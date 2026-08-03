-- ═══════════════════════════════════════════════════════════════════════════
-- PROCEDIMENTOS — distinguir "gratuito de propósito" de "preço a definir"
-- Criado em: 2026-08-03
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Antes, price = 0 significava as duas coisas ao mesmo tempo: "avaliação
-- gratuita" (intencional) e "ainda não defini o preço" (pendência). Os dois
-- casos já corretamente não geram receita ao concluir um agendamento — mas
-- o segundo caso precisa avisar o usuário antes, e o primeiro não.

ALTER TABLE public.procedures
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.procedures.is_free IS
  'Marca um procedimento de preço zero como intencionalmente gratuito (ex: avaliação). Sem essa marcação, price=0 é tratado como "preço ainda não definido" e gera aviso ao concluir um agendamento.';
