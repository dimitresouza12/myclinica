-- ═══════════════════════════════════════════════════════════════════════════
-- CONVÊNIOS POR CLÍNICA + VÍNCULO DO PACIENTE (guias TISS impressas, produção, recibo, Receita Saúde)
-- Criado em: 2026-11-16
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Aditivo: uma tabela nova e colunas novas em patients (todas anuláveis). Nada existente muda.
--   * insurance_plans — convênio da clínica: nome, registro ANS (6 dígitos), tabela de valores por
--                       procedimento (jsonb {procedure_id: valor}), observação, ativo.
--   * patients        — insurance_plan_id (convênio cadastrado), convenio_validade (validade da carteirinha),
--                       convenio_titular (titular do plano), payer_name / payer_cpf (pagador, quando não é o
--                       próprio paciente: criança, dependente; usado no recibo e na exportação Receita Saúde).
--   O texto livre patients.convenio / convenio_carteirinha continua valendo (nome do convênio e número).
--
-- Segurança: RLS ligado em insurance_plans SEM policies (fechado por padrão). As policies e o gatilho que
-- impede ligar paciente a convênio de outra clínica ficam em
-- supabase/pendente-colar-sql-editor/20261116_convenios_policies.sql (colar no SQL Editor).
-- O app detecta a ausência da tabela/colunas e segue como antes (extrasSchema.ts / lib/convenios/schema.ts).
--
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.insurance_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(btrim(name)) > 0),
  ans_registry    text CHECK (ans_registry IS NULL OR ans_registry ~ '^[0-9]{6}$'),
  procedure_prices jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(procedure_prices) = 'object'),
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insurance_plans_clinic_idx ON public.insurance_plans (clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS insurance_plans_clinic_name_uniq ON public.insurance_plans (clinic_id, lower(btrim(name)));

ALTER TABLE public.insurance_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS insurance_plan_id uuid REFERENCES public.insurance_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS convenio_validade date,
  ADD COLUMN IF NOT EXISTS convenio_titular  text,
  ADD COLUMN IF NOT EXISTS payer_name        text,
  ADD COLUMN IF NOT EXISTS payer_cpf         text;

CREATE INDEX IF NOT EXISTS patients_insurance_plan_idx ON public.patients (insurance_plan_id) WHERE insurance_plan_id IS NOT NULL;

COMMENT ON TABLE public.insurance_plans IS
  'Convênios da clínica (nome, registro ANS, tabela de valores por procedimento em procedure_prices = {procedure_id: valor}).';
COMMENT ON COLUMN public.patients.insurance_plan_id IS 'Convênio cadastrado em insurance_plans (opcional; patients.convenio segue como texto livre).';
COMMENT ON COLUMN public.patients.payer_cpf IS 'CPF do pagador quando diferente do paciente (recibo e Receita Saúde).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar à mão; apaga os convênios e os vínculos gravados):
--
-- ALTER TABLE public.patients DROP COLUMN IF EXISTS insurance_plan_id, DROP COLUMN IF EXISTS convenio_validade,
--   DROP COLUMN IF EXISTS convenio_titular, DROP COLUMN IF EXISTS payer_name, DROP COLUMN IF EXISTS payer_cpf;
-- DROP TABLE IF EXISTS public.insurance_plans;
-- ═══════════════════════════════════════════════════════════════════════════
