-- ═══════════════════════════════════════════════════════════════════════════
-- COMISSÕES — motor de cálculo automático (trigger)
-- Criado em: 2026-07-31
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por que trigger e não código no app: financial_records nasce de mais de um
-- lugar (agenda ao concluir consulta, lançamento manual no /financeiro, e
-- possíveis integrações futuras). Um trigger garante que NENHUM desses
-- caminhos escapa do cálculo de comissão, sem depender de cada tela lembrar
-- de chamar uma função.

CREATE OR REPLACE FUNCTION public.generate_commission_entries()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rule RECORD;
BEGIN
  -- Só gera comissão para receita vinculada a um procedimento com valor.
  -- Despesas e receitas sem procedimento (ex: lançamento avulso "outros")
  -- não passam por aqui.
  IF NEW.type IS DISTINCT FROM 'receita'
     OR NEW.procedure_id IS NULL
     OR NEW.total_amount IS NULL
     OR NEW.total_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Para cada beneficiário ativo, usa a regra mais específica: se existir uma
  -- regra exclusiva para este procedimento, ela vence; senão cai para a regra
  -- geral do beneficiário (procedure_id IS NULL na regra).
  FOR rule IN
    SELECT DISTINCT ON (cr.recipient_id)
      cr.recipient_id, cr.percent, r.name AS recipient_name
    FROM public.commission_rules cr
    JOIN public.commission_recipients r ON r.id = cr.recipient_id
    WHERE cr.clinic_id = NEW.clinic_id
      AND cr.is_active = true
      AND r.is_active = true
      AND (cr.procedure_id = NEW.procedure_id OR cr.procedure_id IS NULL)
    ORDER BY cr.recipient_id, (cr.procedure_id IS NOT NULL) DESC
  LOOP
    INSERT INTO public.commission_entries
      (clinic_id, financial_record_id, recipient_id, recipient_name, percent, amount)
    VALUES
      (NEW.clinic_id, NEW.id, rule.recipient_id, rule.recipient_name, rule.percent,
       round(NEW.total_amount * rule.percent / 100, 2));
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_commission_entries ON public.financial_records;
CREATE TRIGGER trg_generate_commission_entries
  AFTER INSERT ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION public.generate_commission_entries();

COMMENT ON FUNCTION public.generate_commission_entries() IS
  'Ao criar uma receita vinculada a um procedimento, gera 1 commission_entry por beneficiário ativo com regra pra esse procedimento (ou regra geral, se não houver específica). Snapshot congelado: mudar a regra depois não reprocessa receitas já lançadas. Excluir a receita (financial_records) apaga as entries junto via ON DELETE CASCADE.';
