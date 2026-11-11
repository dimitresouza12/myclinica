-- ═══════════════════════════════════════════════════════════════════════════
-- ESTOQUE: LOTE, VALIDADE E RASTREIO DE USO (recall)
-- Criado em: 2026-11-14
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1) stock_lots: cada entrada com lote vira (ou soma em) uma linha, com validade, fornecedor e nota opcionais.
--    `quantidade_atual` é o saldo do lote. O saldo do PRODUTO continua em stock_items.quantity (o total);
--    o que não está em nenhum lote é a diferença (produto antigo, sem lote, segue valendo e sem perda de saldo).
--    Sem gatilho: o app atualiza o saldo do lote e o do produto juntos, cada UPDATE só vale se o saldo
--    ainda for o lido (controle de concorrência no código). Nada aqui é obrigatório para o app funcionar:
--    sem esta migration o Estoque segue exatamente como antes.
--
-- 2) stock_movements ganha 3 colunas NULL:
--      lot_id         de qual lote saiu/entrou (NULL = sem lote, como todo o histórico existente);
--      patient_id     quem recebeu o material (rastreio: "quais pacientes receberam o lote X");
--      appointment_id em qual atendimento foi usado (opcional).
--    Hoje stock_movements NÃO se liga a paciente nem a atendimento; estes campos são o primeiro vínculo.
--
-- Nenhum dado existente é alterado. O vínculo de saldo antigo a um lote inicial é feito pela tela,
-- produto a produto, quando a pessoa pede (nunca automático).
--
-- RLS: padrão do projeto (get_my_clinic_id() / is_superadmin()), leitura com permissão de ver o módulo
-- estoque e escrita com permissão de editar o estoque (mesmo desenho de 20261113_agenda_series_pacotes.sql).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.stock_lots (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id           uuid        NOT NULL REFERENCES public.clinics(id)     ON DELETE CASCADE,
  stock_item_id       uuid        NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  lote                text        NOT NULL CHECK (length(btrim(lote)) > 0),   -- código impresso na embalagem
  validade            date,                                                    -- NULL = sem validade informada
  quantidade_inicial  numeric     NOT NULL DEFAULT 0 CHECK (quantidade_inicial >= 0),
  quantidade_atual    numeric     NOT NULL DEFAULT 0 CHECK (quantidade_atual   >= 0),
  custo               numeric     CHECK (custo IS NULL OR custo >= 0),         -- custo unitário deste lote (opcional)
  fornecedor          text,
  nota_fiscal         text,
  created_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_lots_clinic_validade ON public.stock_lots (clinic_id, validade);
CREATE INDEX IF NOT EXISTS idx_stock_lots_item            ON public.stock_lots (stock_item_id, validade);
-- o mesmo lote (código sem diferença de caixa/espaços e mesma validade) não se repete no produto
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_lots_item_lote_validade
  ON public.stock_lots (stock_item_id, lower(btrim(lote)), (COALESCE(validade, 'infinity'::date)));

-- ─── Colunas novas em stock_movements (todas NULL) ───
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS lot_id         uuid REFERENCES public.stock_lots(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS patient_id     uuid REFERENCES public.patients(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_lot     ON public.stock_movements (lot_id, created_at DESC)     WHERE lot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_patient ON public.stock_movements (patient_id, created_at DESC) WHERE patient_id IS NOT NULL;

-- ─── RLS ───
ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_lots' AND policyname = 'tenant_read_stock_lots') THEN
    CREATE POLICY tenant_read_stock_lots ON public.stock_lots FOR SELECT
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', false)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_lots' AND policyname = 'tenant_insert_stock_lots') THEN
    CREATE POLICY tenant_insert_stock_lots ON public.stock_lots FOR INSERT
      WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', true) AND EXISTS (SELECT 1 FROM public.stock_items i WHERE i.id = stock_lots.stock_item_id AND i.clinic_id = stock_lots.clinic_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_lots' AND policyname = 'tenant_update_stock_lots') THEN
    CREATE POLICY tenant_update_stock_lots ON public.stock_lots FOR UPDATE
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', true)))
      WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', true) AND EXISTS (SELECT 1 FROM public.stock_items i WHERE i.id = stock_lots.stock_item_id AND i.clinic_id = stock_lots.clinic_id)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_lots' AND policyname = 'tenant_delete_stock_lots') THEN
    CREATE POLICY tenant_delete_stock_lots ON public.stock_lots FOR DELETE
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', true)));
  END IF;
END $$;

COMMENT ON TABLE public.stock_lots IS
  'Lote de um produto do estoque: código, validade, fornecedor, nota e saldo do lote. Saldo do produto = stock_items.quantity; o que não está em lote é a diferença.';
COMMENT ON COLUMN public.stock_movements.lot_id         IS 'Lote que a movimentação afetou (NULL = saldo sem lote).';
COMMENT ON COLUMN public.stock_movements.patient_id     IS 'Paciente que recebeu o material (rastreio de lote para recall). NULL = não informado.';
COMMENT ON COLUMN public.stock_movements.appointment_id IS 'Atendimento em que o material foi usado. NULL = não informado.';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar manualmente, nesta ordem; apaga TODOS os lotes e o vínculo lote/paciente das movimentações;
-- o saldo dos produtos em stock_items.quantity não é tocado):
--
-- DROP INDEX IF EXISTS public.idx_stock_movements_patient;
-- DROP INDEX IF EXISTS public.idx_stock_movements_lot;
-- ALTER TABLE public.stock_movements
--   DROP COLUMN IF EXISTS appointment_id,
--   DROP COLUMN IF EXISTS patient_id,
--   DROP COLUMN IF EXISTS lot_id;
-- DROP TABLE IF EXISTS public.stock_lots;   -- leva junto as policies e os índices da tabela
-- ═══════════════════════════════════════════════════════════════════════════
