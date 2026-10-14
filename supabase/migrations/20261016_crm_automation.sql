-- ═══════════════════════════════════════════════════════════════════════════
-- CRM automático + foto do contato
-- Criado em: 2026-10-13
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plano: vault Obsidian → MyClinica/Plano — WhatsApp, Confirmação e CRM.md (Etapa 3)
--
-- crm_leads
--   stage_source  quem mudou a etapa por último: 'manual' (pessoa da equipe) ou 'auto' (regra do sistema).
--                 A automação só desfaz uma escolha manual se o fato novo (consulta marcada ou concluída)
--                 for POSTERIOR a ela: o que a equipe decide por último vale.
--   stage_note    por que o cartão mudou sozinho ("A clínica respondeu no WhatsApp"). Some quando a pessoa move.
--
-- whatsapp_conversations
--   avatar_url         foto de perfil do contato no WhatsApp (URL da CDN do WhatsApp; expira, por isso é
--                      renovada de tempos em tempos); NULL quando o contato não tem foto ou a esconde.
--   avatar_checked_at  última vez que se perguntou à Evolution (evita perguntar a cada mensagem).
--   last_inbound_at    última mensagem DO CONTATO; base da regra "30 dias sem resposta → Perdido".
--
-- Aditiva: só ADD COLUMN com padrão ou nulo, em tabelas novas do WhatsApp/CRM. Nada existente muda.

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS stage_source text NOT NULL DEFAULT 'manual' CHECK (stage_source IN ('manual', 'auto')),
  ADD COLUMN IF NOT EXISTS stage_note   text;

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS avatar_url        text,
  ADD COLUMN IF NOT EXISTS avatar_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_inbound_at   timestamptz;
