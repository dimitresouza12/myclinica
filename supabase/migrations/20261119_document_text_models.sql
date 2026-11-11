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
