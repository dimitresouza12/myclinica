-- PENDENTE: colar no SQL Editor do Supabase (projeto siohvtgbomvcprbzfamr), DEPOIS de aplicar
-- supabase/migrations/20261117_portal_assinatura.sql (patient_portal_links, signature_requests, signed_documents,
-- issued_documents).
--
-- O app funciona SEM este arquivo (o servidor grava e lê com a chave de serviço, sempre escopado à clínica); ele
-- acrescenta as DEFESAS NO BANCO que não dependem do código:
--   1. signed_documents é IMUTÁVEL: UPDATE e DELETE direto são recusados (apagar o paciente ainda apaga em cascata).
--   2. signature_requests: o texto, o hash, o paciente e a clínica não mudam depois de criados.
--   3. clinica e paciente da linha têm de bater (impede gravar com patient_id de outra clínica).
--   4. Leitura pelo navegador só da própria clínica e só com permissão de ver o prontuário. Sem INSERT/UPDATE/DELETE
--      para o navegador: nenhuma policy de escrita de propósito.
-- Idempotente (DROP ... IF EXISTS / CREATE OR REPLACE). Rollback no fim.

-- ── 1. signed_documents imutável ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.signed_documents_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD; -- exclusão em cascata ao apagar o paciente/clínica (LGPD)
  END IF;
  RAISE EXCEPTION 'signed_documents e imutavel (%).', TG_OP USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS signed_documents_immutable_chk ON public.signed_documents;
CREATE TRIGGER signed_documents_immutable_chk
  BEFORE UPDATE OR DELETE ON public.signed_documents
  FOR EACH ROW EXECUTE FUNCTION public.signed_documents_immutable();

-- ── 2. signature_requests: conteúdo congelado ──────────────────────────────
CREATE OR REPLACE FUNCTION public.signature_requests_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content_text IS DISTINCT FROM OLD.content_text
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.doc_type IS DISTINCT FROM OLD.doc_type
     OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
    RAISE EXCEPTION 'o conteudo do documento a assinar nao pode ser alterado' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'assinado' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'documento ja assinado' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS signature_requests_freeze_chk ON public.signature_requests;
CREATE TRIGGER signature_requests_freeze_chk
  BEFORE UPDATE ON public.signature_requests
  FOR EACH ROW EXECUTE FUNCTION public.signature_requests_freeze();

-- ── 3. Clínica e paciente da linha têm de bater ────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_check_patient_clinic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'patient_id pertence a outra clinica' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patient_portal_links_clinic_chk ON public.patient_portal_links;
CREATE TRIGGER patient_portal_links_clinic_chk BEFORE INSERT ON public.patient_portal_links
  FOR EACH ROW EXECUTE FUNCTION public.portal_check_patient_clinic();
DROP TRIGGER IF EXISTS signature_requests_clinic_chk ON public.signature_requests;
CREATE TRIGGER signature_requests_clinic_chk BEFORE INSERT ON public.signature_requests
  FOR EACH ROW EXECUTE FUNCTION public.portal_check_patient_clinic();
DROP TRIGGER IF EXISTS signed_documents_clinic_chk ON public.signed_documents;
CREATE TRIGGER signed_documents_clinic_chk BEFORE INSERT ON public.signed_documents
  FOR EACH ROW EXECUTE FUNCTION public.portal_check_patient_clinic();
DROP TRIGGER IF EXISTS issued_documents_clinic_chk ON public.issued_documents;
CREATE TRIGGER issued_documents_clinic_chk BEFORE INSERT ON public.issued_documents
  FOR EACH ROW EXECUTE FUNCTION public.portal_check_patient_clinic();

-- ── 4. Leitura pela própria clínica (sem escrita pelo navegador) ───────────
DROP POLICY IF EXISTS patient_portal_links_select ON public.patient_portal_links;
CREATE POLICY patient_portal_links_select ON public.patient_portal_links FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin()) AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS signature_requests_select ON public.signature_requests;
CREATE POLICY signature_requests_select ON public.signature_requests FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin()) AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS signed_documents_select ON public.signed_documents;
CREATE POLICY signed_documents_select ON public.signed_documents FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin()) AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS issued_documents_select ON public.issued_documents;
CREATE POLICY issued_documents_select ON public.issued_documents FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin()) AND public.has_module_perm('prontuario', false));

-- Revogar um documento emitido (QR passa a mostrar "revogado"), quando necessário, pelo SQL Editor:
--   UPDATE public.issued_documents SET revoked_at = now() WHERE id = '<id>';

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS signed_documents_immutable_chk ON public.signed_documents;
-- DROP FUNCTION IF EXISTS public.signed_documents_immutable();
-- DROP TRIGGER IF EXISTS signature_requests_freeze_chk ON public.signature_requests;
-- DROP FUNCTION IF EXISTS public.signature_requests_freeze();
-- DROP TRIGGER IF EXISTS patient_portal_links_clinic_chk ON public.patient_portal_links;
-- DROP TRIGGER IF EXISTS signature_requests_clinic_chk ON public.signature_requests;
-- DROP TRIGGER IF EXISTS signed_documents_clinic_chk ON public.signed_documents;
-- DROP TRIGGER IF EXISTS issued_documents_clinic_chk ON public.issued_documents;
-- DROP FUNCTION IF EXISTS public.portal_check_patient_clinic();
-- DROP POLICY IF EXISTS patient_portal_links_select ON public.patient_portal_links;
-- DROP POLICY IF EXISTS signature_requests_select ON public.signature_requests;
-- DROP POLICY IF EXISTS signed_documents_select ON public.signed_documents;
-- DROP POLICY IF EXISTS issued_documents_select ON public.issued_documents;
