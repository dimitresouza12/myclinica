-- ═══════════════════════════════════════════════════════════════════════════
-- COMISSÕES — quem recebe qual % de cada procedimento
-- Criado em: 2026-07-31
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fluxo: financial_records (receita, já existe) → commission_entries (novo,
-- 1 linha por beneficiário que ganha algo daquela receita). As entries são
-- um SNAPSHOT congelado no momento em que a receita é criada — mudar a regra
-- de comissão depois não altera o histórico já gerado.

-- ─── 1. BENEFICIÁRIOS — quem pode receber comissão ──────────────────────────
-- Separado de `professionals` (agenda) e `clinic_users` (login no sistema)
-- porque nem todo beneficiário se encaixa nos dois: a dona do consultório
-- pode não atender pacientes (não é professional) e pode ou não logar no
-- sistema (pode ou não ser clinic_user).
CREATE TABLE IF NOT EXISTS public.commission_recipients (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  role_label      text,       -- rótulo livre: "Dentista", "Dona", "Recepção"...
  professional_id uuid        REFERENCES public.professionals(id) ON DELETE SET NULL,
  clinic_user_id  uuid        REFERENCES public.clinic_users(id) ON DELETE SET NULL,
  is_active       boolean     DEFAULT true NOT NULL,
  created_at      timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commission_recipients_clinic
  ON public.commission_recipients (clinic_id) WHERE is_active = true;

-- ─── 2. REGRAS — qual % cada beneficiário recebe, por procedimento ──────────
-- procedure_id NULL = regra geral (aplica a qualquer procedimento sem regra
-- específica). Uma regra específica do mesmo beneficiário para o mesmo
-- procedimento sobrescreve a regra geral dele.
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id     uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  recipient_id  uuid        NOT NULL REFERENCES public.commission_recipients(id) ON DELETE CASCADE,
  procedure_id  uuid        REFERENCES public.procedures(id) ON DELETE CASCADE,
  percent       numeric     NOT NULL CHECK (percent > 0 AND percent <= 100),
  is_active     boolean     DEFAULT true NOT NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  UNIQUE (recipient_id, procedure_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_clinic
  ON public.commission_rules (clinic_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_commission_rules_procedure
  ON public.commission_rules (procedure_id) WHERE procedure_id IS NOT NULL;

-- ─── 3. LANÇAMENTOS — snapshot congelado do que cada um ganhou ──────────────
-- 1 financial_record pode gerar N commission_entries (uma por beneficiário
-- com regra ativa pro procedimento daquela receita). recipient_name e percent
-- ficam congelados aqui: renomear ou desativar o beneficiário depois, ou
-- mudar a % da regra, não reescreve o histórico já gerado.
CREATE TABLE IF NOT EXISTS public.commission_entries (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id           uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  financial_record_id uuid        NOT NULL REFERENCES public.financial_records(id) ON DELETE CASCADE,
  recipient_id        uuid        NOT NULL REFERENCES public.commission_recipients(id) ON DELETE RESTRICT,
  recipient_name      text        NOT NULL,
  percent             numeric     NOT NULL,
  amount              numeric     NOT NULL,
  created_at          timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commission_entries_clinic
  ON public.commission_entries (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_entries_recipient
  ON public.commission_entries (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_entries_record
  ON public.commission_entries (financial_record_id);

-- ─── 4. RLS — mesmo padrão de isolamento por clínica já usado no app ────────
-- (public.my_clinic_ids() já existe, criada em 20260608_audit_security.sql)

ALTER TABLE public.commission_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_entries    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commission_recipients' AND policyname = 'tenant_isolation_commission_recipients'
  ) THEN
    CREATE POLICY "tenant_isolation_commission_recipients" ON public.commission_recipients
      FOR ALL
      USING (clinic_id = ANY(public.my_clinic_ids()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commission_rules' AND policyname = 'tenant_isolation_commission_rules'
  ) THEN
    CREATE POLICY "tenant_isolation_commission_rules" ON public.commission_rules
      FOR ALL
      USING (clinic_id = ANY(public.my_clinic_ids()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commission_entries' AND policyname = 'tenant_isolation_commission_entries'
  ) THEN
    CREATE POLICY "tenant_isolation_commission_entries" ON public.commission_entries
      FOR ALL
      USING (clinic_id = ANY(public.my_clinic_ids()));
  END IF;
END $$;

COMMENT ON TABLE public.commission_recipients IS
  'Pessoas que recebem comissão por procedimento (dentista, dona, recepção...). Independente de professionals/clinic_users pois nem todo beneficiário atende pacientes ou loga no sistema.';
COMMENT ON TABLE public.commission_rules IS
  'Percentual que cada beneficiário recebe. procedure_id NULL = regra geral; regra específica do mesmo beneficiário/procedimento tem prioridade.';
COMMENT ON TABLE public.commission_entries IS
  'Snapshot congelado: quanto cada beneficiário ganhou de cada receita, no momento em que a receita foi criada. Não é recalculado se a regra mudar depois.';
