-- PENDENTE: colar no SQL Editor do Supabase (projeto siohvtgbomvcprbzfamr), SE as policies não tiverem entrado
-- junto com supabase/migrations/20261114_vet_vacinas_pesos.sql (o classificador do MCP costuma recusar esse bloco).
-- As DUAS TABELAS (pet_vaccinations, pet_weights) precisam existir antes (rode a migration primeiro).
-- Enquanto não há policy, o RLS ligado deixa as tabelas fechadas: nada lê nem grava, e a aba "Vacinas e peso"
-- mostra um aviso neutro (o resto do prontuário segue normal).
-- Padrão do prontuário: get_my_clinic_id() OR is_superadmin() + has_module_perm('prontuario').
-- Idempotente (DROP POLICY IF EXISTS). Rollback: DROP POLICY ... ou DROP TABLE das duas (ver a migration).

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.pet_vaccinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_weights      ENABLE ROW LEVEL SECURITY;

-- pet_vaccinations
DROP POLICY IF EXISTS pet_vaccinations_select ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_select ON public.pet_vaccinations FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS pet_vaccinations_insert ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_insert ON public.pet_vaccinations FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = pet_vaccinations.clinic_id));

DROP POLICY IF EXISTS pet_vaccinations_update ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_update ON public.pet_vaccinations FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = pet_vaccinations.clinic_id));

DROP POLICY IF EXISTS pet_vaccinations_delete ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_delete ON public.pet_vaccinations FOR DELETE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true));

-- pet_weights
DROP POLICY IF EXISTS pet_weights_select ON public.pet_weights;
CREATE POLICY pet_weights_select ON public.pet_weights FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS pet_weights_insert ON public.pet_weights;
CREATE POLICY pet_weights_insert ON public.pet_weights FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = pet_weights.clinic_id));

DROP POLICY IF EXISTS pet_weights_update ON public.pet_weights;
CREATE POLICY pet_weights_update ON public.pet_weights FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = pet_weights.clinic_id));

DROP POLICY IF EXISTS pet_weights_delete ON public.pet_weights;
CREATE POLICY pet_weights_delete ON public.pet_weights FOR DELETE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true));
