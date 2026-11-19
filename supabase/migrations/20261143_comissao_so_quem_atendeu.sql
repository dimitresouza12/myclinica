-- ═══════════════════════════════════════════════════════════════════════════
-- COMISSÕES — regra "só quando o beneficiário é quem atendeu"
-- Criado em: 2026-11-19
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Caso de uso (Naiara Harmonização): sócia com 50% fixo sobre tudo (regra
-- comum) e cada dentista com 50% APENAS nos atendimentos que ele próprio fez.
--
-- Mudanças (aditivas; nada é apagado nem reprocessado):
--   1. commission_rules.only_when_attended (default false = comportamento atual).
--   2. generate_commission_entries() passa a olhar financial_records.professional_id:
--        - regra only_when_attended=true só vale se NEW.professional_id for o
--          mesmo professional_id do beneficiário (commission_recipients);
--        - receita SEM procedimento passa a gerar comissão, mas SÓ para regras
--          gerais (procedure_id NULL) marcadas only_when_attended=true. Regras
--          comuns continuam ignorando receita sem procedimento;
--        - a precedência "regra do procedimento vence a geral" é decidida ANTES
--          do filtro de atendimento: se existe regra específica para o
--          procedimento, é ela que governa o beneficiário (inclusive se não
--          valer por não ter sido ele quem atendeu, caso em que não há comissão
--          para ele — a geral não é usada como fallback);
--        - mudar professional_id numa receita já lançada dispara recálculo.
--   3. Entries já existentes NÃO são reprocessadas (snapshot por lançamento).
--      O trigger trg_generate_commission_entries não é recriado.

ALTER TABLE public.commission_rules
  ADD COLUMN IF NOT EXISTS only_when_attended boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.commission_rules.only_when_attended IS
  'Se true, a regra só gera comissão quando financial_records.professional_id é o mesmo professional_id do beneficiário (quem atendeu). Regra geral (procedure_id NULL) com este flag também vale para receita sem procedimento. Default false: comportamento original.';

CREATE OR REPLACE FUNCTION public.generate_commission_entries()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  rule RECORD;
BEGIN
  -- Em UPDATE, só refaz as entries se algo que afeta o cálculo mudou
  -- (valor, procedimento, profissional que atendeu ou virou despesa/deixou de ser).
  IF TG_OP = 'UPDATE'
     AND NEW.total_amount    IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.procedure_id    IS NOT DISTINCT FROM OLD.procedure_id
     AND NEW.professional_id IS NOT DISTINCT FROM OLD.professional_id
     AND NEW.type            IS NOT DISTINCT FROM OLD.type THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    DELETE FROM public.commission_entries WHERE financial_record_id = NEW.id;
  END IF;

  -- Só receita com valor positivo gera comissão. Receita sem procedimento só
  -- entra no loop abaixo para regras only_when_attended com procedure_id NULL.
  IF NEW.type IS DISTINCT FROM 'receita'
     OR NEW.total_amount IS NULL
     OR NEW.total_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- 1) sel: por beneficiário, escolhe a regra mais específica aplicável
  --    (a do procedimento vence a geral). Sem procedimento na receita, só
  --    concorrem regras gerais com only_when_attended.
  -- 2) filtro final: regra only_when_attended só vale se o beneficiário é quem
  --    atendeu (NEW.professional_id = commission_recipients.professional_id).
  FOR rule IN
    SELECT sel.recipient_id, sel.percent, sel.recipient_name
    FROM (
      SELECT DISTINCT ON (cr.recipient_id)
        cr.recipient_id, cr.percent, cr.only_when_attended,
        r.name AS recipient_name, r.professional_id AS recipient_professional_id
      FROM public.commission_rules cr
      JOIN public.commission_recipients r ON r.id = cr.recipient_id
      WHERE cr.clinic_id = NEW.clinic_id
        AND cr.is_active = true
        AND r.is_active = true
        AND (
          (NEW.procedure_id IS NOT NULL
             AND (cr.procedure_id = NEW.procedure_id OR cr.procedure_id IS NULL))
          OR
          (NEW.procedure_id IS NULL
             AND cr.procedure_id IS NULL
             AND cr.only_when_attended = true)
        )
      ORDER BY cr.recipient_id, (cr.procedure_id IS NOT NULL) DESC
    ) sel
    WHERE sel.only_when_attended = false
       OR (NEW.professional_id IS NOT NULL
           AND sel.recipient_professional_id = NEW.professional_id)
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

COMMENT ON FUNCTION public.generate_commission_entries() IS
  'Ao criar (ou editar valor/procedimento/profissional/tipo de) uma receita, gera 1 commission_entry por beneficiário ativo: regra do procedimento (ou geral, se não houver específica) quando a receita tem procedimento; só regras gerais only_when_attended quando não tem. Regras only_when_attended só valem se financial_records.professional_id = commission_recipients.professional_id. Regra em si é congelada por lançamento: mudar a % depois não reprocessa receitas já lançadas — só edições no próprio lançamento disparam recálculo. Excluir a receita apaga as entries junto via ON DELETE CASCADE.';
