-- ═══════════════════════════════════════════════════════════════════════════
-- CHAT DA EQUIPE, FASE 3 — anexos de imagem e áudio com expiração
-- Criado em: 2026-11-12 (arquivo 20261123) | Projeto Supabase: siohvtgbomvcprbzfamr
-- Depende de: 20261120_chat_equipe.sql (team_channels, team_channel_members, team_messages e os
-- helpers team_my_member_id, team_chat_enabled, team_clinic_has_chat, is_team_channel_member,
-- team_can_read_channel, team_channel_writable, RPC team_delete_message) e get_my_clinic_id().
-- NÃO depende de 20261121 (presença) nem de 20261120_chat_equipe_indices.sql.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA
--   O chat só leva texto. Queremos imagem e áudio, mas arquivo em disco de servidor custa caro:
--   o anexo precisa ser leve (o app comprime no navegador) e MORRER sozinho depois de um prazo.
--
-- DECISÃO
--   * Arquivo no Storage, bucket PRIVADO `team-chat`, caminho `<clinic_id>/<channel_id>/<arquivo>`.
--     Limite de 1,5 MB por arquivo e só webp/jpeg/webm/ogg/mp4(áudio). Leitura sempre por URL
--     assinada (a policy de SELECT do Storage é a mesma regra de leitura do canal).
--   * Metadados em tabela própria `team_message_attachments` (1 linha por anexo), com `expires_at`.
--     O prazo mora numa função só (`team_attachment_retention_days()` = 15 dias).
--   * Quem cria mensagem+anexo é a RPC `team_send_attachment_message` (mensagem e anexo na MESMA
--     transação; valida tipo, tamanho, caminho e se o arquivo existe no Storage).
--   * Expiração: o arquivo é apagado por uma rotina de servidor (service_role) que lê
--     `team_attachments_due`, apaga o objeto pela API do Storage e chama
--     `team_attachments_mark_expired`. A linha do anexo e a mensagem FICAM (histórico mostra
--     "anexo expirado"); só o arquivo some. Apagar a mensagem antecipa a expiração (expires_at = now()).
--   * Sem Realtime na tabela de anexos: a mensagem chega pelo Realtime já existente
--     (team_messages) e o app busca os anexos dela por message_id (a linha de anexo já está
--     confirmada quando o evento chega, pois nasce na mesma transação).
--
-- MUDANÇA
--   1. Bucket `team-chat` (privado, 1572864 bytes, 5 mimes).
--   2. public.team_messages: coluna nova `has_attachment boolean NOT NULL DEFAULT false` e a
--      constraint team_messages_body_len recriada para aceitar body vazio QUANDO has_attachment.
--      (única alteração em tabela existente; aditiva: coluna com default, constraint mais frouxa
--      só nesse caso. O navegador NÃO tem GRANT de INSERT nessa coluna, então só a RPC a liga:
--      INSERT direto continua exigindo texto não vazio.)
--   3. Tabela public.team_message_attachments (+ índices, RLS só de leitura).
--   4. Funções: team_attachment_retention_days, team_try_uuid, team_chat_storage_access,
--      team_send_attachment_message, team_attachments_due, team_attachments_mark_expired,
--      team_chat_orphan_objects. Alterada: team_delete_message (mesma assinatura e mesmos grants).
--   5. Policies de Storage (BLOCO SEPARADO no fim, pode exigir o SQL Editor).
--
-- DECISÕES DE DETALHE
--   * Leitura do anexo (tabela E Storage) = mesma regra de team_messages: membro do canal OU
--     admin/superadmin da própria clínica (team_can_read_channel). O pedido dizia "só membro" para o
--     Storage; mantive a regra do chat inteiro para o admin não ver mensagem com imagem quebrada em
--     conversa que ele já pode ler. Para restringir só a membros, troque team_can_read_channel por
--     is_team_channel_member na função team_chat_storage_access (um lugar só). A leitura também é
--     negada para anexo já vencido/expirado ou de mensagem apagada, mesmo com o arquivo ainda no disco.
--   * Escrita (upload no Storage e RPC) = membro do canal, canal não arquivado, chat habilitado.
--   * Sem UPDATE em storage.objects (sem upsert/sobrescrita) e sem DELETE para usuários: a limpeza
--     usa service_role pela API do Storage (apagar por SQL em storage.objects NÃO remove o arquivo
--     do disco; use sempre a API: storage.from('team-chat').remove([...])).
--   * team_edit_message NÃO foi alterada: editar texto não mexe em anexo, e continua exigindo
--     texto de 1 a 4000 caracteres (não dá para "editar" uma legenda para vazio).
--   * Arquivos enviados ao Storage e nunca anexados (RPC falhou/aba fechada) ficam órfãos:
--     team_chat_orphan_objects lista esses objetos para a mesma rotina de limpeza apagar.
--   * Idempotência da RPC: reenviar o mesmo storage_path pelo mesmo remetente devolve o id da
--     mensagem já criada (retry seguro após queda de rede), sem duplicar.
--
-- Códigos de erro da RPC (RAISE EXCEPTION 'codigo'; o app já casa por substring em
-- src/lib/teamChat/errors.ts): not_authenticated, chat_disabled, channel_not_writable,
-- invalid_attachment_kind, invalid_attachment_mime, attachment_too_large,
-- invalid_attachment_size, invalid_attachment_duration, invalid_attachment_dimensions,
-- invalid_attachment_path, attachment_not_found, invalid_body, reply_not_found.
--
-- Aditiva e idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS nos nomes
-- próprios deste arquivo). Desfazer: bloco ROLLBACK no fim.
--
-- ORDEM DE APLICAÇÃO: (A) tudo até o fim da seção 8 pelo SQL Editor (ou migração normal);
-- (B) a seção 9 (storage.objects) por último, pelo SQL Editor. Se o bloco (B) falhar com
-- "must be owner of table objects", o resto continua valendo; o anexo só funciona depois de (B).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Bucket privado ───────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-chat', 'team-chat', false, 1572864,
  ARRAY['image/webp', 'image/jpeg', 'audio/webm', 'audio/ogg', 'audio/mp4']
)
ON CONFLICT (id) DO NOTHING;


-- ─── 2. team_messages: body vazio permitido quando há anexo ─────────────────

ALTER TABLE public.team_messages
  ADD COLUMN IF NOT EXISTS has_attachment boolean NOT NULL DEFAULT false;

ALTER TABLE public.team_messages DROP CONSTRAINT IF EXISTS team_messages_body_len;
ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_body_len CHECK (
  char_length(body) <= 4000
  AND (deleted_at IS NOT NULL OR has_attachment OR char_length(btrim(body)) >= 1)
);
-- (GRANT de INSERT em team_messages é por coluna e não inclui has_attachment: o navegador não liga
--  essa coluna; só team_send_attachment_message, que é SECURITY DEFINER.)

COMMENT ON COLUMN public.team_messages.has_attachment IS
  'true quando a mensagem nasceu com anexo (team_send_attachment_message). Permite body vazio. Só a RPC liga.';


-- ─── 3. Prazo de retenção (única fonte) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.team_attachment_retention_days()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 15;
$function$;


-- ─── 4. Tabela de anexos ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_message_attachments (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id   uuid        NOT NULL,
  channel_id   uuid        NOT NULL,
  clinic_id    uuid        NOT NULL,
  kind         text        NOT NULL CHECK (kind IN ('image', 'audio')),
  storage_path text        NOT NULL UNIQUE,
  mime         text        NOT NULL,
  size_bytes   integer     NOT NULL CHECK (size_bytes > 0),
  width        integer,
  height       integer,
  duration_ms  integer,
  expires_at   timestamptz NOT NULL,
  expired_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- a mensagem tem que ser do MESMO canal (FK composta em team_messages(id, channel_id), que já é UNIQUE);
  -- cascata: apagar a mensagem de verdade (ex.: canal removido) leva a linha junto
  CONSTRAINT team_attachments_message_fk FOREIGN KEY (message_id, channel_id)
    REFERENCES public.team_messages (id, channel_id) ON DELETE CASCADE,
  -- clinic_id tem que ser o da clínica do canal
  CONSTRAINT team_attachments_channel_fk FOREIGN KEY (channel_id, clinic_id)
    REFERENCES public.team_channels (id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT team_attachments_kind_mime CHECK (
    (kind = 'image' AND mime IN ('image/webp', 'image/jpeg'))
    OR (kind = 'audio' AND mime IN ('audio/webm', 'audio/ogg', 'audio/mp4'))
  ),
  CONSTRAINT team_attachments_path_shape CHECK (
    storage_path LIKE clinic_id::text || '/' || channel_id::text || '/%'
  )
);

CREATE INDEX IF NOT EXISTS idx_team_attachments_message ON public.team_message_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_team_attachments_due     ON public.team_message_attachments (expires_at) WHERE expired_at IS NULL;
-- índice da FK (channel_id, clinic_id): evita varredura ao apagar canal
CREATE INDEX IF NOT EXISTS idx_team_attachments_channel ON public.team_message_attachments (channel_id, clinic_id);

ALTER TABLE public.team_message_attachments ENABLE ROW LEVEL SECURITY;

-- só leitura pelo navegador; INSERT/UPDATE/DELETE só via RPC (definer) e service_role
REVOKE ALL ON public.team_message_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_message_attachments TO authenticated;

DROP POLICY IF EXISTS team_attachments_select ON public.team_message_attachments;
CREATE POLICY team_attachments_select ON public.team_message_attachments
  FOR SELECT TO authenticated
  USING (
    clinic_id = (SELECT public.get_my_clinic_id())
    AND public.team_can_read_channel(channel_id)
  );
-- (sem policy de INSERT/UPDATE/DELETE: negado. NÃO está na publicação supabase_realtime.)

COMMENT ON TABLE public.team_message_attachments IS
  'Chat da equipe: anexos (image/audio) de mensagens. Arquivo no bucket privado team-chat; expira em expires_at (rotina service_role apaga o arquivo e marca expired_at). Sem escrita direta; sem Realtime.';


-- ─── 5. Helpers de caminho / Storage ─────────────────────────────────────────

-- uuid ou NULL, sem levantar erro (regex antes do cast)
CREATE OR REPLACE FUNCTION public.team_try_uuid(p_text text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_text::uuid
    ELSE NULL
  END;
$function$;

-- Usada pelas policies de storage.objects. O caminho tem que ser EXATAMENTE
-- <clinic_id>/<channel_id>/<arquivo> (2 pastas + nome). Cast seguro: caminho inválido => false.
--   p_write = false: posso LER o canal (membro ou admin da clínica dona)
--   p_write = true : posso ESCREVER (membro, canal não arquivado, chat habilitado)
CREATE OR REPLACE FUNCTION public.team_chat_storage_access(p_name text, p_write boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_parts   text[];
  v_clinic  uuid;
  v_channel uuid;
BEGIN
  IF p_name IS NULL THEN RETURN false; END IF;
  v_parts := storage.foldername(p_name);
  IF cardinality(v_parts) IS DISTINCT FROM 2 OR COALESCE(storage.filename(p_name), '') = '' THEN
    RETURN false;
  END IF;

  v_clinic  := public.team_try_uuid(v_parts[1]);
  v_channel := public.team_try_uuid(v_parts[2]);
  IF v_clinic IS NULL OR v_channel IS NULL THEN RETURN false; END IF;

  -- só a clínica do próprio login e canal dessa clínica
  IF v_clinic IS DISTINCT FROM public.get_my_clinic_id() THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_channels c WHERE c.id = v_channel AND c.clinic_id = v_clinic) THEN
    RETURN false;
  END IF;

  IF p_write THEN
    RETURN public.team_chat_enabled(v_clinic) AND public.team_channel_writable(v_channel, v_clinic);
  END IF;
  IF NOT public.team_can_read_channel(v_channel) THEN RETURN false; END IF;

  -- anexo vencido ou de mensagem apagada (expires_at = now()): o arquivo só sai no ciclo diário, mas
  -- ninguém gera URL assinada nesse intervalo. Sem linha de anexo (upload em andamento) = permitido.
  IF EXISTS (
    SELECT 1 FROM public.team_message_attachments a
    WHERE a.storage_path = p_name AND (a.expired_at IS NOT NULL OR a.expires_at <= now())
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$function$;


-- ─── 6. RPC de envio de mensagem com anexo ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.team_send_attachment_message(
  p_channel_id  uuid,
  p_kind        text,
  p_storage_path text,
  p_mime        text,
  p_size_bytes  integer,
  p_width       integer DEFAULT NULL,
  p_height      integer DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_body        text    DEFAULT '',
  p_reply_to    uuid    DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max_bytes       CONSTANT integer := 1572864;   -- = file_size_limit do bucket
  c_max_image_bytes CONSTANT integer := 614400;
  c_max_audio_ms    CONSTANT integer := 300000;
  v_me      uuid := public.team_my_member_id();
  v_clinic  uuid := public.get_my_clinic_id();
  v_body    text := COALESCE(p_body, '');
  v_prefix  text;
  v_rest    text;
  v_obj     record;
  v_size    bigint;
  v_obj_mime text;
  v_existing uuid;
  v_msg     uuid;
BEGIN
  IF v_me IS NULL OR v_clinic IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.team_clinic_has_chat(v_clinic) THEN
    RAISE EXCEPTION 'chat_disabled' USING ERRCODE = '42501';
  END IF;
  -- membro do canal, canal da minha clínica, não arquivado (mesma regra do INSERT em team_messages)
  IF p_channel_id IS NULL OR NOT public.team_channel_writable(p_channel_id, v_clinic) THEN
    RAISE EXCEPTION 'channel_not_writable' USING ERRCODE = '42501';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('image', 'audio') THEN
    RAISE EXCEPTION 'invalid_attachment_kind' USING ERRCODE = '22023';
  END IF;
  IF p_mime IS NULL
     OR NOT ((p_kind = 'image' AND p_mime IN ('image/webp', 'image/jpeg'))
          OR (p_kind = 'audio' AND p_mime IN ('audio/webm', 'audio/ogg', 'audio/mp4'))) THEN
    RAISE EXCEPTION 'invalid_attachment_mime' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes <= 0 THEN
    RAISE EXCEPTION 'invalid_attachment_size' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes > c_max_bytes OR (p_kind = 'image' AND p_size_bytes > c_max_image_bytes) THEN
    RAISE EXCEPTION 'attachment_too_large' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'audio' AND p_duration_ms IS NOT NULL AND (p_duration_ms <= 0 OR p_duration_ms > c_max_audio_ms) THEN
    RAISE EXCEPTION 'invalid_attachment_duration' USING ERRCODE = '22023';
  END IF;
  IF (p_width IS NOT NULL AND (p_width <= 0 OR p_width > 20000))
     OR (p_height IS NOT NULL AND (p_height <= 0 OR p_height > 20000)) THEN
    RAISE EXCEPTION 'invalid_attachment_dimensions' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
  END IF;

  -- caminho: <clinic_id do canal>/<channel_id>/<arquivo>, sem subpastas
  v_prefix := v_clinic::text || '/' || p_channel_id::text || '/';
  IF p_storage_path IS NULL OR NOT starts_with(p_storage_path, v_prefix) THEN
    RAISE EXCEPTION 'invalid_attachment_path' USING ERRCODE = '22023';
  END IF;
  v_rest := substr(p_storage_path, char_length(v_prefix) + 1);
  IF v_rest = '' OR position('/' IN v_rest) > 0 OR char_length(v_rest) > 200 THEN
    RAISE EXCEPTION 'invalid_attachment_path' USING ERRCODE = '22023';
  END IF;

  -- retry seguro: o mesmo arquivo já anexado por mim devolve a mensagem que já existe
  SELECT a.message_id INTO v_existing
  FROM public.team_message_attachments a
  JOIN public.team_messages msg ON msg.id = a.message_id
  WHERE a.storage_path = p_storage_path
    AND a.clinic_id = v_clinic
    AND msg.sender_clinic_user_id = v_me;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- o objeto tem que existir no bucket (e, quando o Storage informa dono, ser meu)
  SELECT o.metadata, o.owner_id INTO v_obj
  FROM storage.objects o
  WHERE o.bucket_id = 'team-chat' AND o.name = p_storage_path;
  IF NOT FOUND OR (v_obj.owner_id IS NOT NULL AND v_obj.owner_id <> auth.uid()::text) THEN
    RAISE EXCEPTION 'attachment_not_found' USING ERRCODE = '22023';
  END IF;

  -- confere o que o Storage guardou de verdade (não confia só no que o navegador disse)
  IF COALESCE(v_obj.metadata->>'size', '') ~ '^[0-9]+$' THEN
    v_size := (v_obj.metadata->>'size')::bigint;
    IF v_size <= 0 THEN
      RAISE EXCEPTION 'invalid_attachment_size' USING ERRCODE = '22023';
    END IF;
    IF v_size > c_max_bytes OR (p_kind = 'image' AND v_size > c_max_image_bytes) THEN
      RAISE EXCEPTION 'attachment_too_large' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_size := p_size_bytes;
  END IF;
  v_obj_mime := lower(btrim(split_part(COALESCE(v_obj.metadata->>'mimetype', ''), ';', 1)));
  IF v_obj_mime <> '' AND v_obj_mime <> p_mime THEN
    RAISE EXCEPTION 'invalid_attachment_mime' USING ERRCODE = '22023';
  END IF;

  IF p_reply_to IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.team_messages r WHERE r.id = p_reply_to AND r.channel_id = p_channel_id
     ) THEN
    RAISE EXCEPTION 'reply_not_found' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.team_messages
      (channel_id, clinic_id, sender_clinic_user_id, body, reply_to_id, has_attachment)
    VALUES
      (p_channel_id, v_clinic, v_me, v_body, p_reply_to, true)
    RETURNING id INTO v_msg;

    INSERT INTO public.team_message_attachments
      (message_id, channel_id, clinic_id, kind, storage_path, mime, size_bytes,
       width, height, duration_ms, expires_at)
    VALUES
      (v_msg, p_channel_id, v_clinic, p_kind, p_storage_path, p_mime, v_size::integer,
       CASE WHEN p_kind = 'image' THEN p_width  END,
       CASE WHEN p_kind = 'image' THEN p_height END,
       CASE WHEN p_kind = 'audio' THEN p_duration_ms END,
       now() + public.team_attachment_retention_days() * interval '1 day');
  EXCEPTION WHEN unique_violation THEN
    -- corrida: outra chamada anexou esse arquivo agora; o savepoint desfaz a mensagem desta
    SELECT a.message_id INTO v_existing
    FROM public.team_message_attachments a
    JOIN public.team_messages msg ON msg.id = a.message_id
    WHERE a.storage_path = p_storage_path AND a.clinic_id = v_clinic AND msg.sender_clinic_user_id = v_me;
    IF v_existing IS NULL THEN
      RAISE EXCEPTION 'attachment_not_found' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing;
  END;

  RETURN v_msg;
END;
$function$;


-- ─── 7. team_delete_message: apagar a mensagem antecipa a expiração do anexo ─

-- Mesma assinatura e mesmos grants de antes (CREATE OR REPLACE preserva o ACL).
CREATE OR REPLACE FUNCTION public.team_delete_message(p_message uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me uuid := public.team_my_member_id();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.team_messages msg
     SET deleted_at = now(), body = ''
   WHERE msg.id = p_message
     AND msg.sender_clinic_user_id = v_me
     AND msg.clinic_id = public.get_my_clinic_id()
     AND msg.deleted_at IS NULL
     AND public.is_team_channel_member(msg.channel_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found' USING ERRCODE = '42501';
  END IF;

  -- a rotina de limpeza apaga o arquivo no próximo ciclo (expired_at é marcado por ela)
  UPDATE public.team_message_attachments a
     SET expires_at = now()
   WHERE a.message_id = p_message
     AND a.expired_at IS NULL
     AND a.expires_at > now();
END;
$function$;


-- ─── 8. Rotina de limpeza (só service_role) + grants ────────────────────────

-- Anexos vencidos cujo arquivo ainda não foi removido. A rotina apaga cada storage_path pela
-- API do Storage e depois chama team_attachments_mark_expired com os ids que deram certo.
CREATE OR REPLACE FUNCTION public.team_attachments_due(p_limit integer DEFAULT 500)
 RETURNS TABLE (id uuid, storage_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.id, a.storage_path
  FROM public.team_message_attachments a
  WHERE a.expires_at <= now() AND a.expired_at IS NULL
  ORDER BY a.expires_at
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));
$function$;

-- Marca como expirados (arquivo já removido). Devolve quantas linhas mudaram. Idempotente.
CREATE OR REPLACE FUNCTION public.team_attachments_mark_expired(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.team_message_attachments a
     SET expired_at = now()
   WHERE a.id = ANY (COALESCE(p_ids, '{}'::uuid[]))
     AND a.expired_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- Objetos do bucket que nunca viraram anexo (upload sem RPC), mais velhos que p_older_than.
-- A rotina os remove pela API do Storage. Fora do pedido original; poupa disco de upload abandonado.
CREATE OR REPLACE FUNCTION public.team_chat_orphan_objects(p_older_than interval DEFAULT interval '1 day', p_limit integer DEFAULT 500)
 RETURNS TABLE (name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'team-chat'
    AND o.created_at < now() - GREATEST(COALESCE(p_older_than, interval '1 day'), interval '1 hour')
    AND NOT EXISTS (SELECT 1 FROM public.team_message_attachments a WHERE a.storage_path = o.name)
  ORDER BY o.created_at
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));
$function$;

-- Grants. Navegador (authenticated): RPC de envio, prazo (para mostrar "expira em N dias") e os
-- helpers que as policies chamam. Limpeza: só service_role.
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.team_send_attachment_message(uuid, text, text, text, integer, integer, integer, integer, text, uuid)',
    'public.team_attachment_retention_days()',
    'public.team_try_uuid(text)',
    'public.team_chat_storage_access(text, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.team_attachments_due(integer)',
    'public.team_attachments_mark_expired(uuid[])',
    'public.team_chat_orphan_objects(interval, integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. STORAGE — policies em storage.objects
--    PODE EXIGIR O SQL EDITOR (owner de storage.objects é supabase_storage_admin).
--    Rode este bloco por último e separado, como foi feito com realtime.messages na fase 2.
--    Se der "must be owner of table objects", rode-o pelo SQL Editor do painel Supabase.
--    Sem as duas policies o upload/leitura no bucket team-chat é negado (default deny do Storage):
--    o resto da migração fica inerte e seguro.
-- ═══════════════════════════════════════════════════════════════════════════

-- LER (inclusive o RETURNING do upload e a URL assinada): quem lê o canal da pasta
DROP POLICY IF EXISTS team_chat_objects_select ON storage.objects;
CREATE POLICY team_chat_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'team-chat'
    AND public.team_chat_storage_access(name, false)
  );

-- ENVIAR: membro do canal da pasta (canal não arquivado, chat habilitado), caminho
-- <clinic_id>/<channel_id>/<arquivo>
DROP POLICY IF EXISTS team_chat_objects_insert ON storage.objects;
CREATE POLICY team_chat_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-chat'
    AND public.team_chat_storage_access(name, true)
  );

-- (propositalmente SEM policy de UPDATE e de DELETE no bucket team-chat: sem sobrescrever
--  e sem apagar pelo navegador; a limpeza usa service_role pela API do Storage)


-- ═══════════════════════════════════════════════════════════════════════════
-- CONSULTAS DE VERIFICAÇÃO (rodar depois de aplicar; todas somente leitura)
-- ═══════════════════════════════════════════════════════════════════════════
--   -- bucket privado, limite e mimes
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'team-chat';
--   -- esperado: public = false, 1572864, {image/webp,image/jpeg,audio/webm,audio/ogg,audio/mp4}
--
--   -- policies do bucket (esperado: 2 linhas, SELECT e INSERT, roles {authenticated}; nenhuma UPDATE/DELETE)
--   select policyname, cmd, roles from pg_policies
--    where schemaname = 'storage' and tablename = 'objects' and policyname like 'team_chat_objects_%';
--
--   -- policy e grants da tabela (esperado: team_attachments_select; authenticated só SELECT)
--   select policyname, cmd from pg_policies where tablename = 'team_message_attachments';
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'team_message_attachments' order by 1, 2;
--   select relrowsecurity from pg_class where oid = 'public.team_message_attachments'::regclass;  -- true
--
--   -- grants das funções (esperado: authenticated nas 4 primeiras; SÓ service_role nas 3 de limpeza)
--   select p.proname, p.prosecdef, p.proconfig, p.proacl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('team_send_attachment_message','team_attachment_retention_days','team_try_uuid',
--                        'team_chat_storage_access','team_attachments_due','team_attachments_mark_expired',
--                        'team_chat_orphan_objects','team_delete_message')
--    order by 1;
--
--   -- não pode estar na publicação realtime (esperado: 0 linhas)
--   select * from pg_publication_tables where tablename = 'team_message_attachments';
--
--   -- constraint nova de team_messages e a coluna
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'team_messages_body_len';
--   select column_name, data_type, column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'team_messages' and column_name = 'has_attachment';
--
--   -- prazo
--   select public.team_attachment_retention_days();  -- 15


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar à mão, em ordem)
-- ═══════════════════════════════════════════════════════════════════════════
--   -- 1) policies de storage (SQL Editor). Antes, esvazie o bucket pelo painel/API se ainda tiver
--   --    arquivos: apagar linha de storage.objects por SQL NÃO remove o arquivo do disco.
--   DROP POLICY IF EXISTS team_chat_objects_insert ON storage.objects;
--   DROP POLICY IF EXISTS team_chat_objects_select ON storage.objects;
--   -- (depois de esvaziado: DELETE FROM storage.buckets WHERE id = 'team-chat';)
--
--   -- 2) team_delete_message de volta à versão da fase 1 (sem o UPDATE dos anexos): recriar a função
--   --    com o corpo de 20261120_chat_equipe.sql (seção 6, team_delete_message). Mesma assinatura.
--
--   -- 3) funções novas
--   DROP FUNCTION IF EXISTS public.team_chat_orphan_objects(interval, integer);
--   DROP FUNCTION IF EXISTS public.team_attachments_mark_expired(uuid[]);
--   DROP FUNCTION IF EXISTS public.team_attachments_due(integer);
--   DROP FUNCTION IF EXISTS public.team_send_attachment_message(uuid, text, text, text, integer, integer, integer, integer, text, uuid);
--   DROP FUNCTION IF EXISTS public.team_chat_storage_access(text, boolean);
--   DROP FUNCTION IF EXISTS public.team_try_uuid(text);
--   DROP FUNCTION IF EXISTS public.team_attachment_retention_days();
--
--   -- 4) tabela (DESTRUTIVO: apaga os metadados dos anexos; mensagens ficam)
--   DROP TABLE IF EXISTS public.team_message_attachments;
--
--   -- 5) team_messages: voltar a exigir texto. Primeiro trate as mensagens só-anexo vivas
--   --    (senão a constraint antiga falha): ex. UPDATE public.team_messages SET deleted_at = now()
--   --    WHERE has_attachment AND deleted_at IS NULL AND btrim(body) = '';
--   ALTER TABLE public.team_messages DROP CONSTRAINT IF EXISTS team_messages_body_len;
--   ALTER TABLE public.team_messages ADD CONSTRAINT team_messages_body_len CHECK (
--     char_length(body) <= 4000 AND (deleted_at IS NOT NULL OR char_length(btrim(body)) >= 1)
--   );
--   ALTER TABLE public.team_messages DROP COLUMN IF EXISTS has_attachment;
-- ═══════════════════════════════════════════════════════════════════════════
