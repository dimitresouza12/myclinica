-- PENDENTE: colar no SQL Editor do Supabase (projeto siohvtgbomvcprbzfamr), DEPOIS de aplicar
-- supabase/migrations/20261119_document_text_models.sql (document_text_models).
--
-- O app funciona SEM este arquivo (o servidor grava e lê com a chave de serviço, sempre escopado à clínica); ele
-- acrescenta as DEFESAS NO BANCO:
--   1. updated_at mantido pelo banco; clínica e chave do modelo não mudam depois de criados.
--   2. Leitura pelo navegador só da própria clínica e só com permissão de ver o prontuário.
--      Sem INSERT/UPDATE/DELETE para o navegador: nenhuma policy de escrita de propósito.
-- Idempotente (DROP ... IF EXISTS / CREATE OR REPLACE). Rollback no fim.

CREATE OR REPLACE FUNCTION public.document_text_models_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id OR NEW.model_key IS DISTINCT FROM OLD.model_key THEN
    RAISE EXCEPTION 'clinica e chave do modelo nao mudam' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_text_models_guard_chk ON public.document_text_models;
CREATE TRIGGER document_text_models_guard_chk BEFORE UPDATE ON public.document_text_models
  FOR EACH ROW EXECUTE FUNCTION public.document_text_models_guard();

DROP POLICY IF EXISTS document_text_models_select ON public.document_text_models;
CREATE POLICY document_text_models_select ON public.document_text_models FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin()) AND public.has_module_perm('prontuario', false));

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS document_text_models_guard_chk ON public.document_text_models;
-- DROP FUNCTION IF EXISTS public.document_text_models_guard();
-- DROP POLICY IF EXISTS document_text_models_select ON public.document_text_models;
