-- ═══════════════════════════════════════════════════════════════════════════
-- SEGURANÇA — escopo por área na Fisioterapia, validações na Estética e limite diário atômico do diário alimentar
-- Criado em: 2026-11-16 (NÃO APLICADA: arquivo para o Dimitre revisar e aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Correção sobre migrações JÁ APLICADAS (20261130, 20261134, 20261136). Nenhuma delas foi editada: tudo entra aqui.
--
-- 1) FISIOTERAPIA (20261130 não tinha escopo por área nem gatilhos)
--    a) Policy RESTRICTIVE restrict_<tabela>_by_area em fisio_exercicios, fisio_prescricoes, fisio_prescricao_itens,
--       fisio_execucoes e fisio_goniometrias. Mesma regra das demais fichas clínicas (clinical_row_visible_to_my_area,
--       20261111): em clínica com escopo por profissional, a linha só aparece para admin/recepção, o autor ou quem é da
--       mesma área. Colunas usadas:
--         fisio_exercicios      (NULL, created_by)
--         fisio_prescricoes     (professional_id, created_by)
--         fisio_goniometrias    (professional_id, created_by)
--         fisio_prescricao_itens  herda da prescrição pai (EXISTS na tabela pai, que já passa pela RLS dela)
--         fisio_execucoes         herda do item (EXISTS em fisio_prescricao_itens, que herda da prescrição)
--       Só é criada se clinical_row_visible_to_my_area existir (mesmo padrão de 20261131/20261133).
--    b) Gatilhos BEFORE INSERT OR UPDATE (padrão *_before_write de 20261131/20261133/20261135):
--         INSERT: created_by := auth.uid() (quando há sessão; chave de serviço não tem uid e fica como veio)
--         UPDATE: clinic_id, patient_id, prescricao_id, created_by e created_at não mudam; updated_at := now()
--         professional_id (prescrições e goniometrias) precisa ser da MESMA clínica da linha (profissional_invalido).
--       fisio_execucoes não ganha gatilho: nenhum papel de sessão escreve nela (sem policy de INSERT/UPDATE/DELETE);
--       só o servidor, com a chave de serviço, depois de conferir token, escopo e o item do paciente do link.
--
-- 2) ESTÉTICA (20261136): estetica_registrar_aplicacao e estetica_estornar_aplicacao (corpos atuais + o que segue) e o gatilho
--    estetica_aplicacoes_before_write.
--      * registrar: em clínica com escopo por profissional, quem não é admin/recepção e não enxerga o paciente
--        (patient_visible_to_my_area) recebe sem_permissao (42501), antes de qualquer outra coisa (inclusive antes de
--        devolver uma aplicação já gravada pelo p_request_id).
--      * estornar: depois de carregar a linha, exige clinical_row_visible_to_my_area(NULL, autor); senão sem_permissao.
--      * p_appointment_id, se informado, precisa existir em appointments na MESMA clínica e para o MESMO paciente
--        (senão dados_invalidos, P0001). O mesmo vale no gatilho quando appointment_id é trocado (UPDATE) e no INSERT.
--      * SECURITY DEFINER, search_path e REVOKE/GRANT idênticos aos de 20261136.
--    O gatilho estetica_aplicacoes_before_write CONTINUA SECURITY DEFINER (de propósito): as conferências de termo
--    (contracts) e de atendimento (appointments) têm que enxergar a tabela inteira; sob SECURITY INVOKER elas passariam
--    pela RLS de quem edita (agenda restrita por profissional, contratos por módulo) e recusariam vínculos válidos.
--    Trocar para INVOKER não protege nada a mais: a variável myclinica.estetica_fn é só uma variável de transação
--    (nenhum papel de sessão consegue ligá-la pela API, só as duas funções acima), e a função de gatilho não é chamável.
--    O estorno por RPC funcionaria nas duas formas; o que quebraria com INVOKER é o UPDATE direto com troca de
--    appointment_id/contract_id por usuário sem acesso total a essas tabelas.
--
-- 3) DIÁRIO ALIMENTAR (20261134): limite de 20 registros por paciente e dia, ATÔMICO. O app contava e depois inseria (duas
--    requisições simultâneas passavam as duas). O gatilho nutri_diario_limite_dia segura um pg_advisory_xact_lock por
--    paciente + dia, conta e recusa a 21ª linha com limite_diario (P0001). O número 20 tem que acompanhar
--    LIMITES_DIARIO.porDia em src/lib/nutri/diario.ts.
--
-- Dependências (a migração para com mensagem clara se faltar alguma): as tabelas fisio_*, estetica_aplicacoes, nutri_diario,
-- appointments e professionals; get_my_clinic_id(), is_superadmin(), has_module_perm(), clinic_scopes_by_professional(),
-- is_admin_or_recepcao(), patient_visible_to_my_area(uuid) e clinical_row_visible_to_my_area(uuid, uuid)
-- (20261111_*, 20261130, 20261134, 20261136).
--
-- Idempotente: CREATE OR REPLACE e DROP ... IF EXISTS antes de cada CREATE. Pode rodar duas vezes.
-- Aditiva: nenhuma coluna ou tabela é alterada nem apagada. Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_falta text;
BEGIN
  SELECT string_agg(t, ', ') INTO v_falta
    FROM unnest(ARRAY[
      'clinics', 'patients', 'professionals', 'appointments',
      'fisio_exercicios', 'fisio_prescricoes', 'fisio_prescricao_itens', 'fisio_execucoes', 'fisio_goniometrias',
      'estetica_aplicacoes', 'nutri_diario'
    ]) AS t
   WHERE to_regclass('public.' || t) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'faltam tabelas: % (aplique antes 20261130, 20261134 e 20261136)', v_falta;
  END IF;

  -- confere pelo nome (as assinaturas exatas vêm das migrações de 20261111)
  SELECT string_agg(f, ', ') INTO v_falta
    FROM unnest(ARRAY[
      'get_my_clinic_id', 'is_superadmin', 'has_module_perm',
      'clinic_scopes_by_professional', 'is_admin_or_recepcao', 'patient_visible_to_my_area', 'clinical_row_visible_to_my_area'
    ]) AS f
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = f);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'faltam funções: % (aplique antes 20261111_pacientes_unicos_e_area.sql e 20261111_permissoes_por_modulo.sql)', v_falta;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) FISIOTERAPIA
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1a) Gatilhos ───

-- Biblioteca: sem professional_id nem patient_id. created_by e clinic_id não mudam.
CREATE OR REPLACE FUNCTION public.fisio_exercicios_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  ELSE
    NEW.clinic_id  := OLD.clinic_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fisio_exercicios_before_write ON public.fisio_exercicios;
CREATE TRIGGER fisio_exercicios_before_write
  BEFORE INSERT OR UPDATE ON public.fisio_exercicios
  FOR EACH ROW EXECUTE FUNCTION public.fisio_exercicios_before_write();

-- Prescrição: SECURITY DEFINER só para a conferência do profissional enxergar a tabela inteira
-- (superadmin atendendo outra clínica não vê os profissionais dela pela RLS).
CREATE OR REPLACE FUNCTION public.fisio_prescricoes_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  ELSE
    NEW.clinic_id  := OLD.clinic_id;
    NEW.patient_id := OLD.patient_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;

  IF NEW.professional_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.professional_id IS DISTINCT FROM OLD.professional_id)
     AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = NEW.professional_id AND pr.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'profissional_invalido' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fisio_prescricoes_before_write ON public.fisio_prescricoes;
CREATE TRIGGER fisio_prescricoes_before_write
  BEFORE INSERT OR UPDATE ON public.fisio_prescricoes
  FOR EACH ROW EXECUTE FUNCTION public.fisio_prescricoes_before_write();

-- Itens: não têm created_by nem updated_at. Clínica, paciente e prescrição não mudam (a policy de INSERT/UPDATE já
-- confere que a prescrição é da mesma clínica e do mesmo paciente).
CREATE OR REPLACE FUNCTION public.fisio_prescricao_itens_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.clinic_id     := OLD.clinic_id;
    NEW.patient_id    := OLD.patient_id;
    NEW.prescricao_id := OLD.prescricao_id;
    NEW.created_at    := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fisio_prescricao_itens_before_write ON public.fisio_prescricao_itens;
CREATE TRIGGER fisio_prescricao_itens_before_write
  BEFORE INSERT OR UPDATE ON public.fisio_prescricao_itens
  FOR EACH ROW EXECUTE FUNCTION public.fisio_prescricao_itens_before_write();

-- Goniometria
CREATE OR REPLACE FUNCTION public.fisio_goniometrias_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  ELSE
    NEW.clinic_id  := OLD.clinic_id;
    NEW.patient_id := OLD.patient_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;

  IF NEW.professional_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.professional_id IS DISTINCT FROM OLD.professional_id)
     AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = NEW.professional_id AND pr.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'profissional_invalido' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fisio_goniometrias_before_write ON public.fisio_goniometrias;
CREATE TRIGGER fisio_goniometrias_before_write
  BEFORE INSERT OR UPDATE ON public.fisio_goniometrias
  FOR EACH ROW EXECUTE FUNCTION public.fisio_goniometrias_before_write();

-- ─── 1b) Escopo por área (RESTRICTIVE, somada às policies de 20261130, que NÃO são alteradas) ───
-- Só cria se clinical_row_visible_to_my_area existir. Sem ela, vale o isolamento por clínica + permissão do módulo;
-- reaplicar este arquivo depois cria as policies.
DO $area$
DECLARE
  r record;
  v_tem boolean;
BEGIN
  v_tem := EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                    WHERE ns.nspname = 'public' AND p.proname = 'clinical_row_visible_to_my_area');
  FOR r IN
    SELECT * FROM (VALUES
      ('fisio_exercicios',
       'public.clinical_row_visible_to_my_area(NULL, created_by)'),
      ('fisio_prescricoes',
       'public.clinical_row_visible_to_my_area(professional_id, created_by)'),
      ('fisio_prescricao_itens',
       'EXISTS (SELECT 1 FROM public.fisio_prescricoes pr WHERE pr.id = fisio_prescricao_itens.prescricao_id)'),
      ('fisio_execucoes',
       'EXISTS (SELECT 1 FROM public.fisio_prescricao_itens it WHERE it.id = fisio_execucoes.item_id)'),
      ('fisio_goniometrias',
       'public.clinical_row_visible_to_my_area(professional_id, created_by)')
    ) AS x(tabela, expr)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'restrict_' || r.tabela || '_by_area', r.tabela);
    IF v_tem THEN
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL USING (%s)',
                     'restrict_' || r.tabela || '_by_area', r.tabela, r.expr);
    END IF;
  END LOOP;
END
$area$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) ESTÉTICA
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 2a) Gatilho (continua SECURITY DEFINER; ver o cabeçalho) ───
CREATE OR REPLACE FUNCTION public.estetica_aplicacoes_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.autor := auth.uid();
    END IF;
    -- o atendimento vinculado precisa ser da mesma clínica e do mesmo paciente
    IF NEW.appointment_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.appointments ap WHERE ap.id = NEW.appointment_id AND ap.clinic_id = NEW.clinic_id AND ap.patient_id = NEW.patient_id) THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.estornada_em IS NOT NULL THEN
    RAISE EXCEPTION 'aplicacao_estornada' USING ERRCODE = 'P0001';
  END IF;

  NEW.clinic_id        := OLD.clinic_id;
  NEW.patient_id       := OLD.patient_id;
  NEW.request_id       := OLD.request_id;
  NEW.data             := OLD.data;
  NEW.tipo             := OLD.tipo;
  NEW.stock_item_id    := OLD.stock_item_id;
  NEW.lot_id           := OLD.lot_id;
  NEW.movement_id      := OLD.movement_id;
  NEW.produto          := OLD.produto;
  NEW.fabricante       := OLD.fabricante;
  NEW.lote             := OLD.lote;
  NEW.validade         := OLD.validade;
  NEW.dose             := OLD.dose;
  NEW.dose_unidade     := OLD.dose_unidade;
  NEW.quantidade_baixa := OLD.quantidade_baixa;
  NEW.autor            := OLD.autor;
  NEW.created_at       := OLD.created_at;
  NEW.updated_at       := now();
  IF COALESCE(current_setting('myclinica.estetica_fn', true), '') <> 'on' THEN
    NEW.estornada_em   := OLD.estornada_em;
    NEW.estorno_motivo := OLD.estorno_motivo;
    NEW.estornada_por  := OLD.estornada_por;
  END IF;

  -- termo trocado: precisa ser da mesma clínica e do mesmo paciente
  IF NEW.contract_id IS NOT NULL AND NEW.contract_id IS DISTINCT FROM OLD.contract_id AND to_regclass('public.contracts') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = $1 AND c.clinic_id = $2 AND c.patient_id = $3)'
      INTO v_ok USING NEW.contract_id, OLD.clinic_id, OLD.patient_id;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'termo_invalido' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- atendimento trocado: precisa ser da mesma clínica e do mesmo paciente
  IF NEW.appointment_id IS NOT NULL AND NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
     AND NOT EXISTS (SELECT 1 FROM public.appointments ap WHERE ap.id = NEW.appointment_id AND ap.clinic_id = OLD.clinic_id AND ap.patient_id = OLD.patient_id) THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 2b) estetica_registrar_aplicacao ───
-- Mudanças sobre 20261136: (1) escopo por área do paciente; (2) p_appointment_id da mesma clínica e do mesmo paciente.
CREATE OR REPLACE FUNCTION public.estetica_registrar_aplicacao(
  p_request_id            uuid,
  p_patient_id            uuid,
  p_data                  date,
  p_tipo                  text,
  p_stock_item_id         uuid,
  p_lot_id                uuid,
  p_dose                  numeric,
  p_dose_unidade          text,
  p_quantidade_baixa      numeric,
  p_regioes               jsonb DEFAULT '[]'::jsonb,
  p_observacoes           text DEFAULT NULL,
  p_contract_id           uuid DEFAULT NULL,
  p_appointment_id        uuid DEFAULT NULL,
  p_profissional_nome     text DEFAULT NULL,
  p_profissional_registro text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic  uuid := public.get_my_clinic_id();
  v_hoje    date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_item    public.stock_items%ROWTYPE;
  v_lot     public.stock_lots%ROWTYPE;
  v_mov     uuid;
  v_id      uuid;
  v_ok      boolean;
  v_regioes jsonb := COALESCE(p_regioes, '[]'::jsonb);
  v_tipo    text := COALESCE(NULLIF(btrim(p_tipo), ''), 'outro');
BEGIN
  IF auth.uid() IS NULL OR v_clinic IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_module_perm('prontuario', true) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF p_patient_id IS NULL OR p_stock_item_id IS NULL OR p_lot_id IS NULL
     OR p_dose IS NULL OR p_dose <= 0 OR p_quantidade_baixa IS NULL OR p_quantidade_baixa <= 0
     OR p_dose_unidade IS NULL OR btrim(p_dose_unidade) = ''
     OR p_data IS NULL OR p_data > v_hoje
     OR jsonb_typeof(v_regioes) <> 'array' OR jsonb_array_length(v_regioes) > 60
     OR v_tipo NOT IN ('toxina', 'preenchimento', 'bioestimulador', 'fio', 'ultrassom', 'outro') THEN
    RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'P0001';
  END IF;

  -- escopo por área: em clínica que separa por profissional, só admin/recepção ou quem enxerga o paciente (mesma regra de patients)
  IF coalesce(public.clinic_scopes_by_professional(), false)
     AND NOT public.is_admin_or_recepcao()
     AND NOT public.patient_visible_to_my_area(p_patient_id) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  -- repetição do mesmo envio (clique duplo, nova tentativa): devolve a aplicação já gravada, sem baixar de novo
  IF p_request_id IS NOT NULL THEN
    SELECT a.id INTO v_id FROM public.estetica_aplicacoes a WHERE a.clinic_id = v_clinic AND a.request_id = p_request_id;
    IF FOUND THEN
      RETURN v_id;
    END IF;
  END IF;

  PERFORM 1 FROM public.patients p WHERE p.id = p_patient_id AND p.clinic_id = v_clinic;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'paciente_invalido' USING ERRCODE = 'P0001';
  END IF;

  -- atendimento vinculado: mesma clínica e mesmo paciente
  IF p_appointment_id IS NOT NULL THEN
    PERFORM 1 FROM public.appointments ap
     WHERE ap.id = p_appointment_id AND ap.clinic_id = v_clinic AND ap.patient_id = p_patient_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'dados_invalidos' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_contract_id IS NOT NULL AND to_regclass('public.contracts') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = $1 AND c.clinic_id = $2 AND c.patient_id = $3)'
      INTO v_ok USING p_contract_id, v_clinic, p_patient_id;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'termo_invalido' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- trava SEMPRE nesta ordem (lote, depois produto): o estorno usa a mesma, sem risco de impasse
  SELECT * INTO v_lot FROM public.stock_lots l
   WHERE l.id = p_lot_id AND l.clinic_id = v_clinic AND l.stock_item_id = p_stock_item_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lote_inexistente' USING ERRCODE = 'P0001';
  END IF;

  IF v_lot.validade IS NOT NULL AND v_lot.validade < v_hoje THEN
    RAISE EXCEPTION 'lote_vencido' USING ERRCODE = 'P0001', DETAIL = to_char(v_lot.validade, 'YYYY-MM-DD');
  END IF;
  IF v_lot.quantidade_atual < p_quantidade_baixa THEN
    RAISE EXCEPTION 'lote_insuficiente' USING ERRCODE = 'P0001', DETAIL = v_lot.quantidade_atual::text;
  END IF;

  SELECT * INTO v_item FROM public.stock_items i
   WHERE i.id = p_stock_item_id AND i.clinic_id = v_clinic
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lote_inexistente' USING ERRCODE = 'P0001';
  END IF;
  IF v_item.quantity < p_quantidade_baixa THEN
    RAISE EXCEPTION 'estoque_insuficiente' USING ERRCODE = 'P0001', DETAIL = v_item.quantity::text;
  END IF;

  UPDATE public.stock_lots  SET quantidade_atual = quantidade_atual - p_quantidade_baixa, updated_at = now() WHERE id = v_lot.id;
  UPDATE public.stock_items SET quantity         = quantity         - p_quantidade_baixa, updated_at = now() WHERE id = v_item.id;

  INSERT INTO public.stock_movements (clinic_id, item_id, type, quantity, reason, user_name, lot_id, patient_id, appointment_id)
  VALUES (v_clinic, v_item.id, 'saida', p_quantidade_baixa, 'Aplicação estética', NULLIF(btrim(p_profissional_nome), ''), v_lot.id, p_patient_id, p_appointment_id)
  RETURNING id INTO v_mov;

  INSERT INTO public.estetica_aplicacoes (
    clinic_id, patient_id, request_id, data, tipo, stock_item_id, lot_id, movement_id, appointment_id, contract_id,
    produto, fabricante, lote, validade, dose, dose_unidade, quantidade_baixa, regioes, observacoes,
    profissional_nome, profissional_registro
  ) VALUES (
    v_clinic, p_patient_id, p_request_id, p_data, v_tipo, v_item.id, v_lot.id, v_mov, p_appointment_id, p_contract_id,
    left(v_item.name, 160), NULLIF(left(btrim(COALESCE(v_lot.fabricante, '')), 160), ''), left(v_lot.lote, 80), v_lot.validade,
    p_dose, left(btrim(p_dose_unidade), 20), p_quantidade_baixa, v_regioes, NULLIF(btrim(COALESCE(p_observacoes, '')), ''),
    NULLIF(left(btrim(COALESCE(p_profissional_nome, '')), 160), ''), NULLIF(left(btrim(COALESCE(p_profissional_registro, '')), 60), '')
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.estetica_registrar_aplicacao(uuid, uuid, date, text, uuid, uuid, numeric, text, numeric, jsonb, text, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estetica_registrar_aplicacao(uuid, uuid, date, text, uuid, uuid, numeric, text, numeric, jsonb, text, uuid, uuid, text, text) TO authenticated;

-- ─── 2c) estetica_estornar_aplicacao ───
-- Mudança sobre 20261136: depois de carregar a linha, exige clinical_row_visible_to_my_area(NULL, autor).
CREATE OR REPLACE FUNCTION public.estetica_estornar_aplicacao(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := public.get_my_clinic_id();
  v_a      public.estetica_aplicacoes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_clinic IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_module_perm('prontuario', true) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_a FROM public.estetica_aplicacoes a WHERE a.id = p_id AND a.clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'aplicacao_inexistente' USING ERRCODE = 'P0001';
  END IF;

  -- escopo por área: a função já libera clínica sem escopo, admin/recepção e o próprio autor
  IF NOT public.clinical_row_visible_to_my_area(NULL, v_a.autor) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF v_a.estornada_em IS NOT NULL THEN
    RAISE EXCEPTION 'ja_estornada' USING ERRCODE = 'P0001';
  END IF;

  -- mesma ordem de trava da baixa: lote, depois produto (se o lote ou o produto foram apagados, só o que resta é devolvido)
  IF v_a.lot_id IS NOT NULL THEN
    PERFORM 1 FROM public.stock_lots l WHERE l.id = v_a.lot_id FOR UPDATE;
    UPDATE public.stock_lots SET quantidade_atual = quantidade_atual + v_a.quantidade_baixa, updated_at = now() WHERE id = v_a.lot_id;
  END IF;
  IF v_a.stock_item_id IS NOT NULL THEN
    PERFORM 1 FROM public.stock_items i WHERE i.id = v_a.stock_item_id FOR UPDATE;
    UPDATE public.stock_items SET quantity = quantity + v_a.quantidade_baixa, updated_at = now() WHERE id = v_a.stock_item_id;
    -- entrada com o mesmo paciente e lote: o recall do Estoque desconta do que ele "recebeu"
    INSERT INTO public.stock_movements (clinic_id, item_id, type, quantity, reason, user_name, lot_id, patient_id, appointment_id)
    VALUES (v_clinic, v_a.stock_item_id, 'entrada', v_a.quantidade_baixa, 'Estorno de aplicação estética', v_a.profissional_nome, v_a.lot_id, v_a.patient_id, v_a.appointment_id);
  END IF;

  PERFORM set_config('myclinica.estetica_fn', 'on', true);
  UPDATE public.estetica_aplicacoes
     SET estornada_em = now(), estorno_motivo = NULLIF(left(btrim(COALESCE(p_motivo, '')), 500), ''), estornada_por = auth.uid()
   WHERE id = v_a.id;
  PERFORM set_config('myclinica.estetica_fn', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.estetica_estornar_aplicacao(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estetica_estornar_aplicacao(uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) DIÁRIO ALIMENTAR: limite de 20 por paciente e dia, atômico
-- ═══════════════════════════════════════════════════════════════════════════
-- O lock é por (paciente, dia) e dura até o fim da transação do INSERT: a segunda requisição espera a primeira
-- confirmar e só então conta (READ COMMITTED enxerga a linha recém-confirmada). SECURITY DEFINER para a contagem
-- não depender da RLS de quem insere (hoje só o servidor, com a chave de serviço).
CREATE OR REPLACE FUNCTION public.nutri_diario_limite_dia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('nutri_diario:' || NEW.patient_id::text || ':' || NEW.dia::text, 0));
  SELECT count(*) INTO v_total FROM public.nutri_diario d WHERE d.patient_id = NEW.patient_id AND d.dia = NEW.dia;
  IF v_total >= 20 THEN
    RAISE EXCEPTION 'limite_diario' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nutri_diario_limite_dia ON public.nutri_diario;
CREATE TRIGGER nutri_diario_limite_dia
  BEFORE INSERT ON public.nutri_diario
  FOR EACH ROW EXECUTE FUNCTION public.nutri_diario_limite_dia();

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de aplicar; somente leitura):
--   -- 5 policies restritivas novas (esperado: 5 linhas, permissive = RESTRICTIVE, cmd = ALL)
--   SELECT tablename, policyname, permissive, cmd FROM pg_policies
--    WHERE schemaname = 'public' AND policyname LIKE 'restrict\_fisio\_%\_by\_area' ORDER BY 1;
--   -- gatilhos (esperado: 4 de fisio + estetica_aplicacoes_before_write + nutri_diario_limite_dia)
--   SELECT tgrelid::regclass, tgname FROM pg_trigger
--    WHERE NOT tgisinternal AND tgname IN ('fisio_exercicios_before_write', 'fisio_prescricoes_before_write',
--          'fisio_prescricao_itens_before_write', 'fisio_goniometrias_before_write',
--          'estetica_aplicacoes_before_write', 'nutri_diario_limite_dia') ORDER BY 2;
--   -- funções novas da estética (esperado: o corpo contém a conferência de escopo)
--   SELECT proname, prosecdef, proconfig,
--          prosrc LIKE '%patient_visible_to_my_area%' AS registrar_confere_area,
--          prosrc LIKE '%clinical_row_visible_to_my_area%' AS estornar_confere_area,
--          prosrc LIKE '%appointments%' AS confere_atendimento
--     FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('estetica_registrar_aplicacao', 'estetica_estornar_aplicacao', 'estetica_aplicacoes_before_write') ORDER BY 1;
--   -- privilégios mantidos (esperado: false, false / true, true)
--   SELECT has_function_privilege('anon', 'public.estetica_registrar_aplicacao(uuid,uuid,date,text,uuid,uuid,numeric,text,numeric,jsonb,text,uuid,uuid,text,text)', 'EXECUTE'),
--          has_function_privilege('anon', 'public.estetica_estornar_aplicacao(uuid,text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.estetica_registrar_aplicacao(uuid,uuid,date,text,uuid,uuid,numeric,text,numeric,jsonb,text,uuid,uuid,text,text)', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.estetica_estornar_aplicacao(uuid,text)', 'EXECUTE');
--
-- ROLLBACK (rodar manualmente; só remove o que esta migração criou e devolve os corpos de 20261136):
--   -- 1) Fisioterapia
--   DROP POLICY IF EXISTS restrict_fisio_exercicios_by_area       ON public.fisio_exercicios;
--   DROP POLICY IF EXISTS restrict_fisio_prescricoes_by_area      ON public.fisio_prescricoes;
--   DROP POLICY IF EXISTS restrict_fisio_prescricao_itens_by_area ON public.fisio_prescricao_itens;
--   DROP POLICY IF EXISTS restrict_fisio_execucoes_by_area        ON public.fisio_execucoes;
--   DROP POLICY IF EXISTS restrict_fisio_goniometrias_by_area     ON public.fisio_goniometrias;
--   DROP TRIGGER IF EXISTS fisio_exercicios_before_write       ON public.fisio_exercicios;
--   DROP TRIGGER IF EXISTS fisio_prescricoes_before_write      ON public.fisio_prescricoes;
--   DROP TRIGGER IF EXISTS fisio_prescricao_itens_before_write ON public.fisio_prescricao_itens;
--   DROP TRIGGER IF EXISTS fisio_goniometrias_before_write     ON public.fisio_goniometrias;
--   DROP FUNCTION IF EXISTS public.fisio_exercicios_before_write();
--   DROP FUNCTION IF EXISTS public.fisio_prescricoes_before_write();
--   DROP FUNCTION IF EXISTS public.fisio_prescricao_itens_before_write();
--   DROP FUNCTION IF EXISTS public.fisio_goniometrias_before_write();
--   -- 2) Estética: rode de novo, na ordem, os blocos CREATE OR REPLACE de estetica_aplicacoes_before_write (seção 2),
--   --    estetica_registrar_aplicacao (seção 3) e estetica_estornar_aplicacao (seção 4) de 20261136_estetica_lotes_aplicacoes.sql
--   --    (eles já trazem o REVOKE/GRANT). Não use DROP FUNCTION: o app depende delas.
--   -- 3) Diário
--   DROP TRIGGER IF EXISTS nutri_diario_limite_dia ON public.nutri_diario;
--   DROP FUNCTION IF EXISTS public.nutri_diario_limite_dia();
-- ═══════════════════════════════════════════════════════════════════════════
