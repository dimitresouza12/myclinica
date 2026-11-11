-- ═══════════════════════════════════════════════════════════════════════════
-- IA ESCRIBA — consentimento explícito da clínica em public.clinics
-- Criado em: 2026-11-15
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contexto: a rota /api/ia/escriba envia texto clínico (dado de saúde, dado sensível pela LGPD)
-- a um provedor de IA. Antes disso a clínica precisa ter consentido de forma explícita.
-- Sem esta coluna o código trata a IA como DESLIGADA (degrada sem erro).
--
-- Aditiva e reversível:
--   - 3 colunas novas em clinics. ia_escriba_consent é NOT NULL default false: nenhuma clínica
--     existente muda de comportamento.
--   - ia_escriba_consent_at / _by registram quando e quem (auth.users.id do admin) consentiu.
--   - Quem grava é a rota PUT /api/ia/escriba (service role, só administrador da clínica).
--     A política de UPDATE de clinics já restringe a alteração ao admin da própria clínica.
--
-- Esta migração NÃO liga o consentimento em nenhuma clínica.
-- Rodar manualmente; o código não executa DDL.
--
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clinics
  add column if not exists ia_escriba_consent boolean not null default false,
  add column if not exists ia_escriba_consent_at timestamptz,
  add column if not exists ia_escriba_consent_by uuid;

comment on column public.clinics.ia_escriba_consent is
  'Consentimento explícito da clínica para enviar texto clínico (sem identificadores do paciente) ao provedor de IA da IA escriba. false = recurso desligado.';
comment on column public.clinics.ia_escriba_consent_at is
  'Quando o administrador deu o consentimento da IA escriba.';
comment on column public.clinics.ia_escriba_consent_by is
  'auth.users.id do administrador que deu o consentimento da IA escriba.';

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação (só leitura):
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'clinics' and column_name like 'ia_escriba%';
--   select count(*) filter (where ia_escriba_consent) as com_consentimento, count(*) as total from public.clinics;
-- ───────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (descomente e rode inteiro; a IA escriba volta a ficar desligada)
-- ═══════════════════════════════════════════════════════════════════════════
-- alter table public.clinics
--   drop column if exists ia_escriba_consent_by,
--   drop column if exists ia_escriba_consent_at,
--   drop column if exists ia_escriba_consent;
