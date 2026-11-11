-- PENDENTE: colar no SQL Editor do Supabase (projeto siohvtgbomvcprbzfamr).
-- As TRES TABELAS (therapy_goals, therapy_goal_logs, therapy_assessments) ja foram criadas em producao
-- com RLS ligado e SEM policies, ou seja, nada le nem grava ate este arquivo rodar (fechado por padrao).
-- Este arquivo cria as policies (padrao do prontuario: get_my_clinic_id() OR is_superadmin() + has_module_perm('prontuario')).
-- Idempotente (DROP POLICY IF EXISTS). Rollback: DROP POLICY ... ou DROP TABLE das tres (ver migrations/20261113_metas_terapeuticas.sql).

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.therapy_goals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapy_goal_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapy_assessments ENABLE ROW LEVEL SECURITY;

-- therapy_goals: sem DELETE (encerrar = status 'cancelada')
DROP POLICY IF EXISTS therapy_goals_select ON public.therapy_goals;
CREATE POLICY therapy_goals_select ON public.therapy_goals FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS therapy_goals_insert ON public.therapy_goals;
CREATE POLICY therapy_goals_insert ON public.therapy_goals FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = therapy_goals.clinic_id));

DROP POLICY IF EXISTS therapy_goals_update ON public.therapy_goals;
CREATE POLICY therapy_goals_update ON public.therapy_goals FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = therapy_goals.clinic_id));

-- therapy_goal_logs
DROP POLICY IF EXISTS therapy_goal_logs_select ON public.therapy_goal_logs;
CREATE POLICY therapy_goal_logs_select ON public.therapy_goal_logs FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS therapy_goal_logs_insert ON public.therapy_goal_logs;
CREATE POLICY therapy_goal_logs_insert ON public.therapy_goal_logs FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.therapy_goals g
                          WHERE g.id = goal_id AND g.clinic_id = therapy_goal_logs.clinic_id AND g.patient_id = therapy_goal_logs.patient_id));

DROP POLICY IF EXISTS therapy_goal_logs_update ON public.therapy_goal_logs;
CREATE POLICY therapy_goal_logs_update ON public.therapy_goal_logs FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.therapy_goals g
                          WHERE g.id = goal_id AND g.clinic_id = therapy_goal_logs.clinic_id AND g.patient_id = therapy_goal_logs.patient_id));

DROP POLICY IF EXISTS therapy_goal_logs_delete ON public.therapy_goal_logs;
CREATE POLICY therapy_goal_logs_delete ON public.therapy_goal_logs FOR DELETE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true));

-- therapy_assessments
DROP POLICY IF EXISTS therapy_assessments_select ON public.therapy_assessments;
CREATE POLICY therapy_assessments_select ON public.therapy_assessments FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS therapy_assessments_insert ON public.therapy_assessments;
CREATE POLICY therapy_assessments_insert ON public.therapy_assessments FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = therapy_assessments.clinic_id));

DROP POLICY IF EXISTS therapy_assessments_update ON public.therapy_assessments;
CREATE POLICY therapy_assessments_update ON public.therapy_assessments FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = therapy_assessments.clinic_id));

DROP POLICY IF EXISTS therapy_assessments_delete ON public.therapy_assessments;
CREATE POLICY therapy_assessments_delete ON public.therapy_assessments FOR DELETE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true));

