-- ═══════════════════════════════════════════════════════════════════════════
-- COMISSÕES — preserva a data original das entries e fecha a janela de concorrência
-- Criado em: 2026-11-19
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Correções dos achados da revisão da 20261144 (já aplicada; ela NÃO é editada):
--
--   1. created_at das entries. As entries recriadas (recálculo, reset e trigger
--      em UPDATE) ganhavam created_at = now() (DEFAULT), deslocando comissões de
--      meses antigos para o mês atual nos relatórios (useCommissionsData e
--      relatorios agrupam por commission_entries.created_at). Agora:
--        - insert_commission_entries grava created_at = created_at da receita
--          (fallback now() se a receita não for encontrada);
--        - o INSERT do recalc_recipient_commissions grava o created_at da receita;
--        - reset_commission_entry_adjustment e o trigger generate_commission_entries
--          usam insert_commission_entries, então herdam a correção sem serem
--          recriados. Efeito colateral bom: editar valor/procedimento/profissional
--          de uma receita antiga também deixa de empurrar a comissão para o mês
--          atual. No INSERT da receita o trigger continua igual (created_at da
--          receita ~ now()).
--
--   2. Concorrência. Ordem de locks única em todo o fluxo: RECEITA primeiro,
--      ENTRY depois (é a ordem do UPDATE em financial_records disparando o
--      trigger, e do reset).
--        - recalc_recipient_commissions (quando NOT dry_run) trava as receitas do
--          período com SELECT ... ORDER BY fr.id FOR UPDATE ANTES do loop, em vez
--          de FOR UPDATE OF fr dentro do SELECT do loop. Motivos: (a) em READ
--          COMMITTED o loop passa a rodar com snapshot novo, tirado depois de
--          adquirir os locks, então enxerga ajustes manuais commitados enquanto
--          esperava (FOR UPDATE dentro do mesmo SELECT reavalia só a linha da
--          receita; os LATERAL sobre commission_entries ficariam com o snapshot
--          antigo); (b) ORDER BY id dá ordem determinística de lock e evita
--          deadlock entre recálculos de beneficiários diferentes sobre receitas
--          em comum (o advisory lock é por beneficiário); (c) não depende de
--          FOR UPDATE ser aceito junto de LATERAL/LEFT JOIN. Em dry_run não trava
--          nada (é só leitura).
--        - adjust_commission_entry lê financial_record_id da entry SEM lock,
--          trava a receita FOR UPDATE e só então relê a entry FOR UPDATE (se
--          sumiu: P0002 entry_not_found). Assim um recálculo/reset concorrente
--          não apaga um ajuste manual feito no meio, e total_amount/procedure_id
--          da receita são lidos já sob lock.
--
--   3. Backfill: ver comentário no fim do arquivo (não é necessário).
--
--   4. Histórico só para admin (achado do QA). A policy SELECT de
--      commission_rule_changes (tenant_isolation_commission_rule_changes) liberava
--      a leitura a qualquer usuário autenticado da clínica; somada à RESTRICTIVE
--      restrict_comissoes_select (has_module_perm('comissoes', false)), um não-admin
--      da Recepção com permissão de ver Comissões lia todo o histórico (quem mudou
--      o % de quem). A policy é recriada exigindo team_is_clinic_admin() (ou
--      superadmin). A RESTRICTIVE restrict_comissoes_select NÃO é alterada.
--
-- Assinaturas, SECURITY DEFINER, search_path, checagens e códigos de erro das
-- funções são exatamente os da 20261144. Nenhum dado é alterado por esta migration
-- (o item 4 só troca uma policy de SELECT).

-- ─── 1a. insert_commission_entries: created_at = created_at da receita ──────
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
    (clinic_id, financial_record_id, recipient_id, recipient_name, percent, amount, created_at)
  SELECT p_clinic_id, p_record_id, ar.recipient_id, ar.recipient_name, ar.percent,
         round(p_total * ar.percent / 100, 2),
         coalesce(
           (SELECT fr.created_at FROM public.financial_records fr WHERE fr.id = p_record_id),
           now())
  FROM public.commission_applicable_rules(p_clinic_id, p_procedure_id, p_professional_id, NULL) ar;
$$;

-- ─── 1b/2a. recalc_recipient_commissions: created_at da receita + lock ──────
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

  -- Ordem de locks: receita primeiro, entry depois (igual ao UPDATE da receita
  -- via trigger, ao reset e ao adjust_commission_entry). Trava as receitas do
  -- período em ordem de id (evita deadlock entre recálculos de beneficiários
  -- diferentes) ANTES do loop: o SELECT do loop abaixo tira um snapshot novo
  -- depois dos locks e enxerga qualquer ajuste manual commitado enquanto esta
  -- transação esperava. Em dry_run não trava nada.
  IF NOT p_dry_run THEN
    PERFORM fr.id
    FROM public.financial_records fr
    WHERE fr.clinic_id = v_clinic
      AND fr.type = 'receita'
      AND fr.total_amount > 0
      AND (fr.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from
    ORDER BY fr.id
    FOR UPDATE;
  END IF;

  FOR rec IN
    SELECT fr.id, fr.clinic_id, fr.procedure_id, fr.professional_id, fr.total_amount,
           fr.created_at AS record_created_at,
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
        -- created_at = data da receita, para a comissão continuar no mês de origem.
        INSERT INTO public.commission_entries
          (clinic_id, financial_record_id, recipient_id, recipient_name, percent, amount, created_at)
        VALUES
          (rec.clinic_id, rec.id, p_recipient_id, rec.new_name, rec.new_percent, v_new_amount,
           rec.record_created_at);
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

-- ─── 2b. adjust_commission_entry: trava a receita antes da entry ────────────
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
  v_record_id   uuid;
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

  -- Passo 1: descobre a receita da entry SEM lock (só para saber o que travar).
  SELECT financial_record_id INTO v_record_id
  FROM public.commission_entries
  WHERE id = p_entry_id AND clinic_id = v_clinic;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Passo 2: trava a receita (mesma ordem do recálculo: receita primeiro). Lê
  -- total e procedimento já sob lock. Se a receita sumiu, a entry foi junto
  -- (ON DELETE CASCADE).
  SELECT fr.total_amount, fr.procedure_id INTO v_total, v_procedure
  FROM public.financial_records fr
  WHERE fr.id = v_record_id AND fr.clinic_id = v_clinic
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Passo 3: só agora trava e relê a entry. Se um recálculo/reset a apagou
  -- enquanto esperávamos a receita, não existe mais.
  SELECT * INTO v_entry
  FROM public.commission_entries
  WHERE id = p_entry_id AND clinic_id = v_clinic
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry_not_found' USING ERRCODE = 'P0002';
  END IF;

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

-- ─── Permissões (reaplicadas; CREATE OR REPLACE já preserva, isto é cinto e suspensório) ──
-- Funções internas: sem EXECUTE para anon/authenticated.
REVOKE ALL ON FUNCTION public.commission_applicable_rules(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.insert_commission_entries(uuid, uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- RPCs: EXECUTE só para authenticated.
REVOKE ALL ON FUNCTION public.recalc_recipient_commissions(uuid, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_commission_entry(uuid, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_commission_entry_adjustment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_commission_rule_change(uuid, uuid, uuid, numeric, numeric, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_recipient_commissions(uuid, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_commission_entry(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_commission_entry_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_commission_rule_change(uuid, uuid, uuid, numeric, numeric, boolean, boolean) TO authenticated;

-- ─── 4. Histórico (commission_rule_changes) só para admin da clínica ────────
-- A policy anterior permitia SELECT a qualquer authenticated da clínica. Agora só
-- admin da clínica (team_is_clinic_admin()) ou superadmin lê. A policy RESTRICTIVE
-- restrict_comissoes_select (has_module_perm('comissoes', false)) continua como
-- está: ela segue valendo em conjunto (AND) com esta. Escrita não muda: as linhas
-- são inseridas pelas RPCs SECURITY DEFINER.
-- Consequência para a aplicação: a tela de Comissões só mostra o histórico de
-- alterações a admin; para não-admin a consulta passa a retornar 0 linhas (sem
-- erro), então a UI deve ocultar/ignorar a seção de histórico para esse perfil.
DROP POLICY IF EXISTS tenant_isolation_commission_rule_changes ON public.commission_rule_changes;
CREATE POLICY tenant_isolation_commission_rule_changes
  ON public.commission_rule_changes
  FOR SELECT
  TO authenticated
  USING ((clinic_id = get_my_clinic_id() AND team_is_clinic_admin()) OR is_superadmin());

-- ─── 3. Backfill: não necessário ────────────────────────────────────────────
-- Na data desta migration, commission_rule_changes tinha 0 linhas, ou seja,
-- nenhum recálculo real (nem ajuste/reset manual) foi executado com a 20261144.
-- Portanto nenhuma entry foi recriada com created_at = now() por essas RPCs e
-- não há dado a corrigir; esta migration só impede que aconteça daqui para frente.
--
-- Se algum recálculo/reset rodar ANTES de esta migration ser aplicada, detecte
-- as entries com data deslocada com a consulta abaixo (somente leitura; NÃO
-- executável aqui, está em comentário):
--
--   SELECT ce.id, ce.clinic_id, ce.financial_record_id,
--          ce.created_at AS entry_created_at, fr.created_at AS record_created_at
--   FROM public.commission_entries ce
--   JOIN public.financial_records fr ON fr.id = ce.financial_record_id
--   WHERE ce.created_at IS DISTINCT FROM fr.created_at
--   ORDER BY ce.created_at DESC;
--
-- Atenção: entries regeradas pelo trigger em UPDATE de receita (comportamento
-- anterior à 20261144) também aparecem nessa consulta, pois ganharam now() na
-- época. Cruze com commission_rule_changes (kind 'recalc'/'manual_entry') para
-- separar. Se for preciso corrigir, revisar o resultado e só então rodar, com
-- aprovação, algo como:
--
--   UPDATE public.commission_entries ce
--   SET created_at = fr.created_at
--   FROM public.financial_records fr
--   WHERE fr.id = ce.financial_record_id
--     AND ce.created_at IS DISTINCT FROM fr.created_at;
