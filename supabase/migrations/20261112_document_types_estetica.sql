-- ═══════════════════════════════════════════════════════════════════════════
-- Tipos de documento da Estética: TCLE e Termo de uso de imagem
-- Criado em: 2026-11-12   (NÃO aplicada em produção — aplicar só com aprovação)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- clinic_document_templates.type tem CHECK com os 5 tipos originais
-- (receita_comum, receita_especial, declaracao_comparecimento, atestado, laudo).
-- Sem alargar a CHECK, a clínica não consegue subir/calibrar papel timbrado de
-- 'tcle' e 'termo_imagem' (o INSERT/UPSERT falha). Esta migration só amplia a
-- lista de valores aceitos: nenhuma linha existente muda.
--
-- O nome da CHECK original não está versionado nas migrations (a tabela foi
-- criada fora delas). Por isso o bloco abaixo localiza e remove qualquer CHECK da
-- tabela cuja definição cite os tipos de documento, e recria uma com nome fixo.
-- Idempotente: rodar de novo apenas troca a CHECK pela mesma definição.
--
-- Depois de aplicar: trocar ESTETICA_EXTRA_DOCUMENTS_ENABLED para true em
-- src/lib/specialtyConfig.tsx (o código esconde os 2 tipos até lá).
--
-- Desfazer: bloco ROLLBACK no fim.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.clinic_document_templates'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%receita_comum%'
  LOOP
    EXECUTE format('ALTER TABLE public.clinic_document_templates DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.clinic_document_templates
    ADD CONSTRAINT clinic_document_templates_type_check
    CHECK (type IN (
      'receita_comum', 'receita_especial', 'declaracao_comparecimento', 'atestado', 'laudo',
      'tcle', 'termo_imagem'
    ));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (falha se já existir modelo salvo de 'tcle'/'termo_imagem'; apague essas
-- linhas antes, ou mantenha a CHECK ampla)
--
--   ALTER TABLE public.clinic_document_templates DROP CONSTRAINT IF EXISTS clinic_document_templates_type_check;
--   ALTER TABLE public.clinic_document_templates
--     ADD CONSTRAINT clinic_document_templates_type_check
--     CHECK (type IN ('receita_comum', 'receita_especial', 'declaracao_comparecimento', 'atestado', 'laudo'));
-- ═══════════════════════════════════════════════════════════════════════════
