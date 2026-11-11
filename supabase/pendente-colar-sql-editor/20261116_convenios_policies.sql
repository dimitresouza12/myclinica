-- PENDENTE: colar no SQL Editor do Supabase (projeto siohvtgbomvcprbzfamr), DEPOIS de aplicar
-- supabase/migrations/20261116_convenios.sql (tabela insurance_plans + colunas novas em patients).
-- Sem este arquivo a tabela fica fechada por padrao (RLS ligado, sem policy): o app enxerga a lista vazia e
-- nao consegue gravar convenio.
--
-- Leitura: quem acessa financeiro, pacientes ou agenda da clinica (o cadastro do paciente lista os convenios).
-- Escrita: quem edita o financeiro da clinica. Padrao: get_my_clinic_id() OR is_superadmin() + has_module_perm.
-- Idempotente (DROP ... IF EXISTS / CREATE OR REPLACE). Rollback no fim.

-- ── Policies de insurance_plans ────────────────────────────────────────────
DROP POLICY IF EXISTS insurance_plans_select ON public.insurance_plans;
CREATE POLICY insurance_plans_select ON public.insurance_plans FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND (public.has_module_perm('financeiro', false)
              OR public.has_module_perm('pacientes', false)
              OR public.has_module_perm('agenda', false)));

DROP POLICY IF EXISTS insurance_plans_insert ON public.insurance_plans;
CREATE POLICY insurance_plans_insert ON public.insurance_plans FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('financeiro', true));

DROP POLICY IF EXISTS insurance_plans_update ON public.insurance_plans;
CREATE POLICY insurance_plans_update ON public.insurance_plans FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('financeiro', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('financeiro', true));

-- Sem DELETE: convenio que nao se usa mais fica inativo (is_active = false), o historico de producao continua legivel.

-- ── Gatilho: o convenio ligado ao paciente tem de ser da mesma clinica ──────
CREATE OR REPLACE FUNCTION public.patients_check_insurance_plan_clinic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.insurance_plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.insurance_plans ip
    WHERE ip.id = NEW.insurance_plan_id AND ip.clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'insurance_plan_id pertence a outra clinica' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_insurance_plan_clinic_chk ON public.patients;
CREATE TRIGGER patients_insurance_plan_clinic_chk
  BEFORE INSERT OR UPDATE OF insurance_plan_id, clinic_id ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_check_insurance_plan_clinic();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS patients_insurance_plan_clinic_chk ON public.patients;
-- DROP FUNCTION IF EXISTS public.patients_check_insurance_plan_clinic();
-- DROP POLICY IF EXISTS insurance_plans_select ON public.insurance_plans;
-- DROP POLICY IF EXISTS insurance_plans_insert ON public.insurance_plans;
-- DROP POLICY IF EXISTS insurance_plans_update ON public.insurance_plans;
