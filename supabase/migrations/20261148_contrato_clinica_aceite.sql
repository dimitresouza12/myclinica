-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRATO DA CLÍNICA — campos em clinics + aceite digital (clinic_agreements)
-- Criado em: 2026-11-23
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O que faz:
--   1. clinics: colunas novas, todas NULLABLE (aditivo, sem backfill):
--        contract_months          int   (3, 6, 12 ou null)
--        contract_payment_mode    text  ('monthly' | 'upfront' ou null)
--        contract_start_date      date
--        first_due_date           date
--        asaas_customer_real_id   text  (id do customer no Asaas;
--                                        clinics.asaas_customer_id guarda o
--                                        payment link, por isso a coluna nova)
--   2. clinic_agreements: o aceite/assinatura do contrato (provas, hashes, OTP,
--      IP, user agent). RLS ligada; SELECT só para membros da clínica
--      (get_my_clinic_id()) e superadmin; SEM policy de INSERT/UPDATE/DELETE
--      (escrita só via service role, no servidor).
--   3. Trigger append-only: depois de status='signed', DELETE é bloqueado e
--      UPDATE só pode mudar asaas_ref (qualquer outra coluna alterada levanta
--      exceção). TRUNCATE também é bloqueado enquanto existir linha assinada.
--      Bônus: 'cancelled' é terminal (não volta para pending/signed).
--   4. clinic_agreement_code_log: log persistido de envios do código (OTP) para
--      limitar reenvio. RLS ligada, sem policies (só service role).
--
-- Decisões a saber:
--   * user_id NÃO tem FK para auth.users de propósito: um FK com ON DELETE
--     SET NULL/CASCADE tentaria alterar/apagar linha assinada e o trigger
--     bloquearia a exclusão do usuário. user_id é registro de prova.
--   * clinic_id tem FK ON DELETE CASCADE (padrão de contracts). Apagar uma
--     clínica que tenha contrato assinado FALHA de propósito (o trigger bloqueia
--     o DELETE em cascata); clínica só com pending/cancelled é apagada normal.
--   * Como após assinar só asaas_ref pode mudar, TODOS os campos de prova
--     (signed_at, signer_*, signature_image, ip_address, user_agent,
--     signed_hash, pdf_path, pdf_hash, content_*) precisam ser gravados no
--     mesmo UPDATE que muda status para 'signed' (ou antes dele).
--   * Privilégios de tabela: anon sem acesso; authenticated só SELECT.
--     service_role mantém tudo (bypassa RLS, mas NÃO bypassa o trigger).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE, DROP ... IF EXISTS + CREATE para policy/trigger, e
-- constraints/índices protegidos por checagem de existência.
--
-- Como reverter (só se nenhuma linha estiver 'signed'; com linhas assinadas o
-- DROP TABLE funciona, pois não dispara trigger de linha, mas apaga a prova:
-- NÃO faça sem decisão explícita):
--   DROP TABLE IF EXISTS public.clinic_agreement_code_log;
--   DROP TABLE IF EXISTS public.clinic_agreements;
--   DROP FUNCTION IF EXISTS public.clinic_agreements_guard();
--   DROP FUNCTION IF EXISTS public.clinic_agreements_block_truncate();
--   ALTER TABLE public.clinics
--     DROP CONSTRAINT IF EXISTS clinics_contract_months_check,
--     DROP CONSTRAINT IF EXISTS clinics_contract_payment_mode_check,
--     DROP COLUMN IF EXISTS contract_months,
--     DROP COLUMN IF EXISTS contract_payment_mode,
--     DROP COLUMN IF EXISTS contract_start_date,
--     DROP COLUMN IF EXISTS first_due_date,
--     DROP COLUMN IF EXISTS asaas_customer_real_id;
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. clinics: colunas do contrato ────────────────────────────────────────
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS contract_months        int,
  ADD COLUMN IF NOT EXISTS contract_payment_mode  text,
  ADD COLUMN IF NOT EXISTS contract_start_date    date,
  ADD COLUMN IF NOT EXISTS first_due_date         date,
  ADD COLUMN IF NOT EXISTS asaas_customer_real_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.clinics'::regclass
                   AND conname = 'clinics_contract_months_check') THEN
    ALTER TABLE public.clinics
      ADD CONSTRAINT clinics_contract_months_check
      CHECK (contract_months IS NULL OR contract_months IN (3, 6, 12));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.clinics'::regclass
                   AND conname = 'clinics_contract_payment_mode_check') THEN
    ALTER TABLE public.clinics
      ADD CONSTRAINT clinics_contract_payment_mode_check
      CHECK (contract_payment_mode IS NULL OR contract_payment_mode IN ('monthly', 'upfront'));
  END IF;
END $$;

COMMENT ON COLUMN public.clinics.asaas_customer_real_id IS
  'Id do customer no Asaas (cus_...). clinics.asaas_customer_id guarda o payment link, não o customer.';

-- ─── 2. clinic_agreements ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinic_agreements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL,            -- quem aceitou (sem FK: ver cabeçalho)
  plan              text NOT NULL,
  months            int  NOT NULL CHECK (months IN (3, 6, 12)),
  payment_mode      text NOT NULL CHECK (payment_mode IN ('monthly', 'upfront')),
  installments      int  NOT NULL DEFAULT 1 CHECK (installments >= 1),
  monthly_value     numeric(10,2) NOT NULL CHECK (monthly_value >= 0),
  total_value       numeric(10,2) NOT NULL CHECK (total_value >= 0),
  card_fee_value    numeric(10,2) NOT NULL DEFAULT 0 CHECK (card_fee_value >= 0),
  first_due_date    date,
  content_text      text,
  content_hash      text,
  pdf_path          text,
  pdf_hash          text,
  signer_name       text,
  signer_cpf        text,
  signature_image   text,
  code_hash         text,
  code_expires_at   timestamptz,
  code_attempts     int  NOT NULL DEFAULT 0,
  code_sent_to      text,
  code_sent_count   int  NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'signed', 'cancelled')),
  signed_at         timestamptz,
  ip_address        text,
  user_agent        text,
  signed_hash       text,
  asaas_ref         text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_agreements_clinic_id ON public.clinic_agreements (clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_agreements_status    ON public.clinic_agreements (status);

-- RLS: leitura só de membros da própria clínica (+ superadmin). Sem policy de
-- escrita: INSERT/UPDATE/DELETE só por service role.
ALTER TABLE public.clinic_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_agreements_select ON public.clinic_agreements;
CREATE POLICY clinic_agreements_select ON public.clinic_agreements
  FOR SELECT TO authenticated
  USING (clinic_id = (SELECT public.get_my_clinic_id()) OR (SELECT public.is_superadmin()));

REVOKE ALL ON public.clinic_agreements FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.clinic_agreements FROM authenticated;

-- ─── 3. Trigger append-only após assinar ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clinic_agreements_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'signed' THEN
      RAISE EXCEPTION 'clinic_agreement_signed_immutable: contrato assinado não pode ser apagado'
        USING errcode = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.status = 'signed' THEN
    -- Única coluna que pode mudar depois de assinado: asaas_ref.
    IF (to_jsonb(NEW) - 'asaas_ref') IS DISTINCT FROM (to_jsonb(OLD) - 'asaas_ref') THEN
      RAISE EXCEPTION 'clinic_agreement_signed_immutable: contrato assinado só aceita alteração em asaas_ref'
        USING errcode = 'P0001';
    END IF;
  ELSIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'clinic_agreement_cancelled_terminal: contrato cancelado não pode ser reaberto'
      USING errcode = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_clinic_agreements_guard ON public.clinic_agreements;
CREATE TRIGGER trg_clinic_agreements_guard
  BEFORE UPDATE OR DELETE ON public.clinic_agreements
  FOR EACH ROW EXECUTE FUNCTION public.clinic_agreements_guard();

-- TRUNCATE não dispara trigger de linha: bloqueia enquanto houver assinado.
CREATE OR REPLACE FUNCTION public.clinic_agreements_block_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.clinic_agreements WHERE status = 'signed') THEN
    RAISE EXCEPTION 'clinic_agreement_signed_immutable: tabela tem contratos assinados'
      USING errcode = 'P0001';
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_clinic_agreements_block_truncate ON public.clinic_agreements;
CREATE TRIGGER trg_clinic_agreements_block_truncate
  BEFORE TRUNCATE ON public.clinic_agreements
  FOR EACH STATEMENT EXECUTE FUNCTION public.clinic_agreements_block_truncate();

-- ─── 4. clinic_agreement_code_log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinic_agreement_code_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  agreement_id     uuid NOT NULL REFERENCES public.clinic_agreements(id) ON DELETE CASCADE,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  destination_hash text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clinic_agreement_code_log_agreement
  ON public.clinic_agreement_code_log (agreement_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_agreement_code_log_clinic
  ON public.clinic_agreement_code_log (clinic_id, sent_at DESC);

-- RLS ligada e SEM policies: nenhum acesso para anon/authenticated; só service role.
ALTER TABLE public.clinic_agreement_code_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clinic_agreement_code_log FROM anon, authenticated;
