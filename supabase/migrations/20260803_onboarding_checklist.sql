-- ═══════════════════════════════════════════════════════════════════════════
-- CHECKLIST DE PRIMEIROS PASSOS — dispensa manual por item
-- Criado em: 2026-08-03
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O checklist do dashboard é derivado de dados reais (tem procedimento com
-- preço? tem profissional cadastrado? etc.) — assim nunca fica desatualizado
-- sozinho. Mas o usuário também pode marcar "já feito" manualmente num item
-- (ex: já configurou por fora, ou simplesmente quer parar de ver o aviso).
-- Essa coluna guarda só os itens dispensados manualmente; a lista real de
-- itens/chaves vive no código do app, não no banco.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS onboarding_dismissed text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.clinics.onboarding_dismissed IS
  'Chaves dos itens do checklist de primeiros passos que o usuário marcou manualmente como concluídos (ex: {"pricing","team"}). Some do dashboard mesmo se os dados reais ainda não confirmarem o passo.';
