-- ═══════════════════════════════════════════════════════════════════════════
-- AGENDA — Bloqueio de horário
-- Criado em: 2026-08-05
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Permite registrar um "bloqueio" na agenda (almoço, férias, indisponibilidade)
-- como uma linha normal de `appointments` com status = 'bloqueado' e sem
-- paciente vinculado. Reaproveita toda a lógica existente de detecção de
-- conflito de horário (slotBusyMap já considera qualquer linha sobreposta,
-- independente do status), sem precisar de uma tabela nova.
--
-- Confirmado via probe direto no banco (não havia CHECK constraint bloqueando
-- novos valores de status — só a constraint NOT NULL em patient_id barrava):
--   insert ... patient_id: null, status: 'bloqueado' ->
--   "null value in column patient_id ... violates not-null constraint"

ALTER TABLE public.appointments
  ALTER COLUMN patient_id DROP NOT NULL;

COMMENT ON COLUMN public.appointments.patient_id IS
  'Nulo quando a linha representa um bloqueio de horário (status=bloqueado) em vez de um agendamento de paciente.';
