-- ═══════════════════════════════════════════════════════════════════════════
-- WhatsApp — onda do áudio (as barrinhas do player, como no WhatsApp)
-- Criado em: 2026-10-14
-- ═══════════════════════════════════════════════════════════════════════════
--
-- whatsapp_messages.media_wave  até 64 valores de 0 a 100 (um byte cada), em base64. Vem pronto na mensagem de
--                               áudio do WhatsApp; nos áudios gravados pelo sistema é calculado no navegador.
--
-- Aditiva: ADD COLUMN nulo. Nada existente muda.

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_wave text CHECK (media_wave IS NULL OR char_length(media_wave) <= 140);
