-- Responsavel legal do paciente (fono, TO, psico infantil; tutor na veterinaria).
-- Idempotente: pode ser colado mais de uma vez. RLS de patients ja cobre as colunas novas (nada a mexer).
-- Enquanto este SQL nao for colado, o app esconde os campos e nao os envia (ver src/lib/pacientes/guardianColumns.ts).

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS guardian_name text,
  ADD COLUMN IF NOT EXISTS guardian_cpf text,
  ADD COLUMN IF NOT EXISTS guardian_relationship text,
  ADD COLUMN IF NOT EXISTS guardian_phone text;

COMMENT ON COLUMN public.patients.guardian_name IS 'Nome do responsavel legal (ou tutor, na veterinaria)';
COMMENT ON COLUMN public.patients.guardian_cpf IS 'CPF do responsavel legal (so digitos ou formatado)';
COMMENT ON COLUMN public.patients.guardian_relationship IS 'Parentesco: Mae, Pai, Avo, Tutor legal, Outro...';
COMMENT ON COLUMN public.patients.guardian_phone IS 'Telefone do responsavel legal';

-- Faz o PostgREST enxergar as colunas novas sem esperar
NOTIFY pgrst, 'reload schema';
