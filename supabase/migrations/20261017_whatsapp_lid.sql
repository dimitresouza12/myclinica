-- ═══════════════════════════════════════════════════════════════════════════
-- WhatsApp — ligação entre o identificador interno (@lid) e o telefone do contato
-- Criado em: 2026-10-13
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O WhatsApp às vezes identifica um contato só por um código interno ("<id>@lid") e, em outra
-- mensagem, pelo telefone. Sem guardar essa ligação, a mesma pessoa vira duas conversas e dois leads.
--
-- whatsapp_conversations.lid  id do @lid (sem o sufixo) que já foi visto junto do telefone desta conversa.
--                             Quando chega uma mensagem só com o @lid, a conversa é achada por aqui.
--
-- Aditiva: ADD COLUMN nulo + índice, em tabela nova do WhatsApp. Nada existente muda.

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS lid text;

CREATE INDEX IF NOT EXISTS idx_wa_conv_lid
  ON public.whatsapp_conversations (clinic_id, lid) WHERE lid IS NOT NULL;
