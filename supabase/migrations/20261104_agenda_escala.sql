-- ═══════════════════════════════════════════════════════════════════════════
-- AGENDA — Escala e disponibilidade dos profissionais
-- Criado em: 2026-11-04
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plano: vault Obsidian → MyClinica/Planejamento/Plano — Escala e Disponibilidade dos Profissionais.md
--
-- Três camadas, nesta ordem de precedência por dia:
--   1. professional_day_schedule  o que foi marcado para uma data (substitui a rotina nesse dia)
--   2. professional_week_pattern  rotina "Repetir toda semana" (por dia da semana)
--   3. (nada)                     por definir, se o profissional tem a escala ligada
-- Os bloqueios (appointments.status = 'bloqueado') continuam por cima de tudo.
--
-- professionals.schedule_enabled = false (padrão) mantém o comportamento de hoje: o profissional
-- atende em qualquer horário. Nenhuma clínica existente muda até alguém ligar a escala.
--
-- Janelas de horário ficam em jsonb: [{"start":"08:00","end":"12:00","shift_id":"manha"}]. Uma linha por
-- profissional e dia (ou dia da semana) mantém a gravação atômica com um único upsert.
--
-- Aditiva: tabelas novas, 3 colunas novas (padrão seguro) e políticas. Nada existente é alterado.
-- NÃO inclui a proteção contra marcação dupla (restrição de exclusão com btree_gist): exige conferir
-- antes se já existem sobreposições nos dados e fica para uma migration própria.

-- ─── Configurações da clínica (uma linha por clínica; a linha só existe depois de salvar) ───
CREATE TABLE IF NOT EXISTS public.clinic_schedule_settings (
  clinic_id                 uuid        PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  shifts                    jsonb       NOT NULL DEFAULT '[{"id":"manha","name":"Manhã","start":"08:00","end":"12:00"},{"id":"tarde","name":"Tarde","start":"13:00","end":"18:00"}]'::jsonb,
  extra_slot_policy         text        NOT NULL DEFAULT 'admin_recepcao'
                                        CHECK (extra_slot_policy IN ('none', 'admin', 'admin_recepcao')),
  extra_slot_require_reason boolean     NOT NULL DEFAULT true,
  reminder_enabled          boolean     NOT NULL DEFAULT true,
  reminder_days_before      integer     NOT NULL DEFAULT 3 CHECK (reminder_days_before BETWEEN 0 AND 30),
  opening_hours             jsonb,      -- {"start":"07:00","end":"19:30"}: casas da grade de início até antes do fim; nulo = 07:00 a 19:00
  slot_step_minutes         integer     NOT NULL DEFAULT 30 CHECK (slot_step_minutes IN (15, 20, 30, 60)),
  professional_can_edit_own boolean     NOT NULL DEFAULT false,
  link_procedures           boolean     NOT NULL DEFAULT false,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- ─── Rotina semanal ("Repetir toda semana") ───
CREATE TABLE IF NOT EXISTS public.professional_week_pattern (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid        NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  weekday         smallint    NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = domingo
  windows         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, weekday)
);
CREATE INDEX IF NOT EXISTS idx_prof_week_pattern_clinic ON public.professional_week_pattern (clinic_id);

-- ─── O que foi marcado para uma data ───
CREATE TABLE IF NOT EXISTS public.professional_day_schedule (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid        NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  works           boolean     NOT NULL,
  windows         jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- vazio com works = true: atende o dia todo
  note            text,
  updated_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, date)
);
CREATE INDEX IF NOT EXISTS idx_prof_day_schedule_clinic_date ON public.professional_day_schedule (clinic_id, date);

-- ─── Colunas novas em tabelas existentes ───
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS schedule_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS extra_slot_reason text,   -- motivo do encaixe fora da escala
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz;   -- quando o paciente chegou (botão "Paciente chegou" no detalhe da consulta)

-- ─── RLS: leitura com permissão de ver a agenda, escrita com permissão de editar ───
ALTER TABLE public.clinic_schedule_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_week_pattern  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_day_schedule  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clinic_schedule_settings', 'professional_week_pattern', 'professional_day_schedule'] LOOP
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

COMMENT ON TABLE public.professional_week_pattern IS
  'Rotina semanal do profissional (Repetir toda semana). Dia da semana sem linha = não atende nesse dia pela rotina.';
COMMENT ON TABLE public.professional_day_schedule IS
  'Escala de uma data específica; substitui a rotina semanal nesse dia. works = false: não atende.';
COMMENT ON COLUMN public.professionals.schedule_enabled IS
  'false = nunca configurou escala (atende em qualquer horário, como antes). true = só atende nos dias e janelas da escala.';
