-- ═══════════════════════════════════════════════════════════════════════════
-- ESTÉTICA — aplicação de produto com rastreabilidade de lote
-- Criado em: 2026-11-16 (NÃO APLICADA: arquivo para o Dimitre revisar e aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O estoque com lote JÁ EXISTE (20261114_estoque_lotes.sql: stock_lots + lot_id/patient_id/appointment_id em
-- stock_movements) e a tela de Estoque já tem "Lotes e validade" e "Pacientes que receberam o lote" (recall). Esta migração
-- NÃO cria outro cadastro de produto/lote: liga a APLICAÇÃO da Estética a esse estoque.
--
-- 1) stock_lots.fabricante (coluna nova, NULL): o lote já tinha código, validade, fornecedor e nota; faltava o fabricante.
--
-- 2) estetica_aplicacoes: 1 linha por aplicação (toxina, preenchedor, bioestimulador...) com o produto/lote USADO gravado
--    também como texto (produto, fabricante, lote, validade): a ficha impressa e o recall continuam certos mesmo que o
--    lote seja editado ou apagado depois. Guarda a dose total + unidade (U, ml...), a quantidade baixada do estoque (na
--    unidade do produto no estoque, que pode ser diferente: 20 U de um frasco de 100 U = baixa de 1 frasco, ou 20 se o
--    produto é controlado em U), as regiões aplicadas com unidades e posição no mapa (jsonb), observações, o profissional e
--    o termo de consentimento (contract_id, módulo de contratos que já existe; nada de termo novo).
--
-- 3) estetica_registrar_aplicacao(...): a única porta de entrada para criar uma aplicação. Numa transação só:
--    confere clínica e permissão do prontuário, bloqueia (FOR UPDATE) o lote e o produto, RECUSA lote vencido (sem
--    exceção: aplicar material vencido não é caso de confirmar), confere o saldo do lote e do produto, baixa os dois,
--    grava a movimentação de saída (com lote e paciente: é ela que alimenta o recall do Estoque) e a linha da aplicação.
--    SECURITY DEFINER para a baixa valer mesmo para quem edita prontuário mas não tem permissão do módulo estoque.
--    A tabela NÃO aceita INSERT direto (policy restritiva): sem a função não existe aplicação sem baixa.
--    p_request_id (uuid gerado pela tela) deixa o "salvar" idempotente: clique duplo ou nova tentativa não baixa duas vezes.
--
-- 4) estetica_estornar_aplicacao(...): desfaz uma aplicação lançada por engano (devolve ao lote e ao produto, lança a
--    entrada de estorno com o mesmo paciente para o recall descontar, marca a linha como estornada). A linha NÃO é apagada.
--
-- 5) estetica_lotes_para_aplicacao(): lotes com saldo da clínica para o seletor da aplicação, sem exigir permissão do
--    módulo estoque (quem aplica precisa escolher o lote).
--
-- RLS de estetica_aplicacoes (mesmo desenho de odonto_periogramas, 20261131):
--   * clinic_isolation (permissiva): só a própria clínica (ou superadmin).
--   * restrict_prontuario_select/update (RESTRICTIVE): exige has_module_perm('prontuario', false|true).
--   * sem INSERT direto (RESTRICTIVE, WITH CHECK false) e DELETE só do superadmin: a trilha de lote não se apaga.
--   * restrict_estetica_aplicacoes_by_area (RESTRICTIVE): em clínica com escopo por profissional, só admin/recepção, o autor
--     ou quem é da mesma área, via clinical_row_visible_to_my_area (20261111). Criada só se essa função existir.
--
-- Dependências (a migração para com mensagem clara se faltar alguma): clinics, patients, stock_items, stock_movements,
-- stock_lots (20261114_estoque_lotes.sql), appointments, get_my_clinic_id(), is_superadmin(), has_module_perm(text, boolean).
-- Opcionais: contracts (20261118_contratos.sql; sem ela contract_id existe mas sem chave estrangeira, e o vínculo de termo
-- não é validado) e clinical_row_visible_to_my_area.
--
-- Idempotente: CREATE ... IF NOT EXISTS, CREATE OR REPLACE e DROP ... IF EXISTS antes de cada CREATE. Pode rodar duas vezes.
-- Aditiva: só ADD COLUMN IF NOT EXISTS em stock_lots. Desfazer: bloco ROLLBACK no fim.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_falta text;
BEGIN
  SELECT string_agg(t, ', ') INTO v_falta
    FROM unnest(ARRAY['clinics', 'patients', 'stock_items', 'stock_movements', 'appointments']) AS t
   WHERE to_regclass('public.' || t) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'faltam tabelas: %', v_falta;
  END IF;

  IF to_regclass('public.stock_lots') IS NULL THEN
    RAISE EXCEPTION 'falta public.stock_lots (aplique antes 20261114_estoque_lotes.sql)';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name IN ('lot_id', 'patient_id', 'appointment_id')) < 3 THEN
    RAISE EXCEPTION 'stock_movements sem lot_id/patient_id/appointment_id (aplique antes 20261114_estoque_lotes.sql)';
  END IF;

  -- confere pelo nome (as assinaturas exatas vêm das migrações de 20261111)
  SELECT string_agg(f, ', ') INTO v_falta
    FROM unnest(ARRAY['get_my_clinic_id', 'is_superadmin', 'has_module_perm']) AS f
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = f);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'faltam funções: % (aplique antes 20261111_permissoes_por_modulo.sql)', v_falta;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Fabricante no lote
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.stock_lots ADD COLUMN IF NOT EXISTS fabricante text;
COMMENT ON COLUMN public.stock_lots.fabricante IS 'Fabricante do produto deste lote (rastreabilidade de injetáveis). NULL = não informado.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) estetica_aplicacoes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.estetica_aplicacoes (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id             uuid        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id            uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  request_id            uuid,
  data                  date        NOT NULL DEFAULT CURRENT_DATE,
  tipo                  text        NOT NULL DEFAULT 'outro'
                                    CHECK (tipo IN ('toxina', 'preenchimento', 'bioestimulador', 'fio', 'ultrassom', 'outro')),
  -- vínculos com o estoque (SET NULL: apagar o lote ou o produto não apaga a ficha; o texto abaixo continua)
  stock_item_id         uuid        REFERENCES public.stock_items(id)     ON DELETE SET NULL,
  lot_id                uuid        REFERENCES public.stock_lots(id)      ON DELETE SET NULL,
  movement_id           uuid        REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  appointment_id        uuid        REFERENCES public.appointments(id)    ON DELETE SET NULL,
  -- termo de consentimento (módulo de contratos); a chave estrangeira é criada mais abaixo, se a tabela existir
  contract_id           uuid,
  -- o que foi usado, como texto (rastreabilidade que sobrevive a edição ou exclusão do lote)
  produto               text        NOT NULL CHECK (length(btrim(produto)) > 0 AND length(produto) <= 160),
  fabricante            text        CHECK (fabricante IS NULL OR length(fabricante) <= 160),
  lote                  text        NOT NULL CHECK (length(btrim(lote)) > 0 AND length(lote) <= 80),
  validade              date,
  dose                  numeric     NOT NULL CHECK (dose > 0 AND dose <= 100000),
  dose_unidade          text        NOT NULL DEFAULT 'U' CHECK (length(btrim(dose_unidade)) > 0 AND length(dose_unidade) <= 20),
  quantidade_baixa      numeric     NOT NULL CHECK (quantidade_baixa > 0),
  -- [{ id, regiao, unidades, x, y }]: formato em src/lib/estetica/aplicacoes.ts (x,y no mapa do rosto, NULL = sem ponto)
  regioes               jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(regioes) = 'array' AND jsonb_array_length(regioes) <= 60 AND pg_column_size(regioes) <= 262144),
  observacoes           text        CHECK (observacoes IS NULL OR length(observacoes) <= 4000),
  profissional_nome     text        CHECK (profissional_nome IS NULL OR length(profissional_nome) <= 160),
  profissional_registro text        CHECK (profissional_registro IS NULL OR length(profissional_registro) <= 60),
  autor                 uuid,
  estornada_em          timestamptz,
  estorno_motivo        text        CHECK (estorno_motivo IS NULL OR length(estorno_motivo) <= 500),
  estornada_por         uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.estetica_aplicacoes IS 'Estética: aplicações de produto (toxina, preenchedor...) com o lote usado, dose, regiões e termo. Criada só por estetica_registrar_aplicacao (baixa o estoque na mesma transação).';
COMMENT ON COLUMN public.estetica_aplicacoes.quantidade_baixa IS 'Quantidade baixada do lote e do produto, na unidade do produto no estoque (pode diferir da dose: 20 U aplicadas = 1 frasco).';
COMMENT ON COLUMN public.estetica_aplicacoes.regioes IS 'JSON array de regiões aplicadas: id, regiao, unidades, x, y (mapa do rosto 300x249). Formato em src/lib/estetica/aplicacoes.ts.';
COMMENT ON COLUMN public.estetica_aplicacoes.contract_id IS 'Termo de consentimento ligado a esta aplicação (public.contracts). NULL = sem termo vinculado.';
COMMENT ON COLUMN public.estetica_aplicacoes.request_id IS 'uuid gerado pela tela para o salvar ser idempotente (único por clínica).';

CREATE INDEX IF NOT EXISTS idx_estetica_aplicacoes_paciente ON public.estetica_aplicacoes (patient_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_estetica_aplicacoes_clinica  ON public.estetica_aplicacoes (clinic_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_estetica_aplicacoes_lote     ON public.estetica_aplicacoes (lot_id) WHERE lot_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_estetica_aplicacoes_request ON public.estetica_aplicacoes (clinic_id, request_id) WHERE request_id IS NOT NULL;

-- chave estrangeira do termo, só se o módulo de contratos existe
DO $fk$
BEGIN
  IF to_regclass('public.contracts') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estetica_aplicacoes_contract_fk' AND conrelid = 'public.estetica_aplicacoes'::regclass) THEN
    ALTER TABLE public.estetica_aplicacoes
      ADD CONSTRAINT estetica_aplicacoes_contract_fk FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;
  END IF;
END
$fk$;

-- ─── Gatilho: autor, updated_at e o que NÃO pode mudar depois de gravado ───
-- A baixa de estoque já aconteceu com a dose, o lote e a quantidade gravados: editar isso deixaria o estoque errado.
-- Pode mudar: regiões, observações, profissional, termo e o atendimento vinculado. O estorno só pelas funções abaixo
-- (elas ligam a variável de transação myclinica.estetica_fn).
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estetica_aplicacoes_before_write ON public.estetica_aplicacoes;
CREATE TRIGGER estetica_aplicacoes_before_write
  BEFORE INSERT OR UPDATE ON public.estetica_aplicacoes
  FOR EACH ROW EXECUTE FUNCTION public.estetica_aplicacoes_before_write();

-- ─── RLS ───
ALTER TABLE public.estetica_aplicacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation ON public.estetica_aplicacoes;
CREATE POLICY clinic_isolation ON public.estetica_aplicacoes
  AS PERMISSIVE FOR ALL
  USING      (clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
  WITH CHECK (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

DROP POLICY IF EXISTS restrict_prontuario_select ON public.estetica_aplicacoes;
CREATE POLICY restrict_prontuario_select ON public.estetica_aplicacoes
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('prontuario', false)));

-- sem INSERT direto: a aplicação nasce em estetica_registrar_aplicacao (a função é SECURITY DEFINER e não passa por RLS)
DROP POLICY IF EXISTS restrict_aplicacao_sem_insert_direto ON public.estetica_aplicacoes;
CREATE POLICY restrict_aplicacao_sem_insert_direto ON public.estetica_aplicacoes
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS restrict_prontuario_update ON public.estetica_aplicacoes;
CREATE POLICY restrict_prontuario_update ON public.estetica_aplicacoes
  AS RESTRICTIVE FOR UPDATE
  USING      ((SELECT public.has_module_perm('prontuario', true)))
  WITH CHECK ((SELECT public.has_module_perm('prontuario', true)));

-- a trilha de lote não se apaga pela API (só o superadmin, para limpeza de suporte)
DROP POLICY IF EXISTS restrict_aplicacao_delete ON public.estetica_aplicacoes;
CREATE POLICY restrict_aplicacao_delete ON public.estetica_aplicacoes
  AS RESTRICTIVE FOR DELETE
  USING (public.is_superadmin());

-- Escopo por área: só cria se clinical_row_visible_to_my_area existir (vem de 20261111_pacientes_unicos_e_area).
-- Sem ela, vale o isolamento por clínica + permissão do módulo; reaplicar este arquivo depois cria a policy.
DO $area$
BEGIN
  DROP POLICY IF EXISTS restrict_estetica_aplicacoes_by_area ON public.estetica_aplicacoes;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
              WHERE ns.nspname = 'public' AND p.proname = 'clinical_row_visible_to_my_area') THEN
    EXECUTE 'CREATE POLICY restrict_estetica_aplicacoes_by_area ON public.estetica_aplicacoes AS RESTRICTIVE FOR ALL USING (public.clinical_row_visible_to_my_area(NULL, autor))';
  END IF;
END
$area$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) estetica_registrar_aplicacao: baixa atômica + ficha
-- Erros (message, errcode P0001; 42501 para sessão/permissão): sem_sessao, sem_permissao, dados_invalidos, paciente_invalido,
-- termo_invalido, lote_inexistente, lote_vencido, lote_insuficiente, estoque_insuficiente.
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) estetica_estornar_aplicacao: desfaz a baixa (a linha fica, marcada como estornada)
-- ═══════════════════════════════════════════════════════════════════════════

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
-- 5) estetica_lotes_para_aplicacao: lotes com saldo para o seletor (sem exigir o módulo estoque)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.estetica_lotes_para_aplicacao()
RETURNS TABLE (
  lot_id        uuid,
  stock_item_id uuid,
  produto       text,
  unidade       text,
  categoria     text,
  lote          text,
  validade      date,
  fabricante    text,
  saldo         numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, i.id, i.name, i.unit, i.category, l.lote, l.validade, l.fabricante, l.quantidade_atual
    FROM public.stock_lots l
    JOIN public.stock_items i ON i.id = l.stock_item_id AND i.clinic_id = l.clinic_id
   WHERE l.clinic_id = public.get_my_clinic_id()
     AND l.quantidade_atual > 0
     AND COALESCE(i.is_active, true)
     AND public.has_module_perm('prontuario', false)
   ORDER BY i.name, l.validade NULLS LAST, l.created_at;
$$;

REVOKE ALL ON FUNCTION public.estetica_lotes_para_aplicacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estetica_lotes_para_aplicacao() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de aplicar; somente leitura):
--   -- RLS ligada (esperado: true)
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.estetica_aplicacoes'::regclass;
--   -- policies: clinic_isolation + restrict_prontuario_(select|update) + restrict_aplicacao_(sem_insert_direto|delete)
--   -- + restrict_estetica_aplicacoes_by_area (se clinical_row_visible_to_my_area existir)
--   SELECT policyname, permissive, cmd FROM pg_policies WHERE tablename = 'estetica_aplicacoes' ORDER BY policyname;
--   -- funções (esperado: 3 linhas, as duas primeiras com prosecdef = true)
--   SELECT proname, prosecdef FROM pg_proc
--    WHERE proname IN ('estetica_registrar_aplicacao', 'estetica_estornar_aplicacao', 'estetica_lotes_para_aplicacao');
--   -- anon NÃO pode executar (esperado: false, false)
--   SELECT has_function_privilege('anon', 'public.estetica_registrar_aplicacao(uuid,uuid,date,text,uuid,uuid,numeric,text,numeric,jsonb,text,uuid,uuid,text,text)', 'EXECUTE'),
--          has_function_privilege('anon', 'public.estetica_estornar_aplicacao(uuid,text)', 'EXECUTE');
--   -- coluna nova (esperado: 1 linha)
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'stock_lots' AND column_name = 'fabricante';
--
-- ROLLBACK (rodar manualmente; APAGA as aplicações registradas. As saídas e entradas já lançadas em stock_movements e os
-- saldos NÃO são desfeitos: se quiser devolver o estoque, estorne as aplicações pela tela ANTES de desfazer):
--   DROP FUNCTION IF EXISTS public.estetica_lotes_para_aplicacao();
--   DROP FUNCTION IF EXISTS public.estetica_estornar_aplicacao(uuid, text);
--   DROP FUNCTION IF EXISTS public.estetica_registrar_aplicacao(uuid, uuid, date, text, uuid, uuid, numeric, text, numeric, jsonb, text, uuid, uuid, text, text);
--   DROP TABLE IF EXISTS public.estetica_aplicacoes;
--   DROP FUNCTION IF EXISTS public.estetica_aplicacoes_before_write();
--   ALTER TABLE public.stock_lots DROP COLUMN IF EXISTS fabricante;   -- opcional: perde o fabricante já digitado
-- ═══════════════════════════════════════════════════════════════════════════
