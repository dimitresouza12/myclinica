-- ═══════════════════════════════════════════════════════════════════════════
-- Colunas opcionais da Onda 1: dados do pet (vet) e RQE (medico)
-- Criado em: 2026-11-11
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só colunas que o frontend da Onda 1 não consegue guardar em outro lugar
-- (patients e professionals não têm coluna jsonb). Todas NULLABLE, sem default,
-- sem backfill: nenhum dado existente muda e nenhuma query atual quebra.
-- Já existem em produção: patients.birth_date, pet_name, pet_species, pet_breed,
-- pet_weight, pet_age, pet_coat, pet_neutered, professionals.registration_number.
--
--   patients.pet_birth_date  date  — data real/estimada; substitui o texto
--                                    congelado de pet_age (que fica, não é apagado).
--   patients.pet_sex         text  — 'macho' | 'femea' (CHECK abaixo).
--   patients.pet_microchip   text  — nº do microchip (Res. CFMV 1.653/2025).
--   professionals.rqe        text  — Registro de Qualificação de Especialista
--                                    (CFM 2.299/2021), texto livre.
--
-- "Vários pets do mesmo tutor": já é possível sem esquema novo — patients não tem
-- unicidade em telefone/CPF, então cada pet é uma linha de patients com o mesmo
-- tutor/telefone. Tabela tutors / tutor_id ficam para a Onda 2.
--
-- Desfazer: bloco ROLLBACK no fim.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS pet_birth_date date,
  ADD COLUMN IF NOT EXISTS pet_sex text,
  ADD COLUMN IF NOT EXISTS pet_microchip text;

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS rqe text;

-- CHECK direto (sem NOT VALID): a coluna é nova e toda nula, então valida sem custo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.patients'::regclass AND conname = 'patients_pet_sex_check'
  ) THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_pet_sex_check
      CHECK (pet_sex IS NULL OR pet_sex IN ('macho', 'femea'));
  END IF;
END $$;

COMMENT ON COLUMN public.patients.pet_birth_date IS 'Veterinária: data de nascimento (real ou estimada) do pet. A idade é calculada na tela.';
COMMENT ON COLUMN public.patients.pet_sex IS 'Veterinária: sexo do pet (macho | femea).';
COMMENT ON COLUMN public.patients.pet_microchip IS 'Veterinária: número do microchip do pet (Res. CFMV 1.653/2025).';
COMMENT ON COLUMN public.professionals.rqe IS 'Registro de Qualificação de Especialista (médicos), texto livre. Sai ao lado do CRM nos documentos.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (DROP COLUMN apaga o que já tiver sido digitado; confirmar antes)
--
--   ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_pet_sex_check;
--   ALTER TABLE public.patients DROP COLUMN IF EXISTS pet_birth_date;
--   ALTER TABLE public.patients DROP COLUMN IF EXISTS pet_sex;
--   ALTER TABLE public.patients DROP COLUMN IF EXISTS pet_microchip;
--   ALTER TABLE public.professionals DROP COLUMN IF EXISTS rqe;
-- ═══════════════════════════════════════════════════════════════════════════
