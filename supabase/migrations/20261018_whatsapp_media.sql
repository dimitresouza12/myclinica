-- ═══════════════════════════════════════════════════════════════════════════
-- WhatsApp — imagem, documento, áudio e vídeo dentro das conversas (Etapa 2, fase de mídia)
-- Criado em: 2026-10-14
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plano: vault Obsidian → MyClinica/Plano — WhatsApp, Confirmação e CRM.md (Etapa 2)
--
-- O arquivo NÃO fica para sempre: é uma cópia temporária (poucos dias) num bucket privado. Depois a
-- limpeza apaga o arquivo e a mensagem continua na conversa com o aviso "arquivo removido"; enquanto
-- o WhatsApp ainda tiver o arquivo, dá para baixar de novo. A miniatura fica no banco.
--
-- whatsapp_messages (colunas novas, todas nulas em mensagem de texto)
--   media_status      pending (baixando) | ready (disponível) | failed (não deu para baixar) | expired (cópia removida)
--   media_mime        tipo do arquivo (image/jpeg, application/pdf…)
--   media_name        nome do arquivo (documentos)
--   media_size        tamanho em bytes
--   media_seconds     duração de áudio/vídeo
--   media_path        caminho no bucket whatsapp-media (<clinic_id>/<conversation_id>/<message_id>)
--   media_expires_at  quando a cópia pode ser apagada
--   media_thumb       miniatura JPEG em base64 (pequena), para mostrar algo antes de abrir
--
-- whatsapp_media_source  o que é preciso para baixar o arquivo de novo do WhatsApp (contém a chave do
--                        arquivo). SEM nenhuma política: só o servidor (service role) lê e grava.
--
-- Bucket whatsapp-media: privado e SEM política em storage.objects. O navegador nunca acessa o bucket
-- direto: a rota de API confere a permissão do usuário e devolve um link assinado de poucos minutos.
--
-- Aditiva: só ADD COLUMN nulo, tabela nova e bucket novo. Nada existente muda.

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_status     text CHECK (media_status IN ('pending', 'ready', 'failed', 'expired')),
  ADD COLUMN IF NOT EXISTS media_mime       text,
  ADD COLUMN IF NOT EXISTS media_name       text,
  ADD COLUMN IF NOT EXISTS media_size       integer CHECK (media_size IS NULL OR media_size >= 0),
  ADD COLUMN IF NOT EXISTS media_seconds    integer CHECK (media_seconds IS NULL OR media_seconds >= 0),
  ADD COLUMN IF NOT EXISTS media_path       text,
  ADD COLUMN IF NOT EXISTS media_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS media_thumb      text;

-- a limpeza diária procura só as mensagens com cópia que já pode sair
CREATE INDEX IF NOT EXISTS idx_wa_messages_media_expiry
  ON public.whatsapp_messages (media_expires_at) WHERE media_status = 'ready';

CREATE TABLE IF NOT EXISTS public.whatsapp_media_source (
  message_id  uuid        PRIMARY KEY REFERENCES public.whatsapp_messages(id) ON DELETE CASCADE,
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  raw         jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS ligada e nenhuma política: somente a service role (servidor) enxerga esta tabela.
ALTER TABLE public.whatsapp_media_source ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_wa_media_source_created ON public.whatsapp_media_source (created_at);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-media', 'whatsapp-media', false, 20971520)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.whatsapp_media_source IS
  'Dados para baixar de novo uma mídia do WhatsApp (inclui a chave do arquivo). Sem política de RLS: só o servidor acessa.';
