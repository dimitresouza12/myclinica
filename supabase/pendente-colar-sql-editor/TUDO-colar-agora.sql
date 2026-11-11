

-- ############################################################
-- 1/8 veterinaria: policies de pet_vaccinations e pet_weights
-- ############################################################

-- PENDENTE: colar no SQL Editor do Supabase (projeto siohvtgbomvcprbzfamr), SE as policies não tiverem entrado
-- junto com supabase/migrations/20261114_vet_vacinas_pesos.sql (o classificador do MCP costuma recusar esse bloco).
-- As DUAS TABELAS (pet_vaccinations, pet_weights) precisam existir antes (rode a migration primeiro).
-- Enquanto não há policy, o RLS ligado deixa as tabelas fechadas: nada lê nem grava, e a aba "Vacinas e peso"
-- mostra um aviso neutro (o resto do prontuário segue normal).
-- Padrão do prontuário: get_my_clinic_id() OR is_superadmin() + has_module_perm('prontuario').
-- Idempotente (DROP POLICY IF EXISTS). Rollback: DROP POLICY ... ou DROP TABLE das duas (ver a migration).

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.pet_vaccinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_weights      ENABLE ROW LEVEL SECURITY;

-- pet_vaccinations
DROP POLICY IF EXISTS pet_vaccinations_select ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_select ON public.pet_vaccinations FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS pet_vaccinations_insert ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_insert ON public.pet_vaccinations FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = pet_vaccinations.clinic_id));

DROP POLICY IF EXISTS pet_vaccinations_update ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_update ON public.pet_vaccinations FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = pet_vaccinations.clinic_id));

DROP POLICY IF EXISTS pet_vaccinations_delete ON public.pet_vaccinations;
CREATE POLICY pet_vaccinations_delete ON public.pet_vaccinations FOR DELETE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true));

-- pet_weights
DROP POLICY IF EXISTS pet_weights_select ON public.pet_weights;
CREATE POLICY pet_weights_select ON public.pet_weights FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS pet_weights_insert ON public.pet_weights;
CREATE POLICY pet_weights_insert ON public.pet_weights FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = pet_weights.clinic_id));

DROP POLICY IF EXISTS pet_weights_update ON public.pet_weights;
CREATE POLICY pet_weights_update ON public.pet_weights FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = pet_weights.clinic_id));

DROP POLICY IF EXISTS pet_weights_delete ON public.pet_weights;
CREATE POLICY pet_weights_delete ON public.pet_weights FOR DELETE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true));


-- ############################################################
-- 2/8 estoque: endurece check de lote por clinica (idempotente)
-- ############################################################

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


-- ############################################################
-- 3/8 convenios: tabelas
-- ############################################################

-- ═══════════════════════════════════════════════════════════════════════════
-- CONVÊNIOS POR CLÍNICA + VÍNCULO DO PACIENTE (guias TISS impressas, produção, recibo, Receita Saúde)
-- Criado em: 2026-11-16
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Aditivo: uma tabela nova e colunas novas em patients (todas anuláveis). Nada existente muda.
--   * insurance_plans — convênio da clínica: nome, registro ANS (6 dígitos), tabela de valores por
--                       procedimento (jsonb {procedure_id: valor}), observação, ativo.
--   * patients        — insurance_plan_id (convênio cadastrado), convenio_validade (validade da carteirinha),
--                       convenio_titular (titular do plano), payer_name / payer_cpf (pagador, quando não é o
--                       próprio paciente: criança, dependente; usado no recibo e na exportação Receita Saúde).
--   O texto livre patients.convenio / convenio_carteirinha continua valendo (nome do convênio e número).
--
-- Segurança: RLS ligado em insurance_plans SEM policies (fechado por padrão). As policies e o gatilho que
-- impede ligar paciente a convênio de outra clínica ficam em
-- supabase/pendente-colar-sql-editor/20261116_convenios_policies.sql (colar no SQL Editor).
-- O app detecta a ausência da tabela/colunas e segue como antes (extrasSchema.ts / lib/convenios/schema.ts).
--
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.insurance_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(btrim(name)) > 0),
  ans_registry    text CHECK (ans_registry IS NULL OR ans_registry ~ '^[0-9]{6}$'),
  procedure_prices jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(procedure_prices) = 'object'),
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insurance_plans_clinic_idx ON public.insurance_plans (clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS insurance_plans_clinic_name_uniq ON public.insurance_plans (clinic_id, lower(btrim(name)));

ALTER TABLE public.insurance_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS insurance_plan_id uuid REFERENCES public.insurance_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS convenio_validade date,
  ADD COLUMN IF NOT EXISTS convenio_titular  text,
  ADD COLUMN IF NOT EXISTS payer_name        text,
  ADD COLUMN IF NOT EXISTS payer_cpf         text;

CREATE INDEX IF NOT EXISTS patients_insurance_plan_idx ON public.patients (insurance_plan_id) WHERE insurance_plan_id IS NOT NULL;

COMMENT ON TABLE public.insurance_plans IS
  'Convênios da clínica (nome, registro ANS, tabela de valores por procedimento em procedure_prices = {procedure_id: valor}).';
COMMENT ON COLUMN public.patients.insurance_plan_id IS 'Convênio cadastrado em insurance_plans (opcional; patients.convenio segue como texto livre).';
COMMENT ON COLUMN public.patients.payer_cpf IS 'CPF do pagador quando diferente do paciente (recibo e Receita Saúde).';

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar à mão; apaga os convênios e os vínculos gravados):
--
-- ALTER TABLE public.patients DROP COLUMN IF EXISTS insurance_plan_id, DROP COLUMN IF EXISTS convenio_validade,
--   DROP COLUMN IF EXISTS convenio_titular, DROP COLUMN IF EXISTS payer_name, DROP COLUMN IF EXISTS payer_cpf;
-- DROP TABLE IF EXISTS public.insurance_plans;
-- ═══════════════════════════════════════════════════════════════════════════


-- ############################################################
-- 4/8 convenios: policies
-- ############################################################

-- PENDENTE: colar no SQL Editor do Supabase (projeto siohvtgbomvcprbzfamr), DEPOIS de aplicar
-- supabase/migrations/20261116_convenios.sql (tabela insurance_plans + colunas novas em patients).
-- Sem este arquivo a tabela fica fechada por padrao (RLS ligado, sem policy): o app enxerga a lista vazia e
-- nao consegue gravar convenio.
--
-- Leitura: quem acessa financeiro, pacientes ou agenda da clinica (o cadastro do paciente lista os convenios).
-- Escrita: quem edita o financeiro da clinica. Padrao: get_my_clinic_id() OR is_superadmin() + has_module_perm.
-- Idempotente (DROP ... IF EXISTS / CREATE OR REPLACE). Rollback no fim.

-- ── Policies de insurance_plans ────────────────────────────────────────────
DROP POLICY IF EXISTS insurance_plans_select ON public.insurance_plans;
CREATE POLICY insurance_plans_select ON public.insurance_plans FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND (public.has_module_perm('financeiro', false)
              OR public.has_module_perm('pacientes', false)
              OR public.has_module_perm('agenda', false)));

DROP POLICY IF EXISTS insurance_plans_insert ON public.insurance_plans;
CREATE POLICY insurance_plans_insert ON public.insurance_plans FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('financeiro', true));

DROP POLICY IF EXISTS insurance_plans_update ON public.insurance_plans;
CREATE POLICY insurance_plans_update ON public.insurance_plans FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('financeiro', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('financeiro', true));

-- Sem DELETE: convenio que nao se usa mais fica inativo (is_active = false), o historico de producao continua legivel.

-- ── Gatilho: o convenio ligado ao paciente tem de ser da mesma clinica ──────
CREATE OR REPLACE FUNCTION public.patients_check_insurance_plan_clinic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.insurance_plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.insurance_plans ip
    WHERE ip.id = NEW.insurance_plan_id AND ip.clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'insurance_plan_id pertence a outra clinica' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_insurance_plan_clinic_chk ON public.patients;
CREATE TRIGGER patients_insurance_plan_clinic_chk
  BEFORE INSERT OR UPDATE OF insurance_plan_id, clinic_id ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_check_insurance_plan_clinic();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS patients_insurance_plan_clinic_chk ON public.patients;
-- DROP FUNCTION IF EXISTS public.patients_check_insurance_plan_clinic();
-- DROP POLICY IF EXISTS insurance_plans_select ON public.insurance_plans;
-- DROP POLICY IF EXISTS insurance_plans_insert ON public.insurance_plans;
-- DROP POLICY IF EXISTS insurance_plans_update ON public.insurance_plans;


-- ############################################################
-- 5/8 portal do paciente + assinatura: tabelas
-- ############################################################

-- ═══════════════════════════════════════════════════════════════════════════
-- LINK MÁGICO DO PACIENTE, ASSINATURA ELETRÔNICA SIMPLES E QR VERIFICADOR DE DOCUMENTOS
-- Criado em: 2026-11-17
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Quatro tabelas novas, aditivas (nada existente é alterado):
--   * patient_portal_links — link pessoal /p/[token]. Guarda SÓ o SHA-256 do token (o token em claro existe
--                            apenas na resposta que cria o link). Escopos escolhidos pela clínica, validade,
--                            revogação, último acesso e contagem de acessos.
--   * signature_requests   — documento (TCLE, termo de imagem, contrato) pendente de assinatura, preso a UM link.
--                            O texto é TEXTO PURO e o hash do conteúdo é gravado na criação.
--   * signed_documents     — resultado da assinatura, IMUTÁVEL (gatilho no arquivo de policies): texto assinado,
--                            hash do conteúdo, nome, método, desenho (PNG), data/hora, hash HMAC do IP,
--                            user-agent e hash do ato. Uma assinatura por pedido (UNIQUE request_id).
--                            É assinatura eletrônica simples (Lei 14.063/2020, art. 4º, I), NÃO ICP-Brasil.
--   * issued_documents     — documento próprio emitido (atestado, declaração, laudo, receita comum) com QR:
--                            guarda só o hash do código verificador e o hash do conteúdo; nenhum texto clínico.
--
-- Segurança: RLS LIGADO nas quatro SEM policies de escrita (o navegador não grava nada). Quem lê e grava é o
-- servidor, com a clínica sempre vinda do usuário logado (rotas da clínica) ou do próprio link (páginas públicas).
-- As policies de leitura e os gatilhos de imutabilidade ficam em
-- supabase/pendente-colar-sql-editor/20261117_portal_assinatura_policies.sql (colar no SQL Editor).
-- O app detecta a ausência das tabelas e segue como antes (mensagem neutra na tela da clínica).
--
-- Desfazer: bloco ROLLBACK no fim do arquivo (apaga as quatro tabelas e os dados delas).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.patient_portal_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id     uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token_hash     text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  scopes         text[] NOT NULL CHECK (
                   cardinality(scopes) > 0
                   AND scopes <@ ARRAY['plano_alimentar','vacinas_peso','proximas_consultas','orientacoes','assinatura']::text[]),
  message        text CHECK (message IS NULL OR length(message) <= 1000),
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  last_access_at timestamptz,
  access_count   integer NOT NULL DEFAULT 0 CHECK (access_count >= 0),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS patient_portal_links_patient_idx ON public.patient_portal_links (clinic_id, patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.signature_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  link_id      uuid REFERENCES public.patient_portal_links(id) ON DELETE SET NULL,
  doc_type     text NOT NULL CHECK (doc_type IN ('tcle','termo_imagem','contrato')),
  title        text NOT NULL CHECK (length(btrim(title)) > 0 AND length(title) <= 120),
  content_text text NOT NULL CHECK (length(content_text) BETWEEN 30 AND 20000),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  status       text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','assinado','revogado')),
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS signature_requests_patient_idx ON public.signature_requests (clinic_id, patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS signature_requests_link_idx    ON public.signature_requests (link_id);

CREATE TABLE IF NOT EXISTS public.signed_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL UNIQUE REFERENCES public.signature_requests(id),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doc_type        text NOT NULL CHECK (doc_type IN ('tcle','termo_imagem','contrato')),
  title           text NOT NULL,
  content_text    text NOT NULL,
  content_hash    text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  signer_name     text NOT NULL CHECK (length(btrim(signer_name)) >= 5),
  method          text NOT NULL CHECK (method IN ('desenho','digitado')),
  signature_image text CHECK (signature_image IS NULL OR (signature_image LIKE 'data:image/png;base64,%' AND length(signature_image) <= 200000)),
  accepted_text   text NOT NULL,
  signed_at       timestamptz NOT NULL,
  ip_hash         text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent      text NOT NULL DEFAULT '' CHECK (length(user_agent) <= 300),
  signed_hash     text NOT NULL CHECK (signed_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((method = 'desenho') = (signature_image IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS signed_documents_patient_idx ON public.signed_documents (clinic_id, patient_id, signed_at DESC);

CREATE TABLE IF NOT EXISTS public.issued_documents (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                 uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id                uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doc_type                  text NOT NULL CHECK (doc_type IN ('atestado','declaracao_comparecimento','laudo','receita_comum')),
  code_hash                 text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  content_hash              text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  professional_id           uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name         text,
  professional_registration text,
  issued_by                 uuid,
  issued_at                 timestamptz NOT NULL DEFAULT now(),
  revoked_at                timestamptz
);
CREATE INDEX IF NOT EXISTS issued_documents_patient_idx ON public.issued_documents (clinic_id, patient_id, issued_at DESC);

ALTER TABLE public.patient_portal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signed_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_documents     ENABLE ROW LEVEL SECURITY;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.issued_documents;
-- DROP TABLE IF EXISTS public.signed_documents;
-- DROP TABLE IF EXISTS public.signature_requests;
-- DROP TABLE IF EXISTS public.patient_portal_links;


-- ############################################################
-- 6/8 portal + assinatura: policies (obrigatorio)
-- ############################################################

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


-- ############################################################
-- 7/8 contratos: tabelas
-- ############################################################

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRATOS DE PACIENTE COM STATUS E MODELOS DE CONTRATO DA CLÍNICA
-- Criado em: 2026-11-18
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pré-requisito: supabase/migrations/20261117_portal_assinatura.sql (signature_requests, signed_documents).
--
-- Duas tabelas novas, aditivas (nada existente é alterado):
--   * contract_templates — modelos de contrato da clínica (texto com campos {{paciente}}, {{valor}}...).
--                          O texto padrão antigo (CONTRATADA / CONTRATANTE) é o modelo inicial, que o app oferece
--                          em código quando a clínica ainda não tem nenhum salvo.
--   * contracts          — contrato de UM paciente: texto, vigência, valor, forma de pagamento, profissional, pacote
--                          opcional e o estado: rascunho | enviado | assinado | cancelado. "Vencido" NÃO é gravado:
--                          é calculado (assinado + término da vigência já passou), para nunca ficar desatualizado.
--                          O envio reaproveita o mecanismo existente: cria um signature_request (doc_type 'contrato')
--                          preso a um link do paciente e guarda o id em signature_request_id. A assinatura continua
--                          sendo gravada em signed_documents (imutável); o contrato só aponta para ela.
--
-- Segurança: RLS LIGADO nas duas SEM policies de escrita (o navegador não grava nada). Quem lê e grava é o servidor
-- (rotas /api/contratos), com a clínica sempre vinda do usuário logado e a permissão do módulo Prontuário.
-- As policies de leitura e os gatilhos ficam em
-- supabase/pendente-colar-sql-editor/20261118_contratos_policies.sql (colar no SQL Editor).
-- O app detecta a ausência das tabelas e mostra uma mensagem neutra (o resto do prontuário segue como antes).
--
-- Desfazer: bloco ROLLBACK no fim do arquivo (apaga as duas tabelas e os dados delas).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contract_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(btrim(name)) > 0 AND length(name) <= 80),
  body       text NOT NULL CHECK (length(body) BETWEEN 30 AND 20000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contract_templates_clinic_idx ON public.contract_templates (clinic_id, name);

CREATE TABLE IF NOT EXISTS public.contracts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id            uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id           uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  template_id          uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  title                text NOT NULL CHECK (length(btrim(title)) > 0 AND length(title) <= 120),
  content_text         text NOT NULL CHECK (length(content_text) BETWEEN 30 AND 20000),
  status               text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviado','assinado','cancelado')),
  valid_from           date,
  valid_until          date,
  amount               numeric CHECK (amount IS NULL OR amount >= 0),
  payment_method       text CHECK (payment_method IS NULL OR length(payment_method) <= 60),
  professional_id      uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  package_id           uuid,        -- patient_packages.id quando o contrato foi feito a partir de um pacote (sem FK: a tabela é opcional)
  signature_request_id uuid UNIQUE REFERENCES public.signature_requests(id) ON DELETE SET NULL,
  content_hash         text CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
  sent_at              timestamptz,
  signed_at            timestamptz,
  cancelled_at         timestamptz,
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until >= valid_from)
);
CREATE INDEX IF NOT EXISTS contracts_patient_idx ON public.contracts (clinic_id, patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contracts_clinic_status_idx ON public.contracts (clinic_id, status, valid_until);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts          ENABLE ROW LEVEL SECURITY;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.contracts;
-- DROP TABLE IF EXISTS public.contract_templates;


-- ############################################################
-- 8/8 contratos: policies
-- ############################################################

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


-- ############################################################
-- 9/10 fluxo iniciar atendimento (idempotente)
-- ############################################################

-- Fluxo "Iniciar atendimento": recepção (paciente chegou / aguardando) e atendimento (em atendimento / atendido).
-- Idempotente: pode rodar mais de uma vez. NÃO altera nem remove nenhum status ou coluna existente.
--
-- Status: appointments.status é texto livre (sem CHECK, confirmado no banco em 2026-11-11), então os dois status
-- novos entram só por valor, sem DDL:
--   'arrived'     = paciente chegou, aguardando atendimento
--   'in_progress' = em atendimento
-- Os existentes seguem iguais: agendado, confirmado, concluido (= atendido), cancelado, faltou, bloqueado.
-- A restrição appointments_no_double_booking só exclui 'cancelado', então os novos status continuam ocupando o horário.
--
-- Cronômetro: o início e o fim ficam gravados aqui; a tela do profissional calcula o tempo a partir de started_at
-- (por isso o cronômetro retoma sozinho se a página recarregar). Nenhuma dessas colunas vai para o portal/link do paciente
-- (o portal lê colunas explícitas de appointments).

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS arrived_at   timestamptz,  -- já existe (20261104_agenda_escala.sql); repetido por segurança
  ADD COLUMN IF NOT EXISTS called_at    timestamptz,  -- paciente chamado na fila (sem mensagem automática)
  ADD COLUMN IF NOT EXISTS started_at   timestamptz,  -- início do atendimento
  ADD COLUMN IF NOT EXISTS finished_at  timestamptz,  -- fim do atendimento
  ADD COLUMN IF NOT EXISTS started_by   uuid,         -- auth.users.id de quem iniciou (opcional, sem FK de propósito)
  ADD COLUMN IF NOT EXISTS finished_by  uuid;         -- auth.users.id de quem finalizou (opcional, sem FK de propósito)

-- Fila do dia: poucas linhas por clínica estão "aguardando" ou "em atendimento"; índice parcial barato.
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_flow
  ON public.appointments (clinic_id, scheduled_at)
  WHERE status IN ('arrived', 'in_progress');

-- RLS: as policies existentes (clinic_isolation e restrict_agenda_by_professional) já cobrem as colunas novas.
-- Não há CHECK de status, então não existe arquivo em pendente-colar-sql-editor para este recurso.


-- ############################################################
-- 10/11 modelos de texto de documento: tabela
-- ############################################################

-- ═══════════════════════════════════════════════════════════════════════════
-- MODELOS DE TEXTO DE ATESTADO / DECLARAÇÃO / LAUDO DA CLÍNICA (importados por foto ou editados)
-- Criado em: 2026-11-19
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Uma tabela nova, aditiva (nada existente é alterado). clinic_document_templates guarda o PAPEL TIMBRADO (pdf_url e
-- posição dos campos) e não serve para isto: aqui mora o TEXTO do modelo, com campos {{paciente}}, {{data}}...
-- (catálogo em src/lib/documentos/camposModelo.ts). Um modelo por clínica e por chave (`<tipo>.<finalidade>` ou
-- `laudo`, a mesma de modeloKey() em src/lib/documentos/atestado.ts); salvar de novo SUBSTITUI. Sem linha, o
-- formulário estruturado usa o modelo padrão do sistema (MODELOS_PADRAO).
--
-- A IMAGEM enviada na importação NUNCA é guardada: só o texto que a pessoa revisou e confirmou chega aqui.
--
-- Segurança: RLS LIGADO SEM policies de escrita (o navegador não grava). Quem lê e grava é o servidor (rotas
-- /api/documentos/modelos), com a clínica sempre vinda do usuário logado e a permissão do módulo Prontuário.
-- A policy de leitura fica em supabase/pendente-colar-sql-editor/20261119_document_text_models_policies.sql.
-- O app detecta a ausência da tabela e mostra mensagem neutra (o formulário segue com o modelo padrão).
--
-- Desfazer: bloco ROLLBACK no fim (apaga a tabela e os modelos salvos).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.document_text_models (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  model_key  text NOT NULL CHECK (model_key IN (
    'atestado.afastamento', 'atestado.comparecimento', 'atestado.aptidao', 'atestado.acompanhante',
    'declaracao_comparecimento.comparecimento', 'declaracao_comparecimento.acompanhante', 'laudo'
  )),
  name       text NOT NULL CHECK (length(btrim(name)) > 0 AND length(name) <= 80),
  body       text NOT NULL CHECK (length(body) BETWEEN 20 AND 6000),
  source     text NOT NULL DEFAULT 'foto_ia' CHECK (source IN ('foto_ia', 'manual')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, model_key)
);

ALTER TABLE public.document_text_models ENABLE ROW LEVEL SECURITY;

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.document_text_models;


-- ############################################################
-- 11/11 modelos de texto: policies
-- ############################################################

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
