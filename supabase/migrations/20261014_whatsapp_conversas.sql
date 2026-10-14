-- ═══════════════════════════════════════════════════════════════════════════
-- WHATSAPP — conversas e mensagens dentro do sistema (tela "Mensagens")
-- Criado em: 2026-10-13
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plano: vault Obsidian → MyClinica/Plano — WhatsApp, Confirmação e CRM.md (Etapa 2)
--
-- whatsapp_conversations  1 linha por contato (telefone) de cada clínica.
-- whatsapp_messages       as mensagens. Nesta fase só TEXTO é guardado de verdade; imagem,
--                         áudio, vídeo e documento entram como registro (tipo + legenda), sem o
--                         arquivo. O arquivo entra na fase de mídia (Garage, cópia temporária).
--
-- LEITURA: usuário da clínica com permissão de VISUALIZAR o módulo 'crm' (admin e superadmin
-- sempre). ESCRITA: só pelo servidor (service role) — o navegador não grava mensagem nem zera
-- contador; o envio passa por rota de API que confere a permissão de EDITAR e fala com a Evolution.
--
-- Realtime: as duas tabelas entram na publicação supabase_realtime; o Realtime respeita a RLS,
-- então cada usuário só recebe eventos da própria clínica e só se tiver permissão de leitura.

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id               uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

  -- DDD + 8 últimos dígitos (ignora DDI e o nono dígito). 'lid:<id>' quando só há o identificador interno.
  phone_key               text        NOT NULL,
  -- identificador usado para RESPONDER (preferência: o do telefone)
  jid                     text        NOT NULL,
  contact_name            text,       -- nome que o contato usa no WhatsApp

  patient_id              uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_checked_at      timestamptz,

  last_message_at         timestamptz NOT NULL DEFAULT now(),
  last_message_preview    text,
  last_message_direction  text        CHECK (last_message_direction IN ('in', 'out')),
  unread_count            integer     NOT NULL DEFAULT 0 CHECK (unread_count >= 0),

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  UNIQUE (clinic_id, phone_key)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id             uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id       uuid        NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,

  direction             text        NOT NULL CHECK (direction IN ('in', 'out')),
  kind                  text        NOT NULL DEFAULT 'text'
                                    CHECK (kind IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'other')),
  body                  text,       -- texto, ou legenda quando for mídia

  -- quem/o que originou: contato, usuário pelo sistema, celular da clínica, mensagem automática
  origin                text        NOT NULL CHECK (origin IN ('contato', 'sistema', 'celular', 'automatico')),
  sent_by               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_name          text,

  provider_message_id   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- a mesma mensagem não entra duas vezes (a Evolution pode repetir o evento, e a mensagem enviada
-- pelo sistema volta como eco no webhook). Índice ÚNICO COMPLETO, não parcial: o upsert do
-- supabase-js (ON CONFLICT) não consegue citar o predicado de um índice parcial. No Postgres,
-- NULL é sempre distinto, então mensagens sem provider_message_id não colidem.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_messages_provider
  ON public.whatsapp_messages (clinic_id, provider_message_id);

CREATE INDEX IF NOT EXISTS idx_wa_messages_conv      ON public.whatsapp_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wa_conv_clinic_recent ON public.whatsapp_conversations (clinic_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_patient       ON public.whatsapp_conversations (patient_id) WHERE patient_id IS NOT NULL;

-- ─── RLS: leitura por clínica + permissão do módulo CRM; escrita só pelo servidor ───
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_conversations' AND policyname = 'tenant_read_wa_conversations') THEN
    CREATE POLICY "tenant_read_wa_conversations" ON public.whatsapp_conversations
      FOR SELECT
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', false)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_messages' AND policyname = 'tenant_read_wa_messages') THEN
    CREATE POLICY "tenant_read_wa_messages" ON public.whatsapp_messages
      FOR SELECT
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', false)));
  END IF;
END $$;

-- ─── Realtime ───
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_conversations') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.whatsapp_conversations IS
  'Uma conversa de WhatsApp por contato e clínica (tela Mensagens). Escrita só pelo servidor.';
COMMENT ON TABLE public.whatsapp_messages IS
  'Mensagens das conversas de WhatsApp. Nesta fase só o texto é guardado; mídia entra como registro sem arquivo. Escrita só pelo servidor.';
