-- ═══════════════════════════════════════════════════════════════════════════
-- VETERINÁRIA: CARTEIRA DE VACINAS / ANTIPARASITÁRIOS E CURVA DE PESO DO PET
-- Criado em: 2026-11-14
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Duas tabelas novas, aditivas (nada existente é alterado). Cada pet é uma linha de `patients`.
--   * pet_vaccinations — um registro por aplicação (vacina, vermífugo ou antipulgas/carrapatos):
--                        produto, lote, fabricante, data de aplicação, próxima dose/reforço,
--                        veterinário (nome e registro no conselho copiados na hora, para o impresso
--                        não mudar se o cadastro do profissional mudar depois).
--   * pet_weights      — uma pesagem por linha (data + kg). Hoje patients.pet_weight guarda só o
--                        último valor e é sobrescrito; aqui fica o histórico para a curva de peso.
--
-- Segurança: RLS ligado nas duas. Mesmo desenho do prontuário:
--   leitura  = (clinic_id = get_my_clinic_id() OR is_superadmin()) E has_module_perm('prontuario', false)
--   escrita  = (clinic_id = get_my_clinic_id() OR is_superadmin()) E has_module_perm('prontuario', true)
--   o pet (patient_id) precisa pertencer à mesma clínica (impede gravar com patient_id de outra).
--
-- Sem gatilhos: created_by usa DEFAULT auth.uid(); updated_at é enviado pelo app.
-- Registros aceitam UPDATE e DELETE (corrigir toque errado). Apagar o paciente apaga o histórico (CASCADE).
--
-- As policies também estão em supabase/pendente-colar-sql-editor/20261114_vet_policies.sql (idempotente),
-- para o caso de o classificador do MCP recusar o bloco de policies: as tabelas ficam fechadas por padrão
-- (RLS ligado, sem policy = ninguém lê nem grava) até esse arquivo rodar.
--
-- Desfazer: bloco ROLLBACK no fim do arquivo (apaga as duas tabelas e os dados delas).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Carteira de vacinas e antiparasitários ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pet_vaccinations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id    uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kind          text NOT NULL DEFAULT 'vacina' CHECK (kind IN ('vacina', 'vermifugo', 'antiparasitario_externo')),
  name          text NOT NULL CHECK (length(btrim(name)) > 0),
  batch         text,
  manufacturer  text,
  applied_on    date NOT NULL DEFAULT current_date,
  next_due_on   date,
  professional_id           uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name         text,
  professional_registration text,
  notes         text,
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (next_due_on IS NULL OR next_due_on >= applied_on)
);

CREATE INDEX IF NOT EXISTS pet_vaccinations_patient_idx ON public.pet_vaccinations (patient_id, applied_on);
CREATE INDEX IF NOT EXISTS pet_vaccinations_clinic_due_idx ON public.pet_vaccinations (clinic_id, next_due_on);

-- ── Histórico de peso ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pet_weights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id  uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  weighed_on  date NOT NULL DEFAULT current_date,
  weight_kg   numeric(7,3) NOT NULL CHECK (weight_kg > 0 AND weight_kg <= 2000),
  note        text,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pet_weights_patient_idx ON public.pet_weights (patient_id, weighed_on);
CREATE INDEX IF NOT EXISTS pet_weights_clinic_idx  ON public.pet_weights (clinic_id);

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

COMMENT ON TABLE public.pet_vaccinations IS
  'Carteira do pet: vacinas, vermífugos e antiparasitários externos aplicados (produto, lote, fabricante, data, próxima dose, veterinário).';
COMMENT ON TABLE public.pet_weights IS
  'Histórico de pesagens do pet (data + kg) para a curva de peso. patients.pet_weight continua guardando o último valor.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar à mão, só se precisar desfazer; apaga a carteira e as pesagens gravadas):
--
-- DROP TABLE IF EXISTS public.pet_vaccinations;
-- DROP TABLE IF EXISTS public.pet_weights;
-- ═══════════════════════════════════════════════════════════════════════════
