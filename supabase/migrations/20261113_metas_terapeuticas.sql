-- ═══════════════════════════════════════════════════════════════════════════
-- METAS TERAPÊUTICAS (PEI / PTI) — fonoaudiologia, terapia ocupacional, fisioterapia, psicologia
-- Criado em: 2026-11-13
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Três tabelas novas, todas aditivas (nada existente é alterado):
--   * therapy_goals        — a meta (título, domínio, critério, prazo, status).
--   * therapy_goal_logs    — um registro por meta por sessão (adquirido / com pista /
--                            não adquirido), com data, profissional e nota curta.
--   * therapy_assessments  — avaliações estruturadas por data, em jsonb:
--                            'quadro_fonemico' (fono) e 'checklist_avd' (TO).
--
-- Segurança: RLS ligado nas três. Mesmo desenho do prontuário:
--   leitura  = (clinic_id = get_my_clinic_id() OR is_superadmin()) E has_module_perm('prontuario', false)
--   escrita  = (clinic_id = get_my_clinic_id() OR is_superadmin()) E has_module_perm('prontuario', true)
--   o paciente (e a meta, nos registros) precisam pertencer à mesma clínica (impede gravar
--   com patient_id de outra clínica).
--
-- Sem gatilhos: created_by usa DEFAULT auth.uid(); updated_at é enviado pelo app.
-- Metas não têm DELETE (para encerrar, muda o status para 'cancelada'): o histórico clínico
-- não some. Registros de sessão e avaliações aceitam DELETE só para corrigir toque errado.
--
-- Desfazer: bloco ROLLBACK no fim do arquivo (apaga as três tabelas e os dados delas).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Metas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.therapy_goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id  uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  area        text NOT NULL CHECK (area IN ('fono', 'to', 'fisio', 'psico')),
  title       text NOT NULL CHECK (length(btrim(title)) > 0),
  domain      text,
  criterion   text,
  target_date date,
  status      text NOT NULL DEFAULT 'em_andamento'
              CHECK (status IN ('em_andamento', 'atingida', 'suspensa', 'cancelada')),
  sort_order  integer NOT NULL DEFAULT 0,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS therapy_goals_patient_idx ON public.therapy_goals (patient_id, area);
CREATE INDEX IF NOT EXISTS therapy_goals_clinic_idx  ON public.therapy_goals (clinic_id);

-- ── Registros por sessão ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.therapy_goal_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES public.clinics(id)       ON DELETE CASCADE,
  patient_id  uuid NOT NULL REFERENCES public.patients(id)      ON DELETE CASCADE,
  goal_id     uuid NOT NULL REFERENCES public.therapy_goals(id) ON DELETE CASCADE,
  log_date    date NOT NULL DEFAULT current_date,
  result      text NOT NULL CHECK (result IN ('adquirido', 'com_pista', 'nao_adquirido')),
  note        text,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS therapy_goal_logs_goal_idx    ON public.therapy_goal_logs (goal_id, log_date);
CREATE INDEX IF NOT EXISTS therapy_goal_logs_patient_idx ON public.therapy_goal_logs (patient_id, log_date);
CREATE INDEX IF NOT EXISTS therapy_goal_logs_clinic_idx  ON public.therapy_goal_logs (clinic_id);

-- ── Avaliações estruturadas (quadro fonêmico, checklist de AVD) ─────────────
CREATE TABLE IF NOT EXISTS public.therapy_assessments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id  uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('quadro_fonemico', 'checklist_avd')),
  assessed_on date NOT NULL DEFAULT current_date,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS therapy_assessments_patient_idx ON public.therapy_assessments (patient_id, kind, assessed_on);
CREATE INDEX IF NOT EXISTS therapy_assessments_clinic_idx  ON public.therapy_assessments (clinic_id);

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

COMMENT ON TABLE public.therapy_goals IS
  'Metas do plano terapêutico (PEI fono / PTI TO / metas de fisio e psico). Sem DELETE: encerrar = status cancelada.';
COMMENT ON TABLE public.therapy_goal_logs IS
  'Registro por sessão de cada meta: adquirido, com_pista ou nao_adquirido, com data, profissional e nota curta.';
COMMENT ON TABLE public.therapy_assessments IS
  'Avaliações estruturadas por data (quadro_fonemico, checklist_avd) com o conteúdo em data (jsonb).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar à mão, só se precisar desfazer; apaga as metas e registros gravados):
--
-- DROP TABLE IF EXISTS public.therapy_goal_logs;
-- DROP TABLE IF EXISTS public.therapy_assessments;
-- DROP TABLE IF EXISTS public.therapy_goals;
-- ═══════════════════════════════════════════════════════════════════════════
