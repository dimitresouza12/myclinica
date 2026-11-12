-- ═══════════════════════════════════════════════════════════════════════════
-- EQUIPE: ACESSOS DELEGÁVEIS (recepção com equipe/edição cria logins sem escalar)
-- Criado em: 2026-11-12 | Projeto Supabase: siohvtgbomvcprbzfamr
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Objetivo: quem tem permissão equipe/can_edit (ex.: recepção) cria usuários e
-- vincula login a profissionais, sem poder virar admin nem mexer em admin.
--
-- Regra de autorização (todas as RPCs abaixo):
--   autorizado = admin | superadmin | has_module_perm('equipe', true)
--   e o alvo precisa ser da MESMA clínica do chamador (superadmin pode em qualquer
--   clínica, exceto link_professional_login, que sempre cria na clínica do chamador).
--   Se o chamador NÃO é admin/superadmin:
--     - não cria, altera, desativa, desvincula nem redefine senha de usuário de cargo admin
--       (nem de superadmin: só superadmin mexe em superadmin, para qualquer chamador);
--     - não mexe em si mesmo (cannot_modify_self);
--     - não atribui o cargo 'admin' (cannot_grant_admin);
--     - não age sobre alvo cujas permissões excedam o teto dele (cannot_modify_higher):
--       alvo com qualquer configuracoes, com financeiro/equipe em edição, ou com módulo/
--       nível que o chamador não tem. Vale em update, delete, save_permissions, unlink e
--       reset de senha (evita takeover de conta por redefinição de senha);
--     - NÃO reativa usuário (p_is_active = true: cannot_reactivate_member) e NÃO exclui
--       usuário definitivamente (delete_clinic_member: not_authorized). Pode desativar
--       (update com p_is_active = false, ou unlink);
--     - em permissões só concede módulo/nível que ele próprio tem, e NUNCA
--       configuracoes (nem ver), financeiro (editar) nem equipe (editar)
--       (cannot_grant_permission). Linha de módulo que o chamador não enxerga
--       (inclui configuracoes) é PRESERVADA no alvo, não apagada; reenviar o que o
--       alvo já tem não é erro. O metadata (ex.: show_totals) nunca excede o do chamador:
--       mantém o do alvo, ou copia o do chamador quando o módulo é novo para o alvo.
--   Reset de senha e exclusão (tocam auth.users) recusam alvo cujo user_id tenha OUTRA
--   linha em clinic_users (outra clínica, ou outro cargo/admin/superadmin): 'target_shared_account'
--   (superadmin passa). Não-admin que tenha mais de uma linha ativa é recusado (not_authorized).
--   Admin e superadmin seguem com tudo, salvo as travas de último admin e de si mesmo.
--
-- O que este arquivo faz:
--   C0  equipe_authorize_caller(uuid)  helper interno (sem EXECUTE para API).
--   C0b equipe_assert_target_ok(...)   helper interno: superadmin/admin/self/teto de permissões
--                                        do alvo (cannot_modify_higher) e conta compartilhada.
--   C1  create_clinic_member           + autorização delegada, cannot_grant_admin,
--                                        weak_password (< 8), email_invalid.
--   C2  update_clinic_member           + autorização delegada, cannot_modify_admin/self/higher,
--                                        member_not_found, cannot_demote_last_admin e
--                                        cannot_deactivate_last_admin (a tela de
--                                        Configurações já traduz esses códigos).
--   C3  delete_clinic_member           mesma lógica de 20261111_seguranca_criticos (A1):
--                                        continua só admin/superadmin (não-admin recebe
--                                        not_authorized). 'unauthorized' vira 'not_authorized'.
--   C4  save_clinic_member_permissions mantém a validação de módulo de 20261111_permissoes_por_modulo
--                                        (B11) + autorização delegada + teto de concessão.
--   C5  link_professional_login        NOVA: cria o login e vincula ao profissional.
--   C6  unlink_professional_login      NOVA: desativa o login e desvincula.
--   C7  reset_clinic_member_password   NOVA: redefine senha (mín. 8).
--   C8  professionals_guard_clinic_user_id  também libera equipe/edição, com limites
--                                        (não vincula/desvincula admin, superadmin nem
--                                        a si mesmo; só usuário da própria clínica do
--                                        profissional, inclusive para admin não-superadmin).
--
-- Independente de ordem em relação a 20261111_permissoes_por_modulo e
-- 20261111_seguranca_criticos: C3, C4 e C8 recriam as mesmas funções/gatilho com
-- CREATE OR REPLACE / DROP TRIGGER IF EXISTS. Se aqueles arquivos forem colados
-- DEPOIS deste, sobrescrevem C3/C4/C8 com a versão antiga (admin-only): cole este por último.
--
-- Códigos de erro (RAISE EXCEPTION 'codigo'):
--   not_authenticated (28000)  not_authorized (42501)   cannot_grant_admin (42501)
--   cannot_grant_permission (42501)  cannot_modify_admin (42501)  cannot_modify_self (42501)
--   cannot_modify_higher (42501)  cannot_reactivate_member (42501)  target_shared_account (42501)
--   cannot_delete_self (23000)  cannot_deactivate_self (23000)
--   cannot_delete_last_admin / cannot_demote_last_admin / cannot_deactivate_last_admin (23000)
--   concurrent_change (40001: vínculo do profissional mudou durante o unlink; repetir)
--   member_not_found (P0002)  professional_not_found (P0002)  professional_not_linked (P0002)
--   professional_already_linked (23505)  email_taken / username_taken (23505)
--   invalid_role / invalid_specialty_type / invalid_permissions / invalid_module: ... (22023)
--   username_invalid / email_invalid / weak_password (22023)
--
-- Desfazer: bloco ROLLBACK no fim.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── C0. Helper interno ──────────────────────────────────────────────────────
-- Autentica o chamador, aplica a regra "admin | superadmin | equipe/edição" e a trava
-- de clínica. p_target_clinic_id NULL = sem alvo (criação). Só é chamado por funções
-- SECURITY DEFINER deste arquivo; não é exposto à API.

CREATE OR REPLACE FUNCTION public.equipe_authorize_caller(
  p_target_clinic_id uuid DEFAULT NULL,
  OUT caller_user_id uuid,
  OUT caller_clinic_id uuid,
  OUT caller_is_admin boolean,
  OUT caller_is_superadmin boolean
)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  caller_user_id := auth.uid();
  IF caller_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  SELECT cu.clinic_id, cu.role INTO caller_clinic_id, v_role
  FROM public.clinic_users cu
  WHERE cu.user_id = caller_user_id AND cu.is_active = true
  LIMIT 1;

  IF caller_clinic_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING errcode = '28000';
  END IF;

  caller_is_superadmin := public.is_superadmin();
  caller_is_admin := coalesce(caller_is_superadmin, false) OR coalesce(v_role, '') = 'admin';

  IF p_target_clinic_id IS NOT NULL
     AND p_target_clinic_id <> caller_clinic_id
     AND NOT caller_is_superadmin THEN
    RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
  END IF;

  IF NOT caller_is_admin THEN
    -- get_my_clinic_id/get_my_role/has_module_perm escolhem "a" linha ativa do usuário com
    -- LIMIT 1 (sem ORDER BY). Com mais de uma linha ativa, a clínica acima e a permissão
    -- avaliada abaixo poderiam vir de linhas diferentes: para não-admin, recusa.
    IF (SELECT count(*) FROM public.clinic_users cu
        WHERE cu.user_id = caller_user_id AND cu.is_active = true) > 1 THEN
      RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
    END IF;

    -- Com uma única linha ativa, has_module_perm avalia a linha de caller_clinic_id, e a
    -- trava de clínica acima garante que o alvo é dessa mesma clínica.
    IF NOT public.has_module_perm('equipe', true) THEN
      RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.equipe_authorize_caller(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipe_authorize_caller(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.equipe_authorize_caller(uuid) FROM authenticated;


-- ─── C0b. Helper interno: o alvo cabe no que o chamador pode gerenciar? ───────
-- Chamado por update, delete, save_permissions, unlink e reset de senha logo depois de
-- equipe_authorize_caller. Regras:
--   - alvo superadmin só por superadmin (cannot_modify_admin);
--   - p_touches_auth (reset de senha e exclusão mexem em auth.users): alvo cujo user_id tem
--     OUTRA linha em clinic_users é recusado (target_shared_account), exceto superadmin;
--   - chamador não-admin: alvo admin (cannot_modify_admin), ele mesmo (cannot_modify_self) e
--     alvo com permissões acima do teto dele (cannot_modify_higher). Teto = mesma regra de
--     save_clinic_member_permissions: ver = módulo <> configuracoes que ele próprio vê;
--     editar = módulo fora de configuracoes/financeiro/equipe que ele próprio edita.
--   - p_expected_clinic_id (opcional): o alvo tem de ser dessa clínica (unlink).

CREATE OR REPLACE FUNCTION public.equipe_assert_target_ok(
  p_target_member_id uuid,
  p_caller_user_id uuid,
  p_caller_is_admin boolean,
  p_caller_is_superadmin boolean,
  p_touches_auth boolean DEFAULT false,
  p_expected_clinic_id uuid DEFAULT NULL
)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_id uuid;
  v_user_id   uuid;
  v_role      text;
  v_is_sa     boolean;
  r           record;
  v_cap_view  boolean;
  v_cap_edit  boolean;
BEGIN
  SELECT cu.clinic_id, cu.user_id, cu.role, coalesce(cu.is_superadmin, false)
    INTO v_clinic_id, v_user_id, v_role, v_is_sa
  FROM public.clinic_users cu WHERE cu.id = p_target_member_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'member_not_found' USING errcode = 'P0002';
  END IF;

  IF p_expected_clinic_id IS NOT NULL AND v_clinic_id <> p_expected_clinic_id THEN
    RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
  END IF;

  IF v_is_sa AND NOT coalesce(p_caller_is_superadmin, false) THEN
    RAISE EXCEPTION 'cannot_modify_admin' USING errcode = '42501';
  END IF;

  IF p_touches_auth AND NOT coalesce(p_caller_is_superadmin, false) AND EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.user_id = v_user_id AND cu.id <> p_target_member_id
  ) THEN
    RAISE EXCEPTION 'target_shared_account' USING errcode = '42501';
  END IF;

  IF NOT coalesce(p_caller_is_admin, false) THEN
    IF coalesce(v_role, '') = 'admin' THEN
      RAISE EXCEPTION 'cannot_modify_admin' USING errcode = '42501';
    END IF;
    IF v_user_id = p_caller_user_id THEN
      RAISE EXCEPTION 'cannot_modify_self' USING errcode = '42501';
    END IF;

    FOR r IN
      SELECT cup.module, cup.can_view, cup.can_edit
      FROM public.clinic_user_permissions cup
      WHERE cup.clinic_user_id = p_target_member_id
    LOOP
      v_cap_view := r.module <> 'configuracoes' AND public.has_module_perm(r.module, false);
      v_cap_edit := r.module NOT IN ('configuracoes', 'financeiro', 'equipe')
                    AND public.has_module_perm(r.module, true);
      IF ((r.can_view OR r.can_edit) AND NOT v_cap_view)
         OR (r.can_edit AND NOT v_cap_edit) THEN
        RAISE EXCEPTION 'cannot_modify_higher' USING errcode = '42501';
      END IF;
    END LOOP;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.equipe_assert_target_ok(uuid, uuid, boolean, boolean, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipe_assert_target_ok(uuid, uuid, boolean, boolean, boolean, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.equipe_assert_target_ok(uuid, uuid, boolean, boolean, boolean, uuid) FROM authenticated;


-- ─── C1. create_clinic_member ────────────────────────────────────────────────

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
  v_caller_user_id   uuid;
  v_caller_clinic_id uuid;
  v_caller_is_admin  boolean;
  v_caller_is_sa     boolean;
  v_new_user_id      uuid;
  v_new_cu_id        uuid;
  v_instance_id      uuid;
  v_username         text;
  v_email            text;
BEGIN
  SELECT * INTO v_caller_user_id, v_caller_clinic_id, v_caller_is_admin, v_caller_is_sa
  FROM public.equipe_authorize_caller(NULL);

  IF p_role IS NULL OR p_role NOT IN ('recepcao', 'auxiliar', 'dentista', 'medico', 'profissional', 'admin') THEN
    RAISE EXCEPTION 'invalid_role' USING errcode = '22023';
  END IF;

  IF p_role = 'admin' AND NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'cannot_grant_admin' USING errcode = '42501';
  END IF;

  IF p_specialty_type IS NOT NULL AND p_specialty_type NOT IN ('odonto','medico','estetica','vet','fisio','psico','nutri','fono','to') THEN
    RAISE EXCEPTION 'invalid_specialty_type' USING errcode = '22023';
  END IF;

  v_username := lower(trim(p_username));
  IF v_username IS NULL OR v_username !~ '^[a-z0-9][a-z0-9_.-]{2,29}$' THEN
    RAISE EXCEPTION 'username_invalid' USING errcode = '22023';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'email_invalid' USING errcode = '22023';
  END IF;

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'weak_password' USING errcode = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION 'email_taken' USING errcode = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM public.clinic_users WHERE username = v_username) THEN
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
    v_email,
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
    v_email,
    'email',
    jsonb_build_object('sub', v_new_user_id::text, 'email', v_email),
    now(), now(), now()
  );

  INSERT INTO public.clinic_users (clinic_id, user_id, role, specialty_type, display_name, username, is_active, is_superadmin, email)
  VALUES (v_caller_clinic_id, v_new_user_id, p_role, p_specialty_type, p_display_name, v_username, true, false, v_email)
  RETURNING id INTO v_new_cu_id;

  IF p_specialty_type IS NOT NULL THEN
    UPDATE public.clinics SET specialties = array_append(specialties, p_specialty_type)
    WHERE id = v_caller_clinic_id AND NOT (p_specialty_type = ANY(specialties));
  END IF;

  RETURN v_new_cu_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_clinic_member(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_clinic_member(text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_clinic_member(text, text, text, text, text, text) TO authenticated, service_role;


-- ─── C2. update_clinic_member ────────────────────────────────────────────────

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
  v_caller_user_id   uuid;
  v_caller_clinic_id uuid;
  v_caller_is_admin  boolean;
  v_caller_is_sa     boolean;
  v_target_clinic_id uuid;
  v_target_user_id   uuid;
  v_target_role      text;
  v_target_active    boolean;
  v_target_is_sa     boolean;
BEGIN
  SELECT clinic_id, user_id, role, coalesce(is_active, true), coalesce(is_superadmin, false)
    INTO v_target_clinic_id, v_target_user_id, v_target_role, v_target_active, v_target_is_sa
  FROM public.clinic_users WHERE id = p_member_id;

  IF v_target_clinic_id IS NULL THEN
    RAISE EXCEPTION 'member_not_found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_caller_user_id, v_caller_clinic_id, v_caller_is_admin, v_caller_is_sa
  FROM public.equipe_authorize_caller(v_target_clinic_id);

  -- superadmin só por superadmin; não-admin: nada de admin, de si mesmo nem de alvo acima do teto
  PERFORM public.equipe_assert_target_ok(p_member_id, v_caller_user_id, v_caller_is_admin, v_caller_is_sa);

  IF NOT v_caller_is_admin THEN
    IF p_role = 'admin' THEN
      RAISE EXCEPTION 'cannot_grant_admin' USING errcode = '42501';
    END IF;
    IF p_is_active IS TRUE AND NOT v_target_active THEN
      RAISE EXCEPTION 'cannot_reactivate_member' USING errcode = '42501';
    END IF;
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

  -- Não deixa a clínica sem admin ativo (rebaixar ou desativar o último).
  -- FOR UPDATE nos admins ativos serializa dois pedidos simultâneos (corrida do último admin).
  IF v_target_role = 'admin' AND v_target_active
     AND ((p_role IS NOT NULL AND p_role <> 'admin') OR p_is_active = false) THEN
    PERFORM 1 FROM public.clinic_users
    WHERE clinic_id = v_target_clinic_id AND role = 'admin' AND is_active = true
    ORDER BY id
    FOR UPDATE;

    IF NOT EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_id = v_target_clinic_id
        AND role = 'admin'
        AND is_active = true
        AND id <> p_member_id
    ) THEN
      IF p_is_active = false THEN
        RAISE EXCEPTION 'cannot_deactivate_last_admin' USING errcode = '23000';
      ELSE
        RAISE EXCEPTION 'cannot_demote_last_admin' USING errcode = '23000';
      END IF;
    END IF;
  END IF;

  UPDATE public.clinic_users
  SET
    role           = COALESCE(p_role, role),
    is_active      = COALESCE(p_is_active, is_active),
    display_name   = COALESCE(p_display_name, display_name),
    specialty_type = CASE WHEN p_clear_specialty_type THEN NULL ELSE COALESCE(p_specialty_type, specialty_type) END
  WHERE id = p_member_id;

  IF p_specialty_type IS NOT NULL THEN
    UPDATE public.clinics SET specialties = array_append(specialties, p_specialty_type)
    WHERE id = v_target_clinic_id AND NOT (p_specialty_type = ANY(specialties));
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_clinic_member(uuid, text, boolean, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_clinic_member(uuid, text, boolean, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_clinic_member(uuid, text, boolean, text, text, boolean) TO authenticated, service_role;


-- ─── C3. delete_clinic_member ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_clinic_member(p_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_user_id   uuid;
  v_caller_clinic_id uuid;
  v_caller_is_admin  boolean;
  v_caller_is_sa     boolean;
  v_target_clinic_id uuid;
  v_target_user_id   uuid;
  v_target_role      text;
  v_target_active    boolean;
  v_target_is_sa     boolean;
BEGIN
  SELECT clinic_id, user_id, role, coalesce(is_active, true), coalesce(is_superadmin, false)
    INTO v_target_clinic_id, v_target_user_id, v_target_role, v_target_active, v_target_is_sa
  FROM public.clinic_users WHERE id = p_member_id;

  IF v_target_clinic_id IS NULL THEN
    RAISE EXCEPTION 'member_not_found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_caller_user_id, v_caller_clinic_id, v_caller_is_admin, v_caller_is_sa
  FROM public.equipe_authorize_caller(v_target_clinic_id);

  -- Exclusão definitiva (apaga também o login em auth.users): só admin/superadmin.
  -- Quem tem equipe/edição só desativa (update_clinic_member p_is_active = false ou unlink).
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
  END IF;

  -- Não pode excluir a si mesmo
  IF v_target_user_id = v_caller_user_id THEN
    RAISE EXCEPTION 'cannot_delete_self' USING errcode = '23000';
  END IF;

  -- Superadmin só por superadmin; recusa conta compartilhada com outra linha (apagaria o auth.users dela)
  PERFORM public.equipe_assert_target_ok(p_member_id, v_caller_user_id, v_caller_is_admin, v_caller_is_sa, true);

  -- Não pode excluir o último admin ativo da clínica (FOR UPDATE: serializa exclusões simultâneas)
  IF v_target_role = 'admin' AND v_target_active THEN
    PERFORM 1 FROM public.clinic_users
    WHERE clinic_id = v_target_clinic_id AND role = 'admin' AND is_active = true
    ORDER BY id
    FOR UPDATE;

    IF NOT EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_id = v_target_clinic_id
        AND role = 'admin'
        AND is_active = true
        AND id <> p_member_id
    ) THEN
      RAISE EXCEPTION 'cannot_delete_last_admin' USING errcode = '23000';
    END IF;
  END IF;

  -- Remove permissões (CASCADE já faria, mas explícito por segurança)
  DELETE FROM public.clinic_user_permissions WHERE clinic_user_id = p_member_id;

  -- Remove o registro de clinic_users (professionals.clinic_user_id vira NULL: ON DELETE SET NULL)
  DELETE FROM public.clinic_users WHERE id = p_member_id;

  -- Remove o usuário do auth.users
  DELETE FROM auth.users WHERE id = v_target_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_clinic_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_clinic_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_clinic_member(uuid) TO authenticated, service_role;


-- ─── C4. save_clinic_member_permissions ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_clinic_member_permissions(p_member_id uuid, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_user_id   uuid;
  v_caller_clinic_id uuid;
  v_caller_is_admin  boolean;
  v_caller_is_sa     boolean;
  v_target_clinic_id uuid;
  v_target_user_id   uuid;
  v_target_role      text;
  v_target_is_sa     boolean;
  perm               jsonb;
  v_module           text;
  v_can_edit         boolean;
  v_can_view         boolean;
  v_req_view         boolean;
  v_req_edit         boolean;
  v_cur_view         boolean;
  v_cur_edit         boolean;
  v_cap_view         boolean;
  v_cap_edit         boolean;
  v_locked           text[] := '{}';
  v_old_meta         jsonb := '{}'::jsonb;
  v_meta             jsonb;
  v_valid_modules    constant text[] := ARRAY[
    'dashboard','pacientes','prontuario','agenda','financeiro','comissoes','procedimentos',
    'relatorios','metas','estoque','equipe','crm','campanhas','configuracoes'
  ];
BEGIN
  SELECT clinic_id, user_id, role, coalesce(is_superadmin, false)
    INTO v_target_clinic_id, v_target_user_id, v_target_role, v_target_is_sa
  FROM public.clinic_users WHERE id = p_member_id;

  IF v_target_clinic_id IS NULL THEN
    RAISE EXCEPTION 'member_not_found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_caller_user_id, v_caller_clinic_id, v_caller_is_admin, v_caller_is_sa
  FROM public.equipe_authorize_caller(v_target_clinic_id);

  -- superadmin só por superadmin; não-admin: nada de admin, de si mesmo nem de alvo acima do teto
  PERFORM public.equipe_assert_target_ok(p_member_id, v_caller_user_id, v_caller_is_admin, v_caller_is_sa);

  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'invalid_permissions' USING errcode = '22023';
  END IF;

  -- Valida tudo antes de apagar qualquer coisa
  FOR perm IN SELECT * FROM jsonb_array_elements(p_permissions)
  LOOP
    v_module := perm->>'module';
    IF v_module IS NULL OR NOT (v_module = ANY (v_valid_modules)) THEN
      RAISE EXCEPTION 'invalid_module: %', coalesce(v_module, '(null)') USING errcode = '22023';
    END IF;
  END LOOP;

  -- Teto de concessão para quem não é admin
  IF NOT v_caller_is_admin THEN
    FOREACH v_module IN ARRAY v_valid_modules
    LOOP
      -- pedido no payload (módulo repetido: vale o mais permissivo, que é só mais estrito aqui)
      SELECT coalesce(bool_or(coalesce((e->>'can_edit')::boolean, false)), false),
             coalesce(bool_or(coalesce((e->>'can_view')::boolean, false)
                              OR coalesce((e->>'can_edit')::boolean, false)), false)
        INTO v_req_edit, v_req_view
      FROM jsonb_array_elements(p_permissions) e
      WHERE e->>'module' = v_module;

      -- o que o alvo já tem
      v_cur_view := NULL; v_cur_edit := NULL;
      SELECT cup.can_view, cup.can_edit INTO v_cur_view, v_cur_edit
      FROM public.clinic_user_permissions cup
      WHERE cup.clinic_user_id = p_member_id AND cup.module = v_module;
      v_cur_view := coalesce(v_cur_view, false) OR coalesce(v_cur_edit, false);
      v_cur_edit := coalesce(v_cur_edit, false);

      -- o que o chamador pode conceder
      v_cap_view := v_module <> 'configuracoes' AND public.has_module_perm(v_module, false);
      v_cap_edit := v_module NOT IN ('configuracoes', 'financeiro', 'equipe')
                    AND public.has_module_perm(v_module, true);

      IF (v_req_view AND NOT v_cur_view AND NOT v_cap_view)
         OR (v_req_edit AND NOT v_cur_edit AND NOT v_cap_edit) THEN
        RAISE EXCEPTION 'cannot_grant_permission' USING errcode = '42501';
      END IF;

      -- módulo que o chamador não enxerga: a linha do alvo fica como está
      IF NOT v_cap_view THEN
        v_locked := v_locked || v_module;
      END IF;
    END LOOP;
  END IF;

  -- metadata atual do alvo, por módulo (lido antes do DELETE); usado só para não-admin
  SELECT coalesce(jsonb_object_agg(cup.module, cup.metadata), '{}'::jsonb) INTO v_old_meta
  FROM public.clinic_user_permissions cup
  WHERE cup.clinic_user_id = p_member_id;

  DELETE FROM public.clinic_user_permissions
  WHERE clinic_user_id = p_member_id
    AND NOT (module = ANY (v_locked));

  FOR perm IN SELECT * FROM jsonb_array_elements(p_permissions)
  LOOP
    v_module := perm->>'module';
    IF v_module = ANY (v_locked) THEN
      CONTINUE;
    END IF;

    v_can_edit := coalesce((perm->>'can_edit')::boolean, false);
    v_can_view := coalesce((perm->>'can_view')::boolean, false) OR v_can_edit;

    IF v_caller_is_admin THEN
      v_meta := COALESCE(perm->'metadata', '{}'::jsonb);
    ELSE
      -- Não-admin não define metadata (ex.: show_totals): mantém o do alvo; se o módulo é
      -- novo para o alvo, copia o do próprio chamador (nunca acima do que ele tem).
      v_meta := v_old_meta -> v_module;
      IF v_meta IS NULL THEN
        SELECT cup.metadata INTO v_meta
        FROM public.clinic_user_permissions cup
        JOIN public.clinic_users cu ON cu.id = cup.clinic_user_id
        WHERE cu.user_id = v_caller_user_id AND cu.is_active = true AND cup.module = v_module
        LIMIT 1;
      END IF;
      v_meta := COALESCE(v_meta, '{}'::jsonb);
    END IF;

    INSERT INTO public.clinic_user_permissions (clinic_id, clinic_user_id, module, can_view, can_edit, metadata)
    VALUES (
      v_target_clinic_id,
      p_member_id,
      v_module,
      v_can_view,
      v_can_edit,
      v_meta
    )
    ON CONFLICT (clinic_user_id, module) DO UPDATE
      SET can_view = EXCLUDED.can_view,
          can_edit = EXCLUDED.can_edit,
          metadata = EXCLUDED.metadata,
          updated_at = now();
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_clinic_member_permissions(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_clinic_member_permissions(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_clinic_member_permissions(uuid, jsonb) TO authenticated, service_role;


-- ─── C5. link_professional_login ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.link_professional_login(
  p_professional_id uuid,
  p_email text,
  p_password text,
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
  v_caller_user_id   uuid;
  v_caller_clinic_id uuid;
  v_caller_is_admin  boolean;
  v_caller_is_sa     boolean;
  v_prof             public.professionals%ROWTYPE;
  v_prof_clinic_id   uuid;
  v_cu_id            uuid;
BEGIN
  SELECT * INTO v_caller_user_id, v_caller_clinic_id, v_caller_is_admin, v_caller_is_sa
  FROM public.equipe_authorize_caller(NULL);

  -- Primeiro confere a clínica (sem lock); só depois trava a linha do profissional
  SELECT clinic_id INTO v_prof_clinic_id FROM public.professionals WHERE id = p_professional_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found' USING errcode = 'P0002';
  END IF;

  -- O login nasce na clínica do chamador, então o profissional tem de ser dela (vale p/ superadmin também)
  IF v_prof_clinic_id IS DISTINCT FROM v_caller_clinic_id THEN
    RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
  END IF;

  SELECT * INTO v_prof FROM public.professionals WHERE id = p_professional_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found' USING errcode = 'P0002';
  END IF;

  IF v_prof.clinic_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'professional_already_linked' USING errcode = '23505';
  END IF;

  -- Reaproveita toda a validação/criação (cargo, username, e-mail, senha, auth.users/identities).
  -- cannot_grant_admin e demais erros sobem daqui. Sem p_specialty_type usa a área do profissional.
  v_cu_id := public.create_clinic_member(
    p_email, p_password, v_prof.name, p_username, p_role,
    coalesce(p_specialty_type, v_prof.specialty_type)
  );

  -- Dono da função: o gatilho professionals_guard_clinic_user_id não barra (current_user não é authenticated)
  UPDATE public.professionals SET clinic_user_id = v_cu_id WHERE id = p_professional_id;

  RETURN v_cu_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_professional_login(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_professional_login(uuid, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_professional_login(uuid, text, text, text, text, text) TO authenticated, service_role;


-- ─── C6. unlink_professional_login ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unlink_professional_login(p_professional_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_user_id   uuid;
  v_caller_clinic_id uuid;
  v_caller_is_admin  boolean;
  v_caller_is_sa     boolean;
  v_prof             public.professionals%ROWTYPE;
  v_prof_clinic_id   uuid;
  v_pre_cu_id        uuid;
  v_target_user_id   uuid;
  v_target_role      text;
  v_target_active    boolean;
BEGIN
  -- Leitura sem lock; autoriza ANTES de travar qualquer linha (quem não pode não segura lock)
  SELECT clinic_id, clinic_user_id INTO v_prof_clinic_id, v_pre_cu_id
  FROM public.professionals WHERE id = p_professional_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_caller_user_id, v_caller_clinic_id, v_caller_is_admin, v_caller_is_sa
  FROM public.equipe_authorize_caller(v_prof_clinic_id);

  IF v_pre_cu_id IS NULL THEN
    RAISE EXCEPTION 'professional_not_linked' USING errcode = 'P0002';
  END IF;

  -- O clinic_user vinculado tem de ser da clínica do profissional
  SELECT cu.user_id, cu.role, coalesce(cu.is_active, true)
    INTO v_target_user_id, v_target_role, v_target_active
  FROM public.clinic_users cu
  WHERE cu.id = v_pre_cu_id AND cu.clinic_id = v_prof_clinic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
  END IF;

  -- Ordem de lock (igual a delete_clinic_member): clinic_users (por id) e depois professionals,
  -- para não haver deadlock entre unlink e exclusão. Admin alvo: trava todos os admins ativos.
  PERFORM 1 FROM public.clinic_users cu
  WHERE cu.id = v_pre_cu_id
     OR (coalesce(v_target_role, '') = 'admin' AND v_target_active
         AND cu.clinic_id = v_prof_clinic_id AND cu.role = 'admin' AND cu.is_active = true)
  ORDER BY cu.id
  FOR UPDATE;

  SELECT * INTO v_prof FROM public.professionals WHERE id = p_professional_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found' USING errcode = 'P0002';
  END IF;
  IF v_prof.clinic_user_id IS DISTINCT FROM v_pre_cu_id THEN
    RAISE EXCEPTION 'concurrent_change' USING errcode = '40001';
  END IF;

  IF v_caller_is_admin AND v_target_user_id = v_caller_user_id THEN
    RAISE EXCEPTION 'cannot_deactivate_self' USING errcode = '23000';
  END IF;

  -- superadmin só por superadmin; não-admin: nada de admin, de si mesmo nem de alvo acima do teto
  PERFORM public.equipe_assert_target_ok(
    v_pre_cu_id, v_caller_user_id, v_caller_is_admin, v_caller_is_sa, false, v_prof_clinic_id);

  -- Não desativa o último admin ativo (admins já travados acima)
  IF coalesce(v_target_role, '') = 'admin' AND v_target_active THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.clinic_users
      WHERE clinic_id = v_prof_clinic_id AND role = 'admin' AND is_active = true
        AND id <> v_pre_cu_id
    ) THEN
      RAISE EXCEPTION 'cannot_deactivate_last_admin' USING errcode = '23000';
    END IF;
  END IF;

  UPDATE public.clinic_users SET is_active = false
  WHERE id = v_pre_cu_id AND clinic_id = v_prof_clinic_id;

  UPDATE public.professionals SET clinic_user_id = NULL WHERE id = p_professional_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.unlink_professional_login(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlink_professional_login(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unlink_professional_login(uuid) TO authenticated, service_role;


-- ─── C7. reset_clinic_member_password ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_clinic_member_password(p_clinic_user_id uuid, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_caller_user_id   uuid;
  v_caller_clinic_id uuid;
  v_caller_is_admin  boolean;
  v_caller_is_sa     boolean;
  v_target_clinic_id uuid;
  v_target_user_id   uuid;
  v_target_role      text;
  v_target_is_sa     boolean;
BEGIN
  SELECT clinic_id, user_id, role, coalesce(is_superadmin, false)
    INTO v_target_clinic_id, v_target_user_id, v_target_role, v_target_is_sa
  FROM public.clinic_users WHERE id = p_clinic_user_id;

  IF v_target_clinic_id IS NULL THEN
    RAISE EXCEPTION 'member_not_found' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_caller_user_id, v_caller_clinic_id, v_caller_is_admin, v_caller_is_sa
  FROM public.equipe_authorize_caller(v_target_clinic_id);

  -- superadmin só por superadmin; conta compartilhada com outra linha (outra clínica/cargo) é recusada;
  -- não-admin: nada de admin, de si mesmo nem de alvo com permissões acima do teto (anti-takeover)
  PERFORM public.equipe_assert_target_ok(p_clinic_user_id, v_caller_user_id, v_caller_is_admin, v_caller_is_sa, true);

  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'weak_password' USING errcode = '22023';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = v_target_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_clinic_member_password(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_clinic_member_password(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_clinic_member_password(uuid, text) TO authenticated, service_role;


-- ─── C8. professionals_guard_clinic_user_id: libera equipe/edição, com limites ──
-- Superadmin: livre. Admin: livre, mas só com usuário da clínica do profissional (que é a
-- dele). Quem tem equipe/edição: pode vincular/desvincular só
-- usuário da própria clínica que NÃO seja admin, superadmin nem ele mesmo (vale para o
-- vínculo antigo e para o novo). Sessões não-API (service_role, SQL Editor, RPC
-- SECURITY DEFINER) passam direto.

-- Os EXISTS ficam em helpers SECURITY DEFINER: o gatilho é SECURITY INVOKER (precisa ser, pois o
-- bypass usa current_user NOT IN ('authenticated','anon')) e a RLS de clinic_users mostra ao
-- não-admin só a própria linha, então a consulta direta nunca acharia o alvo. Como o gatilho roda
-- com o papel da sessão, os helpers precisam de EXECUTE para authenticated; eles só devolvem boolean
-- sobre usuários da clínica do próprio chamador (get_my_clinic_id) e não aceitam anon.

CREATE OR REPLACE FUNCTION public.professionals_link_target_ok(
  p_clinic_user_id uuid,
  p_professional_clinic_id uuid,
  p_restrict_privileged boolean
)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- usuário existe, é da clínica do chamador e do profissional; se p_restrict_privileged,
  -- também não é admin, superadmin nem o próprio chamador
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.id = p_clinic_user_id
      AND cu.clinic_id = public.get_my_clinic_id()
      AND cu.clinic_id IS NOT DISTINCT FROM p_professional_clinic_id
      AND (NOT p_restrict_privileged
           OR (cu.role IS DISTINCT FROM 'admin'
               AND NOT coalesce(cu.is_superadmin, false)
               AND cu.user_id <> auth.uid()))
  );
$function$;

CREATE OR REPLACE FUNCTION public.professionals_old_link_blocked(p_clinic_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- vínculo atual de admin, superadmin, do próprio chamador ou de outra clínica: bloqueado
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.id = p_clinic_user_id
      AND (cu.role = 'admin' OR coalesce(cu.is_superadmin, false) OR cu.user_id = auth.uid()
           OR cu.clinic_id IS DISTINCT FROM public.get_my_clinic_id())
  );
$function$;

REVOKE ALL ON FUNCTION public.professionals_link_target_ok(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.professionals_link_target_ok(uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.professionals_link_target_ok(uuid, uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.professionals_old_link_blocked(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.professionals_old_link_blocked(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.professionals_old_link_blocked(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.professionals_guard_clinic_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.clinic_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.clinic_user_id IS NOT DISTINCT FROM OLD.clinic_user_id THEN
    RETURN NEW;
  END IF;

  IF public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  -- Admin: livre, mas o usuário vinculado tem de ser da própria clínica (e da clínica do profissional)
  IF public.get_my_role() = 'admin' THEN
    IF NEW.clinic_user_id IS NULL
       OR public.professionals_link_target_ok(NEW.clinic_user_id, NEW.clinic_id, false) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'professional_clinic_user_admin_only' USING ERRCODE = '42501';
  END IF;

  IF public.has_module_perm('equipe', true) THEN
    -- vínculo antigo (desvincular): não pode ser de admin, superadmin nem dele mesmo
    IF TG_OP = 'UPDATE' AND OLD.clinic_user_id IS NOT NULL
       AND public.professionals_old_link_blocked(OLD.clinic_user_id) THEN
      RAISE EXCEPTION 'professional_clinic_user_admin_only' USING ERRCODE = '42501';
    END IF;

    -- vínculo novo: precisa existir, ser da clínica do chamador e do profissional e não ser admin/superadmin/ele mesmo
    IF NEW.clinic_user_id IS NULL
       OR public.professionals_link_target_ok(NEW.clinic_user_id, NEW.clinic_id, true) THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'professional_clinic_user_admin_only' USING ERRCODE = '42501';
END
$function$;

DROP TRIGGER IF EXISTS trg_professionals_guard_clinic_user_id ON public.professionals;
CREATE TRIGGER trg_professionals_guard_clinic_user_id
  BEFORE INSERT OR UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.professionals_guard_clinic_user_id();


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de colar; só leitura):
--   select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.proconfig, p.proacl::text
--     from pg_proc p where p.pronamespace='public'::regnamespace
--      and p.proname in ('equipe_authorize_caller','equipe_assert_target_ok','professionals_link_target_ok','professionals_old_link_blocked','create_clinic_member','update_clinic_member',
--        'delete_clinic_member','save_clinic_member_permissions','link_professional_login',
--        'unlink_professional_login','reset_clinic_member_password','professionals_guard_clinic_user_id')
--     order by 1;   -- 12 linhas; prosecdef=true nas 8 RPCs + 4 helpers; proacl sem "=X" (PUBLIC) nem "anon=X";
--                   -- equipe_* sem authenticated; professionals_link_target_ok/old_link_blocked COM authenticated (usados pelo gatilho)
--   select tgname from pg_trigger where tgrelid='public.professionals'::regclass and not tgisinternal;
--                   -- trg_professionals_guard_clinic_user_id + trg_enforce_clinic_professional_limit
--   Teste funcional sugerido (usar clínica/usuário de QA, nunca dado real): logar como recepção com
--   equipe/edição e chamar create_clinic_member(..., 'admin') -> cannot_grant_admin;
--   create_clinic_member(..., 'recepcao') -> ok; update_clinic_member(<id admin>) -> cannot_modify_admin;
--   save_clinic_member_permissions concedendo configuracoes -> cannot_grant_permission.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (executar em bloco; só com confirmação do dono)
--
--   -- C5, C6, C7, C0: funções novas (nada depende delas no banco)
--   DROP FUNCTION IF EXISTS public.link_professional_login(uuid, text, text, text, text, text);
--   DROP FUNCTION IF EXISTS public.unlink_professional_login(uuid);
--   DROP FUNCTION IF EXISTS public.reset_clinic_member_password(uuid, text);
--   -- (só depois de restaurar C1..C4 abaixo, que chamam o helper)
--   DROP FUNCTION IF EXISTS public.professionals_link_target_ok(uuid, uuid, boolean);
--   DROP FUNCTION IF EXISTS public.professionals_old_link_blocked(uuid);
--   -- (só depois de trocar ou remover o gatilho C8, que chama os dois acima)
--   DROP FUNCTION IF EXISTS public.equipe_assert_target_ok(uuid, uuid, boolean, boolean, boolean, uuid);
--   DROP FUNCTION IF EXISTS public.equipe_authorize_caller(uuid);
--
--   -- C1, C2: restaurar o corpo de 20261111_clinic_member_specialty_fono_to.sql
--   --   (repetir os dois CREATE OR REPLACE desse arquivo: create_clinic_member e update_clinic_member;
--   --    volta a ser admin-only e perde weak_password/email_invalid/last-admin).
--   -- C3: restaurar o bloco A1 de 20261111_seguranca_criticos.sql (delete_clinic_member admin-only).
--   -- C4: restaurar a B11 de 20261111_permissoes_por_modulo.sql (admin-only, com validação de módulo);
--   --   ou, para o estado anterior a ambas, a versão sem validação listada no ROLLBACK daquele arquivo.
--   -- C8: voltar o gatilho para "só admin/superadmin":
--   --   se 20261111_permissoes_por_modulo.sql ESTÁ aplicado: repetir o CREATE OR REPLACE
--   --     FUNCTION professionals_guard_clinic_user_id() do bloco B7 daquele arquivo;
--   --   se NÃO está (estado de produção em 2026-11-12):
--   --     DROP TRIGGER IF EXISTS trg_professionals_guard_clinic_user_id ON public.professionals;
--   --     DROP FUNCTION IF EXISTS public.professionals_guard_clinic_user_id();
--   -- Grants: os REVOKE de anon em create/update/save podem ser desfeitos com
--   --   GRANT EXECUTE ON FUNCTION <assinatura> TO anon, PUBLIC;  (estado anterior de produção)
-- ═══════════════════════════════════════════════════════════════════════════
