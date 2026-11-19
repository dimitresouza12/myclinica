-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCEIRO — quem recebeu o dinheiro (financial_records.received_by)
-- Criado em: 2026-11-18
-- ═══════════════════════════════════════════════════════════════════════════
--
-- received_by  uuid NULL -> clinic_users(id) ON DELETE SET NULL
--   Usuário da clínica (admin/recepção/profissional) que recebeu o valor da entrada.
--   Nullable: registros antigos, seeds e testes continuam inserindo sem a coluna. Sem backfill.
--
-- Índice (clinic_id, received_by, created_at): relatório "quanto cada pessoa recebeu no período".
--
-- Trigger de validação: received_by precisa ser da MESMA clínica do registro. O FK sozinho só garante
-- que o clinic_users existe, não que é da clínica. A função é SECURITY DEFINER porque a recepção só
-- enxerga a própria linha em clinic_users (RLS), então a checagem não poderia rodar com o papel do chamador.
-- Só valida quando received_by é preenchido e (INSERT, ou received_by/clinic_id mudaram).
--
-- Não toca em RLS: as políticas de financial_records (clinic_isolation + restrict_financeiro_*) não
-- referenciam colunas específicas e continuam valendo para a coluna nova.
-- O trigger trg_generate_commission_entries só recalcula se total_amount/procedure_id/type mudam: não é afetado.
--
-- Idempotente. Só adiciona; não altera nem apaga dado existente.

ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS received_by uuid NULL
  REFERENCES public.clinic_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.financial_records.received_by IS
  'clinic_users.id de quem recebeu o valor desta entrada. NULL = não informado (registros antigos). Validado pelo trigger trg_financial_records_received_by_clinic: precisa ser da mesma clínica do registro.';

CREATE INDEX IF NOT EXISTS idx_financial_records_received_by
  ON public.financial_records (clinic_id, received_by, created_at);

CREATE OR REPLACE FUNCTION public.check_financial_received_by_clinic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.received_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.received_by IS NOT DISTINCT FROM OLD.received_by
     AND NEW.clinic_id    IS NOT DISTINCT FROM OLD.clinic_id THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.id = NEW.received_by
      AND cu.clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'received_by deve ser um usuário da mesma clínica do registro financeiro'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_financial_received_by_clinic() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.financial_records'::regclass
      AND tgname = 'trg_financial_records_received_by_clinic'
  ) THEN
    CREATE TRIGGER trg_financial_records_received_by_clinic
      BEFORE INSERT OR UPDATE OF received_by, clinic_id ON public.financial_records
      FOR EACH ROW EXECUTE FUNCTION public.check_financial_received_by_clinic();
  END IF;
END $$;
