-- ═══════════════════════════════════════════════════════════════════════════
-- EQUIPE: LOGIN NOVO NASCE COM O PRESET DO CARGO (com limite)
-- Criado em: 2026-11-13 | Projeto Supabase: siohvtgbomvcprbzfamr
-- Depende de: 20261112_equipe_acessos.sql (já aplicado em produção)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problema (QA): recepção com equipe/edição cria o login de um dentista; ao gravar o preset
-- do cargo, save_clinic_member_permissions (teto do chamador) levanta cannot_grant_permission
-- porque o preset tem módulos que a recepção não tem (prontuario, dashboard...), e o login
-- fica sem nenhuma permissão.
--
-- Regra nova, só no ramo NÃO-admin de save_clinic_member_permissions:
--   Se o alvo NÃO tem nenhuma linha em clinic_user_permissions (login recém-criado), é da
--   MESMA clínica do chamador e não é admin, superadmin nem o próprio chamador, o teto do
--   chamador NÃO se aplica aos módulos de visualização/edição comum. Continua proibido:
--     - qualquer nível de 'configuracoes' (ver ou editar);
--     - 'financeiro' em edição e 'equipe' em edição;
--     - show_totals=true (payload com show_totals=true é recusado; o metadata gravado para
--       login novo tem show_totals=false em financeiro, pois a tela trata ausente como true).
--   Violação: cannot_grant_permission (42501). Módulo inválido e can_edit => can_view seguem
--   como antes. Alvo que JÁ tem linhas: teto atual, sem mudança. Admin: livre, sem mudança.
--
-- Mantidos: assinatura, SECURITY DEFINER, search_path, grants (REVOKE PUBLIC/anon; GRANT
-- authenticated, service_role). Aditiva: só CREATE OR REPLACE desta função.
-- Desfazer: bloco ROLLBACK no fim (restaura o corpo de 20261112_equipe_acessos.sql, C4).
-- ═══════════════════════════════════════════════════════════════════════════


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
  v_fresh            boolean := false;
  v_req_totals       boolean;
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

  -- Login NOVO (alvo sem nenhuma linha de permissão), da mesma clínica do chamador e que não
  -- é admin, superadmin nem o próprio chamador: nasce com o preset do cargo, então o teto do
  -- chamador não vale para módulos de visualização/edição comum (a recepção cria o login do
  -- dentista, cujo preset tem prontuario, dashboard etc. que a recepção não tem). Continua
  -- proibido: qualquer nível de configuracoes, financeiro em edição, equipe em edição e
  -- show_totals=true. Alvo que já tem linhas segue com o teto normal.
  IF NOT v_caller_is_admin THEN
    v_fresh := v_target_clinic_id = v_caller_clinic_id
               AND coalesce(v_target_role, '') <> 'admin'
               AND NOT v_target_is_sa
               AND v_target_user_id <> v_caller_user_id
               AND NOT EXISTS (SELECT 1 FROM public.clinic_user_permissions cup
                               WHERE cup.clinic_user_id = p_member_id);
  END IF;

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

      IF v_fresh THEN
        -- login novo: só as proibições absolutas; o resto do preset do cargo passa
        IF (v_module = 'configuracoes' AND (v_req_view OR v_req_edit))
           OR (v_module IN ('financeiro', 'equipe') AND v_req_edit) THEN
          RAISE EXCEPTION 'cannot_grant_permission' USING errcode = '42501';
        END IF;

        -- show_totals=true nunca é concedido por não-admin (ausente na tela = true, então
        -- o metadata gravado abaixo força false)
        SELECT coalesce(bool_or(lower(coalesce(e->'metadata'->>'show_totals', '')) IN ('true', 't', '1')), false)
          INTO v_req_totals
        FROM jsonb_array_elements(p_permissions) e
        WHERE e->>'module' = v_module;
        IF v_req_totals THEN
          RAISE EXCEPTION 'cannot_grant_permission' USING errcode = '42501';
        END IF;

        -- configuracoes nunca é escrita por não-admin
        IF v_module = 'configuracoes' THEN
          v_locked := v_locked || v_module;
        END IF;
      ELSE
        IF (v_req_view AND NOT v_cur_view AND NOT v_cap_view)
           OR (v_req_edit AND NOT v_cur_edit AND NOT v_cap_edit) THEN
          RAISE EXCEPTION 'cannot_grant_permission' USING errcode = '42501';
        END IF;

        -- módulo que o chamador não enxerga: a linha do alvo fica como está
        IF NOT v_cap_view THEN
          v_locked := v_locked || v_module;
        END IF;
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
      -- login novo: show_totals sempre false (nunca herdado do chamador, nem ausente)
      IF v_fresh AND (v_module = 'financeiro' OR v_meta ? 'show_totals') THEN
        v_meta := v_meta || '{"show_totals": false}'::jsonb;
      END IF;
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


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (executar em bloco; só com confirmação do dono)
-- Restaura o corpo de save_clinic_member_permissions de 20261112_equipe_acessos.sql (C4):
--
--   CREATE OR REPLACE FUNCTION public.save_clinic_member_permissions(p_member_id uuid, p_permissions jsonb)
--    RETURNS void
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_caller_user_id   uuid;
--     v_caller_clinic_id uuid;
--     v_caller_is_admin  boolean;
--     v_caller_is_sa     boolean;
--     v_target_clinic_id uuid;
--     v_target_user_id   uuid;
--     v_target_role      text;
--     v_target_is_sa     boolean;
--     perm               jsonb;
--     v_module           text;
--     v_can_edit         boolean;
--     v_can_view         boolean;
--     v_req_view         boolean;
--     v_req_edit         boolean;
--     v_cur_view         boolean;
--     v_cur_edit         boolean;
--     v_cap_view         boolean;
--     v_cap_edit         boolean;
--     v_locked           text[] := '{}';
--     v_old_meta         jsonb := '{}'::jsonb;
--     v_meta             jsonb;
--     v_valid_modules    constant text[] := ARRAY[
--       'dashboard','pacientes','prontuario','agenda','financeiro','comissoes','procedimentos',
--       'relatorios','metas','estoque','equipe','crm','campanhas','configuracoes'
--     ];
--   BEGIN
--     SELECT clinic_id, user_id, role, coalesce(is_superadmin, false)
--       INTO v_target_clinic_id, v_target_user_id, v_target_role, v_target_is_sa
--     FROM public.clinic_users WHERE id = p_member_id;
--
--     IF v_target_clinic_id IS NULL THEN
--       RAISE EXCEPTION 'member_not_found' USING errcode = 'P0002';
--     END IF;
--
--     SELECT * INTO v_caller_user_id, v_caller_clinic_id, v_caller_is_admin, v_caller_is_sa
--     FROM public.equipe_authorize_caller(v_target_clinic_id);
--
--     -- superadmin só por superadmin; não-admin: nada de admin, de si mesmo nem de alvo acima do teto
--     PERFORM public.equipe_assert_target_ok(p_member_id, v_caller_user_id, v_caller_is_admin, v_caller_is_sa);
--
--     IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
--       RAISE EXCEPTION 'invalid_permissions' USING errcode = '22023';
--     END IF;
--
--     -- Valida tudo antes de apagar qualquer coisa
--     FOR perm IN SELECT * FROM jsonb_array_elements(p_permissions)
--     LOOP
--       v_module := perm->>'module';
--       IF v_module IS NULL OR NOT (v_module = ANY (v_valid_modules)) THEN
--         RAISE EXCEPTION 'invalid_module: %', coalesce(v_module, '(null)') USING errcode = '22023';
--       END IF;
--     END LOOP;
--
--     -- Teto de concessão para quem não é admin
--     IF NOT v_caller_is_admin THEN
--       FOREACH v_module IN ARRAY v_valid_modules
--       LOOP
--         -- pedido no payload (módulo repetido: vale o mais permissivo, que é só mais estrito aqui)
--         SELECT coalesce(bool_or(coalesce((e->>'can_edit')::boolean, false)), false),
--                coalesce(bool_or(coalesce((e->>'can_view')::boolean, false)
--                                 OR coalesce((e->>'can_edit')::boolean, false)), false)
--           INTO v_req_edit, v_req_view
--         FROM jsonb_array_elements(p_permissions) e
--         WHERE e->>'module' = v_module;
--
--         -- o que o alvo já tem
--         v_cur_view := NULL; v_cur_edit := NULL;
--         SELECT cup.can_view, cup.can_edit INTO v_cur_view, v_cur_edit
--         FROM public.clinic_user_permissions cup
--         WHERE cup.clinic_user_id = p_member_id AND cup.module = v_module;
--         v_cur_view := coalesce(v_cur_view, false) OR coalesce(v_cur_edit, false);
--         v_cur_edit := coalesce(v_cur_edit, false);
--
--         -- o que o chamador pode conceder
--         v_cap_view := v_module <> 'configuracoes' AND public.has_module_perm(v_module, false);
--         v_cap_edit := v_module NOT IN ('configuracoes', 'financeiro', 'equipe')
--                       AND public.has_module_perm(v_module, true);
--
--         IF (v_req_view AND NOT v_cur_view AND NOT v_cap_view)
--            OR (v_req_edit AND NOT v_cur_edit AND NOT v_cap_edit) THEN
--           RAISE EXCEPTION 'cannot_grant_permission' USING errcode = '42501';
--         END IF;
--
--         -- módulo que o chamador não enxerga: a linha do alvo fica como está
--         IF NOT v_cap_view THEN
--           v_locked := v_locked || v_module;
--         END IF;
--       END LOOP;
--     END IF;
--
--     -- metadata atual do alvo, por módulo (lido antes do DELETE); usado só para não-admin
--     SELECT coalesce(jsonb_object_agg(cup.module, cup.metadata), '{}'::jsonb) INTO v_old_meta
--     FROM public.clinic_user_permissions cup
--     WHERE cup.clinic_user_id = p_member_id;
--
--     DELETE FROM public.clinic_user_permissions
--     WHERE clinic_user_id = p_member_id
--       AND NOT (module = ANY (v_locked));
--
--     FOR perm IN SELECT * FROM jsonb_array_elements(p_permissions)
--     LOOP
--       v_module := perm->>'module';
--       IF v_module = ANY (v_locked) THEN
--         CONTINUE;
--       END IF;
--
--       v_can_edit := coalesce((perm->>'can_edit')::boolean, false);
--       v_can_view := coalesce((perm->>'can_view')::boolean, false) OR v_can_edit;
--
--       IF v_caller_is_admin THEN
--         v_meta := COALESCE(perm->'metadata', '{}'::jsonb);
--       ELSE
--         -- Não-admin não define metadata (ex.: show_totals): mantém o do alvo; se o módulo é
--         -- novo para o alvo, copia o do próprio chamador (nunca acima do que ele tem).
--         v_meta := v_old_meta -> v_module;
--         IF v_meta IS NULL THEN
--           SELECT cup.metadata INTO v_meta
--           FROM public.clinic_user_permissions cup
--           JOIN public.clinic_users cu ON cu.id = cup.clinic_user_id
--           WHERE cu.user_id = v_caller_user_id AND cu.is_active = true AND cup.module = v_module
--           LIMIT 1;
--         END IF;
--         v_meta := COALESCE(v_meta, '{}'::jsonb);
--       END IF;
--
--       INSERT INTO public.clinic_user_permissions (clinic_id, clinic_user_id, module, can_view, can_edit, metadata)
--       VALUES (
--         v_target_clinic_id,
--         p_member_id,
--         v_module,
--         v_can_view,
--         v_can_edit,
--         v_meta
--       )
--       ON CONFLICT (clinic_user_id, module) DO UPDATE
--         SET can_view = EXCLUDED.can_view,
--             can_edit = EXCLUDED.can_edit,
--             metadata = EXCLUDED.metadata,
--             updated_at = now();
--     END LOOP;
--   END;
--   $function$;
--
--   REVOKE ALL ON FUNCTION public.save_clinic_member_permissions(uuid, jsonb) FROM PUBLIC;
--   REVOKE ALL ON FUNCTION public.save_clinic_member_permissions(uuid, jsonb) FROM anon;
--   GRANT EXECUTE ON FUNCTION public.save_clinic_member_permissions(uuid, jsonb) TO authenticated, service_role;
-- ═══════════════════════════════════════════════════════════════════════════
