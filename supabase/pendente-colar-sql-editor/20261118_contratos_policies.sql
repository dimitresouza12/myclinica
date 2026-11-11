-- PENDENTE: colar no SQL Editor do Supabase (projeto siohvtgbomvcprbzfamr), DEPOIS de aplicar
-- supabase/migrations/20261118_contratos.sql (contract_templates, contracts).
--
-- O app funciona SEM este arquivo (o servidor grava e lê com a chave de serviço, sempre escopado à clínica); ele
-- acrescenta as DEFESAS NO BANCO que não dependem do código:
--   1. O texto, o hash e o paciente de um contrato NÃO mudam depois de enviado (só rascunho é editável) e um contrato
--      assinado nunca volta a rascunho ou enviado (só pode ser cancelado).
--   2. Clínica e paciente da linha têm de bater; modelo, profissional e pedido de assinatura têm de ser da mesma clínica.
--   3. updated_at é mantido pelo banco.
--   4. Leitura pelo navegador só da própria clínica e só com permissão de ver o prontuário. Sem INSERT/UPDATE/DELETE
--      para o navegador: nenhuma policy de escrita de propósito.
-- Idempotente (DROP ... IF EXISTS / CREATE OR REPLACE). Rollback no fim.

-- ── 1 e 3. Conteúdo congelado depois de enviado + updated_at ───────────────
CREATE OR REPLACE FUNCTION public.contracts_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
    RAISE EXCEPTION 'clinica e paciente do contrato nao mudam' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'rascunho' AND (
       NEW.content_text IS DISTINCT FROM OLD.content_text
    OR NEW.title        IS DISTINCT FROM OLD.title
    OR NEW.valid_from   IS DISTINCT FROM OLD.valid_from
    OR NEW.valid_until  IS DISTINCT FROM OLD.valid_until
    OR NEW.amount       IS DISTINCT FROM OLD.amount
  ) THEN
    RAISE EXCEPTION 'contrato ja enviado nao pode ser alterado: cancele e crie outro' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'assinado' AND NEW.status NOT IN ('assinado','cancelado') THEN
    RAISE EXCEPTION 'contrato assinado so pode ser cancelado' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'cancelado' AND NEW.status <> 'cancelado' THEN
    RAISE EXCEPTION 'contrato cancelado nao volta' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_guard_chk ON public.contracts;
CREATE TRIGGER contracts_guard_chk BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_guard();

-- ── 2. Tudo da mesma clínica ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.contracts_same_clinic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'patient_id pertence a outra clinica' USING ERRCODE = '23514';
  END IF;
  IF NEW.template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contract_templates t WHERE t.id = NEW.template_id AND t.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'template_id pertence a outra clinica' USING ERRCODE = '23514';
  END IF;
  IF NEW.professional_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = NEW.professional_id AND pr.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'professional_id pertence a outra clinica' USING ERRCODE = '23514';
  END IF;
  IF NEW.signature_request_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.signature_requests s WHERE s.id = NEW.signature_request_id AND s.clinic_id = NEW.clinic_id AND s.patient_id = NEW.patient_id) THEN
    RAISE EXCEPTION 'signature_request_id pertence a outra clinica ou paciente' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_same_clinic_chk ON public.contracts;
CREATE TRIGGER contracts_same_clinic_chk BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_same_clinic();

-- ── 4. Leitura pela própria clínica (sem escrita pelo navegador) ───────────
DROP POLICY IF EXISTS contracts_select ON public.contracts;
CREATE POLICY contracts_select ON public.contracts FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin()) AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS contract_templates_select ON public.contract_templates;
CREATE POLICY contract_templates_select ON public.contract_templates FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin()) AND public.has_module_perm('prontuario', false));

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS contracts_guard_chk ON public.contracts;
-- DROP FUNCTION IF EXISTS public.contracts_guard();
-- DROP TRIGGER IF EXISTS contracts_same_clinic_chk ON public.contracts;
-- DROP FUNCTION IF EXISTS public.contracts_same_clinic();
-- DROP POLICY IF EXISTS contracts_select ON public.contracts;
-- DROP POLICY IF EXISTS contract_templates_select ON public.contract_templates;
