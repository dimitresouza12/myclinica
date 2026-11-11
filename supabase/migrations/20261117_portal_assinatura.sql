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
