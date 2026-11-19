-- ═══════════════════════════════════════════════════════════════════════════
-- COMISSÕES — recálculo retroativo por beneficiário e ajuste manual por receita
-- Criado em: 2026-11-19
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Caso de uso: o dono da clínica muda a % de um beneficiário e quer
--   (a) recalcular as receitas passadas a partir de uma data, e
--   (b) ajustar a divisão de UMA receita específica.
--
-- Mudanças (aditivas; nenhum dado existente é apagado ou alterado pela migration):
--   1. commission_entries ganha is_manual / adjusted_by / adjusted_at.
--   2. Funções internas (sem EXECUTE para anon/authenticated):
--        - commission_applicable_rules(): UMA única definição da regra de
--          precedência (específica > geral, only_when_attended, receita sem
--          procedimento só para regras gerais only_when_attended). Usada pelo
--          trigger, pelo recálculo e pelo reset.
--        - insert_commission_entries(): insere as entries de uma receita.
--   3. generate_commission_entries() (CREATE OR REPLACE; o trigger NÃO é
--      recriado): em UPDATE, se a receita tem alguma entry is_manual=true, não
--      apaga nem recalcula nada dela.
--   4. Tabela commission_rule_changes (histórico/auditoria). Leitura para a
--      clínica via RLS; nenhuma escrita direta para anon/authenticated.
--   5. RPCs SECURITY DEFINER, só admin da clínica (team_is_clinic_admin() e
--      clinic_id = get_my_clinic_id()), EXECUTE só para authenticated:
--        - recalc_recipient_commissions(p_recipient_id, p_from, p_dry_run)
--        - adjust_commission_entry(p_entry_id, p_percent, p_amount)
--        - reset_commission_entry_adjustment(p_record_id)
--        - log_commission_rule_change(...)   <- DECISÃO do item 6: o frontend
--          chama esta RPC para registrar kind='rule' em vez de inserir direto
--          na tabela (assim a tabela fica 100% sem escrita direta, e a RPC
--          valida clínica/beneficiário/regra e carimba changed_by = auth.uid()).
--
-- Decisões:
--   * "created_at >= p_from" é avaliado no fuso America/Sao_Paulo (data local
--     da clínica), não em UTC: receita lançada às 22h de 31/01 não vira 01/02.
--   * Recalcular beneficiário INATIVO é recusado (recipient_inactive): como as
--     regras só valem para beneficiário ativo, o recálculo zeraria as entries.
--   * Receita com QUALQUER entry manual é intocável por trigger e recálculo
--     (a trava é por receita, não por entry): isso evita o total da divisão
--     mudar por baixo de um ajuste manual feito pelo dono. Para voltar ao
--     automático: reset_commission_entry_adjustment(receita).
--   * Superadmin só opera na própria clínica (get_my_clinic_id()).

-- ─── 1. commission_entries ──────────────────────────────────────────────────
ALTER TABLE public.commission_entries
  ADD COLUMN IF NOT EXISTS is_manual   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adjusted_by uuid        NULL,
  ADD COLUMN IF NOT EXISTS adjusted_at timestamptz NULL;

COMMENT ON COLUMN public.commission_entries.is_manual IS
  'true = valor/% ajustado manualmente (adjust_commission_entry). A receita com alguma entry manual não é recalculada pelo trigger nem por recalc_recipient_commissions.';
COMMENT ON COLUMN public.commission_entries.adjusted_by IS 'auth.uid() de quem fez o ajuste manual.';
COMMENT ON COLUMN public.commission_entries.adjusted_at IS 'Quando o ajuste manual foi feito.';

-- Índice para a checagem "esta receita tem entry manual?" (parcial, quase vazio).
CREATE INDEX IF NOT EXISTS idx_commission_entries_manual_record
  ON public.commission_entries (financial_record_id) WHERE is_manual;

-- ─── 2. Funções internas (regra de comissão em um único lugar) ──────────────
-- Para uma receita (clínica, procedimento, profissional que atendeu), devolve
-- no máximo UMA linha por beneficiário ativo, já com a % que vale. Se
-- p_recipient_id vier preenchido, restringe a esse beneficiário.
--   1) por beneficiário, escolhe a regra mais específica aplicável (a do
--      procedimento vence a geral). Sem procedimento na receita, só concorrem
--      regras gerais only_when_attended;
--   2) filtro final: regra only_when_attended só vale se o beneficiário é quem
--      atendeu (p_professional_id = commission_recipients.professional_id).
-- A precedência é decidida ANTES do filtro de atendimento (sem fallback para a
-- geral quando a específica não vale), igual ao comportamento da 20261143.
CREATE OR REPLACE FUNCTION public.commission_applicable_rules(
  p_clinic_id       uuid,
  p_procedure_id    uuid,
  p_professional_id uuid,
  p_recipient_id    uuid DEFAULT NULL
)
RETURNS TABLE (recipient_id uuid, recipient_name text, percent numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT sel.recipient_id, sel.recipient_name, sel.percent
  FROM (
    SELECT DISTINCT ON (cr.recipient_id)
      cr.recipient_id, cr.percent, cr.only_when_attended,
      r.name AS recipient_name, r.professional_id AS recipient_professional_id
    FROM public.commission_rules cr
    JOIN public.commission_recipients r ON r.id = cr.recipient_id
    WHERE cr.clinic_id = p_clinic_id
      AND cr.is_active = true
      AND r.is_active = true
      AND (p_recipient_id IS NULL OR cr.recipient_id = p_recipient_id)
      AND (
        (p_procedure_id IS NOT NULL
           AND (cr.procedure_id = p_procedure_id OR cr.procedure_id IS NULL))
        OR
        (p_procedure_id IS NULL
           AND cr.procedure_id IS NULL
           AND cr.only_when_attended = true)
      )
    ORDER BY cr.recipient_id, (cr.procedure_id IS NOT NULL) DESC
  ) sel
  WHERE sel.only_when_attended = false
     OR (p_professional_id IS NOT NULL
         AND sel.recipient_professional_id = p_professional_id);
$$;

-- Insere (não apaga) as entries automáticas de uma receita, pelas regras atuais.
CREATE OR REPLACE FUNCTION public.insert_commission_entries(
  p_record_id       uuid,
  p_clinic_id       uuid,
  p_procedure_id    uuid,
  p_professional_id uuid,
  p_total           numeric
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.commission_entries
    (clinic_id, financial_record_id, recipient_id, recipient_name, percent, amount)
  SELECT p_clinic_id, p_record_id, ar.recipient_id, ar.recipient_name, ar.percent,
         round(p_total * ar.percent / 100, 2)
  FROM public.commission_applicable_rules(p_clinic_id, p_procedure_id, p_professional_id, NULL) ar;
$$;

REVOKE ALL ON FUNCTION public.commission_applicable_rules(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.insert_commission_entries(uuid, uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- ─── 3. Trigger function (o trigger trg_generate_commission_entries fica) ───
CREATE OR REPLACE FUNCTION public.generate_commission_entries()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Receita com ajuste manual é intocável: não apaga nem recalcula nada.
    IF EXISTS (
      SELECT 1 FROM public.commission_entries
      WHERE financial_record_id = NEW.id AND is_manual
    ) THEN
      RETURN NEW;
    END IF;

    -- Só refaz as entries se algo que afeta o cálculo mudou
    -- (valor, procedimento, profissional que atendeu ou virou despesa/deixou de ser).
    IF NEW.total_amount    IS NOT DISTINCT FROM OLD.total_amount
       AND NEW.procedure_id    IS NOT DISTINCT FROM OLD.procedure_id
       AND NEW.professional_id IS NOT DISTINCT FROM OLD.professional_id
       AND NEW.type            IS NOT DISTINCT FROM OLD.type THEN
      RETURN NEW;
    END IF;

    DELETE FROM public.commission_entries WHERE financial_record_id = NEW.id;
  END IF;

  -- Só receita com valor positivo gera comissão.
  IF NEW.type IS DISTINCT FROM 'receita'
     OR NEW.total_amount IS NULL
     OR NEW.total_amount <= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM public.insert_commission_entries(
    NEW.id, NEW.clinic_id, NEW.procedure_id, NEW.professional_id, NEW.total_amount);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.generate_commission_entries() IS
  'Ao criar (ou editar valor/procedimento/profissional/tipo de) uma receita, gera 1 commission_entry por beneficiário ativo via commission_applicable_rules() (regra do procedimento ou geral; only_when_attended só vale para quem atendeu). Mudar a % depois não reprocessa receitas já lançadas (use recalc_recipient_commissions). Receita com alguma entry is_manual=true não é recalculada em UPDATE. Excluir a receita apaga as entries via ON DELETE CASCADE.';

-- ─── 4. Histórico de mudanças ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_rule_changes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id               uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  recipient_id            uuid NOT NULL REFERENCES public.commission_recipients(id) ON DELETE CASCADE,
  rule_id                 uuid NULL REFERENCES public.commission_rules(id) ON DELETE SET NULL,
  procedure_id            uuid NULL REFERENCES public.procedures(id) ON DELETE SET NULL,
  old_percent             numeric NULL,
  new_percent             numeric NULL,
  old_only_when_attended  boolean NULL,
  new_only_when_attended  boolean NULL,
  applied_from            date NULL,
  recalculated_count      integer NOT NULL DEFAULT 0,
  old_total               numeric NULL,
  new_total               numeric NULL,
  changed_by              uuid NULL,
  kind                    text NOT NULL CHECK (kind IN ('rule', 'recalc', 'manual_entry')),
  entry_id                uuid NULL,   -- sem FK: a entry pode ser apagada num reset/recálculo
  financial_record_id     uuid NULL REFERENCES public.financial_records(id) ON DELETE SET NULL,
  note                    text NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commission_rule_changes IS
  'Auditoria de comissões: kind=rule (mudança de regra, via log_commission_rule_change), recalc (recálculo retroativo de um beneficiário) e manual_entry (ajuste/reset manual de uma receita). Escrita só via RPC SECURITY DEFINER.';
COMMENT ON COLUMN public.commission_rule_changes.financial_record_id IS 'Receita afetada (kind=manual_entry). Extra ao desenho original, para listar o histórico por receita.';
COMMENT ON COLUMN public.commission_rule_changes.note IS 'Texto curto livre (ex.: adjust_percent, adjust_amount, reset).';

CREATE INDEX IF NOT EXISTS idx_commission_rule_changes_clinic_created
  ON public.commission_rule_changes (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_rule_changes_recipient
  ON public.commission_rule_changes (recipient_id);
CREATE INDEX IF NOT EXISTS idx_commission_rule_changes_record
  ON public.commission_rule_changes (financial_record_id) WHERE financial_record_id IS NOT NULL;

ALTER TABLE public.commission_rule_changes ENABLE ROW LEVEL SECURITY;

-- Leitura: mesma isolamento por clínica das outras tabelas de comissão +
-- restritiva por permissão do módulo 'comissoes' (mesmo padrão restrict_comissoes_*).
CREATE POLICY tenant_isolation_commission_rule_changes
  ON public.commission_rule_changes
  FOR SELECT TO authenticated
  USING ((clinic_id = get_my_clinic_id()) OR is_superadmin());

CREATE POLICY restrict_comissoes_select
  ON public.commission_rule_changes
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING ((SELECT has_module_perm('comissoes'::text, false)));

-- Sem policy de INSERT/UPDATE/DELETE e sem GRANT de escrita: só as RPCs escrevem.
REVOKE ALL ON public.commission_rule_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commission_rule_changes TO authenticated;

-- ─── 5a. Recálculo retroativo de um beneficiário ────────────────────────────
-- Retorna jsonb:
--   records         receitas (>= p_from, sem entry manual) em que o beneficiário
--                   tem ou passaria a ter comissão
--   changed         dessas, quantas mudam de valor/existência
--   old_total       soma das entries atuais do beneficiário nessas receitas
--   new_total       soma pelas regras atuais
--   skipped_manual  receitas puladas por terem entry manual (e que envolvem o beneficiário)
--   dry_run, applied_from
-- dry_run=true (default) não escreve nada. dry_run=false apaga e recria SÓ as
-- entries desse beneficiário nessas receitas e grava 1 linha kind='recalc'.
CREATE OR REPLACE FUNCTION public.recalc_recipient_commissions(
  p_recipient_id uuid,
  p_from         date,
  p_dry_run      boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_clinic     uuid := get_my_clinic_id();
  v_recipient  public.commission_recipients%ROWTYPE;
  rec          record;
  v_new_amount numeric;
  v_records    integer := 0;
  v_changed    integer := 0;
  v_skipped    integer := 0;
  v_old_total  numeric := 0;
  v_new_total  numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_clinic IS NULL OR NOT team_is_clinic_admin() THEN
    RAISE EXCEPTION 'forbidden: apenas admin da clínica' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL THEN
    RAISE EXCEPTION 'from_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_recipient
  FROM public.commission_recipients
  WHERE id = p_recipient_id AND clinic_id = v_clinic;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recipient_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_recipient.is_active THEN
    RAISE EXCEPTION 'recipient_inactive' USING ERRCODE = '22023';
  END IF;

  -- Serializa recálculos concorrentes do mesmo beneficiário.
  PERFORM pg_advisory_xact_lock(hashtext('recalc_commission:' || p_recipient_id::text));

  FOR rec IN
    SELECT fr.id, fr.clinic_id, fr.procedure_id, fr.professional_id, fr.total_amount,
           EXISTS (SELECT 1 FROM public.commission_entries m
                   WHERE m.financial_record_id = fr.id AND m.is_manual) AS has_manual,
           o.cnt AS old_cnt, o.amount AS old_amount, o.pct AS old_pct,
           n.recipient_name AS new_name, n.percent AS new_percent
    FROM public.financial_records fr
    CROSS JOIN LATERAL (
      SELECT count(*) AS cnt, COALESCE(sum(e.amount), 0) AS amount, max(e.percent) AS pct
      FROM public.commission_entries e
      WHERE e.financial_record_id = fr.id AND e.recipient_id = p_recipient_id
    ) o
    LEFT JOIN LATERAL public.commission_applicable_rules(
      fr.clinic_id, fr.procedure_id, fr.professional_id, p_recipient_id) n ON true
    WHERE fr.clinic_id = v_clinic
      AND fr.type = 'receita'
      AND fr.total_amount > 0
      AND (fr.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from
  LOOP
    -- Receita que não envolve o beneficiário nem antes nem depois: ignora.
    IF rec.old_cnt = 0 AND rec.new_percent IS NULL THEN
      CONTINUE;
    END IF;

    IF rec.has_manual THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_new_amount := CASE WHEN rec.new_percent IS NULL THEN 0
                         ELSE round(rec.total_amount * rec.new_percent / 100, 2) END;
    v_records   := v_records + 1;
    v_old_total := v_old_total + rec.old_amount;
    v_new_total := v_new_total + v_new_amount;
    IF rec.old_amount IS DISTINCT FROM v_new_amount
       OR (rec.old_cnt > 0) IS DISTINCT FROM (rec.new_percent IS NOT NULL)
       OR rec.old_pct IS DISTINCT FROM rec.new_percent THEN
      v_changed := v_changed + 1;
    END IF;

    IF NOT p_dry_run THEN
      DELETE FROM public.commission_entries
      WHERE financial_record_id = rec.id AND recipient_id = p_recipient_id;

      IF rec.new_percent IS NOT NULL THEN
        INSERT INTO public.commission_entries
          (clinic_id, financial_record_id, recipient_id, recipient_name, percent, amount)
        VALUES
          (rec.clinic_id, rec.id, p_recipient_id, rec.new_name, rec.new_percent, v_new_amount);
      END IF;
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    INSERT INTO public.commission_rule_changes
      (clinic_id, recipient_id, applied_from, recalculated_count, old_total, new_total,
       changed_by, kind)
    VALUES
      (v_clinic, p_recipient_id, p_from, v_records, v_old_total, v_new_total,
       auth.uid(), 'recalc');
  END IF;

  RETURN jsonb_build_object(
    'records',        v_records,
    'changed',        v_changed,
    'old_total',      v_old_total,
    'new_total',      v_new_total,
    'skipped_manual', v_skipped,
    'dry_run',        p_dry_run,
    'applied_from',   p_from
  );
END;
$$;

-- ─── 5b. Ajuste manual de uma entry ─────────────────────────────────────────
-- Exige exatamente um de p_percent (0..100) ou p_amount (0..total da receita).
-- Marca a entry is_manual (e, por consequência, trava a receita inteira contra
-- trigger/recálculo). Retorna jsonb {entry_id, financial_record_id, percent, amount}.
CREATE OR REPLACE FUNCTION public.adjust_commission_entry(
  p_entry_id uuid,
  p_percent  numeric DEFAULT NULL,
  p_amount   numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_clinic      uuid := get_my_clinic_id();
  v_entry       public.commission_entries%ROWTYPE;
  v_total       numeric;
  v_procedure   uuid;
  v_new_percent numeric;
  v_new_amount  numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_clinic IS NULL OR NOT team_is_clinic_admin() THEN
    RAISE EXCEPTION 'forbidden: apenas admin da clínica' USING ERRCODE = '42501';
  END IF;

  IF (p_percent IS NULL AND p_amount IS NULL)
     OR (p_percent IS NOT NULL AND p_amount IS NOT NULL) THEN
    RAISE EXCEPTION 'informe exatamente um de p_percent ou p_amount' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_entry
  FROM public.commission_entries
  WHERE id = p_entry_id AND clinic_id = v_clinic
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT fr.total_amount, fr.procedure_id INTO v_total, v_procedure
  FROM public.financial_records fr
  WHERE fr.id = v_entry.financial_record_id;
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'receita_sem_valor' USING ERRCODE = '22023';
  END IF;

  IF p_percent IS NOT NULL THEN
    IF p_percent < 0 OR p_percent > 100 THEN
      RAISE EXCEPTION 'percent_out_of_range (0..100)' USING ERRCODE = '22023';
    END IF;
    v_new_percent := round(p_percent, 2);
    v_new_amount  := round(v_total * p_percent / 100, 2);
  ELSE
    IF p_amount < 0 THEN
      RAISE EXCEPTION 'amount_negative' USING ERRCODE = '22023';
    END IF;
    IF p_amount > v_total THEN
      RAISE EXCEPTION 'amount_exceeds_total' USING ERRCODE = '22023';
    END IF;
    v_new_amount  := round(p_amount, 2);
    v_new_percent := round(p_amount / v_total * 100, 2);
  END IF;

  UPDATE public.commission_entries
  SET percent = v_new_percent,
      amount = v_new_amount,
      is_manual = true,
      adjusted_by = auth.uid(),
      adjusted_at = now()
  WHERE id = v_entry.id;

  INSERT INTO public.commission_rule_changes
    (clinic_id, recipient_id, procedure_id, old_percent, new_percent, old_total, new_total,
     changed_by, kind, entry_id, financial_record_id, note)
  VALUES
    (v_clinic, v_entry.recipient_id, v_procedure, v_entry.percent, v_new_percent,
     v_entry.amount, v_new_amount, auth.uid(), 'manual_entry', v_entry.id,
     v_entry.financial_record_id,
     CASE WHEN p_percent IS NOT NULL THEN 'adjust_percent' ELSE 'adjust_amount' END);

  RETURN jsonb_build_object(
    'entry_id',            v_entry.id,
    'financial_record_id', v_entry.financial_record_id,
    'percent',             v_new_percent,
    'amount',              v_new_amount
  );
END;
$$;

-- ─── 5c. Volta a receita para o automático ──────────────────────────────────
-- Apaga TODAS as entries da receita (manuais e automáticas) e regera pelas
-- regras atuais. Retorna jsonb {financial_record_id, was_manual, entries, total}.
CREATE OR REPLACE FUNCTION public.reset_commission_entry_adjustment(p_record_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_clinic     uuid := get_my_clinic_id();
  v_fr         public.financial_records%ROWTYPE;
  v_was_manual boolean;
  v_old_total  numeric;
  v_new_total  numeric;
  v_new_count  integer;
  v_recipient  uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_clinic IS NULL OR NOT team_is_clinic_admin() THEN
    RAISE EXCEPTION 'forbidden: apenas admin da clínica' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fr
  FROM public.financial_records
  WHERE id = p_record_id AND clinic_id = v_clinic
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(bool_or(is_manual), false), COALESCE(sum(amount), 0)
  INTO v_was_manual, v_old_total
  FROM public.commission_entries WHERE financial_record_id = p_record_id;

  -- Beneficiário de referência para o log (a primeira entry manual).
  SELECT recipient_id INTO v_recipient
  FROM public.commission_entries
  WHERE financial_record_id = p_record_id
  ORDER BY is_manual DESC, created_at
  LIMIT 1;

  DELETE FROM public.commission_entries WHERE financial_record_id = p_record_id;

  IF v_fr.type = 'receita' AND v_fr.total_amount IS NOT NULL AND v_fr.total_amount > 0 THEN
    PERFORM public.insert_commission_entries(
      v_fr.id, v_fr.clinic_id, v_fr.procedure_id, v_fr.professional_id, v_fr.total_amount);
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0)
  INTO v_new_count, v_new_total
  FROM public.commission_entries WHERE financial_record_id = p_record_id;

  -- Só registra quando havia ajuste manual (então havia ao menos uma entry e
  -- v_recipient está preenchido; recipient_id é NOT NULL no log).
  IF v_was_manual AND v_recipient IS NOT NULL THEN
    INSERT INTO public.commission_rule_changes
      (clinic_id, recipient_id, old_total, new_total, changed_by, kind, financial_record_id, note)
    VALUES
      (v_clinic, v_recipient, v_old_total, v_new_total, auth.uid(), 'manual_entry', p_record_id, 'reset');
  END IF;

  RETURN jsonb_build_object(
    'financial_record_id', p_record_id,
    'was_manual',          v_was_manual,
    'entries',             v_new_count,
    'total',               v_new_total
  );
END;
$$;

-- ─── 6. Registro de mudança de regra (kind='rule') ──────────────────────────
-- O frontend chama esta RPC logo depois de criar/editar/remover uma regra.
-- Retorna o id da linha de log.
CREATE OR REPLACE FUNCTION public.log_commission_rule_change(
  p_recipient_id           uuid,
  p_rule_id                uuid    DEFAULT NULL,
  p_procedure_id           uuid    DEFAULT NULL,
  p_old_percent            numeric DEFAULT NULL,
  p_new_percent            numeric DEFAULT NULL,
  p_old_only_when_attended boolean DEFAULT NULL,
  p_new_only_when_attended boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_clinic uuid := get_my_clinic_id();
  v_id     uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_clinic IS NULL OR NOT team_is_clinic_admin() THEN
    RAISE EXCEPTION 'forbidden: apenas admin da clínica' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.commission_recipients
                 WHERE id = p_recipient_id AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'recipient_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- A regra pode já ter sido removida (log de remoção): só valida se ainda existir.
  IF p_rule_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.commission_rules WHERE id = p_rule_id)
     AND NOT EXISTS (SELECT 1 FROM public.commission_rules
                     WHERE id = p_rule_id AND clinic_id = v_clinic AND recipient_id = p_recipient_id) THEN
    RAISE EXCEPTION 'rule_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_procedure_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.procedures WHERE id = p_procedure_id AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'procedure_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF (p_old_percent IS NOT NULL AND (p_old_percent < 0 OR p_old_percent > 100))
     OR (p_new_percent IS NOT NULL AND (p_new_percent < 0 OR p_new_percent > 100)) THEN
    RAISE EXCEPTION 'percent_out_of_range (0..100)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.commission_rule_changes
    (clinic_id, recipient_id, rule_id, procedure_id, old_percent, new_percent,
     old_only_when_attended, new_only_when_attended, changed_by, kind)
  VALUES
    (v_clinic, p_recipient_id,
     CASE WHEN EXISTS (SELECT 1 FROM public.commission_rules WHERE id = p_rule_id) THEN p_rule_id END,
     p_procedure_id, p_old_percent, p_new_percent,
     p_old_only_when_attended, p_new_only_when_attended, auth.uid(), 'rule')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── Permissões das RPCs: só authenticated ──────────────────────────────────
REVOKE ALL ON FUNCTION public.recalc_recipient_commissions(uuid, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_commission_entry(uuid, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_commission_entry_adjustment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_commission_rule_change(uuid, uuid, uuid, numeric, numeric, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_recipient_commissions(uuid, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_commission_entry(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_commission_entry_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_commission_rule_change(uuid, uuid, uuid, numeric, numeric, boolean, boolean) TO authenticated;
