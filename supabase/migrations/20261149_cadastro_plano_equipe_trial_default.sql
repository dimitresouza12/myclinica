-- ═══════════════════════════════════════════════════════════════════════════
-- CADASTRO ACEITA O PLANO 'equipe' + DEFAULT DE trial_ends_at EM 14 DIAS
-- Criado em: 2026-11-23
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O que faz:
--   1. Recria public.register_clinic_and_admin(9 args) a partir da definição
--      viva (lida em 2026-11-23), acrescentando 'equipe' à whitelist de planos
--      (antes, plano desconhecido caía em 'essencial'). Mantém todos os planos
--      existentes ('essencial','completo','ilimitado','completo_plus',
--      'avancado','basico','plus'), o trial de 14 dias (igual à 20261146),
--      SECURITY DEFINER e SET search_path TO 'public'. Overloads de 7 e 8 args
--      não são tocados.
--   2. ALTER COLUMN clinics.trial_ends_at SET DEFAULT now() + interval '14 days'
--      (era now() + 7 days). Só afeta INSERTs futuros que não informam a coluna;
--      linhas existentes não mudam.
--
-- Independente da 20261146: pode ser aplicada antes, depois ou sozinha (esta
-- recria a função inteira, já com 14 dias). Aplicando as duas, vale a última.
-- Complementa a 20261147 (limite de 6 profissionais do plano 'equipe').
--
-- Idempotente: CREATE OR REPLACE e SET DEFAULT.
--
-- Como reverter:
--   ALTER TABLE public.clinics ALTER COLUMN trial_ends_at
--     SET DEFAULT now() + interval '7 days';
--   e rodar de novo o CREATE OR REPLACE abaixo sem 'equipe' na lista do CASE
--   (e, se quiser voltar a 7 dias, com '7 days').
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.register_clinic_and_admin(p_clinic_name text, p_slug text, p_clinic_type text, p_phone text, p_admin_name text, p_username text, p_email text, p_plan text DEFAULT 'essencial'::text, p_cpf text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_clinic_id uuid;
  v_username  text;
  v_plan      text;
  v_cpf       text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING errcode='28000'; END IF;

  v_username := lower(trim(p_username));
  IF v_username !~ '^[a-z0-9][a-z0-9_.-]{2,29}$' THEN RAISE EXCEPTION 'username_invalid' USING errcode='22023'; END IF;

  IF EXISTS (SELECT 1 FROM clinic_users WHERE user_id = v_user_id) THEN RAISE EXCEPTION 'user_already_linked' USING errcode='23505'; END IF;
  IF EXISTS (SELECT 1 FROM clinics WHERE slug = p_slug) THEN RAISE EXCEPTION 'slug_taken' USING errcode='23505'; END IF;
  IF EXISTS (SELECT 1 FROM clinic_users WHERE username = v_username) THEN RAISE EXCEPTION 'username_taken' USING errcode='23505'; END IF;

  v_cpf := NULLIF(regexp_replace(COALESCE(p_cpf, ''), '[^0-9]', '', 'g'), '');
  IF v_cpf IS NOT NULL AND length(v_cpf) != 11 THEN RAISE EXCEPTION 'cpf_invalid' USING errcode='22023'; END IF;
  IF v_cpf IS NOT NULL AND EXISTS (SELECT 1 FROM clinic_users WHERE cpf = v_cpf) THEN RAISE EXCEPTION 'cpf_taken' USING errcode='23505'; END IF;

  v_plan := CASE
    WHEN p_plan IN ('essencial', 'completo', 'ilimitado', 'completo_plus', 'equipe', 'avancado', 'basico', 'plus')
    THEN p_plan
    ELSE 'essencial'
  END;

  -- Clínica já aprovada, começa em trial de 14 dias, e nasce com o novo
  -- modelo de acesso por profissional (Bloco A do plano de acesso).
  INSERT INTO clinics (name, slug, clinic_type, phone, is_active, plan, status, trial_ends_at, professional_scoped_access)
  VALUES (p_clinic_name, p_slug, p_clinic_type, NULLIF(p_phone, ''), true, v_plan, 'trial', now() + interval '14 days', true)
  RETURNING id INTO v_clinic_id;

  INSERT INTO clinic_users (clinic_id, user_id, role, display_name, username, is_active, is_superadmin, email, cpf)
  VALUES (v_clinic_id, v_user_id, 'admin', p_admin_name, v_username, true, false, p_email, v_cpf);

  RETURN v_clinic_id;
END;
$function$;

ALTER TABLE public.clinics
  ALTER COLUMN trial_ends_at SET DEFAULT now() + interval '14 days';
