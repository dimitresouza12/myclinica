-- ═══════════════════════════════════════════════════════════════════════════
-- EQUIPE: NÃO-ADMIN GERENCIA LOGINS COMUNS DA CLÍNICA (sem comparar com o teto)
-- Criado em: 2026-11-14 | Projeto Supabase: siohvtgbomvcprbzfamr
-- Depende de: 20261112_equipe_acessos.sql e 20261113_equipe_preset_novo_login.sql (já aplicados)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problema (QA): recepção com equipe/edição cria o login de um dentista (preset com prontuario
-- em edição), mas depois NÃO consegue redefinir a senha nem desativar esse login:
-- equipe_assert_target_ok levanta cannot_modify_higher porque o alvo tem prontuario acima do
-- teto da recepção.
--
-- Decisão do dono: a recepção gerencia (redefinir senha, desativar, atualizar nome/cargo,
-- desvincular) logins comuns da clínica, mesmo com permissões clínicas que ela não tem,
-- consistente com ela poder criá-los.
--
-- Mudança (só o ramo chamador NÃO-admin de equipe_assert_target_ok): o alvo deixa de ser
-- comparado com as permissões do chamador. Passa a valer uma lista de proibições absolutas;
-- o alvo é recusado com cannot_modify_higher (42501) se tiver:
--   - QUALQUER nível (ver ou editar) de 'configuracoes', OU
--   - 'financeiro' em edição, OU
--   - 'equipe' em edição.
-- Continuam recusas: alvo admin/superadmin (cannot_modify_admin), o próprio chamador
-- (cannot_modify_self), conta compartilhada (target_shared_account), outra clínica
-- (not_authorized). Login sem nenhuma permissão passa. Admin/superadmin: livre, sem mudança.
--
-- save_clinic_member_permissions: NÃO muda. O ramo "alvo com linhas" só compara o que é
-- PEDIDO com o que o alvo JÁ tem; reenviar o que o alvo tem e rebaixar passam, e conceder acima
-- do teto continua recusado (cannot_grant_permission). Módulos que o chamador não enxerga ficam
-- travados (linha do alvo preservada). Só deixava de funcionar porque o helper barrava antes.
--
-- Mantidos: assinatura, SECURITY DEFINER, search_path, STABLE, grants (CREATE OR REPLACE
-- preserva os REVOKE de 20261112). Aditiva: só CREATE OR REPLACE desta função.
-- Desfazer: bloco ROLLBACK no fim (restaura o corpo de 20261112_equipe_acessos.sql, C0b).
-- ═══════════════════════════════════════════════════════════════════════════


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

    -- Proibições absolutas (não dependem do que o chamador tem): login com qualquer nível de
    -- configuracoes, ou financeiro/equipe em edição, só admin gerencia.
    IF EXISTS (
      SELECT 1 FROM public.clinic_user_permissions cup
      WHERE cup.clinic_user_id = p_target_member_id
        AND ((cup.module = 'configuracoes' AND (cup.can_view OR cup.can_edit))
             OR (cup.module IN ('financeiro', 'equipe') AND cup.can_edit))
    ) THEN
      RAISE EXCEPTION 'cannot_modify_higher' USING errcode = '42501';
    END IF;
  END IF;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodar depois de aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--   select position('Proibições absolutas' in pg_get_functiondef('public.equipe_assert_target_ok(uuid,uuid,boolean,boolean,boolean,uuid)'::regprocedure)) > 0 as nova_regra;
--   -- grants: authenticated/anon/PUBLIC sem EXECUTE (helper interno), como em 20261112
--   select has_function_privilege('authenticated','public.equipe_assert_target_ok(uuid,uuid,boolean,boolean,boolean,uuid)','execute');  -- false


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (restaura o corpo de 20261112_equipe_acessos.sql, C0b)
-- ═══════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE FUNCTION public.equipe_assert_target_ok(
--   p_target_member_id uuid,
--   p_caller_user_id uuid,
--   p_caller_is_admin boolean,
--   p_caller_is_superadmin boolean,
--   p_touches_auth boolean DEFAULT false,
--   p_expected_clinic_id uuid DEFAULT NULL
-- )
--  RETURNS void
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_clinic_id uuid;
--   v_user_id   uuid;
--   v_role      text;
--   v_is_sa     boolean;
--   r           record;
--   v_cap_view  boolean;
--   v_cap_edit  boolean;
-- BEGIN
--   SELECT cu.clinic_id, cu.user_id, cu.role, coalesce(cu.is_superadmin, false)
--     INTO v_clinic_id, v_user_id, v_role, v_is_sa
--   FROM public.clinic_users cu WHERE cu.id = p_target_member_id;
--
--   IF v_clinic_id IS NULL THEN
--     RAISE EXCEPTION 'member_not_found' USING errcode = 'P0002';
--   END IF;
--
--   IF p_expected_clinic_id IS NOT NULL AND v_clinic_id <> p_expected_clinic_id THEN
--     RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
--   END IF;
--
--   IF v_is_sa AND NOT coalesce(p_caller_is_superadmin, false) THEN
--     RAISE EXCEPTION 'cannot_modify_admin' USING errcode = '42501';
--   END IF;
--
--   IF p_touches_auth AND NOT coalesce(p_caller_is_superadmin, false) AND EXISTS (
--     SELECT 1 FROM public.clinic_users cu
--     WHERE cu.user_id = v_user_id AND cu.id <> p_target_member_id
--   ) THEN
--     RAISE EXCEPTION 'target_shared_account' USING errcode = '42501';
--   END IF;
--
--   IF NOT coalesce(p_caller_is_admin, false) THEN
--     IF coalesce(v_role, '') = 'admin' THEN
--       RAISE EXCEPTION 'cannot_modify_admin' USING errcode = '42501';
--     END IF;
--     IF v_user_id = p_caller_user_id THEN
--       RAISE EXCEPTION 'cannot_modify_self' USING errcode = '42501';
--     END IF;
--
--     FOR r IN
--       SELECT cup.module, cup.can_view, cup.can_edit
--       FROM public.clinic_user_permissions cup
--       WHERE cup.clinic_user_id = p_target_member_id
--     LOOP
--       v_cap_view := r.module <> 'configuracoes' AND public.has_module_perm(r.module, false);
--       v_cap_edit := r.module NOT IN ('configuracoes', 'financeiro', 'equipe')
--                     AND public.has_module_perm(r.module, true);
--       IF ((r.can_view OR r.can_edit) AND NOT v_cap_view)
--          OR (r.can_edit AND NOT v_cap_edit) THEN
--         RAISE EXCEPTION 'cannot_modify_higher' USING errcode = '42501';
--       END IF;
--     END LOOP;
--   END IF;
-- END;
-- $function$;
