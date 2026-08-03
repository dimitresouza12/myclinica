-- ═══════════════════════════════════════════════════════════════════════════
-- MODAL DE BOAS-VINDAS — mostra o checklist uma vez ao entrar pela 1ª vez
-- Criado em: 2026-08-03
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Complementa onboarding_dismissed (20260803_onboarding_checklist.sql): aquela
-- coluna marca item por item; essa aqui é um flag único — "essa clínica já
-- viu o modal de boas-vindas", pra não abrir de novo sozinho a cada login.
-- O card no dashboard continua aparecendo normalmente até os itens serem
-- concluídos ou dispensados — fechar o modal não conta como "já feito".

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS onboarding_modal_seen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinics.onboarding_modal_seen IS
  'true depois que o usuário fecha o modal de boas-vindas pela 1ª vez. Não indica que os passos foram concluídos — só que o modal não deve abrir sozinho de novo.';
