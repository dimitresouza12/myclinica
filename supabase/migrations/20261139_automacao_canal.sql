-- ═══════════════════════════════════════════════════════════════════════════
-- AUTOMAÇÃO — canal MyClinica <-> n8n (rotas /api/automacao/*, PARAR, fora do horário)
-- Criado em: 2026-11-17
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plano: vault Obsidian -> MyClinica/Planejamento/Plano — Dashboard MyClinica e Automações.md (seção 5.6)
--
-- automacao_notificacoes   avisos para a recepção (sino, aviso na tela, Ações necessárias). Leitura e
--                          "marcar como lida" pelos usuários da clínica; criação só pelo servidor.
-- whatsapp_optout          contatos que escreveram PARAR: nunca mais recebem automação. Só servidor.
-- automacao_envios         idempotência e histórico dos envios da automação (chave única). Só servidor.
-- clinic_whatsapp          + automacao_gerenciada (liga a automação do n8n e desliga a confirmação embutida)
--                          + automacao_config (jsonb escrito pelo dashboard: fora do horário, palavras do PARAR)
--
-- Idempotente (IF NOT EXISTS / DO $$): pode rodar mais de uma vez. Só cria; não altera nem apaga dado existente.
-- Nenhuma clínica muda de comportamento: automacao_gerenciada começa false para todas.
--
-- ESCRITA: sempre service role (src/lib/supabaseAdmin.ts), que ignora RLS. Por isso, além da RLS, as tabelas
-- novas tiram o INSERT/UPDATE/DELETE de anon e authenticated (defesa em profundidade; o padrão do projeto é
-- só RLS, aqui o privilégio também é retirado).
--
-- Padrão de política copiado de 20261104_agenda_escala.sql / 20261014_whatsapp_conversas.sql:
--   public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('agenda', <editar?>))

-- ─── clinic_whatsapp: marcador e configuração ───────────────────────────────
ALTER TABLE public.clinic_whatsapp
  ADD COLUMN IF NOT EXISTS automacao_gerenciada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automacao_config     jsonb   NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clinic_whatsapp.automacao_gerenciada IS
  'true = a automação do n8n cuida das confirmações desta clínica; o run-confirmations embutido a pula (evita mensagem em dobro). Escrito pelo dashboard.';
COMMENT ON COLUMN public.clinic_whatsapp.automacao_config IS
  'Configuração das funções que moram no MyClinica, escrita pelo dashboard. Formato: {"foraDoHorario":{"ativa":bool,"texto":"..."},"parar":{"palavras":["parar","pare","sair","stop"]},"boasVindas":{"diasSemConversar":30}}. Campo ausente = padrão.';

-- ─── Avisos para a recepção ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automacao_notificacoes (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  tipo            text        NOT NULL CHECK (tipo IN ('confirmou', 'pediu_remarcar', 'nao_entendi', 'sem_resposta')),
  titulo          text        NOT NULL,
  corpo           text,
  link            text,
  appointment_id  uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  -- dedupe atômico do aviso (tipo + consulta + janela de 6h): o mesmo aviso repetido pelo n8n, mesmo em chamadas
  -- simultâneas, cai no índice único abaixo em vez de gravar duas linhas. Nulo = sem dedupe.
  chave_dedupe    text,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  lida_em         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_automacao_notificacoes_clinic
  ON public.automacao_notificacoes (clinic_id, lida_em, criada_em);

-- Índice ÚNICO sem predicado (o upsert do PostgREST só infere índice completo); NULL não conflita com NULL.
CREATE UNIQUE INDEX IF NOT EXISTS ux_automacao_notificacoes_dedupe
  ON public.automacao_notificacoes (clinic_id, chave_dedupe);

-- ─── Quem pediu para parar ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_optout (
  clinic_id  uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  -- mesma chave das conversas: DDD + 8 últimos dígitos, ou 'lid:<id>' quando só há o identificador interno
  phone_key  text        NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, phone_key)
);

-- ─── Envios da automação (idempotência) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.automacao_envios (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  chave_idempotencia text        NOT NULL UNIQUE,
  clinic_id          uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  funcao             text        NOT NULL
                                 CHECK (funcao IN ('lembrete_vespera', 'confirmacao_dia', 'quem_faltou', 'fora_do_horario', 'aniversario', 'responder')),
  appointment_id     uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  -- aniversario e responder não partem de uma consulta
  paciente_id        uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  -- 'ignorado' = não enviou por um motivo que não é falha (ex.: confirmacao_ja_enviada); não conta para a pausa do número
  status             text        NOT NULL DEFAULT 'enviando'
                                 CHECK (status IN ('enviando', 'enviado', 'falhou', 'ignorado')),
  erro               text,       -- só código curto (ex.: sem_whatsapp, evolution_400, tentar_novamente); nunca texto de mensagem
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  enviado_em         timestamptz
);

-- portão do número: envios e falhas recentes da clínica
CREATE INDEX IF NOT EXISTS idx_automacao_envios_clinic_recent
  ON public.automacao_envios (clinic_id, status, atualizado_em DESC);

-- ─── Privilégios: o navegador só lê (e marca aviso como lido) ────────────────
REVOKE ALL ON public.automacao_notificacoes FROM anon, authenticated;
GRANT SELECT ON public.automacao_notificacoes TO authenticated;
GRANT UPDATE (lida_em) ON public.automacao_notificacoes TO authenticated;

REVOKE ALL ON public.whatsapp_optout   FROM anon, authenticated;
REVOKE ALL ON public.automacao_envios  FROM anon, authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.automacao_notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_optout        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automacao_envios       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- avisos: quem enxerga a agenda da clínica lê e marca como lido (o GRANT acima limita a edição à coluna lida_em)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'automacao_notificacoes' AND policyname = 'tenant_read_automacao_notificacoes') THEN
    CREATE POLICY "tenant_read_automacao_notificacoes" ON public.automacao_notificacoes
      FOR SELECT
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('agenda', false)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'automacao_notificacoes' AND policyname = 'tenant_update_automacao_notificacoes') THEN
    CREATE POLICY "tenant_update_automacao_notificacoes" ON public.automacao_notificacoes
      FOR UPDATE
      USING      (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('agenda', false)))
      WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('agenda', false)));
  END IF;
  -- whatsapp_optout e automacao_envios: RLS ligada e NENHUMA política = só service role.
END $$;

-- ─── Realtime (sino e aviso na tela; o Realtime respeita a RLS acima) ───────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'automacao_notificacoes') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.automacao_notificacoes;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.automacao_notificacoes IS
  'Avisos da automação para a recepção (confirmou, pediu_remarcar, nao_entendi, sem_resposta). Criação só pelo servidor; usuários da clínica leem e marcam lida_em.';
COMMENT ON TABLE public.whatsapp_optout IS
  'Contatos que escreveram PARAR numa clínica: nunca mais recebem mensagem automática. Só service role (RLS sem política).';
COMMENT ON TABLE public.automacao_envios IS
  'Envios da automação, com chave de idempotência única (clínica, função, consulta, horário). Só service role (RLS sem política).';

-- ─── Retenção (sem cron: rodar à mão ou agendar depois) ─────────────────────
-- As duas tabelas só crescem. A função apaga o que já não serve e devolve quantas linhas saíram de cada uma:
--   * avisos JÁ LIDOS há mais de p_dias (avisos não lidos ficam, a recepção ainda precisa deles);
--   * envios fechados (enviado, falhou, ignorado) há mais de p_dias. 'enviando' nunca é apagado aqui.
-- Mínimo de 30 dias: a chave de idempotência dos envios leva a data, então 30 dias basta para o n8n não
-- reenviar uma chave antiga; o padrão de 90 dias deixa folga para auditoria e para a conta de aquecimento.
-- Só service role executa (nenhum privilégio para anon/authenticated). Uso, no SQL editor ou via service role:
--   SELECT * FROM public.automacao_limpar_historico();      -- 90 dias
--   SELECT * FROM public.automacao_limpar_historico(180);
-- whatsapp_optout NÃO tem retenção: apagar uma linha faz o contato voltar a receber mensagem.
CREATE OR REPLACE FUNCTION public.automacao_limpar_historico(p_dias integer DEFAULT 90)
RETURNS TABLE (notificacoes_apagadas bigint, envios_apagados bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_corte timestamptz;
  v_n bigint;
  v_e bigint;
BEGIN
  IF p_dias IS NULL OR p_dias < 30 THEN
    RAISE EXCEPTION 'p_dias deve ser no mínimo 30';
  END IF;
  v_corte := now() - make_interval(days => p_dias);

  DELETE FROM public.automacao_notificacoes WHERE lida_em IS NOT NULL AND lida_em < v_corte;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  DELETE FROM public.automacao_envios WHERE status <> 'enviando' AND atualizado_em < v_corte;
  GET DIAGNOSTICS v_e = ROW_COUNT;

  RETURN QUERY SELECT v_n, v_e;
END
$fn$;

REVOKE ALL ON FUNCTION public.automacao_limpar_historico(integer) FROM PUBLIC, anon, authenticated;
