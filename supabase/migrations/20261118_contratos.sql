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
