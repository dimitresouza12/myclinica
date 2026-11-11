-- PENDENTE: colar no SQL Editor do Supabase (projeto siohvtgbomvcprbzfamr). Depende de 20261114_estoque_lotes.sql (já aplicada).
-- Endurece o WITH CHECK de INSERT/UPDATE em stock_lots: o stock_item_id precisa pertencer à mesma clínica do lote,
-- impedindo que um tenant grave lote apontando para o produto de outra clínica. Demais condições idênticas às atuais.
-- Idempotente (DROP POLICY IF EXISTS + CREATE POLICY).

DROP POLICY IF EXISTS tenant_insert_stock_lots ON public.stock_lots;
CREATE POLICY tenant_insert_stock_lots ON public.stock_lots FOR INSERT
  WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', true) AND EXISTS (SELECT 1 FROM public.stock_items i WHERE i.id = stock_lots.stock_item_id AND i.clinic_id = stock_lots.clinic_id)));

DROP POLICY IF EXISTS tenant_update_stock_lots ON public.stock_lots;
CREATE POLICY tenant_update_stock_lots ON public.stock_lots FOR UPDATE
  USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', true)))
  WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', true) AND EXISTS (SELECT 1 FROM public.stock_items i WHERE i.id = stock_lots.stock_item_id AND i.clinic_id = stock_lots.clinic_id)));

-- ROLLBACK (volta ao corpo anterior, sem a checagem de tenant do produto):
-- DROP POLICY IF EXISTS tenant_insert_stock_lots ON public.stock_lots;
-- CREATE POLICY tenant_insert_stock_lots ON public.stock_lots FOR INSERT
--   WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', true)));
-- DROP POLICY IF EXISTS tenant_update_stock_lots ON public.stock_lots;
-- CREATE POLICY tenant_update_stock_lots ON public.stock_lots FOR UPDATE
--   USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', true)))
--   WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('estoque', true)));
