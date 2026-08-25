-- ═══════════════════════════════════════════════════════════════════════════
-- SALDO DE PACOTE DO PACIENTE — crédito pré-pago (patient_credits)
-- Criado em: 2026-08-25
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ledger simples: soma de `amount` por patient_id = saldo disponível.
-- 'credito' (amount positivo) = pagamento adiantado, lançado no Financeiro
-- como uma venda de pacote (financial_record_id aponta pra essa receita).
-- 'consumo' (amount negativo) = atendimento concluído descontando do saldo
-- em vez de gerar uma receita nova (appointment_id aponta pro agendamento).
-- 'estorno' = ajuste manual, qualquer sinal.

CREATE TABLE IF NOT EXISTS public.patient_credits (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id            uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id           uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  amount               numeric     NOT NULL,
  type                 text        NOT NULL CHECK (type IN ('credito', 'consumo', 'estorno')),
  financial_record_id  uuid        REFERENCES public.financial_records(id) ON DELETE SET NULL,
  appointment_id       uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  notes                text,
  created_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz DEFAULT now() NOT NULL,
  CHECK ((type = 'credito' AND amount > 0) OR (type = 'consumo' AND amount < 0) OR type = 'estorno')
);

CREATE INDEX IF NOT EXISTS idx_patient_credits_patient ON public.patient_credits (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_credits_clinic  ON public.patient_credits (clinic_id);

-- ─── RLS — mesmo padrão de isolamento por clínica já usado no app ───────────
-- get_my_clinic_id() + is_superadmin() (confirmado como o padrão real em
-- produção na migration 20260731_add_commissions.sql).

ALTER TABLE public.patient_credits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_credits' AND policyname = 'tenant_isolation_patient_credits'
  ) THEN
    CREATE POLICY "tenant_isolation_patient_credits" ON public.patient_credits
      FOR ALL
      USING (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());
  END IF;
END $$;

COMMENT ON TABLE public.patient_credits IS
  'Ledger de crédito pré-pago do paciente (pacote fechado). Soma de amount = saldo disponível. credito=positivo (pagamento adiantado), consumo=negativo (atendimento concluído descontando do saldo), estorno=ajuste manual.';
