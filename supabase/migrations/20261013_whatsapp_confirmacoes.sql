-- ═══════════════════════════════════════════════════════════════════════════
-- WHATSAPP — conexão por clínica + confirmação automática de consultas
-- Criado em: 2026-10-13
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plano completo: vault Obsidian → MyClinica/Plano — WhatsApp, Confirmação e CRM.md
--
-- clinic_whatsapp          1 linha por clínica: estado da conexão (Evolution API)
--                          + configuração de quando/como enviar a confirmação.
-- appointment_confirmations 1 linha por (consulta, tipo, horário da consulta).
--                          A UNIQUE garante que a rotina nunca envia duas vezes
--                          a mesma confirmação, mesmo rodando em paralelo; se a
--                          consulta for remarcada, o horário muda e nasce uma
--                          linha nova (nova confirmação).
--
-- ESCRITA: só pelo servidor (service role, ver src/lib/supabaseAdmin.ts).
-- As políticas abaixo dão SELECT por clínica e NADA além disso — status da
-- conexão, estado do envio e resposta do paciente não podem ser forjados pelo
-- navegador. A edição das configurações passa por rota de API que valida que o
-- usuário é admin da clínica.
--
-- Nenhum segredo fica no banco (chave da Evolution, token do webhook, segredo do
-- agendador): são variáveis de ambiente do servidor.

CREATE TABLE IF NOT EXISTS public.clinic_whatsapp (
  clinic_id             uuid        PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,

  -- conexão
  instance_name         text        NOT NULL UNIQUE,
  status                text        NOT NULL DEFAULT 'desconectado'
                                    CHECK (status IN ('desconectado', 'aguardando_qr', 'conectado')),
  phone_number          text,
  connected_at          timestamptz,
  status_changed_at     timestamptz NOT NULL DEFAULT now(),

  -- configuração da confirmação automática
  confirm_enabled       boolean     NOT NULL DEFAULT false,
  confirm_mode          text        NOT NULL DEFAULT 'vespera'
                                    CHECK (confirm_mode IN ('vespera', 'no_dia', 'ambos')),
  vespera_send_time     time        NOT NULL DEFAULT '18:00',
  no_dia_hours_before   integer     NOT NULL DEFAULT 2 CHECK (no_dia_hours_before BETWEEN 1 AND 12),
  send_window_start     time        NOT NULL DEFAULT '08:00',
  send_window_end       time        NOT NULL DEFAULT '20:00',
  late_booking_policy   text        NOT NULL DEFAULT 'enviar_agora'
                                    CHECK (late_booking_policy IN ('enviar_agora', 'nao_enviar')),
  timezone              text        NOT NULL DEFAULT 'America/Sao_Paulo',

  -- textos (a linha "Responda SIM ou NÃO" é fixa no código, não fica aqui)
  message_template      text        NOT NULL DEFAULT
    'Olá, {paciente}! Sua consulta na {clinica} está marcada para {data} às {hora}{com_profissional}.',
  reply_yes_text        text        NOT NULL DEFAULT 'Consulta confirmada! Até lá.',
  reply_no_text         text        NOT NULL DEFAULT 'Certo, a recepção vai entrar em contato para remarcar.',

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CHECK (send_window_start < send_window_end)
);

CREATE TABLE IF NOT EXISTS public.appointment_confirmations (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id             uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id        uuid        NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,

  kind                  text        NOT NULL CHECK (kind IN ('confirmacao', 'lembrete')),
  -- horário da consulta no momento do envio: remarcou → linha nova
  appointment_at        timestamptz NOT NULL,

  status                text        NOT NULL DEFAULT 'enviando'
                                    CHECK (status IN ('enviando', 'enviado', 'confirmado',
                                                      'pediu_remarcacao', 'respondeu', 'falhou')),

  -- identificação do destinatário no WhatsApp
  to_jid                text,       -- identificador real devolvido pela validação
  phone_key             text,       -- DDD + últimos 8 dígitos (ignora o nono dígito)
  provider_message_id   text,

  sent_at               timestamptz,
  answered_at           timestamptz,
  error                 text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- idempotência do envio
CREATE UNIQUE INDEX IF NOT EXISTS uq_appt_confirmations_once
  ON public.appointment_confirmations (appointment_id, kind, appointment_at);

-- o webhook procura "confirmação enviada, sem resposta" por telefone
CREATE INDEX IF NOT EXISTS idx_appt_confirmations_pending
  ON public.appointment_confirmations (clinic_id, phone_key)
  WHERE status = 'enviado';

CREATE INDEX IF NOT EXISTS idx_appt_confirmations_clinic_recent
  ON public.appointment_confirmations (clinic_id, created_at DESC);

-- ─── RLS — leitura por clínica; escrita só via service role ─────────────────
ALTER TABLE public.clinic_whatsapp           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_confirmations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'clinic_whatsapp' AND policyname = 'tenant_read_clinic_whatsapp') THEN
    CREATE POLICY "tenant_read_clinic_whatsapp" ON public.clinic_whatsapp
      FOR SELECT
      USING (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'appointment_confirmations' AND policyname = 'tenant_read_appt_confirmations') THEN
    CREATE POLICY "tenant_read_appt_confirmations" ON public.appointment_confirmations
      FOR SELECT
      USING (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());
  END IF;
END $$;

COMMENT ON TABLE public.clinic_whatsapp IS
  'Conexão WhatsApp (Evolution API) e configuração da confirmação automática, 1 linha por clínica. Escrita só pelo servidor.';
COMMENT ON TABLE public.appointment_confirmations IS
  'Mensagens de confirmação/lembrete enviadas por consulta e o que o paciente respondeu. UNIQUE (appointment_id, kind, appointment_at) impede envio duplicado. Escrita só pelo servidor.';
