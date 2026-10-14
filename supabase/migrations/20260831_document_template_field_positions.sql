-- ═══════════════════════════════════════════════════════════════════════════
-- CALIBRAÇÃO DE CAMPOS POR MODELO DE DOCUMENTO
-- Criado em: 2026-08-31
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hoje, quando a clínica sobe seu próprio papel timbrado (imagem/PDF), o
-- sistema sempre escreve "Paciente / Data" no mesmo canto fixo, sem saber
-- onde ficam os campos naquele desenho específico. Essa coluna guarda, por
-- modelo (clinic_id + type), a posição calibrada de cada campo — em % da
-- imagem, não px, mesmo princípio de Annotation.x/y do Corpograma/Faceograma
-- (estável independente do tamanho de tela). Array vazio = comportamento
-- atual sem mudança (stub fixo), então nenhuma clínica existente é afetada
-- até calibrar. Mesmo padrão de jsonb já usado em body_protocols/
-- aesthetic_protocols (medical_records).

ALTER TABLE public.clinic_document_templates
  ADD COLUMN IF NOT EXISTS field_positions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.clinic_document_templates.field_positions IS
  'Posições calibradas dos campos sobre o papel timbrado próprio da clínica (ver DocumentFieldCalibrator.tsx e TemplateFieldCanvas.tsx). [] = sem calibração, usa o stub fixo padrão.';
