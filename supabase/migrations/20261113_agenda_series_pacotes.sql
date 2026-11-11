-- ═══════════════════════════════════════════════════════════════════════════
-- AGENDA: AGENDAMENTO RECORRENTE (SÉRIES) E PACOTES DE SESSÕES "X/N"
-- Criado em: 2026-11-13
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1) appointment_series: a regra de uma série (semanal, quinzenal ou mensal, 1x a 3x por
--    semana, N ocorrências ou até uma data). Cada ocorrência é uma linha normal de
--    `appointments` com series_id + series_index, então a agenda, o conflito e o financeiro
--    continuam enxergando cada consulta como hoje. A série serve para "editar/cancelar este
--    e os próximos".
--
-- 2) patient_packages: o paciente contrata N sessões de um procedimento. NÃO há contador
--    gravado: sessões usadas = consultas do pacote com status 'concluido' (derivado em
--    appointments.package_id). Assim desfazer uma conclusão, excluir ou remarcar a consulta
--    devolve a sessão sozinho, sem decremento que possa dessincronizar.
--    `financial_record_id` é opcional: liga o pacote à receita da venda (lançada UMA vez,
--    na contratação). Consulta que consome sessão não gera nova receita nem consome o saldo
--    monetário de `patient_credits` (que segue valendo para quem usa crédito em R$).
--
-- Tudo aditivo: colunas novas são NULL e o app degrada sem elas (sem esta migration a agenda
-- funciona como antes, só sem os recursos de série e pacote).
--
-- RLS: mesmo padrão da escala (20261104_agenda_escala.sql): get_my_clinic_id() / is_superadmin(),
-- leitura com permissão de ver a agenda e escrita com permissão de editar a agenda.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Pacotes de sessões ───
CREATE TABLE IF NOT EXISTS public.patient_packages (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id            uuid        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id           uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  procedure_id         uuid        REFERENCES public.procedures(id) ON DELETE SET NULL,
  name                 text        NOT NULL,                                   -- ex.: "Pacote 10 sessões de pilates"
  total_sessions       integer     NOT NULL CHECK (total_sessions BETWEEN 1 AND 500),
  total_price          numeric     NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  financial_record_id  uuid        REFERENCES public.financial_records(id) ON DELETE SET NULL,
  status               text        NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'cancelado')),
  expires_at           date,                                                   -- validade opcional
  notes                text,
  created_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_packages_clinic_patient ON public.patient_packages (clinic_id, patient_id, status);

-- ─── Séries de agendamento ───
CREATE TABLE IF NOT EXISTS public.appointment_series (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id          uuid        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id         uuid        REFERENCES public.patients(id)      ON DELETE CASCADE,
  professional_id    uuid        REFERENCES public.professionals(id) ON DELETE SET NULL,
  procedure_id       uuid        REFERENCES public.procedures(id)    ON DELETE SET NULL,
  package_id         uuid        REFERENCES public.patient_packages(id) ON DELETE SET NULL,
  frequency          text        NOT NULL CHECK (frequency IN ('semanal', 'quinzenal', 'mensal')),
  weekdays           smallint[]  NOT NULL DEFAULT '{}',                        -- 0 = domingo; 1 a 3 itens (semanal/quinzenal)
  start_date         date        NOT NULL,
  time_of_day        text        NOT NULL,                                     -- "HH:mm", horário local da clínica
  duration_minutes   integer     NOT NULL DEFAULT 60 CHECK (duration_minutes >= 5),
  end_mode           text        NOT NULL CHECK (end_mode IN ('contagem', 'data')),
  occurrences        integer     CHECK (occurrences IS NULL OR occurrences BETWEEN 1 AND 200),
  until_date         date,
  created_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointment_series_clinic ON public.appointment_series (clinic_id, patient_id);

-- ─── Colunas novas em appointments (todas NULL) ───
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS series_id    uuid REFERENCES public.appointment_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS series_index integer,                                 -- 1, 2, 3... dentro da série
  ADD COLUMN IF NOT EXISTS package_id   uuid REFERENCES public.patient_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_series  ON public.appointments (series_id, scheduled_at) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_package ON public.appointments (package_id, scheduled_at) WHERE package_id IS NOT NULL;

-- ─── RLS ───
ALTER TABLE public.patient_packages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_series ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_packages', 'appointment_series'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_read_' || t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm(''agenda'', false)))',
        'tenant_read_' || t, t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_insert_' || t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm(''agenda'', true)))',
        'tenant_insert_' || t, t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_update_' || t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm(''agenda'', true))) WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm(''agenda'', true)))',
        'tenant_update_' || t, t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_delete_' || t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm(''agenda'', true)))',
        'tenant_delete_' || t, t);
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.patient_packages IS
  'Pacote de N sessões de um procedimento contratado pelo paciente. Sessões usadas = appointments com este package_id e status concluido (derivado, sem contador gravado).';
COMMENT ON TABLE public.appointment_series IS
  'Regra de uma série de agendamentos recorrentes. Cada ocorrência é uma linha de appointments com series_id e series_index.';
COMMENT ON COLUMN public.appointments.series_id    IS 'Série recorrente a que a consulta pertence (NULL = consulta avulsa).';
COMMENT ON COLUMN public.appointments.series_index IS 'Posição da consulta na série quando foi criada (1, 2, 3...).';
COMMENT ON COLUMN public.appointments.package_id   IS 'Pacote de sessões que esta consulta consome ao ser concluída (NULL = cobrança normal).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar manualmente, nesta ordem; remove todos os pacotes e séries):
--
-- DROP INDEX IF EXISTS public.idx_appointments_package;
-- DROP INDEX IF EXISTS public.idx_appointments_series;
-- ALTER TABLE public.appointments
--   DROP COLUMN IF EXISTS package_id,
--   DROP COLUMN IF EXISTS series_index,
--   DROP COLUMN IF EXISTS series_id;
-- DROP TABLE IF EXISTS public.appointment_series;
-- DROP TABLE IF EXISTS public.patient_packages;
-- ═══════════════════════════════════════════════════════════════════════════
