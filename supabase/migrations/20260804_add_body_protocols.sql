-- ═══════════════════════════════════════════════════════════════════════════
-- PRONTUÁRIO — Corpograma (protocolos de estética corporal)
-- Criado em: 2026-08-04
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Novo campo irmão de aesthetic_protocols/odontogram (widget "Faceograma"/
-- "Odontograma" no prontuário) para registrar sessões e pontos marcados de
-- procedimentos corporais (criolipólise, drenagem, radiofrequência etc.),
-- exclusivo de clínicas do tipo 'estetica'.

ALTER TABLE public.medical_records
  ADD COLUMN IF NOT EXISTS body_protocols jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.medical_records.body_protocols IS
  'Sessões e pontos marcados no widget "Corpograma" do prontuário (procedimentos estéticos corporais). Mesmo formato de aesthetic_protocols, mas para o corpo.';
