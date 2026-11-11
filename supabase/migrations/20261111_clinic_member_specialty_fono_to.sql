-- ═══════════════════════════════════════════════════════════════════════════
-- create_clinic_member / update_clinic_member — whitelist com as 9 áreas
-- Criado em: 2026-11-11
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Contexto: o plano de melhorias (seção 3.10) registra como P0 que as RPCs
-- rejeitam 'fono' e 'to' com invalid_specialty_type. Verificado em produção
-- (siohvtgbomvcprbzfamr) em 2026-11-10 via pg_get_functiondef: as duas funções
-- JÁ aceitam as 9 áreas (odonto, medico, estetica, vet, fisio, psico, nutri,
-- fono, to), assim como os CHECKs clinics_clinic_type_check,
-- clinic_users_specialty_type_check, professionals_specialty_type_check e
-- clinic_custom_record_fields_specialty_type_check. O ajuste foi feito direto
-- no banco (migrations 20260807012208_add_fono_to_specialty_checks e
-- 20260809220956_fix_clinic_member_specialty_whitelist, aplicadas pelo painel
-- e nunca versionadas neste repositório).
--
-- Esta migração só traz o repositório de volta para o que está em produção:
-- é CREATE OR REPLACE com o corpo idêntico ao de produção, portanto NÃO
-- altera comportamento lá (no-op funcional). Serve para reconstruir um
-- ambiente novo (branch, staging) sem reintroduzir o bug.
--
-- Preservado exatamente: assinatura, SECURITY DEFINER, search_path
-- (create_clinic_member = public, extensions; update_clinic_member = public)
-- e grants. CREATE OR REPLACE não mexe em ACL, então nenhum GRANT/REVOKE aqui.
--
-- Desfazer: bloco ROLLBACK no fim (volta ao whitelist de 7 áreas, que REINTRODUZ
-- o bug de fono/to; só faz sentido para testar).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_clinic_member(
  p_email text,
  p_password text,
  p_display_name text,
  p_username text,
  p_role text,
  p_specialty_type text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_caller_clinic_id uuid;
  v_caller_role      text;
  v_new_user_id      uuid;
  v_new_cu_id        uuid;
  v_instance_id      uuid;
  v_username         text;
BEGIN
  SELECT clinic_id, role INTO v_caller_clinic_id, v_caller_role
  FROM clinic_users
  WHERE user_id = auth.uid() AND is_active = true;

  IF v_caller_clinic_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  IF v_caller_role NOT IN ('admin') AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
  END IF;

  IF p_role NOT IN ('recepcao', 'auxiliar', 'dentista', 'medico', 'profissional', 'admin') THEN
    RAISE EXCEPTION 'invalid_role' USING errcode = '22023';
  END IF;

  IF p_specialty_type IS NOT NULL AND p_specialty_type NOT IN ('odonto','medico','estetica','vet','fisio','psico','nutri','fono','to') THEN
    RAISE EXCEPTION 'invalid_specialty_type' USING errcode = '22023';
  END IF;

  v_username := lower(trim(p_username));
  IF v_username !~ '^[a-z0-9][a-z0-9_.-]{2,29}$' THEN
    RAISE EXCEPTION 'username_invalid' USING errcode = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))) THEN
    RAISE EXCEPTION 'email_taken' USING errcode = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM clinic_users WHERE username = v_username) THEN
    RAISE EXCEPTION 'username_taken' USING errcode = '23505';
  END IF;

  SELECT instance_id INTO v_instance_id FROM auth.users LIMIT 1;

  v_new_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new,
    email_change, phone_change_token, phone_change,
    reauthentication_token, email_change_token_current,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    v_instance_id, v_new_user_id, 'authenticated', 'authenticated',
    lower(trim(p_email)),
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    '', '', '', '', '', '', '', '',
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('display_name', p_display_name),
    now(), now(), false, false
  );

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_new_user_id,
    lower(trim(p_email)),
    'email',
    jsonb_build_object('sub', v_new_user_id::text, 'email', lower(trim(p_email))),
    now(), now(), now()
  );

  INSERT INTO clinic_users (clinic_id, user_id, role, specialty_type, display_name, username, is_active, is_superadmin, email)
  VALUES (v_caller_clinic_id, v_new_user_id, p_role, p_specialty_type, p_display_name, v_username, true, false, lower(trim(p_email)))
  RETURNING id INTO v_new_cu_id;

  IF p_specialty_type IS NOT NULL THEN
    UPDATE clinics SET specialties = array_append(specialties, p_specialty_type)
    WHERE id = v_caller_clinic_id AND NOT (p_specialty_type = ANY(specialties));
  END IF;

  RETURN v_new_cu_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_clinic_member(
  p_member_id uuid,
  p_role text DEFAULT NULL::text,
  p_is_active boolean DEFAULT NULL::boolean,
  p_display_name text DEFAULT NULL::text,
  p_specialty_type text DEFAULT NULL::text,
  p_clear_specialty_type boolean DEFAULT false
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_clinic_id uuid;
  v_caller_role      text;
  v_caller_user_id   uuid;
  v_target_clinic_id uuid;
  v_target_user_id   uuid;
BEGIN
  v_caller_user_id := auth.uid();
  SELECT clinic_id, role INTO v_caller_clinic_id, v_caller_role
  FROM clinic_users
  WHERE user_id = v_caller_user_id AND is_active = true;

  IF v_caller_clinic_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  IF v_caller_role NOT IN ('admin') AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
  END IF;

  SELECT clinic_id, user_id INTO v_target_clinic_id, v_target_user_id
  FROM clinic_users WHERE id = p_member_id;

  IF v_target_clinic_id != v_caller_clinic_id AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
  END IF;

  IF v_target_user_id = v_caller_user_id AND p_is_active = false THEN
    RAISE EXCEPTION 'cannot_deactivate_self' USING errcode = '23000';
  END IF;

  IF p_role IS NOT NULL AND p_role NOT IN ('recepcao', 'auxiliar', 'dentista', 'medico', 'profissional', 'admin') THEN
    RAISE EXCEPTION 'invalid_role' USING errcode = '22023';
  END IF;

  IF p_specialty_type IS NOT NULL AND p_specialty_type NOT IN ('odonto','medico','estetica','vet','fisio','psico','nutri','fono','to') THEN
    RAISE EXCEPTION 'invalid_specialty_type' USING errcode = '22023';
  END IF;

  UPDATE clinic_users
  SET
    role           = COALESCE(p_role, role),
    is_active      = COALESCE(p_is_active, is_active),
    display_name   = COALESCE(p_display_name, display_name),
    specialty_type = CASE WHEN p_clear_specialty_type THEN NULL ELSE COALESCE(p_specialty_type, specialty_type) END
  WHERE id = p_member_id;

  IF p_specialty_type IS NOT NULL THEN
    UPDATE clinics SET specialties = array_append(specialties, p_specialty_type)
    WHERE id = v_target_clinic_id AND NOT (p_specialty_type = ANY(specialties));
  END IF;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (não rodar em produção: reintroduz invalid_specialty_type p/ fono e to)
-- Repetir os dois CREATE OR REPLACE acima trocando, em cada IF de
-- p_specialty_type, a lista por:
--   ('odonto','medico','estetica','vet','fisio','psico','nutri')
-- Nenhum outro objeto foi alterado por esta migração.
-- ═══════════════════════════════════════════════════════════════════════════
