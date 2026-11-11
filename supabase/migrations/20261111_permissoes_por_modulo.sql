-- ═══════════════════════════════════════════════════════════════════════════
-- PERMISSÕES POR MÓDULO NO BANCO (RLS RESTRICTIVE) + HIGIENE DE POLICIES
-- Criado em: 2026-11-11 | Projeto Supabase: siohvtgbomvcprbzfamr
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problema: a tela esconde módulos por clinic_user_permissions, mas no banco só
-- financial_records, medical_records, record_entries, nutri_avaliacoes, comissões e
-- clinic_custom_record_fields respeitam has_module_perm. Qualquer usuário da clínica
-- lia/gravava patients, appointments, procedures, estoque, créditos, campanhas,
-- profissionais, modelos de documento e audit_logs via API, ignorando o módulo.
--
-- Padrão (igual aos restrict_* existentes): policies RESTRICTIVE somam (AND) às
-- permissivas de isolamento por clínica, que NÃO são removidas. Admin e superadmin
-- passam sempre (has_module_perm / has_any_module_perm devolvem true para eles).
-- service_role ignora RLS (n8n, rotas com chave de serviço, webhooks) como hoje.
--
-- Clínicas com professional_scoped_access: nada aqui altera restrict_agenda_by_professional,
-- restrict_pacientes_by_area, restrict_financeiro_by_professional nem as policies por área
-- de 20261111_pacientes_unicos_e_area.sql. As novas só somam a camada "módulo"; o
-- escopo por profissional/área continua valendo por cima (AND). Este arquivo não toca
-- patient_visible_to_my_area, restrict_pacientes_by_area nem patients.created_by_user_id
-- (aplica em qualquer ordem em relação àquele arquivo).
--
-- NÃO inclui nada sobre "admin não vê dado clínico" (decisão pendente).
--
-- ── O que o arquivo faz ──────────────────────────────────────────────────────
--  B0  Helper has_any_module_perm(text[], boolean): "alguma destas permissões".
--  B1  patients       SELECT: ver  pacientes|agenda|prontuario|financeiro|crm|dashboard|
--                              relatorios|campanhas|estoque|comissoes
--                     INSERT: editar pacientes|agenda|crm
--                     UPDATE: editar pacientes|agenda|prontuario|crm
--                     DELETE: editar pacientes
--  B2  appointments   SELECT: ver  agenda|dashboard|financeiro|prontuario|crm|relatorios|
--                              pacientes|campanhas|metas|comissoes
--                     INSERT/DELETE: editar agenda
--                     UPDATE: editar agenda|prontuario|dashboard
--  B3  procedures     SELECT livre (a agenda precisa); INSERT/UPDATE/DELETE: editar procedimentos
--  B4  stock_items, stock_movements   SELECT: ver estoque; escrita: editar estoque
--  B5  patient_credits  SELECT: ver financeiro|pacientes|agenda|prontuario|dashboard;
--                       escrita: editar os mesmos (atendimento/agenda gravam crédito)
--  B6  campaigns      SELECT: ver campanhas; escrita: editar campanhas
--  B7  professionals  SELECT livre; INSERT/DELETE: editar equipe|configuracoes;
--                     UPDATE: editar equipe|configuracoes|agenda (escala da agenda).
--                     Gatilho: clinic_user_id só muda/entra por admin ou superadmin.
--  B8  clinic_document_templates  SELECT: ver prontuario|configuracoes;
--                                 escrita: editar prontuario|configuracoes
--  B9  audit_logs     SELECT: ver configuracoes (admin e superadmin passam)
--  B10 Policies permissivas que consultavam clinic_users sem is_active=true
--      (stock_items, stock_movements, audit_logs, clinic_document_templates, clinics)
--      passam a usar get_my_clinic_id() / is_active = true. Usuário desativado perde acesso.
--  B11 save_clinic_member_permissions: valida o módulo contra a lista oficial, exige
--      array, normaliza can_edit => can_view e tolera módulo repetido no payload.
--      Backfill idempotente: can_edit=true com can_view=false vira can_view=true
--      (hoje 0 linhas).
--
-- Divergências deliberadas em relação ao pedido (porque o código lê/grava assim):
--  * patients INSERT/UPDATE inclui crm (converter lead em paciente) e UPDATE inclui
--    prontuario (ficha, avatar, peso do pet gravam em patients).
--  * appointments UPDATE inclui prontuario (barra de atendimento) e dashboard
--    (confirmar/concluir); patient_credits escrita inclui agenda/prontuario/dashboard
--    (appointmentRevenue grava/apaga crédito ao concluir atendimento).
--  * professionals UPDATE inclui agenda (ScheduleEditor liga schedule_enabled);
--    INSERT/UPDATE também por configuracoes (criar usuário gera profissional).
--  * clinic_document_templates inclui configuracoes (a tela de Configurações sobe os PDFs).
--  * Nenhuma tela grava stock_movements fora de Estoque (lotesApi só é usado lá), então
--    estoque é estrito.
--
-- get_email_by_username / get_email_by_cpf: NÃO alteradas (o login depende delas).
--
-- Desfazer: bloco ROLLBACK no fim.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── B0. Helper ──────────────────────────────────────────────────────────────

-- Espelha has_module_perm, mas aceita vários módulos (basta um). Admin e superadmin: true.
CREATE OR REPLACE FUNCTION public.has_any_module_perm(p_modules text[], p_need_edit boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN public.is_superadmin() OR public.get_my_role() = 'admin' THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.clinic_users cu
        JOIN public.clinic_user_permissions cup ON cup.clinic_user_id = cu.id
        WHERE cu.user_id = auth.uid()
          AND cu.is_active = true
          AND cup.module = ANY (p_modules)
          AND CASE WHEN p_need_edit THEN cup.can_edit ELSE cup.can_view END
      )
    END;
$function$;

REVOKE ALL ON FUNCTION public.has_any_module_perm(text[], boolean) FROM PUBLIC;
-- anon mantém EXECUTE (igual a has_module_perm): a função é usada dentro de policies e devolve false sem auth.uid(),
-- então um SELECT anon continua vindo vazio em vez de 42501.
GRANT EXECUTE ON FUNCTION public.has_any_module_perm(text[], boolean) TO anon, authenticated, service_role;


-- ─── B1. patients ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS restrict_pacientes_modulo_select ON public.patients;
CREATE POLICY restrict_pacientes_modulo_select ON public.patients
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_any_module_perm(
    ARRAY['pacientes','agenda','prontuario','financeiro','crm','dashboard','relatorios','campanhas','estoque','comissoes'], false)));

DROP POLICY IF EXISTS restrict_pacientes_modulo_insert ON public.patients;
CREATE POLICY restrict_pacientes_modulo_insert ON public.patients
  AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT public.has_any_module_perm(ARRAY['pacientes','agenda','crm'], true)));

DROP POLICY IF EXISTS restrict_pacientes_modulo_update ON public.patients;
CREATE POLICY restrict_pacientes_modulo_update ON public.patients
  AS RESTRICTIVE FOR UPDATE
  USING ((SELECT public.has_any_module_perm(ARRAY['pacientes','agenda','prontuario','crm'], true)))
  WITH CHECK ((SELECT public.has_any_module_perm(ARRAY['pacientes','agenda','prontuario','crm'], true)));

DROP POLICY IF EXISTS restrict_pacientes_modulo_delete ON public.patients;
CREATE POLICY restrict_pacientes_modulo_delete ON public.patients
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('pacientes', true)));


-- ─── B2. appointments ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS restrict_agenda_modulo_select ON public.appointments;
CREATE POLICY restrict_agenda_modulo_select ON public.appointments
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_any_module_perm(
    ARRAY['agenda','dashboard','financeiro','prontuario','crm','relatorios','pacientes','campanhas','metas','comissoes'], false)));

DROP POLICY IF EXISTS restrict_agenda_modulo_insert ON public.appointments;
CREATE POLICY restrict_agenda_modulo_insert ON public.appointments
  AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT public.has_module_perm('agenda', true)));

DROP POLICY IF EXISTS restrict_agenda_modulo_update ON public.appointments;
CREATE POLICY restrict_agenda_modulo_update ON public.appointments
  AS RESTRICTIVE FOR UPDATE
  USING ((SELECT public.has_any_module_perm(ARRAY['agenda','prontuario','dashboard'], true)))
  WITH CHECK ((SELECT public.has_any_module_perm(ARRAY['agenda','prontuario','dashboard'], true)));

DROP POLICY IF EXISTS restrict_agenda_modulo_delete ON public.appointments;
CREATE POLICY restrict_agenda_modulo_delete ON public.appointments
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('agenda', true)));


-- ─── B3. procedures (leitura livre na clínica; escrita só procedimentos) ──────

DROP POLICY IF EXISTS restrict_procedimentos_insert ON public.procedures;
CREATE POLICY restrict_procedimentos_insert ON public.procedures
  AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT public.has_module_perm('procedimentos', true)));

DROP POLICY IF EXISTS restrict_procedimentos_update ON public.procedures;
CREATE POLICY restrict_procedimentos_update ON public.procedures
  AS RESTRICTIVE FOR UPDATE
  USING ((SELECT public.has_module_perm('procedimentos', true)))
  WITH CHECK ((SELECT public.has_module_perm('procedimentos', true)));

DROP POLICY IF EXISTS restrict_procedimentos_delete ON public.procedures;
CREATE POLICY restrict_procedimentos_delete ON public.procedures
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('procedimentos', true)));


-- ─── B4 / B6. tabelas de um módulo só (estoque, campanhas) ───────────────────

DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('stock_items',     'estoque',   'estoque'),
      ('stock_movements', 'estoque',   'estoque'),
      ('campaigns',       'campanhas', 'campanhas')
    ) AS t(tbl, modulo, suffix)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'restrict_' || r.suffix || '_select', r.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT USING ((SELECT public.has_module_perm(%L, false)))',
      'restrict_' || r.suffix || '_select', r.tbl, r.modulo);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'restrict_' || r.suffix || '_insert', r.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT WITH CHECK ((SELECT public.has_module_perm(%L, true)))',
      'restrict_' || r.suffix || '_insert', r.tbl, r.modulo);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'restrict_' || r.suffix || '_update', r.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE USING ((SELECT public.has_module_perm(%L, true))) WITH CHECK ((SELECT public.has_module_perm(%L, true)))',
      'restrict_' || r.suffix || '_update', r.tbl, r.modulo, r.modulo);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'restrict_' || r.suffix || '_delete', r.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE USING ((SELECT public.has_module_perm(%L, true)))',
      'restrict_' || r.suffix || '_delete', r.tbl, r.modulo);
  END LOOP;
END
$do$;
-- Nomes gerados: restrict_estoque_* (em stock_items E em stock_movements; o nome é por
-- tabela, não colide), restrict_campanhas_*.


-- ─── B5. patient_credits ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS restrict_creditos_select ON public.patient_credits;
CREATE POLICY restrict_creditos_select ON public.patient_credits
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_any_module_perm(ARRAY['financeiro','pacientes','agenda','prontuario','dashboard'], false)));

DROP POLICY IF EXISTS restrict_creditos_insert ON public.patient_credits;
CREATE POLICY restrict_creditos_insert ON public.patient_credits
  AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT public.has_any_module_perm(ARRAY['financeiro','pacientes','agenda','prontuario','dashboard'], true)));

DROP POLICY IF EXISTS restrict_creditos_update ON public.patient_credits;
CREATE POLICY restrict_creditos_update ON public.patient_credits
  AS RESTRICTIVE FOR UPDATE
  USING ((SELECT public.has_any_module_perm(ARRAY['financeiro','pacientes','agenda','prontuario','dashboard'], true)))
  WITH CHECK ((SELECT public.has_any_module_perm(ARRAY['financeiro','pacientes','agenda','prontuario','dashboard'], true)));

DROP POLICY IF EXISTS restrict_creditos_delete ON public.patient_credits;
CREATE POLICY restrict_creditos_delete ON public.patient_credits
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_any_module_perm(ARRAY['financeiro','pacientes','agenda','prontuario','dashboard'], true)));


-- ─── B7. professionals ───────────────────────────────────────────────────────

-- SELECT sem restrição de módulo: agenda, filtros, prontuário e portal precisam listar.

DROP POLICY IF EXISTS restrict_equipe_insert ON public.professionals;
CREATE POLICY restrict_equipe_insert ON public.professionals
  AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT public.has_any_module_perm(ARRAY['equipe','configuracoes'], true)));

DROP POLICY IF EXISTS restrict_equipe_update ON public.professionals;
CREATE POLICY restrict_equipe_update ON public.professionals
  AS RESTRICTIVE FOR UPDATE
  USING ((SELECT public.has_any_module_perm(ARRAY['equipe','configuracoes','agenda'], true)))
  WITH CHECK ((SELECT public.has_any_module_perm(ARRAY['equipe','configuracoes','agenda'], true)));

DROP POLICY IF EXISTS restrict_equipe_delete ON public.professionals;
CREATE POLICY restrict_equipe_delete ON public.professionals
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_any_module_perm(ARRAY['equipe','configuracoes'], true)));

-- professionals.clinic_user_id define "quem sou eu" (get_my_professional_id) e, em
-- clínica com acesso por profissional, qual agenda a pessoa enxerga. Só admin/superadmin
-- pode vincular ou trocar. Sessões não-API (service_role, SQL Editor, RPC SECURITY DEFINER)
-- passam.
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

  IF public.is_superadmin() OR public.get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'professional_clinic_user_admin_only' USING ERRCODE = '42501';
END
$function$;

DROP TRIGGER IF EXISTS trg_professionals_guard_clinic_user_id ON public.professionals;
CREATE TRIGGER trg_professionals_guard_clinic_user_id
  BEFORE INSERT OR UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.professionals_guard_clinic_user_id();


-- ─── B8. clinic_document_templates ───────────────────────────────────────────

DROP POLICY IF EXISTS restrict_modelos_doc_select ON public.clinic_document_templates;
CREATE POLICY restrict_modelos_doc_select ON public.clinic_document_templates
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_any_module_perm(ARRAY['prontuario','configuracoes'], false)));

DROP POLICY IF EXISTS restrict_modelos_doc_insert ON public.clinic_document_templates;
CREATE POLICY restrict_modelos_doc_insert ON public.clinic_document_templates
  AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT public.has_any_module_perm(ARRAY['prontuario','configuracoes'], true)));

DROP POLICY IF EXISTS restrict_modelos_doc_update ON public.clinic_document_templates;
CREATE POLICY restrict_modelos_doc_update ON public.clinic_document_templates
  AS RESTRICTIVE FOR UPDATE
  USING ((SELECT public.has_any_module_perm(ARRAY['prontuario','configuracoes'], true)))
  WITH CHECK ((SELECT public.has_any_module_perm(ARRAY['prontuario','configuracoes'], true)));

DROP POLICY IF EXISTS restrict_modelos_doc_delete ON public.clinic_document_templates;
CREATE POLICY restrict_modelos_doc_delete ON public.clinic_document_templates
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_any_module_perm(ARRAY['prontuario','configuracoes'], true)));


-- ─── B9. audit_logs: leitura só admin / configuracoes ────────────────────────

DROP POLICY IF EXISTS restrict_auditoria_select ON public.audit_logs;
CREATE POLICY restrict_auditoria_select ON public.audit_logs
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('configuracoes', false)));


-- ─── B10. Policies permissivas sem is_active ─────────────────────────────────
-- Antes: clinic_id = (SELECT clinic_id FROM clinic_users WHERE user_id = auth.uid() LIMIT 1),
-- que vale também para usuário DESATIVADO. get_my_clinic_id() já filtra is_active = true.

ALTER POLICY clinic_isolation_items ON public.stock_items
  USING (clinic_id = public.get_my_clinic_id());

ALTER POLICY clinic_isolation_movements ON public.stock_movements
  USING (clinic_id = public.get_my_clinic_id());

ALTER POLICY "Users can see their clinic logs" ON public.audit_logs
  USING (clinic_id = public.get_my_clinic_id());

ALTER POLICY clinic_own ON public.clinic_document_templates
  USING (clinic_id = public.get_my_clinic_id());

ALTER POLICY clinic_own_insert ON public.clinic_document_templates
  WITH CHECK (clinic_id = public.get_my_clinic_id());

ALTER POLICY clinic_own_update ON public.clinic_document_templates
  USING (clinic_id = public.get_my_clinic_id());

ALTER POLICY "Usuários veem apenas sua própria clínica" ON public.clinics
  USING (id IN (
    SELECT cu.clinic_id FROM public.clinic_users cu
    WHERE cu.user_id = auth.uid() AND cu.is_active = true
  ));

ALTER POLICY "Apenas admins atualizam dados da clínica" ON public.clinics
  USING (id IN (
    SELECT cu.clinic_id FROM public.clinic_users cu
    WHERE cu.user_id = auth.uid() AND cu.role = 'admin' AND cu.is_active = true
  ));


-- ─── B11. save_clinic_member_permissions ─────────────────────────────────────

-- Mesma assinatura e a mesma lógica de autorização de produção; acrescenta:
-- payload precisa ser array; módulo precisa estar na lista oficial (tudo é validado
-- ANTES do DELETE, então um payload inválido não apaga as permissões atuais);
-- can_edit => can_view; módulo repetido no payload não quebra (ON CONFLICT).
CREATE OR REPLACE FUNCTION public.save_clinic_member_permissions(p_member_id uuid, p_permissions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_clinic_id uuid;
  v_caller_role      text;
  v_target_clinic_id uuid;
  perm               jsonb;
  v_module           text;
  v_can_edit         boolean;
  v_can_view         boolean;
  v_valid_modules    constant text[] := ARRAY[
    'dashboard','pacientes','prontuario','agenda','financeiro','comissoes','procedimentos',
    'relatorios','metas','estoque','equipe','crm','campanhas','configuracoes'
  ];
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

  SELECT clinic_id INTO v_target_clinic_id
  FROM clinic_users WHERE id = p_member_id;

  IF v_target_clinic_id IS NULL THEN
    RAISE EXCEPTION 'member_not_found' USING errcode = 'P0002';
  END IF;

  IF v_target_clinic_id IS DISTINCT FROM v_caller_clinic_id AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'not_authorized' USING errcode = '42501';
  END IF;

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

  DELETE FROM clinic_user_permissions WHERE clinic_user_id = p_member_id;

  FOR perm IN SELECT * FROM jsonb_array_elements(p_permissions)
  LOOP
    v_can_edit := coalesce((perm->>'can_edit')::boolean, false);
    v_can_view := coalesce((perm->>'can_view')::boolean, false) OR v_can_edit;

    INSERT INTO clinic_user_permissions (clinic_id, clinic_user_id, module, can_view, can_edit, metadata)
    VALUES (
      v_target_clinic_id,
      p_member_id,
      perm->>'module',
      v_can_view,
      v_can_edit,
      COALESCE(perm->'metadata', '{}'::jsonb)
    )
    ON CONFLICT (clinic_user_id, module) DO UPDATE
      SET can_view = EXCLUDED.can_view,
          can_edit = EXCLUDED.can_edit,
          metadata = EXCLUDED.metadata,
          updated_at = now();
  END LOOP;
END;
$function$;

-- Backfill idempotente (hoje 0 linhas): quem edita também vê.
UPDATE public.clinic_user_permissions
   SET can_view = true
 WHERE can_edit = true AND can_view = false;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de colar):
--   select tablename, policyname, cmd from pg_policies
--     where schemaname='public' and permissive='RESTRICTIVE'
--       and (policyname like 'restrict_%_modulo_%' or policyname like 'restrict_procedimentos_%'
--         or policyname like 'restrict_estoque_%' or policyname like 'restrict_campanhas_%'
--         or policyname like 'restrict_creditos_%' or policyname like 'restrict_equipe_%'
--         or policyname like 'restrict_modelos_doc_%' or policyname = 'restrict_auditoria_select')
--     order by 1,2;      -- esperado: 35 linhas (patients 4, appointments 4, procedures 3, stock_items 4,
--                      stock_movements 4, campaigns 4, patient_credits 4, professionals 3, templates 4, audit_logs 1)
--   select tgname from pg_trigger where tgrelid='public.professionals'::regclass and not tgisinternal;
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (executar em bloco; só com confirmação do dono)
--
--   -- policies novas (todas criadas por este arquivo)
--   DROP POLICY IF EXISTS restrict_pacientes_modulo_select ON public.patients;
--   DROP POLICY IF EXISTS restrict_pacientes_modulo_insert ON public.patients;
--   DROP POLICY IF EXISTS restrict_pacientes_modulo_update ON public.patients;
--   DROP POLICY IF EXISTS restrict_pacientes_modulo_delete ON public.patients;
--   DROP POLICY IF EXISTS restrict_agenda_modulo_select ON public.appointments;
--   DROP POLICY IF EXISTS restrict_agenda_modulo_insert ON public.appointments;
--   DROP POLICY IF EXISTS restrict_agenda_modulo_update ON public.appointments;
--   DROP POLICY IF EXISTS restrict_agenda_modulo_delete ON public.appointments;
--   DROP POLICY IF EXISTS restrict_procedimentos_insert ON public.procedures;
--   DROP POLICY IF EXISTS restrict_procedimentos_update ON public.procedures;
--   DROP POLICY IF EXISTS restrict_procedimentos_delete ON public.procedures;
--   DROP POLICY IF EXISTS restrict_estoque_select ON public.stock_items;
--   DROP POLICY IF EXISTS restrict_estoque_insert ON public.stock_items;
--   DROP POLICY IF EXISTS restrict_estoque_update ON public.stock_items;
--   DROP POLICY IF EXISTS restrict_estoque_delete ON public.stock_items;
--   DROP POLICY IF EXISTS restrict_estoque_select ON public.stock_movements;
--   DROP POLICY IF EXISTS restrict_estoque_insert ON public.stock_movements;
--   DROP POLICY IF EXISTS restrict_estoque_update ON public.stock_movements;
--   DROP POLICY IF EXISTS restrict_estoque_delete ON public.stock_movements;
--   DROP POLICY IF EXISTS restrict_campanhas_select ON public.campaigns;
--   DROP POLICY IF EXISTS restrict_campanhas_insert ON public.campaigns;
--   DROP POLICY IF EXISTS restrict_campanhas_update ON public.campaigns;
--   DROP POLICY IF EXISTS restrict_campanhas_delete ON public.campaigns;
--   DROP POLICY IF EXISTS restrict_creditos_select ON public.patient_credits;
--   DROP POLICY IF EXISTS restrict_creditos_insert ON public.patient_credits;
--   DROP POLICY IF EXISTS restrict_creditos_update ON public.patient_credits;
--   DROP POLICY IF EXISTS restrict_creditos_delete ON public.patient_credits;
--   DROP POLICY IF EXISTS restrict_equipe_insert ON public.professionals;
--   DROP POLICY IF EXISTS restrict_equipe_update ON public.professionals;
--   DROP POLICY IF EXISTS restrict_equipe_delete ON public.professionals;
--   DROP POLICY IF EXISTS restrict_modelos_doc_select ON public.clinic_document_templates;
--   DROP POLICY IF EXISTS restrict_modelos_doc_insert ON public.clinic_document_templates;
--   DROP POLICY IF EXISTS restrict_modelos_doc_update ON public.clinic_document_templates;
--   DROP POLICY IF EXISTS restrict_modelos_doc_delete ON public.clinic_document_templates;
--   DROP POLICY IF EXISTS restrict_auditoria_select ON public.audit_logs;
--   DROP TRIGGER IF EXISTS trg_professionals_guard_clinic_user_id ON public.professionals;
--   DROP FUNCTION IF EXISTS public.professionals_guard_clinic_user_id();
--   DROP FUNCTION IF EXISTS public.has_any_module_perm(text[], boolean);
--
--   -- B10: volta as expressões originais (sem is_active)
--   ALTER POLICY clinic_isolation_items ON public.stock_items
--     USING (clinic_id = (SELECT clinic_users.clinic_id FROM clinic_users WHERE clinic_users.user_id = auth.uid() LIMIT 1));
--   ALTER POLICY clinic_isolation_movements ON public.stock_movements
--     USING (clinic_id = (SELECT clinic_users.clinic_id FROM clinic_users WHERE clinic_users.user_id = auth.uid() LIMIT 1));
--   ALTER POLICY "Users can see their clinic logs" ON public.audit_logs
--     USING (clinic_id = (SELECT clinic_users.clinic_id FROM clinic_users WHERE clinic_users.user_id = auth.uid() LIMIT 1));
--   ALTER POLICY clinic_own ON public.clinic_document_templates
--     USING (clinic_id = (SELECT clinic_users.clinic_id FROM clinic_users WHERE clinic_users.user_id = auth.uid() LIMIT 1));
--   ALTER POLICY clinic_own_insert ON public.clinic_document_templates
--     WITH CHECK (clinic_id = (SELECT clinic_users.clinic_id FROM clinic_users WHERE clinic_users.user_id = auth.uid() LIMIT 1));
--   ALTER POLICY clinic_own_update ON public.clinic_document_templates
--     USING (clinic_id = (SELECT clinic_users.clinic_id FROM clinic_users WHERE clinic_users.user_id = auth.uid() LIMIT 1));
--   ALTER POLICY "Usuários veem apenas sua própria clínica" ON public.clinics
--     USING (id IN (SELECT clinic_users.clinic_id FROM clinic_users WHERE clinic_users.user_id = auth.uid()));
--   ALTER POLICY "Apenas admins atualizam dados da clínica" ON public.clinics
--     USING (id IN (SELECT clinic_users.clinic_id FROM clinic_users WHERE clinic_users.user_id = auth.uid() AND clinic_users.role = 'admin'));
--
--   -- B11: versão anterior de save_clinic_member_permissions (sem validação de módulo)
--   CREATE OR REPLACE FUNCTION public.save_clinic_member_permissions(p_member_id uuid, p_permissions jsonb)
--    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
--   DECLARE v_caller_clinic_id uuid; v_caller_role text; v_target_clinic_id uuid; perm jsonb;
--   BEGIN
--     SELECT clinic_id, role INTO v_caller_clinic_id, v_caller_role FROM clinic_users WHERE user_id = auth.uid() AND is_active = true;
--     IF v_caller_clinic_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING errcode = '28000'; END IF;
--     IF v_caller_role NOT IN ('admin') AND NOT is_superadmin() THEN RAISE EXCEPTION 'not_authorized' USING errcode = '42501'; END IF;
--     SELECT clinic_id INTO v_target_clinic_id FROM clinic_users WHERE id = p_member_id;
--     IF v_target_clinic_id IS DISTINCT FROM v_caller_clinic_id AND NOT is_superadmin() THEN RAISE EXCEPTION 'not_authorized' USING errcode = '42501'; END IF;
--     DELETE FROM clinic_user_permissions WHERE clinic_user_id = p_member_id;
--     FOR perm IN SELECT * FROM jsonb_array_elements(p_permissions) LOOP
--       INSERT INTO clinic_user_permissions (clinic_id, clinic_user_id, module, can_view, can_edit, metadata)
--       VALUES (v_target_clinic_id, p_member_id, perm->>'module', (perm->>'can_view')::boolean, (perm->>'can_edit')::boolean, COALESCE(perm->'metadata', '{}'::jsonb));
--     END LOOP;
--   END; $f$;
--   -- (o backfill can_edit => can_view não é revertido: é só correção de dado inconsistente)
-- ═══════════════════════════════════════════════════════════════════════════
