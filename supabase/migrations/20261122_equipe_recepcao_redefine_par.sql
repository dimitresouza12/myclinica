-- ═══════════════════════════════════════════════════════════════════════════
-- EQUIPE: RECEPÇÃO REDEFINE A SENHA DE LOGIN "PAR" (financeiro/equipe comparados com o chamador)
-- Criado em: 2026-11-22 | Projeto Supabase: siohvtgbomvcprbzfamr
-- Depende de: 20261112_equipe_acessos.sql, 20261113_equipe_preset_novo_login.sql e
--             20261114_equipe_gerenciar_logins.sql (já aplicados)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problema (clínica Centro de Saúde Mãe Maria): há duas recepcionistas, ambas com equipe em
-- edição (financeiro só ver). Desde 20261114, equipe_assert_target_ok recusa com
-- cannot_modify_higher todo alvo não-admin que tenha 'equipe' em edição ou 'financeiro' em
-- edição, sem olhar o que o chamador tem. Resultado: uma recepcionista não consegue redefinir a
-- senha da outra; só o admin consegue, e o dono quer que a recepção administre a equipe sozinha.
--
-- Decisão do dono: uma recepcionista pode REDEFINIR A SENHA de outra recepção/login comum que
-- não tenha nenhuma permissão acima da dela. Só senha: desativar, atualizar nome/cargo,
-- desvincular e salvar permissões continuam com a regra estrita de 20261114.
--
-- Mudança (só o ramo chamador NÃO-admin de equipe_assert_target_ok, só quando p_touches_auth):
--   - 'financeiro' e 'equipe' deixam de ser proibição absoluta no alvo e passam a ser COMPARADOS
--     com o chamador, módulo a módulo. Nível: edição (2) > ver (1) > nenhum (0). O alvo é
--     recusado com cannot_modify_higher (42501) se tiver nível MAIOR que o do chamador no mesmo
--     módulo. Ex.: alvo com equipe/edição e chamador com equipe/edição passa; alvo com
--     financeiro/edição e chamador com financeiro/ver é recusado.
--   - Continuam recusas sempre (todos os caminhos, inclusive senha): alvo com QUALQUER nível de
--     'configuracoes' (cannot_modify_higher), alvo admin/superadmin (cannot_modify_admin), o
--     próprio chamador (cannot_modify_self), conta compartilhada (target_shared_account), outra
--     clínica (not_authorized). Admin/superadmin: livre, sem mudança.
--   - Sem p_touches_auth (update_clinic_member, save_clinic_member_permissions,
--     unlink_professional_login): regra de 20261114 intacta (financeiro/equipe em edição só admin).
--
-- Como a ação "senha" é distinguida (sem mudar assinatura nem código da aplicação):
--   p_touches_auth = true. Chamadores de equipe_assert_target_ok:
--     reset_clinic_member_password   -> p_touches_auth = true   (senha)
--     delete_clinic_member           -> p_touches_auth = true   (mas recusa não-admin ANTES do helper)
--     update_clinic_member           -> padrão (false)
--     save_clinic_member_permissions -> padrão (false)
--     unlink_professional_login      -> false explícito
--   Logo, para chamador NÃO-admin, p_touches_auth = true só ocorre na redefinição de senha.
--   ATENÇÃO futura: se algum RPC novo chamar o helper com p_touches_auth = true para um
--   não-admin, herdará esta flexibilização.
--
-- O nível do chamador é lido de clinic_user_permissions da(s) linha(s) ativa(s) de
-- p_caller_user_id NA CLÍNICA DO ALVO (equipe_authorize_caller já garante UMA única linha ativa para não-admin).
--
-- Impacto medido em produção (só contagem, leitura): 9 pares chamador(equipe edição) -> alvo
-- não-admin; passavam 7 antes, passam 9 depois; 0 pares que passavam passam a ser recusados.
--
-- Mantidos: assinatura, SECURITY DEFINER, search_path, STABLE, grants (CREATE OR REPLACE
-- preserva os REVOKE de 20261112). Aditiva: só CREATE OR REPLACE desta função.
-- Desfazer: bloco ROLLBACK no fim (restaura o corpo de 20261114_equipe_gerenciar_logins.sql,
-- que é o de produção hoje).
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

    -- Proibição absoluta (todos os caminhos): login com QUALQUER nível de configuracoes
    -- só admin gerencia.
    IF EXISTS (
      SELECT 1 FROM public.clinic_user_permissions cup
      WHERE cup.clinic_user_id = p_target_member_id
        AND cup.module = 'configuracoes' AND (cup.can_view OR cup.can_edit)
    ) THEN
      RAISE EXCEPTION 'cannot_modify_higher' USING errcode = '42501';
    END IF;

    IF p_touches_auth THEN
      -- Redefinição de senha (para não-admin, p_touches_auth = true só vem de
      -- reset_clinic_member_password; delete_clinic_member recusa não-admin antes do helper):
      -- financeiro e equipe são comparados com o chamador. Nível: edição 2 > ver 1 > nenhum 0.
      -- Recusa se o alvo tem nível maior que o do chamador no mesmo módulo.
      IF EXISTS (
        SELECT 1
        FROM public.clinic_user_permissions t
        WHERE t.clinic_user_id = p_target_member_id
          AND t.module IN ('financeiro', 'equipe')
          AND (CASE WHEN t.can_edit THEN 2 WHEN t.can_view THEN 1 ELSE 0 END)
              > coalesce((
                  SELECT max(CASE WHEN c.can_edit THEN 2 WHEN c.can_view THEN 1 ELSE 0 END)
                  FROM public.clinic_users ccu
                  JOIN public.clinic_user_permissions c
                    ON c.clinic_user_id = ccu.id AND c.module = t.module
                  WHERE ccu.user_id = p_caller_user_id AND ccu.is_active = true
                    AND ccu.clinic_id = v_clinic_id
                ), 0)
      ) THEN
        RAISE EXCEPTION 'cannot_modify_higher' USING errcode = '42501';
      END IF;
    ELSE
      -- Demais ações (nome/cargo, desativar, desvincular, salvar permissões): regra estrita de
      -- 20261114 (financeiro ou equipe em edição no alvo só admin gerencia).
      IF EXISTS (
        SELECT 1 FROM public.clinic_user_permissions cup
        WHERE cup.clinic_user_id = p_target_member_id
          AND cup.module IN ('financeiro', 'equipe') AND cup.can_edit
      ) THEN
        RAISE EXCEPTION 'cannot_modify_higher' USING errcode = '42501';
      END IF;
    END IF;
  END IF;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodar depois de aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--   -- 1) corpo novo no ar, e grants de helper interno intactos (false)
--   select position('Redefinição de senha' in pg_get_functiondef('public.equipe_assert_target_ok(uuid,uuid,boolean,boolean,boolean,uuid)'::regprocedure)) > 0 as nova_regra,
--          has_function_privilege('authenticated','public.equipe_assert_target_ok(uuid,uuid,boolean,boolean,boolean,uuid)','execute') as authenticated_exec,  -- false
--          has_function_privilege('anon','public.equipe_assert_target_ok(uuid,uuid,boolean,boolean,boolean,uuid)','execute') as anon_exec;                   -- false
--
--   -- 2) assinatura única (sem overload duplicado): deve retornar 1
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'equipe_assert_target_ok';
--
--   -- 3) pares (só contagem, sem dado de paciente): chamador não-admin com equipe/edição vs
--   --    alvo não-admin, regra nova de senha. Esperado: recusa_nova só por configuracoes ou por
--   --    financeiro/equipe do alvo acima do chamador.
--   with lvl as (
--     select cu.id, cu.clinic_id, cu.user_id, cup.module,
--            case when cup.can_edit then 2 when cup.can_view then 1 else 0 end l
--     from public.clinic_users cu join public.clinic_user_permissions cup on cup.clinic_user_id = cu.id
--     where cu.is_active and coalesce(cu.is_superadmin,false) = false and cu.role <> 'admin'
--   ), pares as (
--     select distinct c.id caller, t.id target
--     from lvl c
--     join public.clinic_users cc on cc.id = c.id
--     join public.clinic_users t on t.clinic_id = cc.clinic_id and t.user_id <> cc.user_id
--          and t.is_active and t.role <> 'admin' and coalesce(t.is_superadmin,false) = false
--     where c.module = 'equipe' and c.l = 2
--   )
--   select count(*) as pares,
--     count(*) filter (where exists (select 1 from lvl x where x.id = p.target and x.module = 'configuracoes' and x.l > 0)
--        or exists (select 1 from lvl x where x.id = p.target and x.module in ('financeiro','equipe')
--             and x.l > coalesce((select max(y.l) from lvl y where y.id = p.caller and y.module = x.module), 0))) as recusa_nova
--   from pares p;
--
--   -- 4) teste ponta a ponta (manual, com a recepcionista logada na UI): redefinir a senha da
--   --    outra recepção -> sucesso; tentar desativar a mesma -> continua cannot_modify_higher.


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (restaura o corpo atual de produção = 20261114_equipe_gerenciar_logins.sql)
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
--     IF EXISTS (
--       SELECT 1 FROM public.clinic_user_permissions cup
--       WHERE cup.clinic_user_id = p_target_member_id
--         AND ((cup.module = 'configuracoes' AND (cup.can_view OR cup.can_edit))
--              OR (cup.module IN ('financeiro', 'equipe') AND cup.can_edit))
--     ) THEN
--       RAISE EXCEPTION 'cannot_modify_higher' USING errcode = '42501';
--     END IF;
--   END IF;
-- END;
-- $function$;
