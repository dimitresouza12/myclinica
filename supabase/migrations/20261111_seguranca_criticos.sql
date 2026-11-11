-- ═══════════════════════════════════════════════════════════════════════════
-- SEGURANÇA — ACHADOS CRÍTICOS (pequeno, baixo risco, idempotente)
-- Criado em: 2026-11-11 | Projeto Supabase: siohvtgbomvcprbzfamr
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O que muda (5 itens; cada um independente, pode colar tudo de uma vez):
--
--   A1. delete_clinic_member(p_member_id): hoje qualquer usuário ativo da clínica
--       (inclusive recepção) apagava colegas e a conta no auth.users. Passa a exigir
--       role='admin' da MESMA clínica do alvo (ou superadmin), bloqueia apagar a si
--       mesmo (já existia), o último admin ativo da clínica e superadmin por não-superadmin.
--       Assinatura e retorno iguais (uuid -> void). Mensagens novas:
--       'cannot_delete_last_admin' (a tela hoje mostra "Erro ao excluir usuário: <msg>").
--       EXECUTE tirado de PUBLIC/anon; mantido para authenticated e service_role.
--
--   A2. sync_from_automation(...): SECURITY DEFINER executável por anon SEM checagem
--       (injeta paciente/agendamento em qualquer clínica que se saiba o UUID).
--       CAMINHO ESCOLHIDO: REVOKE de PUBLIC/anon/authenticated, GRANT só service_role.
--       Motivo: nenhum chamador comprovado com anon key — não há uso em src/, supabase/,
--       scripts/, docs/ nem JSON de workflow na máquina; nenhuma função, trigger ou
--       pg_cron DESTE projeto a referencia; o CRM usa a Edge Function n8n-data. O único
--       fluxo histórico (nota do Antigravity: trigger pg_net num projeto Supabase de
--       n8n, FORA deste projeto) chama com a SERVICE key, que continua funcionando.
--       Se esse trigger externo ainda existir e usar a anon key, ele passa a receber
--       42501 (permission denied): trocar a chave dele para service_role.
--
--   A3. decrypt_patient_cpf(p_patient_id): hoje usa chave de fallback fixa no código
--       ('myclinica-pii-key-change-in-vault') porque app.encryption_key NÃO está setado
--       neste projeto (verificado: nem no banco nem nos roles). Passa a:
--         - exigir sessão, has_module_perm('pacientes') e paciente da clínica do chamador
--           (ou superadmin); vira SECURITY INVOKER, então o RLS de patients (isolamento
--           por clínica + restrict_pacientes_by_area, atual e futuro) também vale;
--         - falhar com 'encryption_key_not_configured' se app.encryption_key ausente;
--         - search_path fixo (public, extensions); EXECUTE só authenticated/service_role.
--       Ninguém chama a função no código (grep em src/ vazio) e as 3 linhas com
--       cpf_encrypted também têm cpf em claro, então nada do app quebra. Efeito prático:
--       a função passa a levantar erro até a chave ser configurada (ver abaixo).
--       Para reativar: ALTER DATABASE postgres SET app.encryption_key = '<chave forte>';
--       (a chave ANTIGA do fallback é a única que abre os 3 valores atuais; trocar a
--       chave exige re-criptografar). Não escrevi a chave aqui de propósito.
--
--   A4. clinics UPDATE: o admin de clínica pode atualizar a própria linha (policy
--       "Apenas admins atualizam dados da clínica", sem WITH CHECK) e portanto trocar
--       plan, max_users, status, billing_paid... Gatilho BEFORE UPDATE barra, para
--       sessões authenticated/anon NÃO superadmin, a mudança destas colunas: id, slug,
--       plan, max_patients, max_users, is_active, status, trial_ends_at, billing_phone,
--       billing_due_day, billing_paid, billing_overdue_since, next_billing_date,
--       stripe_customer_id, stripe_subscription_id, stripe_price_id,
--       asaas_customer_id, asaas_subscription_id, custom_monthly_price, demo_mode,
--       created_at, ia_escriba_consent, ia_escriba_consent_at, ia_escriba_consent_by.
--       Passam: service_role, postgres, SQL Editor e RPCs SECURITY DEFINER do banco
--       (create/update_clinic_member, register_clinic_and_admin: current_user = dono da
--       função), e o superadmin. Continua livre para o admin: name, address, phone,
--       email, logo_url, primary_color, clinic_type, specialties, is_multi_specialty,
--       professional_scoped_access, monthly_revenue_goal, gcal_connected,
--       onboarding_*, founder_*. Conferido no código: tudo que a sessão do usuário grava
--       em clinics está nesse segundo grupo (configuracoes, metas, onboarding, login/
--       registerClinicArea, googleCalendar); plan/status/billing só pelo superadmin
--       (ClinicEditModal) e por rotas com service role (asaas, gestor, escriba).
--
--   A5. audit_logs INSERT: audit_insert_own passa a exigir também clinic_id nulo ou
--       = get_my_clinic_id() (hoje dá para gravar log em nome de qualquer clínica).
--       Superadmin continua pela policy própria superadmin_audit_insert.
--
--   A5b. (BLOCO SEPARADO, remove policy: precisa do OK do dono) DROP da policy
--       "Permitir inserção de clínica durante o cadastro" (INSERT em clinics WITH CHECK
--       true para authenticated: qualquer logado criava clínica com plan/status à
--       vontade). Confirmado: o cadastro oficial usa a RPC register_clinic_and_admin
--       (SECURITY DEFINER, ignora RLS) em AuthFlow.tsx; o único insert direto em
--       clinics no app é AdminClinicas.tsx (superadmin, coberto por superadmin_insert_clinic).
--       Se o dono não quiser remover, delete só o bloco A5b.
--
-- Independente de 20261111_pacientes_unicos_e_area.sql e de 20261111_permissoes_por_modulo.sql
-- (aplica em qualquer ordem; A3 não referencia patients.created_by_user_id).
--
-- Desfazer: bloco ROLLBACK no fim.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── A1. delete_clinic_member ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_clinic_member(p_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_clinic_id uuid;
  v_caller_role      text;
  v_is_superadmin    boolean;
  v_target_clinic_id uuid;
  v_target_user_id   uuid;
  v_target_role      text;
  v_target_active    boolean;
  v_target_is_sa     boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_is_superadmin := public.is_superadmin();

  -- Clínica e cargo do chamador
  SELECT clinic_id, role INTO v_caller_clinic_id, v_caller_role
  FROM clinic_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;

  IF v_caller_clinic_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Só admin (ou superadmin) remove membro
  IF NOT v_is_superadmin AND v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Alvo
  SELECT clinic_id, user_id, role, is_active, coalesce(is_superadmin, false)
    INTO v_target_clinic_id, v_target_user_id, v_target_role, v_target_active, v_target_is_sa
  FROM clinic_users WHERE id = p_member_id;

  IF v_target_clinic_id IS NULL THEN
    RAISE EXCEPTION 'member_not_found';
  END IF;

  -- Não pode excluir de outra clínica (superadmin pode)
  IF NOT v_is_superadmin AND v_target_clinic_id <> v_caller_clinic_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Só superadmin remove superadmin
  IF v_target_is_sa AND NOT v_is_superadmin THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Não pode excluir a si mesmo
  IF v_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_delete_self';
  END IF;

  -- Não pode excluir o último admin ativo da clínica
  IF v_target_role = 'admin' AND coalesce(v_target_active, true) THEN
    IF NOT EXISTS (
      SELECT 1 FROM clinic_users
      WHERE clinic_id = v_target_clinic_id
        AND role = 'admin'
        AND is_active = true
        AND id <> p_member_id
    ) THEN
      RAISE EXCEPTION 'cannot_delete_last_admin';
    END IF;
  END IF;

  -- Remove permissões (CASCADE já faria, mas explícito por segurança)
  DELETE FROM clinic_user_permissions WHERE clinic_user_id = p_member_id;

  -- Remove o registro de clinic_users
  DELETE FROM clinic_users WHERE id = p_member_id;

  -- Remove o usuário do auth.users
  DELETE FROM auth.users WHERE id = v_target_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_clinic_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_clinic_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_clinic_member(uuid) TO authenticated, service_role;


-- ─── A2. sync_from_automation: só service_role ───────────────────────────────

REVOKE ALL ON FUNCTION public.sync_from_automation(uuid, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_from_automation(uuid, text, text, text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.sync_from_automation(uuid, text, text, text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_from_automation(uuid, text, text, text, text, timestamptz) TO service_role;


-- ─── A3. decrypt_patient_cpf ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decrypt_patient_cpf(p_patient_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  enc_cpf text;
  enc_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.has_module_perm('pacientes', false) THEN
    RETURN NULL;
  END IF;

  enc_key := nullif(current_setting('app.encryption_key', true), '');
  IF enc_key IS NULL THEN
    RAISE EXCEPTION 'encryption_key_not_configured' USING ERRCODE = '55000';
  END IF;

  -- SECURITY INVOKER: o RLS de patients também filtra (clínica + área). A condição
  -- explícita de clínica fica por clareza e para o caso de RLS desligado no futuro.
  SELECT p.cpf_encrypted INTO enc_cpf
  FROM public.patients p
  WHERE p.id = p_patient_id
    AND (p.clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

  IF enc_cpf IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN pgp_sym_decrypt(enc_cpf::bytea, enc_key);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;  -- valor corrompido ou chave diferente da usada para cifrar
  END;
END
$function$;

REVOKE ALL ON FUNCTION public.decrypt_patient_cpf(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrypt_patient_cpf(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.decrypt_patient_cpf(uuid) TO authenticated, service_role;


-- ─── A4. clinics: gatilho que protege plano/cobrança ─────────────────────────

CREATE OR REPLACE FUNCTION public.clinics_guard_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_protected text[] := ARRAY[
    'id', 'slug', 'created_at',
    'plan', 'max_patients', 'max_users', 'is_active', 'status', 'trial_ends_at',
    'custom_monthly_price', 'demo_mode',
    'billing_phone', 'billing_due_day', 'billing_paid', 'billing_overdue_since', 'next_billing_date',
    'stripe_customer_id', 'stripe_subscription_id', 'stripe_price_id',
    'asaas_customer_id', 'asaas_subscription_id',
    'ia_escriba_consent', 'ia_escriba_consent_at', 'ia_escriba_consent_by'
  ];
  v_old     jsonb;
  v_new     jsonb;
  v_col     text;
  v_changed text[] := '{}';
BEGIN
  -- Só sessões vindas da API (JWT de usuário). service_role, postgres, SQL Editor e
  -- RPCs SECURITY DEFINER (current_user = dono da função) passam direto.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);

  FOREACH v_col IN ARRAY v_protected LOOP
    IF (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
      v_changed := v_changed || v_col;
    END IF;
  END LOOP;

  IF array_length(v_changed, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'clinic_protected_columns: %', array_to_string(v_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_clinics_guard_billing_columns ON public.clinics;
CREATE TRIGGER trg_clinics_guard_billing_columns
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.clinics_guard_billing_columns();


-- ─── A5. audit_logs: INSERT só na própria clínica ────────────────────────────

ALTER POLICY audit_insert_own ON public.audit_logs
  WITH CHECK (
    user_id = auth.uid()
    AND (clinic_id IS NULL OR clinic_id = public.get_my_clinic_id())
  );


-- ─── A5b. (REQUER OK DO DONO) remove INSERT aberto em clinics ─────────────────

DROP POLICY IF EXISTS "Permitir inserção de clínica durante o cadastro" ON public.clinics;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de colar):
--   select grantee, routine_name from information_schema.routine_privileges
--     where routine_schema='public' and routine_name in ('sync_from_automation','delete_clinic_member','decrypt_patient_cpf')
--     order by 2,1;     -- sync: só postgres/service_role; delete/decrypt: sem PUBLIC/anon
--   select tgname from pg_trigger where tgrelid='public.clinics'::regclass and not tgisinternal;
--   select policyname, with_check from pg_policies where tablename='audit_logs' and cmd='INSERT';
--   select policyname from pg_policies where tablename='clinics' and cmd='INSERT';  -- só superadmin_insert_clinic
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (executar em bloco; só com confirmação do dono)
--
--   -- A5b
--   CREATE POLICY "Permitir inserção de clínica durante o cadastro" ON public.clinics
--     AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
--   -- A5
--   ALTER POLICY audit_insert_own ON public.audit_logs WITH CHECK (user_id = auth.uid());
--   -- A4
--   DROP TRIGGER IF EXISTS trg_clinics_guard_billing_columns ON public.clinics;
--   DROP FUNCTION IF EXISTS public.clinics_guard_billing_columns();
--   -- A3 (restaura a versão anterior, INCLUINDO a chave de fallback fixa: só se for indispensável)
--   CREATE OR REPLACE FUNCTION public.decrypt_patient_cpf(p_patient_id uuid)
--    RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $f$
--   DECLARE
--     enc_cpf text;
--     enc_key text := COALESCE(current_setting('app.encryption_key', true), 'myclinica-pii-key-change-in-vault');
--   BEGIN
--     SELECT cpf_encrypted INTO enc_cpf FROM public.patients
--     WHERE id = p_patient_id AND clinic_id = ANY(SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid() AND is_active = true);
--     IF enc_cpf IS NULL THEN RETURN NULL; END IF;
--     RETURN pgp_sym_decrypt(enc_cpf::bytea, enc_key);
--   EXCEPTION WHEN OTHERS THEN RETURN NULL;
--   END $f$;
--   GRANT EXECUTE ON FUNCTION public.decrypt_patient_cpf(uuid) TO PUBLIC, anon;
--   -- A2
--   GRANT EXECUTE ON FUNCTION public.sync_from_automation(uuid, text, text, text, text, timestamptz) TO PUBLIC, anon;
--   -- A1 (versão anterior: sem checagem de cargo, sem trava de último admin)
--   CREATE OR REPLACE FUNCTION public.delete_clinic_member(p_member_id uuid)
--    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
--   DECLARE v_caller_clinic_id uuid; v_target_clinic_id uuid; v_target_user_id uuid;
--   BEGIN
--     SELECT clinic_id INTO v_caller_clinic_id FROM clinic_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
--     IF v_caller_clinic_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
--     SELECT clinic_id, user_id INTO v_target_clinic_id, v_target_user_id FROM clinic_users WHERE id = p_member_id;
--     IF v_target_clinic_id IS NULL THEN RAISE EXCEPTION 'member_not_found'; END IF;
--     IF v_target_clinic_id != v_caller_clinic_id THEN RAISE EXCEPTION 'unauthorized'; END IF;
--     IF v_target_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_delete_self'; END IF;
--     DELETE FROM clinic_user_permissions WHERE clinic_user_id = p_member_id;
--     DELETE FROM clinic_users WHERE id = p_member_id;
--     DELETE FROM auth.users WHERE id = v_target_user_id;
--   END; $f$;
--   GRANT EXECUTE ON FUNCTION public.delete_clinic_member(uuid) TO PUBLIC, anon;
-- ═══════════════════════════════════════════════════════════════════════════
