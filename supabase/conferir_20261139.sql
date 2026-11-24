-- Conferência SOMENTE LEITURA da migração 20261139_automacao_canal.sql.
-- Rode depois de aplicar (SQL Editor do Supabase ou execute_sql). Não altera nada.
-- Esperado: cada bloco devolve as linhas descritas no comentário acima dele.

-- 1) As 3 tabelas existem e têm RLS ligada (rls = true nas três)
SELECT c.relname AS tabela, c.relrowsecurity AS rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('automacao_notificacoes', 'whatsapp_optout', 'automacao_envios')
ORDER BY 1;

-- 2) Colunas novas em clinic_whatsapp (2 linhas: boolean NOT NULL default false; jsonb NOT NULL default '{}')
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clinic_whatsapp'
  AND column_name IN ('automacao_gerenciada', 'automacao_config')
ORDER BY 1;

-- 3) Nenhuma clínica começou gerenciada (esperado: 0)
SELECT count(*) AS gerenciadas FROM public.clinic_whatsapp WHERE automacao_gerenciada;

-- 4) Políticas (esperado: 2 em automacao_notificacoes, SELECT e UPDATE; NENHUMA em whatsapp_optout e automacao_envios)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('automacao_notificacoes', 'whatsapp_optout', 'automacao_envios')
ORDER BY 1, 2;

-- 5) Privilégios do navegador (esperado: anon sem nada nas 3; authenticated só SELECT em automacao_notificacoes)
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('automacao_notificacoes', 'whatsapp_optout', 'automacao_envios')
  AND grantee IN ('anon', 'authenticated')
ORDER BY 1, 2, 3;

-- 5b) UPDATE por coluna (esperado: authenticated só em lida_em de automacao_notificacoes)
SELECT table_name, column_name, grantee, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name IN ('automacao_notificacoes', 'whatsapp_optout', 'automacao_envios')
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE')
ORDER BY 1, 2, 3;

-- 6) Índices e UNIQUEs (esperado: pkey das 3; idx_automacao_notificacoes_clinic; ux_automacao_notificacoes_dedupe (único,
--    clinic_id + chave_dedupe); idx_automacao_envios_clinic_recent; automacao_envios_chave_idempotencia_key único)
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('automacao_notificacoes', 'whatsapp_optout', 'automacao_envios')
ORDER BY 1, 2;

-- 7) Realtime (esperado: 1 linha, automacao_notificacoes)
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'automacao_notificacoes';

-- 8) CHECKs (esperado: tipo com 4 valores; funcao com 6 (inclui aniversario e responder); status com 4 (inclui ignorado))
SELECT conrelid::regclass AS tabela, pg_get_constraintdef(oid) AS regra
FROM pg_constraint
WHERE contype = 'c'
  AND conrelid IN ('public.automacao_notificacoes'::regclass, 'public.automacao_envios'::regclass)
ORDER BY 1, 2;

-- 9) Os helpers das políticas existem (esperado: get_my_clinic_id, has_module_perm, is_superadmin)
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('get_my_clinic_id', 'has_module_perm', 'is_superadmin')
ORDER BY 1;

-- 10) Colunas novas das tabelas da automação (esperado: automacao_envios.paciente_id uuid; automacao_notificacoes.chave_dedupe text)
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'automacao_envios' AND column_name = 'paciente_id')
    OR (table_name = 'automacao_notificacoes' AND column_name = 'chave_dedupe'))
ORDER BY 1, 2;

-- 11) Função de retenção (esperado: 1 linha, security_definer = true; execute só para service_role/postgres, nunca anon/authenticated)
SELECT p.proname, p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_executa,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'automacao_limpar_historico';
