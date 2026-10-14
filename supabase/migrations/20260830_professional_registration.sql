-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTRO PROFISSIONAL (CRO/CRM/CRMV...) — professionals.registration_number
-- Criado em: 2026-08-30
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Texto livre (não estruturado por conselho/UF) — o profissional digita o
-- número do jeito que preferir (ex: "CRO-SP 12345"). Usado pra preencher
-- automaticamente o cabeçalho de documentos como a Receita de Controle
-- Especial no prontuário, em vez de deixar o campo em branco pra escrever
-- à mão toda vez.

ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS registration_number text;

COMMENT ON COLUMN public.professionals.registration_number IS
  'Registro profissional (CRO, CRM, CRMV, CRP, CREFITO...) — texto livre, formato varia por conselho. Preenche automaticamente documentos como a Receita de Controle Especial.';
