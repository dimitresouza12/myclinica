
-- ===== 20261120_chat_equipe_indices.sql =====
-- Chat da equipe: índices de FK apontados pelo advisor de performance (2026-11-12).
-- Aditiva e idempotente. Sem efeito funcional; só evita varredura ao apagar login/mensagem
-- (ON DELETE SET NULL em sender_clinic_user_id e created_by) e ao validar as FKs compostas.
-- Desfazer: DROP INDEX IF EXISTS public.<nome>;

CREATE INDEX IF NOT EXISTS idx_team_messages_sender   ON public.team_messages (sender_clinic_user_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_reply    ON public.team_messages (reply_to_id, channel_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_messages_chan_clinic ON public.team_messages (channel_id, clinic_id);
CREATE INDEX IF NOT EXISTS idx_team_channels_created_by ON public.team_channels (created_by) WHERE created_by IS NOT NULL;

-- ===== 20261121_chat_equipe_fase2.sql =====
-- ═══════════════════════════════════════════════════════════════════════════
-- CHAT DA EQUIPE, FASE 2 — presença em canal privado + índices da busca
-- Criado em: 2026-11-12 (arquivo 20261121) | Projeto Supabase: siohvtgbomvcprbzfamr
-- Depende de: 20261120_chat_equipe.sql (public.team_messages) e public.get_my_clinic_id() (já existem).
-- NÃO depende de 20261120_chat_equipe_indices.sql (nenhum objeto daquele arquivo é usado nem recriado aqui).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- (a) PRESENÇA FECHADA POR CLÍNICA
--   O app passa a abrir:
--     supabase.channel('team-presence:<clinic_id>', { config: { private: true, presence: { key: <clinic_users.id> } } })
--   Canal private exige policy em realtime.messages para o papel authenticated. Criamos duas:
--     team_presence_select  (SELECT)  = receber/entrar na presença do tópico
--     team_presence_insert  (INSERT)  = publicar a própria presença (track)
--   Ambas valem SOMENTE quando:
--     realtime.messages.extension IN ('presence')
--     AND realtime.topic() = 'team-presence:' || get_my_clinic_id()::text
--   Resultado: um login ativo só entra/vê/publica presença do tópico da PRÓPRIA clínica.
--   Login desativado ou sem clínica => get_my_clinic_id() é NULL => comparação NULL => nega.
--   anon não tem policy (negado). Outra clínica => tópico diferente => negado.
--   Forma verificada em produção (somente leitura, 2026-11-12): realtime.messages tem a coluna
--   `extension` (text), RLS já ligada (relrowsecurity = true), realtime.topic() existe e devolve
--   current_setting('realtime.topic'); e a doc oficial do Realtime Authorization usa exatamente
--   `realtime.messages.extension in ('presence')`.
--
--   O QUE MUDA PARA TÓPICOS DE OUTROS RECURSOS: NADA.
--     * Hoje realtime.messages tem ZERO policies (pg_policies do schema realtime vazio): nenhum
--       canal private existe e nenhuma policy existente é tocada, recriada ou removida.
--     * As duas policies novas só casam com topic 'team-presence:<clinic_id da própria clínica>' E
--       extension 'presence'. Para qualquer outro tópico ou extension (broadcast, outro prefixo)
--       elas não concedem nada. O comportamento atual desses casos (negado em canal private) fica igual.
--     * postgres_changes (team_messages, whatsapp, etc.) NÃO passa por realtime.messages: usa a RLS
--       das próprias tabelas. Não é afetado. Canais públicos (private: false) também não.
--     * Não há ALTER TABLE, GRANT, REVOKE nem mudança de publicação em realtime.*.
--   Limite conhecido: a RLS não consegue validar o `presence.key` (o app usa clinic_users.id). Um login
--   da mesma clínica poderia anunciar presença com a key de colega. Impacto: só a bolinha "online"
--   do colega, dentro da própria clínica. Nenhum dado de paciente ou mensagem trafega no canal.
--
-- (b) ÍNDICES DA BUSCA em public.team_messages (aditivos, parciais em mensagem viva)
--   * idx_team_messages_clinic_recent: (clinic_id, created_at DESC) WHERE deleted_at IS NULL.
--   * idx_team_messages_body_trgm: GIN trigram em body WHERE deleted_at IS NULL, para
--     body ILIKE '%termo%'. pg_trgm NÃO estava instalada (conferido em list_extensions/pg_extension);
--     é criada no schema `extensions` (nunca em public), e o opclass é extensions.gin_trgm_ops.
--   Tamanho atual (2026-11-12): 137 linhas, 2 vivas, 104 kB no total. Ver recomendação na entrega:
--   o trigram não compensa agora; o índice por clínica compensa pouco. O SQL está aqui para quando
--   o volume justificar, e ambos são seguros de aplicar (tabela minúscula, sem lock relevante).
--
-- Aditiva e idempotente: IF NOT EXISTS em extensão e índices; DROP POLICY IF EXISTS só nos
-- nomes team_presence_* (próprios deste arquivo) antes de recriar.
-- Desfazer: bloco ROLLBACK no fim.
--
-- ATENÇÃO de permissão: realtime.messages pertence ao papel supabase_realtime_admin. Se o
-- papel que executar a migração não puder criar policy nela ("must be owner of table messages"),
-- rode a seção (a) pelo SQL Editor do painel Supabase (mesma forma da doc oficial) e o restante normalmente.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── (a) Policies de presença em realtime.messages ──────────────────────────

DROP POLICY IF EXISTS team_presence_select ON realtime.messages;
CREATE POLICY team_presence_select ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension IN ('presence')
    AND (SELECT realtime.topic()) = 'team-presence:' || ((SELECT public.get_my_clinic_id())::text)
  );

DROP POLICY IF EXISTS team_presence_insert ON realtime.messages;
CREATE POLICY team_presence_insert ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension IN ('presence')
    AND (SELECT realtime.topic()) = 'team-presence:' || ((SELECT public.get_my_clinic_id())::text)
  );


-- ─── (b) Índices da busca ────────────────────────────────────────────────────

-- Lista recente por clínica (mensagens vivas)
CREATE INDEX IF NOT EXISTS idx_team_messages_clinic_recent
  ON public.team_messages (clinic_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Busca por trecho de texto (ILIKE '%termo%'). Extensão no schema extensions, nunca em public.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_team_messages_body_trgm
  ON public.team_messages USING gin (body extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar à mão; nada aqui apaga dado de conversa)
-- ═══════════════════════════════════════════════════════════════════════════
--   -- 1) policies de presença (o app em modo private perde a presença; mensagens não são afetadas)
--   DROP POLICY IF EXISTS team_presence_insert ON realtime.messages;
--   DROP POLICY IF EXISTS team_presence_select ON realtime.messages;
--
--   -- 2) índices
--   DROP INDEX IF EXISTS public.idx_team_messages_body_trgm;
--   DROP INDEX IF EXISTS public.idx_team_messages_clinic_recent;
--
--   -- 3) extensão: só se nenhum outro objeto a usa (o DROP sem CASCADE falha se houver dependência)
--   DROP EXTENSION IF EXISTS pg_trgm;
-- ═══════════════════════════════════════════════════════════════════════════

-- ===== 20261127_pacientes_storage_por_clinica.sql =====
-- Bucket `pacientes` (anexos da evolução do prontuário): isolamento por clínica + bucket privado.
--
-- Problema: o bucket era público e as 3 policies de storage.objects (SELECT, INSERT, DELETE) valiam para
-- qualquer `authenticated` no bucket inteiro (bucket_id = 'pacientes', sem filtro de pasta). Qualquer login de
-- qualquer clínica lia, enviava e apagava arquivo de paciente de outra clínica. Com o bucket público, qualquer
-- pessoa (sem login) que tivesse a URL também lia.
--
-- Caminho único em uso: evolucao/<clinic_id>/<patient_id>/<timestamp>-<rand>[-<nome>].<ext>
-- (src/lib/prontuarioAttachments.ts, buildAttachmentPath). Em produção, 48 de 48 objetos seguem
-- <tipo>/<clinic_id>/..., todos com tipo `evolucao` e profundidade 4. A 2a pasta é sempre a clínica.
--
-- O que muda:
--   1) Remove as 3 policies abertas (nomes exatos abaixo).
--   2) Cria pacientes_select / pacientes_insert / pacientes_delete: a 2a pasta do caminho precisa ser a clínica
--      do usuário (get_my_clinic_id(), o mesmo helper de patient-avatars), OU o usuário ser superadmin
--      (mesmo padrão de medical_records/record_entries; o modo suporte do admin precisa ver as fotos da clínica
--      que ele está acessando).
--   3) Torna o bucket privado. O app só lê por URL assinada (createSignedUrls em TabTimeline e TabComparador);
--      os 7 registros antigos que guardam URL pública completa têm o caminho extraído (extractStoragePath /
--      storagePathFromPhotoUrl) e viram URL assinada na tela. Nada em src usa getPublicUrl no bucket `pacientes`.
--
-- Não há policy de UPDATE: o app sobe com upsert:false e nunca atualiza objeto desse bucket.
-- Não altera dado, nem file_size_limit/allowed_mime_types (anexos incluem pdf, áudio e vídeo).
-- Idempotente (DROP IF EXISTS + recria). Desfazer: bloco ROLLBACK no fim.
--
-- Se quiser fazer em dois passos, rode primeiro tudo menos o UPDATE de storage.buckets, valide, e rode o UPDATE depois.

BEGIN;

-- 1) Policies abertas antigas (qualquer authenticated, bucket inteiro)
DROP POLICY IF EXISTS "Authenticated can view photos"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload"    ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete"    ON storage.objects;

-- 2) Policies por pasta da clínica: evolucao/<clinic_id>/...  ->  (storage.foldername(name))[2]
DROP POLICY IF EXISTS pacientes_select ON storage.objects;
CREATE POLICY pacientes_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pacientes'
    AND (
      (storage.foldername(name))[2] = (SELECT public.get_my_clinic_id())::text
      OR (SELECT public.is_superadmin())
    )
  );

DROP POLICY IF EXISTS pacientes_insert ON storage.objects;
CREATE POLICY pacientes_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pacientes'
    AND (
      (storage.foldername(name))[2] = (SELECT public.get_my_clinic_id())::text
      OR (SELECT public.is_superadmin())
    )
  );

DROP POLICY IF EXISTS pacientes_delete ON storage.objects;
CREATE POLICY pacientes_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pacientes'
    AND (
      (storage.foldername(name))[2] = (SELECT public.get_my_clinic_id())::text
      OR (SELECT public.is_superadmin())
    )
  );

-- 3) Bucket privado. A investigação (src/, banco e produção) não achou dependência de URL pública:
--    leitura só via createSignedUrls. Único getPublicUrl no bucket `pacientes` está em legacy/app.js (app estático
--    de maio/2026, fora do build do Next, escreve em `pacientes/<arquivo>` e hoje não há nenhum objeto nesse prefixo).
--    Se preferir adiar este passo, comente o UPDATE abaixo (as policies por clínica já valem sozinhas para
--    leitura autenticada, mas URLs públicas antigas continuariam abrindo sem login).
UPDATE storage.buckets SET public = false WHERE id = 'pacientes';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO (rodar depois; somente leitura; nada de dado de paciente)
-- ─────────────────────────────────────────────────────────────────────────────
-- a) Bucket privado e policies novas (esperado: public=false; 3 policies pacientes_* e nenhuma das 3 antigas):
--   SELECT id, public FROM storage.buckets WHERE id = 'pacientes';
--   SELECT policyname, cmd, roles FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects' AND (policyname LIKE 'pacientes\_%' OR qual LIKE '%''pacientes''%' OR with_check LIKE '%''pacientes''%')
--    ORDER BY policyname;
--
-- b) Nenhum objeto fora do padrão <tipo>/<clinic_id>/... (esperado: fora_do_padrao = 0; total = 48 na data desta migração):
--   SELECT count(*) AS total, count(*) FILTER (WHERE name !~ '^[a-z_-]+/[0-9a-f-]{36}/') AS fora_do_padrao
--     FROM storage.objects WHERE bucket_id = 'pacientes';
--
-- c) Isolamento simulado como um usuário comum (troque <USER_UUID> por o auth.users.id de um usuário ATIVO de uma clínica;
--    rode as linhas juntas e termine com ROLLBACK). Esperado: visiveis_minha_clinica = total de objetos da pasta da clínica dele,
--    visiveis_de_outras = 0:
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims', '{"sub":"<USER_UUID>","role":"authenticated"}', true);
--     SELECT count(*) FILTER (WHERE (storage.foldername(name))[2] = (SELECT public.get_my_clinic_id())::text) AS visiveis_minha_clinica,
--            count(*) FILTER (WHERE (storage.foldername(name))[2] <> (SELECT public.get_my_clinic_id())::text) AS visiveis_de_outras
--       FROM storage.objects WHERE bucket_id = 'pacientes';
--   ROLLBACK;
--
-- d) Teste no app (conta de QA, bucket já privado): abrir um prontuário com anexo de evolução (a foto carrega por URL
--    assinada), anexar uma foto nova, apagar uma. Abrir a URL antiga /storage/v1/object/public/pacientes/... em aba anônima
--    deve dar erro (Bucket not found / not found).

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (descomentar e rodar para voltar ao estado anterior, que é o estado INSEGURO original)
-- ─────────────────────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP POLICY IF EXISTS pacientes_select ON storage.objects;
--   DROP POLICY IF EXISTS pacientes_insert ON storage.objects;
--   DROP POLICY IF EXISTS pacientes_delete ON storage.objects;
--   DROP POLICY IF EXISTS "Authenticated can view photos"  ON storage.objects;
--   CREATE POLICY "Authenticated can view photos" ON storage.objects FOR SELECT TO authenticated
--     USING (bucket_id = 'pacientes');
--   DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
--   CREATE POLICY "Authenticated users can upload" ON storage.objects FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'pacientes');
--   DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
--   CREATE POLICY "Authenticated users can delete" ON storage.objects FOR DELETE TO authenticated
--     USING (bucket_id = 'pacientes');
--   UPDATE storage.buckets SET public = true WHERE id = 'pacientes';
-- COMMIT;

-- ===== 20261128_agendamento_online.sql =====
-- ═══════════════════════════════════════════════════════════════════════════
-- AGENDAMENTO ONLINE PÚBLICO — link /agendar/<slug>, 24 horas, por clínica
-- Criado em: 2026-11-28
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O paciente abre o link da clínica, escolhe profissional (e serviço), vê os horários livres reais, informa
-- nome e WhatsApp, aceita a LGPD e confirma. Sem login.
--
-- ARQUITETURA DE ACESSO (importante):
--   * Nenhuma tabela é aberta para anon. O navegador do paciente NUNCA fala com o banco: ele fala com as
--     rotas /api/agendar/* do Next, que chamam as 3 funções abaixo com a chave de serviço.
--   * As funções são SECURITY DEFINER, com search_path fixo, e o EXECUTE é revogado de PUBLIC, anon e
--     authenticated. Só service_role executa. Quem tem a chave anon (que é pública) não consegue chamá-las.
--   * Nenhuma função devolve dado de paciente: o contexto devolve só nome/logo/endereço/telefone da
--     clínica, profissionais e serviços liberados; a disponibilidade devolve só intervalos ocupados em
--     milissegundos (sem nome, sem motivo, sem tipo de bloqueio).
--
-- DUPLA RESERVA:
--   * O banco já tem appointments_no_double_booking (EXCLUDE gist por professional_id + intervalo, fora os
--     cancelados). Ela é a trava atômica; a função só a respeita e converte a violação (23P01) em resposta.
--   * Bloqueio da clínica toda (status 'bloqueado' sem profissional) NÃO é coberto por essa restrição:
--     a função confere explicitamente, sob pg_advisory_xact_lock do profissional.
--
-- Aditiva e idempotente: 4 tabelas novas, 1 coluna nova com padrão seguro em appointments, funções e
-- políticas. Nada existente é alterado. Pode ser aplicada mais de uma vez.
-- Plano de aplicação: aplicar ESTE arquivo inteiro (uma transação) e só depois publicar o código do app.

-- ─── Configuração por clínica (uma linha por clínica; a linha só existe depois de salvar) ───
CREATE TABLE IF NOT EXISTS public.clinic_online_booking (
  clinic_id        uuid        PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  enabled          boolean     NOT NULL DEFAULT false,
  -- parte do link: /agendar/<slug>. 3 a 40 caracteres, minúsculas, números e hífen (não começa nem termina em hífen)
  slug             text,
  -- 'pendente' = a clínica confirma depois (status agendado); 'confirmado' = já nasce confirmado
  confirm_mode     text        NOT NULL DEFAULT 'pendente' CHECK (confirm_mode IN ('pendente', 'confirmado')),
  -- antecedência mínima, em horas, entre agora e o horário escolhido
  min_notice_hours integer     NOT NULL DEFAULT 4  CHECK (min_notice_hours BETWEEN 0 AND 720),
  -- janela máxima: até quantos dias à frente o paciente pode marcar
  max_days_ahead   integer     NOT NULL DEFAULT 30 CHECK (max_days_ahead BETWEEN 1 AND 180),
  -- fuso em que "08:00" do paciente vira instante. Só zonas do Brasil.
  timezone         text        NOT NULL DEFAULT 'America/Sao_Paulo' CHECK (timezone IN (
    'America/Sao_Paulo', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Belem',
    'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho',
    'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_online_booking_slug_format CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  CONSTRAINT clinic_online_booking_enabled_needs_slug CHECK (NOT enabled OR slug IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_online_booking_slug_uniq ON public.clinic_online_booking (slug) WHERE slug IS NOT NULL;

-- ─── Quais profissionais aparecem (lista explícita: sem linha, não aparece) e quanto dura o atendimento ───
CREATE TABLE IF NOT EXISTS public.online_booking_professionals (
  professional_id  uuid        PRIMARY KEY REFERENCES public.professionals(id) ON DELETE CASCADE,
  clinic_id        uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  -- duração que o link reserva. A tela de configuração pré-preenche com a duração padrão do profissional/área.
  duration_minutes integer     NOT NULL CHECK (duration_minutes BETWEEN 10 AND 240),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_online_booking_professionals_clinic ON public.online_booking_professionals (clinic_id);

-- ─── Quais serviços aparecem. Sem nenhuma linha, o paciente não escolhe serviço (vira "Consulta") ───
CREATE TABLE IF NOT EXISTS public.online_booking_procedures (
  procedure_id uuid        PRIMARY KEY REFERENCES public.procedures(id) ON DELETE CASCADE,
  clinic_id    uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_online_booking_procedures_clinic ON public.online_booking_procedures (clinic_id);

-- ─── Registro de cada reserva feita pelo link: consentimento LGPD e base dos limites anti-abuso ───
-- Guarda só o hash do IP (HMAC feito no servidor, não reversível) e a chave do telefone (DDD + 8 últimos dígitos).
CREATE TABLE IF NOT EXISTS public.online_booking_requests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id     uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  phone_key      text        NOT NULL,
  ip_hash        text        NOT NULL,
  consent_text   text        NOT NULL,
  consent_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_online_booking_requests_phone ON public.online_booking_requests (clinic_id, phone_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_booking_requests_ip    ON public.online_booking_requests (clinic_id, ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_booking_requests_time  ON public.online_booking_requests (clinic_id, created_at DESC);

-- ─── Selo "online" na agenda ───
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS booked_online boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.appointments.booked_online IS 'true = marcado pelo paciente no link público /agendar/<slug>.';

-- ─── Profissional e serviço têm de ser da mesma clínica da linha; profissional ainda precisa ter a escala ligada ───
CREATE OR REPLACE FUNCTION public.online_booking_same_clinic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic uuid;
  v_sched boolean;
BEGIN
  IF TG_TABLE_NAME = 'online_booking_professionals' THEN
    SELECT clinic_id, schedule_enabled INTO v_clinic, v_sched FROM public.professionals WHERE id = NEW.professional_id;
    -- sem escala ligada o público veria a grade inteira (almoço, folga): só entra no link quem tem escala
    IF v_clinic IS NOT DISTINCT FROM NEW.clinic_id AND NOT COALESCE(v_sched, false) THEN
      RAISE EXCEPTION 'online_booking: profissional sem escala ligada' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT clinic_id INTO v_clinic FROM public.procedures WHERE id = NEW.procedure_id;
  END IF;
  IF v_clinic IS DISTINCT FROM NEW.clinic_id THEN
    RAISE EXCEPTION 'online_booking: item de outra clínica' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_online_booking_prof_same_clinic ON public.online_booking_professionals;
CREATE TRIGGER trg_online_booking_prof_same_clinic
  BEFORE INSERT OR UPDATE ON public.online_booking_professionals
  FOR EACH ROW EXECUTE FUNCTION public.online_booking_same_clinic();

DROP TRIGGER IF EXISTS trg_online_booking_proc_same_clinic ON public.online_booking_procedures;
CREATE TRIGGER trg_online_booking_proc_same_clinic
  BEFORE INSERT OR UPDATE ON public.online_booking_procedures
  FOR EACH ROW EXECUTE FUNCTION public.online_booking_same_clinic();

-- ─── RLS: só o administrador da clínica (e o superadmin) configura; a leitura do registro é do administrador ───
ALTER TABLE public.clinic_online_booking        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_booking_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_booking_procedures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_booking_requests      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  cond text := '(public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.get_my_role() = ''admin''))';
BEGIN
  FOREACH t IN ARRAY ARRAY['clinic_online_booking', 'online_booking_professionals', 'online_booking_procedures', 'online_booking_requests'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'admin_read_' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING %s', 'admin_read_' || t, t, cond);
    END IF;
  END LOOP;

  -- configuração e listas liberadas: o admin grava (sem policy de escrita, o registro de reservas só é gravado pela função)
  FOREACH t IN ARRAY ARRAY['clinic_online_booking', 'online_booking_professionals', 'online_booking_procedures'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'admin_insert_' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK %s', 'admin_insert_' || t, t, cond);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'admin_update_' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING %s WITH CHECK %s', 'admin_update_' || t, t, cond, cond);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['online_booking_professionals', 'online_booking_procedures'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'admin_delete_' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING %s', 'admin_delete_' || t, t, cond);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Funções auxiliares (internas: ninguém além do service_role e das funções abaixo as executa)
-- ═══════════════════════════════════════════════════════════════════════════

-- Nome comparável: sem acento, sem caixa, espaços únicos. Só traduz as letras acentuadas do português (sem extensão unaccent).
CREATE OR REPLACE FUNCTION public._ob_norm_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT lower(translate(
    regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'))
$$;

-- "HH:MM" -> minutos desde 00:00; NULL se não for um horário.
CREATE OR REPLACE FUNCTION public._ob_hhmm(p_text text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p_text ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
              THEN substr(p_text, 1, 2)::int * 60 + substr(p_text, 4, 2)::int END
$$;

-- Telefone guardado de qualquer jeito -> dígitos nacionais (DDD + número), sem o 55.
CREATE OR REPLACE FUNCTION public._ob_nat_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN d ~ '^55[0-9]{10,11}$' THEN substr(d, 3)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') AS d) x
$$;

CREATE OR REPLACE FUNCTION public._ob_err(p_code text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT jsonb_build_object('ok', false, 'code', p_code) $$;

-- Configuração da clínica pelo slug, SÓ se o link pode estar no ar: ligado, clínica ativa, não é demonstração
-- e o teste grátis não venceu. Sem linha válida devolve um registro com clinic_id nulo.
CREATE OR REPLACE FUNCTION public._ob_active_config(p_slug text)
RETURNS public.clinic_online_booking
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ob.*
  FROM public.clinic_online_booking ob
  JOIN public.clinics c ON c.id = ob.clinic_id
  WHERE ob.enabled
    AND ob.slug = lower(p_slug)
    AND c.is_active IS NOT FALSE
    AND c.demo_mode = false
    AND c.status IN ('active', 'trial')
    AND (c.status <> 'trial' OR c.trial_ends_at IS NULL OR c.trial_ends_at > now())
$$;

-- O horário cabe na escala do profissional? Mesmas regras de lib/agenda/availability.ts (dayStatus + fitsWindows):
--   escala desligada -> não atende pelo link; linha da data manda; sem linha da data usa a rotina semanal;
--   sem nenhuma rotina -> "por definir" (não atende); dia da semana sem janelas na rotina -> não atende;
--   linha da data com works = true e sem janelas -> dia todo.
CREATE OR REPLACE FUNCTION public._ob_in_schedule(p_professional_id uuid, p_date date, p_start_min integer, p_duration integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled boolean;
  v_works boolean;
  v_windows jsonb;
  v_day_found boolean := false;
  v_w jsonb;
BEGIN
  SELECT schedule_enabled INTO v_enabled FROM public.professionals WHERE id = p_professional_id;
  -- profissional sem escala ligada não é reservável pelo link (o trigger e as consultas já o excluem; aqui é a última barreira)
  IF NOT COALESCE(v_enabled, false) THEN RETURN false; END IF;

  SELECT d.works, d.windows INTO v_works, v_windows
  FROM public.professional_day_schedule d
  WHERE d.professional_id = p_professional_id AND d.date = p_date;
  v_day_found := FOUND;

  IF v_day_found THEN
    IF NOT v_works THEN RETURN false; END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.professional_week_pattern WHERE professional_id = p_professional_id) THEN
      RETURN false;
    END IF;
    SELECT w.windows INTO v_windows
    FROM public.professional_week_pattern w
    WHERE w.professional_id = p_professional_id AND w.weekday = extract(dow FROM p_date)::int;
    IF v_windows IS NULL OR jsonb_typeof(v_windows) <> 'array' OR jsonb_array_length(v_windows) = 0 THEN RETURN false; END IF;
  END IF;

  IF v_windows IS NULL OR jsonb_typeof(v_windows) <> 'array' OR jsonb_array_length(v_windows) = 0 THEN RETURN true; END IF;
  FOR v_w IN SELECT * FROM jsonb_array_elements(v_windows) LOOP
    IF p_start_min >= public._ob_hhmm(v_w->>'start') AND p_start_min + p_duration <= public._ob_hhmm(v_w->>'end') THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) CONTEXTO: o que a página pública mostra. NULL = link indisponível (não existe, desligado, clínica inativa).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.online_booking_context(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.clinic_online_booking;
  v_name text; v_logo text; v_address text; v_phone text; v_color text;
BEGIN
  IF p_slug IS NULL OR length(p_slug) > 60 THEN RETURN NULL; END IF;
  v := public._ob_active_config(p_slug);
  IF v.clinic_id IS NULL THEN RETURN NULL; END IF;

  SELECT c.name, c.logo_url, c.address, c.phone, c.primary_color
    INTO v_name, v_logo, v_address, v_phone, v_color
  FROM public.clinics c WHERE c.id = v.clinic_id;

  RETURN jsonb_build_object(
    'clinic', jsonb_build_object('name', v_name, 'logo_url', v_logo, 'address', v_address, 'phone', v_phone, 'primary_color', v_color),
    'config', jsonb_build_object(
      'confirm_mode', v.confirm_mode, 'min_notice_hours', v.min_notice_hours,
      'max_days_ahead', v.max_days_ahead, 'timezone', v.timezone),
    'professionals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'specialty', p.specialty, 'duration_minutes', obp.duration_minutes) ORDER BY p.name)
      FROM public.online_booking_professionals obp
      JOIN public.professionals p ON p.id = obp.professional_id AND p.clinic_id = v.clinic_id AND p.schedule_enabled
      WHERE obp.clinic_id = v.clinic_id
    ), '[]'::jsonb),
    'procedures', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'category', pr.category) ORDER BY pr.name)
      FROM public.online_booking_procedures op
      JOIN public.procedures pr ON pr.id = op.procedure_id AND pr.clinic_id = v.clinic_id AND pr.is_active
      WHERE op.clinic_id = v.clinic_id
    ), '[]'::jsonb)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) DISPONIBILIDADE: tudo que o servidor precisa para calcular os horários livres (a conta é feita em
--    lib/agendamentoOnline/horarios.ts). Só intervalos ocupados em ms; nunca nome, motivo ou tipo.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.online_booking_availability(p_slug text, p_professional_id uuid, p_from date, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.clinic_online_booking;
  v_dur integer;
  v_days integer;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_enabled boolean;
  v_step integer;
  v_open jsonb;
  v_open_s text; v_open_e text;
BEGIN
  IF p_slug IS NULL OR length(p_slug) > 60 OR p_professional_id IS NULL OR p_from IS NULL THEN RETURN NULL; END IF;
  v := public._ob_active_config(p_slug);
  IF v.clinic_id IS NULL THEN RETURN NULL; END IF;

  SELECT obp.duration_minutes INTO v_dur
  FROM public.online_booking_professionals obp
  JOIN public.professionals p ON p.id = obp.professional_id AND p.clinic_id = v.clinic_id AND p.schedule_enabled
  WHERE obp.clinic_id = v.clinic_id AND obp.professional_id = p_professional_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_days := least(greatest(COALESCE(p_days, 1), 1), 31);
  v_from_ts := p_from::timestamp AT TIME ZONE v.timezone;
  v_to_ts   := (p_from + v_days)::timestamp AT TIME ZONE v.timezone;

  SELECT COALESCE(s.slot_step_minutes, 30), s.opening_hours INTO v_step, v_open
  FROM (SELECT 1) one LEFT JOIN public.clinic_schedule_settings s ON s.clinic_id = v.clinic_id;
  v_step := COALESCE(v_step, 30);
  v_open_s := CASE WHEN public._ob_hhmm(v_open->>'start') IS NOT NULL THEN v_open->>'start' ELSE '07:00' END;
  v_open_e := CASE WHEN public._ob_hhmm(v_open->>'end') IS NOT NULL AND public._ob_hhmm(v_open->>'end') > public._ob_hhmm(v_open_s) THEN v_open->>'end' ELSE '19:30' END;
  IF public._ob_hhmm(v_open_e) <= public._ob_hhmm(v_open_s) THEN v_open_s := '07:00'; v_open_e := '19:30'; END IF;

  SELECT schedule_enabled INTO v_enabled FROM public.professionals WHERE id = p_professional_id AND clinic_id = v.clinic_id;

  RETURN jsonb_build_object(
    'config', jsonb_build_object(
      'timezone', v.timezone, 'min_notice_hours', v.min_notice_hours, 'max_days_ahead', v.max_days_ahead,
      'step_minutes', v_step, 'opening', jsonb_build_object('start', v_open_s, 'end', v_open_e)),
    'duration_minutes', v_dur,
    'schedule', jsonb_build_object(
      'enabled', COALESCE(v_enabled, false),
      'pattern', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('weekday', w.weekday, 'windows', w.windows))
        FROM public.professional_week_pattern w WHERE w.professional_id = p_professional_id AND w.clinic_id = v.clinic_id
      ), '[]'::jsonb),
      'days', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('date', d.date, 'works', d.works, 'windows', d.windows))
        FROM public.professional_day_schedule d
        WHERE d.professional_id = p_professional_id AND d.clinic_id = v.clinic_id
          AND d.date >= p_from - 1 AND d.date <= p_from + v_days
      ), '[]'::jsonb)
    ),
    'busy', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        (extract(epoch FROM a.scheduled_at) * 1000)::bigint,
        ((extract(epoch FROM a.scheduled_at) * 1000)::bigint + COALESCE(a.duration_minutes, 60)::bigint * 60000)))
      FROM public.appointments a
      WHERE a.clinic_id = v.clinic_id
        AND COALESCE(a.status, '') <> 'cancelado'
        AND (a.professional_id = p_professional_id OR (a.professional_id IS NULL AND a.status = 'bloqueado'))
        AND a.scheduled_at < v_to_ts
        AND a.scheduled_at + (COALESCE(a.duration_minutes, 60) * interval '1 minute') > v_from_ts
    ), '[]'::jsonb)
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) CRIAR AGENDAMENTO. Devolve {ok:true,...} ou {ok:false, code}. Códigos:
--    indisponivel | dados_invalidos | profissional_invalido | procedimento_invalido | fora_da_janela |
--    horario_invalido | horario_ocupado | limite
-- Todas as regras são conferidas de novo aqui: o navegador pode mandar qualquer horário.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.online_booking_create(
  p_slug text, p_professional_id uuid, p_procedure_id uuid, p_date date, p_time text,
  p_name text, p_phone_digits text, p_phone_display text, p_email text,
  p_consent boolean, p_consent_text text, p_ip_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.clinic_online_booking;
  v_dur integer; v_prof_name text;
  v_has_procs boolean; v_proc_id uuid; v_proc_name text; v_proc_price numeric; v_proc_free boolean;
  v_start timestamptz; v_end timestamptz; v_start_min integer;
  v_today date;
  v_open jsonb; v_open_s integer; v_open_e integer; v_step integer;
  v_name text; v_email text; v_key text;
  v_patient uuid; v_appt uuid; v_status text; v_notes text; v_clinic_name text;
BEGIN
  -- ── entrada: nada do navegador é confiável ──
  v_name := regexp_replace(btrim(COALESCE(p_name, '')), '[[:space:]]+', ' ', 'g');
  IF length(v_name) < 2 OR length(v_name) > 80 THEN RETURN public._ob_err('dados_invalidos'); END IF;
  IF p_phone_digits IS NULL OR p_phone_digits !~ '^[1-9][0-9]{9,10}$' THEN RETURN public._ob_err('dados_invalidos'); END IF;
  IF p_phone_display IS NULL OR length(p_phone_display) > 20 THEN RETURN public._ob_err('dados_invalidos'); END IF;
  v_email := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  -- mesmo charset de validar.ts (cleanEmail): letras minúsculas sem acento, números e . _ % + - na parte local; domínio com pontos
  IF v_email IS NOT NULL AND (length(v_email) > 120 OR v_email !~ '^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$') THEN
    RETURN public._ob_err('dados_invalidos');
  END IF;
  IF p_consent IS NOT TRUE OR p_consent_text IS NULL OR length(p_consent_text) < 10 OR length(p_consent_text) > 600 THEN
    RETURN public._ob_err('dados_invalidos');
  END IF;
  IF p_date IS NULL OR p_time IS NULL OR public._ob_hhmm(p_time) IS NULL THEN RETURN public._ob_err('dados_invalidos'); END IF;
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN RETURN public._ob_err('dados_invalidos'); END IF;
  IF p_professional_id IS NULL THEN RETURN public._ob_err('profissional_invalido'); END IF;

  -- ── o link está no ar? ──
  IF p_slug IS NULL OR length(p_slug) > 60 THEN RETURN public._ob_err('indisponivel'); END IF;
  v := public._ob_active_config(p_slug);
  IF v.clinic_id IS NULL THEN RETURN public._ob_err('indisponivel'); END IF;

  -- ── profissional e serviço liberados NESTA clínica ──
  SELECT obp.duration_minutes, p.name INTO v_dur, v_prof_name
  FROM public.online_booking_professionals obp
  JOIN public.professionals p ON p.id = obp.professional_id AND p.clinic_id = v.clinic_id AND p.schedule_enabled
  WHERE obp.clinic_id = v.clinic_id AND obp.professional_id = p_professional_id;
  IF NOT FOUND THEN RETURN public._ob_err('profissional_invalido'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.online_booking_procedures op
    JOIN public.procedures pr ON pr.id = op.procedure_id AND pr.clinic_id = v.clinic_id AND pr.is_active
    WHERE op.clinic_id = v.clinic_id
  ) INTO v_has_procs;
  IF v_has_procs THEN
    IF p_procedure_id IS NULL THEN RETURN public._ob_err('procedimento_invalido'); END IF;
    SELECT pr.id, pr.name, pr.price, pr.is_free INTO v_proc_id, v_proc_name, v_proc_price, v_proc_free
    FROM public.online_booking_procedures op
    JOIN public.procedures pr ON pr.id = op.procedure_id AND pr.clinic_id = v.clinic_id AND pr.is_active
    WHERE op.clinic_id = v.clinic_id AND op.procedure_id = p_procedure_id;
    IF NOT FOUND THEN RETURN public._ob_err('procedimento_invalido'); END IF;
  ELSIF p_procedure_id IS NOT NULL THEN
    RETURN public._ob_err('procedimento_invalido');
  END IF;

  -- ── janela: antecedência mínima, dias à frente, grade e horário de funcionamento ──
  v_start := (p_date + p_time::time) AT TIME ZONE v.timezone;
  v_end := v_start + (v_dur * interval '1 minute');
  IF v_start < now() + (v.min_notice_hours * interval '1 hour') THEN RETURN public._ob_err('fora_da_janela'); END IF;
  v_today := (now() AT TIME ZONE v.timezone)::date;
  IF p_date > v_today + v.max_days_ahead THEN RETURN public._ob_err('fora_da_janela'); END IF;

  SELECT s.slot_step_minutes, s.opening_hours INTO v_step, v_open
  FROM (SELECT 1) one LEFT JOIN public.clinic_schedule_settings s ON s.clinic_id = v.clinic_id;
  v_step := COALESCE(v_step, 30);
  v_open_s := COALESCE(public._ob_hhmm(v_open->>'start'), 7 * 60);
  v_open_e := COALESCE(public._ob_hhmm(v_open->>'end'), 19 * 60 + 30);
  IF v_open_e <= v_open_s THEN v_open_s := 7 * 60; v_open_e := 19 * 60 + 30; END IF;
  v_start_min := public._ob_hhmm(p_time);
  IF v_start_min < v_open_s OR v_start_min + v_dur > v_open_e OR (v_start_min - v_open_s) % v_step <> 0 THEN
    RETURN public._ob_err('horario_invalido');
  END IF;
  IF NOT public._ob_in_schedule(p_professional_id, p_date, v_start_min, v_dur) THEN RETURN public._ob_err('horario_invalido'); END IF;

  -- ── anti-abuso no banco (o IP e o telefone também são limitados na rota, antes de chegar aqui) ──
  -- Evolução prevista, fora deste escopo: captcha (ex.: Turnstile) ou código de confirmação por WhatsApp antes de gravar.
  -- Enquanto isso, a defesa é: campo isca e tempo de preenchimento na rota, limites abaixo e o modo "pendente" como padrão.
  v_key := left(p_phone_digits, 2) || right(p_phone_digits, 8);

  -- Trava por clínica + telefone ANTES de contar: duas reservas simultâneas do mesmo número se enfileiram e a segunda
  -- enxerga a primeira (sem isso, as duas passariam pelo limite lendo a mesma contagem).
  PERFORM pg_advisory_xact_lock(hashtextextended('online_booking_phone:' || v.clinic_id::text || ':' || v_key, 0));

  -- online_booking_requests só recebe linha quando a reserva foi GRAVADA (mais abaixo): tentativa recusada
  -- (horário ocupado, dado inválido) não consome o limite do telefone nem do IP.
  IF (SELECT count(*) FROM public.online_booking_requests r WHERE r.clinic_id = v.clinic_id AND r.phone_key = v_key AND r.created_at > now() - interval '24 hours') >= 4
     OR (SELECT count(*) FROM public.online_booking_requests r WHERE r.clinic_id = v.clinic_id AND r.ip_hash = p_ip_hash AND r.created_at > now() - interval '1 hour') >= 6
     OR (SELECT count(*) FROM public.online_booking_requests r WHERE r.clinic_id = v.clinic_id AND r.created_at > now() - interval '1 hour') >= 80
     OR (SELECT count(*) FROM public.online_booking_requests r JOIN public.appointments a ON a.id = r.appointment_id
         WHERE r.clinic_id = v.clinic_id AND r.phone_key = v_key AND a.scheduled_at > now() AND a.status IN ('agendado', 'confirmado')) >= 3
     -- teto por clínica: reservas online futuras ainda aguardando confirmação. Passou disso, o link para de aceitar
     -- até a recepção confirmar ou cancelar (impede encher a agenda de "pendentes" falsos).
     OR (SELECT count(*) FROM public.appointments a
         WHERE a.clinic_id = v.clinic_id AND a.booked_online AND a.status = 'agendado' AND a.scheduled_at > now()) >= 60
  THEN
    RETURN public._ob_err('limite');
  END IF;

  -- ── dupla reserva: trava por profissional, confere e insere ──
  PERFORM pg_advisory_xact_lock(hashtextextended('online_booking:' || p_professional_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.clinic_id = v.clinic_id
      AND COALESCE(a.status, '') <> 'cancelado'
      AND (a.professional_id = p_professional_id OR (a.professional_id IS NULL AND a.status = 'bloqueado'))
      AND a.scheduled_at < v_end
      AND a.scheduled_at + (COALESCE(a.duration_minutes, 60) * interval '1 minute') > v_start
  ) THEN
    RETURN public._ob_err('horario_ocupado');
  END IF;

  v_status := CASE v.confirm_mode WHEN 'confirmado' THEN 'confirmado' ELSE 'agendado' END;

  BEGIN
    -- paciente: reaproveita quem já tem o MESMO telefone E o MESMO nome completo (sem acento nem caixa); senão cria. Nunca altera cadastro existente.
    SELECT pt.id INTO v_patient
    FROM public.patients pt
    WHERE pt.clinic_id = v.clinic_id
      AND pt.is_active IS NOT FALSE
      AND length(public._ob_nat_phone(pt.phone)) BETWEEN 10 AND 11
      AND left(public._ob_nat_phone(pt.phone), 2) = left(p_phone_digits, 2)
      AND right(public._ob_nat_phone(pt.phone), 8) = right(p_phone_digits, 8)
      AND public._ob_norm_name(pt.name) = public._ob_norm_name(v_name)
    ORDER BY pt.created_at
    LIMIT 1;

    IF v_patient IS NULL THEN
      INSERT INTO public.patients (clinic_id, name, phone, email, self_registered, registration_status, lgpd_consent, lgpd_consent_at, lgpd_consent_ip)
      VALUES (v.clinic_id, v_name, p_phone_display, v_email, true, 'approved', true, now(), p_ip_hash)
      RETURNING id INTO v_patient;
    END IF;

    v_notes := 'Agendamento online. Nome informado: ' || v_name || '. WhatsApp: ' || p_phone_display
      || CASE WHEN v_email IS NOT NULL THEN '. E-mail: ' || v_email ELSE '' END || '.';

    INSERT INTO public.appointments (clinic_id, patient_id, professional_id, procedure_id, procedure_name, procedure_price,
                                     status, scheduled_at, duration_minutes, notes, booked_online)
    VALUES (v.clinic_id, v_patient, p_professional_id, v_proc_id, COALESCE(v_proc_name, 'Consulta'),
            CASE WHEN v_proc_id IS NULL THEN NULL WHEN v_proc_free THEN 0 ELSE v_proc_price END,
            v_status, v_start, v_dur, v_notes, true)
    RETURNING id INTO v_appt;

    INSERT INTO public.online_booking_requests (clinic_id, appointment_id, patient_id, phone_key, ip_hash, consent_text)
    VALUES (v.clinic_id, v_appt, v_patient, v_key, p_ip_hash, p_consent_text);
  EXCEPTION WHEN exclusion_violation THEN
    -- outra reserva do mesmo profissional entrou no mesmo instante: o bloco inteiro (inclusive o paciente) é desfeito
    RETURN public._ob_err('horario_ocupado');
  END;

  -- lead no CRM (fonte "site"): melhora o funil, mas NUNCA derruba a reserva já feita.
  -- Se o lead já existe, só liga o paciente (se faltava) e leva Novo/Em conversa para Agendado; o resto fica como está.
  BEGIN
    INSERT INTO public.crm_leads (clinic_id, name, phone, phone_key, stage, stage_source, source, interest, patient_id)
    VALUES (v.clinic_id, v_name, p_phone_display, v_key, 'agendado', 'auto', 'site', v_proc_name, v_patient)
    ON CONFLICT (clinic_id, phone_key) DO UPDATE SET
      patient_id   = COALESCE(crm_leads.patient_id, EXCLUDED.patient_id),
      stage        = CASE WHEN crm_leads.stage IN ('novo', 'em_conversa') THEN 'agendado' ELSE crm_leads.stage END,
      stage_source = CASE WHEN crm_leads.stage IN ('novo', 'em_conversa') THEN 'auto' ELSE crm_leads.stage_source END;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'online_booking_create: lead não registrado (%).', SQLSTATE;
  END;

  SELECT name INTO v_clinic_name FROM public.clinics WHERE id = v.clinic_id;
  RETURN jsonb_build_object(
    'ok', true,
    'status', v_status,
    'starts_at', v_start,
    'duration_minutes', v_dur,
    'clinic_name', v_clinic_name,
    'professional_name', v_prof_name,
    'procedure_name', COALESCE(v_proc_name, 'Consulta')
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) RETENÇÃO (LGPD): apaga do registro de reservas o que tem mais de 90 dias (telefone normalizado, hash de IP e
--    texto de consentimento). A reserva e o paciente continuam; o consentimento do paciente fica em patients.lgpd_*.
--    Devolve quantas linhas apagou. Os limites anti-abuso só olham as últimas 24 horas, então a purga não os afeta.
--
-- COMO AGENDAR (nada é agendado por esta migração). Uma das duas:
--   a) pg_cron, uma vez por dia:
--        select cron.schedule('online-booking-purge', '17 3 * * *', $cron$ select public.online_booking_purge() $cron$);
--   b) o agendador do app (service role) chamando  supabase.rpc('online_booking_purge')  uma vez por dia.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.online_booking_purge()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.online_booking_requests WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ─── Permissões: só o service_role (as rotas do Next) executa. Nada de anon, authenticated ou PUBLIC. ───
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public._ob_hhmm(text)',
    'public._ob_norm_name(text)',
    'public._ob_nat_phone(text)',
    'public._ob_err(text)',
    'public._ob_active_config(text)',
    'public._ob_in_schedule(uuid, date, integer, integer)',
    'public.online_booking_context(text)',
    'public.online_booking_availability(text, uuid, date, integer)',
    'public.online_booking_create(text, uuid, uuid, date, text, text, text, text, text, boolean, text, text)',
    'public.online_booking_purge()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

COMMENT ON TABLE public.clinic_online_booking IS 'Agendamento online público por clínica (link /agendar/<slug>). Config só pelo admin; leitura pública só pelas funções online_booking_*.';
COMMENT ON TABLE public.online_booking_requests IS 'Uma linha por reserva feita pelo link público: consentimento LGPD e base dos limites anti-abuso. Só a função grava.';

-- ===== 20261129_nutri_recordatorio.sql =====
-- ═══════════════════════════════════════════════════════════════════════════
-- NUTRIÇÃO — recordatório alimentar de 24 horas estruturado
-- Criado em: 2026-11-29 (NÃO APLICADA: arquivo para o Dimitre revisar e aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O recordatório 24h (o que o paciente comeu no dia anterior, refeição por refeição, com horário, alimento e
-- quantidade) passa a ser guardado em nutri_avaliacoes com tipo 'recordatorio', ao lado de 'avaliacao' e 'plano'.
-- Cada recordatório é uma linha, um por data: a regra é da tela (RecordatorioPanel avisa e abre o existente quando a data já
-- tem registro), SEM índice único no banco, para não travar dois profissionais atendendo o mesmo paciente no mesmo dia. JSON versionado (v:1) definido em
-- src/lib/nutri/recordatorio.ts: refeições, horários, alimentos (ids da TACO ou personalizados), gramas e medida caseira.
--
-- Única mudança de schema: o CHECK de `tipo`, que só aceitava ('avaliacao','plano'), passa a aceitar também 'recordatorio'.
-- Colunas, índices, gatilho e RLS NÃO mudam: as policies da tabela (isolamento por clínica, permissão do módulo
-- prontuário, restrição por área do profissional) valem para todos os tipos. Por isso não há policy nova aqui.
--
-- Idempotente: descobre o CHECK atual de `tipo` pelo catálogo (o nome automático pode variar), remove só ele e
-- recria com o nome fixo `nutri_avaliacoes_tipo_check`. Se já estiver com os três valores, não faz nada.
-- Aditiva: nenhuma linha existente é alterada (todas continuam 'avaliacao' ou 'plano', valores aceitos).
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_nome text;
  v_def  text;
BEGIN
  IF to_regclass('public.nutri_avaliacoes') IS NULL THEN
    RAISE EXCEPTION 'public.nutri_avaliacoes não existe: aplique antes 20261113_nutri_avaliacoes.sql';
  END IF;

  -- CHECK(s) da tabela que mencionam a coluna tipo
  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO v_nome, v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.nutri_avaliacoes'::regclass
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ~ '\mtipo\M'
   LIMIT 1;

  -- já aceita 'recordatorio': nada a fazer
  IF v_def IS NOT NULL AND v_def LIKE '%recordatorio%' THEN
    RETURN;
  END IF;

  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.nutri_avaliacoes DROP CONSTRAINT %I', v_nome);
  END IF;

  ALTER TABLE public.nutri_avaliacoes
    ADD CONSTRAINT nutri_avaliacoes_tipo_check
    CHECK (tipo IN ('avaliacao', 'plano', 'recordatorio'));
END
$$;

COMMENT ON TABLE public.nutri_avaliacoes IS 'Nutrição: avaliações antropométricas (tipo avaliacao), planos alimentares (tipo plano) e recordatórios alimentares 24h (tipo recordatorio) por paciente, com histórico por data.';
COMMENT ON COLUMN public.nutri_avaliacoes.dados IS 'JSON versionado (v:1). Formato em src/lib/nutri/avaliacao.ts (avaliacao), plano.ts (plano) e recordatorio.ts (recordatorio).';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de aplicar):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.nutri_avaliacoes'::regclass AND conname = 'nutri_avaliacoes_tipo_check';
--   -- esperado: CHECK ((tipo = ANY (ARRAY['avaliacao'::text, 'plano'::text, 'recordatorio'::text])))
--
-- ROLLBACK (rodar manualmente; antes, apague ou converta as linhas 'recordatorio', senão o ADD CONSTRAINT falha):
--   DELETE FROM public.nutri_avaliacoes WHERE tipo = 'recordatorio';
--   ALTER TABLE public.nutri_avaliacoes DROP CONSTRAINT IF EXISTS nutri_avaliacoes_tipo_check;
--   ALTER TABLE public.nutri_avaliacoes ADD CONSTRAINT nutri_avaliacoes_tipo_check CHECK (tipo IN ('avaliacao', 'plano'));
-- ═══════════════════════════════════════════════════════════════════════════

-- ===== 20261130_fisio_exercicios_goniometria.sql =====
-- ═══════════════════════════════════════════════════════════════════════════
-- FISIOTERAPIA: BIBLIOTECA DE EXERCÍCIOS, PRESCRIÇÃO, EXECUÇÃO PELO PACIENTE E GONIOMETRIA SERIADA
-- Criado em: 2026-11-30
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cinco tabelas novas, todas aditivas (nada existente é alterado, exceto a lista de escopos aceitos
-- em patient_portal_links, que ganha 'exercicios' — ver bloco 6).
--   * fisio_exercicios           — biblioteca de exercícios da clínica (nome, descrição, região,
--                                  séries/repetições padrão, link de vídeo YouTube/Vimeo, foto no Storage).
--                                  Sem DELETE: para tirar da lista, active = false (as prescrições já
--                                  feitas guardam uma cópia dos dados do exercício).
--   * fisio_prescricoes          — um programa de exercícios de um paciente (título, orientações, status).
--                                  Sem DELETE: encerrar = status 'encerrada' (o histórico de execução fica).
--   * fisio_prescricao_itens     — os exercícios do programa. Cada item guarda uma CÓPIA do nome, da descrição,
--                                  do vídeo e da foto no momento da prescrição, então editar a biblioteca
--                                  depois não muda o que o paciente já recebeu.
--   * fisio_execucoes            — "marquei como feito": uma linha por item por dia (UNIQUE item + dia).
--                                  Quem grava é a página pública do paciente (/p/[token]), pelo servidor com
--                                  a chave de serviço; a clínica só LÊ (histórico de execução).
--   * fisio_goniometrias         — goniometria seriada: articulação, movimento, lado, ativo/passivo, ângulo
--                                  medido e o valor de referência (cópia do valor normal usado na hora).
--
-- Segurança: RLS ligado em todas. Mesmo desenho do prontuário (metas terapêuticas):
--   leitura  = (clinic_id = get_my_clinic_id() OR is_superadmin()) E has_module_perm('prontuario', false)
--   escrita  = (clinic_id = get_my_clinic_id() OR is_superadmin()) E has_module_perm('prontuario', true)
--   o paciente (e a prescrição/o exercício, nos itens) precisam pertencer à mesma clínica.
--   fisio_execucoes não tem policy de escrita: só o servidor (chave de serviço) grava, depois de
--   conferir o token do link, o escopo 'exercicios' e que o item é do paciente do link.
--
-- Fotos dos exercícios: reaproveitam o bucket privado `pacientes`, no caminho
--   exercicios/<clinic_id>/<exercicio_id>/<arquivo>
-- A 2a pasta é a clínica, então já valem as policies pacientes_select/insert/delete da migration
-- 20261127_pacientes_storage_por_clinica.sql (isolamento por clínica). Nada de bucket novo e nenhuma
-- policy de storage nova nesta migration. O CHECK de image_path abaixo garante que o caminho gravado
-- na linha aponta para a pasta da PRÓPRIA clínica (o servidor assina o caminho com a chave de serviço).
-- A página do paciente recebe URL assinada de 1 hora, gerada no servidor.
--
-- Vídeo: só link normalizado de YouTube (watch?v=ID) ou Vimeo (vimeo.com/ID); o app converte qualquer
-- formato colado para esse e o CHECK impede outra coisa (nada de endereço arbitrário na página pública).
--
-- Sem gatilhos: created_by usa DEFAULT auth.uid(); updated_at é enviado pelo app.
--
-- Desfazer: bloco ROLLBACK no fim do arquivo (apaga as cinco tabelas e os dados delas e devolve
-- a lista antiga de escopos).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Biblioteca de exercícios ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fisio_exercicios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(btrim(name)) > 0 AND length(name) <= 120),
  description  text CHECK (description IS NULL OR length(description) <= 2000),
  region       text CHECK (region IS NULL OR length(region) <= 40),
  default_sets smallint CHECK (default_sets IS NULL OR default_sets BETWEEN 1 AND 20),
  default_reps text CHECK (default_reps IS NULL OR length(default_reps) <= 40),
  video_url    text CHECK (video_url IS NULL OR video_url ~ '^https://(www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com/[0-9]{1,12}(/[0-9a-f]{6,20})?)$'),
  image_path   text CHECK (image_path IS NULL OR (length(image_path) <= 300 AND image_path LIKE ('exercicios/' || clinic_id::text || '/%'))),
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fisio_exercicios_clinic_idx ON public.fisio_exercicios (clinic_id, active, name);

-- ── 2. Prescrição (programa do paciente) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fisio_prescricoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title           text NOT NULL CHECK (length(btrim(title)) > 0 AND length(title) <= 120),
  notes           text CHECK (notes IS NULL OR length(notes) <= 2000),
  status          text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  started_on      date NOT NULL DEFAULT current_date,
  ended_on        date,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fisio_prescricoes_patient_idx ON public.fisio_prescricoes (clinic_id, patient_id, status, created_at DESC);

-- ── 3. Itens da prescrição (com cópia dos dados do exercício) ──────────────
CREATE TABLE IF NOT EXISTS public.fisio_prescricao_itens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id    uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  prescricao_id uuid NOT NULL REFERENCES public.fisio_prescricoes(id) ON DELETE CASCADE,
  exercicio_id  uuid REFERENCES public.fisio_exercicios(id) ON DELETE SET NULL,
  name          text NOT NULL CHECK (length(btrim(name)) > 0 AND length(name) <= 120),
  description   text CHECK (description IS NULL OR length(description) <= 2000),
  region        text CHECK (region IS NULL OR length(region) <= 40),
  video_url     text CHECK (video_url IS NULL OR video_url ~ '^https://(www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com/[0-9]{1,12}(/[0-9a-f]{6,20})?)$'),
  image_path    text CHECK (image_path IS NULL OR (length(image_path) <= 300 AND image_path LIKE ('exercicios/' || clinic_id::text || '/%'))),
  sets          smallint CHECK (sets IS NULL OR sets BETWEEN 1 AND 20),
  reps          text CHECK (reps IS NULL OR length(reps) <= 40),
  times_per_week smallint NOT NULL DEFAULT 7 CHECK (times_per_week BETWEEN 1 AND 7),
  notes         text CHECK (notes IS NULL OR length(notes) <= 500),
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fisio_prescricao_itens_presc_idx ON public.fisio_prescricao_itens (prescricao_id, sort_order);
CREATE INDEX IF NOT EXISTS fisio_prescricao_itens_patient_idx ON public.fisio_prescricao_itens (clinic_id, patient_id);

-- ── 4. Execução marcada pelo paciente ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fisio_execucoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES public.fisio_prescricao_itens(id) ON DELETE CASCADE,
  done_on    date NOT NULL,
  done_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, done_on)
);

CREATE INDEX IF NOT EXISTS fisio_execucoes_patient_idx ON public.fisio_execucoes (clinic_id, patient_id, done_on DESC);

-- ── 5. Goniometria seriada ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fisio_goniometrias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  measured_on     date NOT NULL DEFAULT current_date,
  joint           text NOT NULL CHECK (length(btrim(joint)) > 0 AND length(joint) <= 40),
  movement        text NOT NULL CHECK (length(btrim(movement)) > 0 AND length(movement) <= 40),
  side            text NOT NULL DEFAULT 'nao_se_aplica' CHECK (side IN ('direito', 'esquerdo', 'nao_se_aplica')),
  mode            text NOT NULL DEFAULT 'ativo' CHECK (mode IN ('ativo', 'passivo')),
  angle_deg       numeric(5,1) NOT NULL CHECK (angle_deg >= 0 AND angle_deg <= 360),
  reference_deg   numeric(5,1) CHECK (reference_deg IS NULL OR (reference_deg >= 0 AND reference_deg <= 360)),
  note            text CHECK (note IS NULL OR length(note) <= 300),
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fisio_goniometrias_patient_idx ON public.fisio_goniometrias (clinic_id, patient_id, joint, movement, measured_on);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.fisio_exercicios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fisio_prescricoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fisio_prescricao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fisio_execucoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fisio_goniometrias     ENABLE ROW LEVEL SECURITY;

-- fisio_exercicios: sem DELETE (desativar = active false)
DROP POLICY IF EXISTS fisio_exercicios_select ON public.fisio_exercicios;
CREATE POLICY fisio_exercicios_select ON public.fisio_exercicios FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS fisio_exercicios_insert ON public.fisio_exercicios;
CREATE POLICY fisio_exercicios_insert ON public.fisio_exercicios FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true));

DROP POLICY IF EXISTS fisio_exercicios_update ON public.fisio_exercicios;
CREATE POLICY fisio_exercicios_update ON public.fisio_exercicios FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true));

-- fisio_prescricoes: sem DELETE (encerrar = status 'encerrada')
DROP POLICY IF EXISTS fisio_prescricoes_select ON public.fisio_prescricoes;
CREATE POLICY fisio_prescricoes_select ON public.fisio_prescricoes FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS fisio_prescricoes_insert ON public.fisio_prescricoes;
CREATE POLICY fisio_prescricoes_insert ON public.fisio_prescricoes FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = fisio_prescricoes.clinic_id));

DROP POLICY IF EXISTS fisio_prescricoes_update ON public.fisio_prescricoes;
CREATE POLICY fisio_prescricoes_update ON public.fisio_prescricoes FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = fisio_prescricoes.clinic_id));

-- fisio_prescricao_itens: DELETE liberado (tirar um exercício do programa na edição)
DROP POLICY IF EXISTS fisio_prescricao_itens_select ON public.fisio_prescricao_itens;
CREATE POLICY fisio_prescricao_itens_select ON public.fisio_prescricao_itens FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS fisio_prescricao_itens_insert ON public.fisio_prescricao_itens;
CREATE POLICY fisio_prescricao_itens_insert ON public.fisio_prescricao_itens FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.fisio_prescricoes r
                          WHERE r.id = prescricao_id AND r.clinic_id = fisio_prescricao_itens.clinic_id AND r.patient_id = fisio_prescricao_itens.patient_id)
              AND (exercicio_id IS NULL OR EXISTS (SELECT 1 FROM public.fisio_exercicios e
                                                    WHERE e.id = exercicio_id AND e.clinic_id = fisio_prescricao_itens.clinic_id)));

DROP POLICY IF EXISTS fisio_prescricao_itens_update ON public.fisio_prescricao_itens;
CREATE POLICY fisio_prescricao_itens_update ON public.fisio_prescricao_itens FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.fisio_prescricoes r
                          WHERE r.id = prescricao_id AND r.clinic_id = fisio_prescricao_itens.clinic_id AND r.patient_id = fisio_prescricao_itens.patient_id)
              AND (exercicio_id IS NULL OR EXISTS (SELECT 1 FROM public.fisio_exercicios e
                                                    WHERE e.id = exercicio_id AND e.clinic_id = fisio_prescricao_itens.clinic_id)));

DROP POLICY IF EXISTS fisio_prescricao_itens_delete ON public.fisio_prescricao_itens;
CREATE POLICY fisio_prescricao_itens_delete ON public.fisio_prescricao_itens FOR DELETE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true));

-- fisio_execucoes: só leitura para a clínica. A escrita é do servidor (chave de serviço), nunca do navegador.
DROP POLICY IF EXISTS fisio_execucoes_select ON public.fisio_execucoes;
CREATE POLICY fisio_execucoes_select ON public.fisio_execucoes FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

-- fisio_goniometrias
DROP POLICY IF EXISTS fisio_goniometrias_select ON public.fisio_goniometrias;
CREATE POLICY fisio_goniometrias_select ON public.fisio_goniometrias FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS fisio_goniometrias_insert ON public.fisio_goniometrias;
CREATE POLICY fisio_goniometrias_insert ON public.fisio_goniometrias FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = fisio_goniometrias.clinic_id));

DROP POLICY IF EXISTS fisio_goniometrias_update ON public.fisio_goniometrias;
CREATE POLICY fisio_goniometrias_update ON public.fisio_goniometrias FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = fisio_goniometrias.clinic_id));

DROP POLICY IF EXISTS fisio_goniometrias_delete ON public.fisio_goniometrias;
CREATE POLICY fisio_goniometrias_delete ON public.fisio_goniometrias FOR DELETE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true));

COMMENT ON TABLE public.fisio_exercicios IS
  'Biblioteca de exercícios de fisioterapia da clínica. Sem DELETE: desativar = active false.';
COMMENT ON TABLE public.fisio_prescricoes IS
  'Programa de exercícios prescrito a um paciente. Sem DELETE: encerrar = status encerrada.';
COMMENT ON TABLE public.fisio_prescricao_itens IS
  'Exercícios do programa, com cópia do nome, descrição, vídeo e foto do momento da prescrição.';
COMMENT ON TABLE public.fisio_execucoes IS
  'Marcações de "feito" do paciente (uma por item por dia). Gravadas só pelo servidor, a partir da página /p/[token].';
COMMENT ON TABLE public.fisio_goniometrias IS
  'Goniometria seriada: ângulo por articulação, movimento, lado e modo (ativo/passivo), com o valor de referência usado.';

-- ── 6. Portal do paciente: novo escopo 'exercicios' ────────────────────────
-- O CHECK de patient_portal_links.scopes lista os escopos aceitos. Troca pela lista com 'exercicios'
-- (superconjunto da anterior: nenhuma linha existente deixa de valer). Pula sozinho se a tabela do
-- portal ainda não existe. Idempotente: remove o CHECK de escopos, qualquer que seja o nome, e recria.
DO $$
DECLARE c record;
BEGIN
  IF to_regclass('public.patient_portal_links') IS NULL THEN
    RETURN;
  END IF;
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.patient_portal_links'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%plano_alimentar%'
  LOOP
    EXECUTE format('ALTER TABLE public.patient_portal_links DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.patient_portal_links
    ADD CONSTRAINT patient_portal_links_scopes_check CHECK (
      cardinality(scopes) > 0
      AND scopes <@ ARRAY['plano_alimentar','vacinas_peso','proximas_consultas','orientacoes','assinatura','exercicios']::text[]);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodar depois; somente leitura):
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'fisio\_%' ORDER BY 1;   -- 5 linhas, rowsecurity = true
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'fisio\_%' ORDER BY 1, 2;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.patient_portal_links'::regclass AND contype = 'c';
--
-- ROLLBACK (rodar à mão, só se precisar desfazer; apaga prescrições, execuções e medidas gravadas):
--
-- DROP TABLE IF EXISTS public.fisio_execucoes;
-- DROP TABLE IF EXISTS public.fisio_prescricao_itens;
-- DROP TABLE IF EXISTS public.fisio_prescricoes;
-- DROP TABLE IF EXISTS public.fisio_exercicios;
-- DROP TABLE IF EXISTS public.fisio_goniometrias;
-- -- links que já tenham o escopo 'exercicios' precisam ser corrigidos/revogados ANTES de voltar a lista antiga:
-- -- UPDATE public.patient_portal_links SET scopes = array_remove(scopes, 'exercicios') WHERE 'exercicios' = ANY(scopes) AND cardinality(scopes) > 1;
-- -- DELETE FROM public.patient_portal_links WHERE scopes = ARRAY['exercicios']::text[];
-- -- ALTER TABLE public.patient_portal_links DROP CONSTRAINT IF EXISTS patient_portal_links_scopes_check;
-- -- ALTER TABLE public.patient_portal_links ADD CONSTRAINT patient_portal_links_scopes_check CHECK (
-- --   cardinality(scopes) > 0
-- --   AND scopes <@ ARRAY['plano_alimentar','vacinas_peso','proximas_consultas','orientacoes','assinatura']::text[]);
-- ═══════════════════════════════════════════════════════════════════════════

-- ===== 20261131_odonto_periograma_orto.sql =====
-- ═══════════════════════════════════════════════════════════════════════════
-- ODONTOLOGIA — periograma (sondagem periodontal) e ficha de ortodontia
-- Criado em: 2026-11-15 (NÃO APLICADA: arquivo para o Dimitre revisar e aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por que tabelas novas: medical_records guarda UMA linha por paciente e a ficha sobrescreve o valor anterior.
-- O periograma precisa de HISTÓRICO por data (um exame por consulta, para comparar a evolução) e a ortodontia
-- precisa de um registro por tratamento (um paciente pode ter aparelho fixo e depois contenção). Mesmo desenho de
-- nutri_avaliacoes (20261113): linha com `data` + `dados` jsonb versionado (v:1), autor gravado por gatilho.
--
-- odonto_periogramas   1 linha por exame de sondagem (várias no mesmo dia são permitidas; a tela avisa).
--   data   dia do exame
--   dados  jsonb v:1, formato em src/lib/odonto/periograma.ts (6 sítios por dente: profundidade de sondagem e
--          recessão em mm, sangramento, supuração; mobilidade e furca por dente; dente ausente)
--
-- odonto_ortodontia    1 linha por tratamento ortodôntico.
--   data   data de referência do tratamento: a instalação do aparelho (ou o dia do cadastro, se ainda não instalado)
--   dados  jsonb v:1, formato em src/lib/odonto/ortodontia.ts (aparelho, arcadas, instalação, previsão, manutenções
--          com ativação/fio/elásticos/próxima manutenção/fotos). As fotos NÃO ficam no banco: o jsonb guarda só o
--          caminho no bucket `pacientes`, em ortodontia/<clinic_id>/<patient_id>/<arquivo>. A 2ª pasta é a clínica,
--          que é exatamente o que as policies de storage por clínica (20261127_pacientes_storage_por_clinica.sql)
--          já conferem, então NÃO há policy de storage nova aqui.
--
-- RLS (igual a nutri_avaliacoes, em duas camadas somadas):
--   * clinic_isolation (permissiva): só a própria clínica (ou superadmin).
--   * restrict_prontuario_* (RESTRICTIVE, por comando): exige has_module_perm('prontuario'), leitura (false) ou edição
--     (true). O INSERT confere ainda que o paciente pertence à mesma clínica da linha.
--   * restrict_*_by_area (RESTRICTIVE): em clínica com escopo por profissional, a linha só aparece para admin/recepção,
--     para o autor, ou para quem é da mesma área (specialty_type), via clinical_row_visible_to_my_area (20261111).
--
-- Dependências (a migração para com mensagem clara se faltar alguma): public.clinics, public.patients,
-- get_my_clinic_id(), is_superadmin(), has_module_perm(text, boolean), clinical_row_visible_to_my_area(uuid, uuid)
-- (20261111_pacientes_unicos_e_area.sql e 20261111_permissoes_por_modulo.sql).
--
-- Idempotente: CREATE ... IF NOT EXISTS, CREATE OR REPLACE e DROP ... IF EXISTS antes de cada CREATE. Pode rodar duas vezes.
-- Aditiva: não altera nenhuma tabela existente. Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_falta text;
BEGIN
  IF to_regclass('public.clinics') IS NULL OR to_regclass('public.patients') IS NULL THEN
    RAISE EXCEPTION 'public.clinics / public.patients não existem';
  END IF;
  -- confere pelo nome (as assinaturas exatas vêm das migrações de 20261111)
  SELECT string_agg(f, ', ') INTO v_falta
    FROM unnest(ARRAY['get_my_clinic_id', 'is_superadmin', 'has_module_perm', 'clinical_row_visible_to_my_area']) AS f
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = f);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'faltam funções: % (aplique antes 20261111_permissoes_por_modulo.sql e 20261111_pacientes_unicos_e_area.sql)', v_falta;
  END IF;
END
$$;

-- ─── Gatilho comum: autor = quem está logado (INSERT); updated_at sempre (UPDATE); clínica e paciente não mudam ───
CREATE OR REPLACE FUNCTION public.odonto_ficha_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.autor := auth.uid();
    END IF;
  ELSE
    NEW.clinic_id  := OLD.clinic_id;
    NEW.patient_id := OLD.patient_id;
    NEW.autor      := OLD.autor;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) odonto_periogramas
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.odonto_periogramas (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id  uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  data        date        NOT NULL DEFAULT CURRENT_DATE,
  dados       jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados) = 'object' AND pg_column_size(dados) <= 1048576),
  autor       uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.odonto_periogramas IS 'Odontologia: exames de sondagem periodontal (periograma) por paciente, com histórico por data para comparar a evolução.';
COMMENT ON COLUMN public.odonto_periogramas.dados IS 'JSON versionado (v:1). Formato em src/lib/odonto/periograma.ts: dentes[FDI] com 6 sítios (ps, rec, sang, sup), mobilidade, furca, ausente.';
COMMENT ON COLUMN public.odonto_periogramas.autor IS 'auth.users.id de quem gravou, definido pelo gatilho odonto_periogramas_before_write.';

CREATE INDEX IF NOT EXISTS idx_odonto_periogramas_paciente ON public.odonto_periogramas (patient_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_odonto_periogramas_clinica  ON public.odonto_periogramas (clinic_id);

DROP TRIGGER IF EXISTS odonto_periogramas_before_write ON public.odonto_periogramas;
CREATE TRIGGER odonto_periogramas_before_write
  BEFORE INSERT OR UPDATE ON public.odonto_periogramas
  FOR EACH ROW EXECUTE FUNCTION public.odonto_ficha_before_write();

ALTER TABLE public.odonto_periogramas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation ON public.odonto_periogramas;
CREATE POLICY clinic_isolation ON public.odonto_periogramas
  AS PERMISSIVE FOR ALL
  USING      (clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
  WITH CHECK (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

DROP POLICY IF EXISTS restrict_prontuario_select ON public.odonto_periogramas;
CREATE POLICY restrict_prontuario_select ON public.odonto_periogramas
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('prontuario', false)));

DROP POLICY IF EXISTS restrict_prontuario_insert ON public.odonto_periogramas;
CREATE POLICY restrict_prontuario_insert ON public.odonto_periogramas
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    (SELECT public.has_module_perm('prontuario', true))
    AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = odonto_periogramas.patient_id AND p.clinic_id = odonto_periogramas.clinic_id)
  );

DROP POLICY IF EXISTS restrict_prontuario_update ON public.odonto_periogramas;
CREATE POLICY restrict_prontuario_update ON public.odonto_periogramas
  AS RESTRICTIVE FOR UPDATE
  USING      ((SELECT public.has_module_perm('prontuario', true)))
  WITH CHECK ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_prontuario_delete ON public.odonto_periogramas;
CREATE POLICY restrict_prontuario_delete ON public.odonto_periogramas
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_odonto_periogramas_by_area ON public.odonto_periogramas;
CREATE POLICY restrict_odonto_periogramas_by_area ON public.odonto_periogramas
  AS RESTRICTIVE FOR ALL
  USING (public.clinical_row_visible_to_my_area(NULL, autor));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) odonto_ortodontia
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.odonto_ortodontia (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id  uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  data        date        NOT NULL DEFAULT CURRENT_DATE,
  dados       jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados) = 'object' AND pg_column_size(dados) <= 1048576),
  autor       uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.odonto_ortodontia IS 'Odontologia: fichas de tratamento ortodôntico (aparelho, arcadas, instalação e manutenções) por paciente, uma linha por tratamento.';
COMMENT ON COLUMN public.odonto_ortodontia.data IS 'Data de referência do tratamento: a instalação do aparelho (ou o dia do cadastro enquanto não instalado).';
COMMENT ON COLUMN public.odonto_ortodontia.dados IS 'JSON versionado (v:1). Formato em src/lib/odonto/ortodontia.ts. Fotos: só os caminhos no bucket pacientes (ortodontia/<clinic_id>/<patient_id>/...).';
COMMENT ON COLUMN public.odonto_ortodontia.autor IS 'auth.users.id de quem gravou, definido pelo gatilho odonto_ortodontia_before_write.';

CREATE INDEX IF NOT EXISTS idx_odonto_ortodontia_paciente ON public.odonto_ortodontia (patient_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_odonto_ortodontia_clinica  ON public.odonto_ortodontia (clinic_id);

DROP TRIGGER IF EXISTS odonto_ortodontia_before_write ON public.odonto_ortodontia;
CREATE TRIGGER odonto_ortodontia_before_write
  BEFORE INSERT OR UPDATE ON public.odonto_ortodontia
  FOR EACH ROW EXECUTE FUNCTION public.odonto_ficha_before_write();

ALTER TABLE public.odonto_ortodontia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation ON public.odonto_ortodontia;
CREATE POLICY clinic_isolation ON public.odonto_ortodontia
  AS PERMISSIVE FOR ALL
  USING      (clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
  WITH CHECK (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

DROP POLICY IF EXISTS restrict_prontuario_select ON public.odonto_ortodontia;
CREATE POLICY restrict_prontuario_select ON public.odonto_ortodontia
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('prontuario', false)));

DROP POLICY IF EXISTS restrict_prontuario_insert ON public.odonto_ortodontia;
CREATE POLICY restrict_prontuario_insert ON public.odonto_ortodontia
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    (SELECT public.has_module_perm('prontuario', true))
    AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = odonto_ortodontia.patient_id AND p.clinic_id = odonto_ortodontia.clinic_id)
  );

DROP POLICY IF EXISTS restrict_prontuario_update ON public.odonto_ortodontia;
CREATE POLICY restrict_prontuario_update ON public.odonto_ortodontia
  AS RESTRICTIVE FOR UPDATE
  USING      ((SELECT public.has_module_perm('prontuario', true)))
  WITH CHECK ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_prontuario_delete ON public.odonto_ortodontia;
CREATE POLICY restrict_prontuario_delete ON public.odonto_ortodontia
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_odonto_ortodontia_by_area ON public.odonto_ortodontia;
CREATE POLICY restrict_odonto_ortodontia_by_area ON public.odonto_ortodontia
  AS RESTRICTIVE FOR ALL
  USING (public.clinical_row_visible_to_my_area(NULL, autor));

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de aplicar; somente leitura):
--   -- RLS ligada nas duas tabelas (esperado: true, true)
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE oid IN ('public.odonto_periogramas'::regclass, 'public.odonto_ortodontia'::regclass);
--   -- 6 policies por tabela: clinic_isolation + restrict_prontuario_(select|insert|update|delete) + restrict_*_by_area
--   SELECT tablename, policyname, permissive, cmd FROM pg_policies
--    WHERE tablename IN ('odonto_periogramas', 'odonto_ortodontia') ORDER BY tablename, policyname;
--   -- gatilhos (esperado: 1 por tabela)
--   SELECT tgrelid::regclass, tgname FROM pg_trigger
--    WHERE tgname IN ('odonto_periogramas_before_write', 'odonto_ortodontia_before_write');
--
-- ROLLBACK (rodar manualmente; APAGA os periogramas e fichas de ortodontia; as fotos no storage ficam, apague pelo painel
-- se quiser: bucket pacientes, pasta ortodontia/):
--   DROP TABLE IF EXISTS public.odonto_periogramas;
--   DROP TABLE IF EXISTS public.odonto_ortodontia;
--   DROP FUNCTION IF EXISTS public.odonto_ficha_before_write();
-- ═══════════════════════════════════════════════════════════════════════════

-- ===== 20261133_medicina_exames_receita.sql =====
-- ═══════════════════════════════════════════════════════════════════════════
-- MEDICINA — pedido de exames estruturado, receita estruturada e medidas de crescimento (curvas da OMS)
-- Criado em: 2026-11-15 (NÃO APLICADA: arquivo para o Dimitre revisar e aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por que uma tabela nova: o prontuário médico precisa de HISTÓRICO por data de três coisas que não cabem em
-- medical_records (uma linha por paciente, sobrescrita) nem em record_entries (texto imutável da evolução):
--   tipo 'pedido_exames'  cada solicitação de exames emitida (itens, urgência, indicação clínica, CID)
--   tipo 'receita'        cada receita estruturada emitida (medicamento, dose, via, posologia, duração, observação)
--   tipo 'crescimento'    cada medida de crescimento (peso, comprimento/estatura, perímetro cefálico) para plotar
--                         nas curvas da OMS de 0 a 5 anos
-- Mesmo desenho de nutri_avaliacoes (20261113): uma linha por registro, JSON versionado (v:1) em `dados`, vários
-- registros no mesmo dia permitidos. Os formatos estão em src/lib/medico/exames/pedido.ts, receita/receita.ts e
-- crescimento/medidas.ts. Nenhuma tabela existente é alterada.
--
--   data   dia do pedido / da receita / da medida
--   dados  jsonb v:1 (objeto; no máximo ~100 KB)
--   autor  auth.users.id de quem gravou; preenchido pelo gatilho a partir de auth.uid() (não dá para forjar)
--
-- RLS (mesmo conjunto de nutri_avaliacoes, incluindo a restrição por área da 20261111_pacientes_unicos_e_area):
--   * clinic_isolation (permissiva): só a própria clínica (+ superadmin), na leitura e na escrita
--   * restrict_prontuario_* (RESTRICTIVE, por comando): exige has_module_perm('prontuario') — leitura: false, edição: true;
--     o INSERT confere ainda que o paciente pertence à mesma clínica da linha
--   * restrict_medico_registros_by_area (RESTRICTIVE): em clínica com escopo por profissional, só vê/grava quem é da
--     mesma área do autor (clinical_row_visible_to_my_area)
-- service_role ignora RLS (como nas demais tabelas).
--
-- Pré-requisitos: as funções get_my_clinic_id, is_superadmin, has_module_perm e clinical_row_visible_to_my_area
-- (migrações 20261111_permissoes_por_modulo e 20261111_pacientes_unicos_e_area). Se alguma faltar, o script PARA com
-- mensagem clara em vez de criar a tabela sem a proteção.
--
-- Idempotente: CREATE ... IF NOT EXISTS, CREATE OR REPLACE e DROP ... IF EXISTS antes de cada policy e gatilho; pode ser
-- rodada mais de uma vez. Aditiva: só cria tabela, índices, função, gatilho e policies.
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_falta text;
BEGIN
  SELECT string_agg(f, ', ') INTO v_falta
    FROM unnest(ARRAY['get_my_clinic_id', 'is_superadmin', 'has_module_perm', 'clinical_row_visible_to_my_area']) AS f
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f
   );
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam funções de permissão em public (%): aplique antes 20261111_permissoes_por_modulo.sql e 20261111_pacientes_unicos_e_area.sql', v_falta;
  END IF;
  IF to_regclass('public.clinics') IS NULL OR to_regclass('public.patients') IS NULL THEN
    RAISE EXCEPTION 'public.clinics ou public.patients não existe';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.medico_registros (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id  uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  tipo        text        NOT NULL CHECK (tipo IN ('pedido_exames', 'receita', 'crescimento')),
  data        date        NOT NULL DEFAULT CURRENT_DATE,
  dados       jsonb       NOT NULL DEFAULT '{}'::jsonb
              CHECK (jsonb_typeof(dados) = 'object' AND octet_length(dados::text) <= 100000),
  autor       uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.medico_registros IS 'Medicina: pedidos de exames (tipo pedido_exames), receitas estruturadas (tipo receita) e medidas de crescimento para as curvas da OMS (tipo crescimento) por paciente, com histórico por data.';
COMMENT ON COLUMN public.medico_registros.dados IS 'JSON versionado (v:1). Formato em src/lib/medico/exames/pedido.ts, receita/receita.ts e crescimento/medidas.ts.';
COMMENT ON COLUMN public.medico_registros.autor IS 'auth.users.id de quem gravou, definido pelo gatilho medico_registros_before_write.';

CREATE INDEX IF NOT EXISTS idx_medico_registros_paciente
  ON public.medico_registros (patient_id, tipo, data DESC);
CREATE INDEX IF NOT EXISTS idx_medico_registros_clinica
  ON public.medico_registros (clinic_id);

-- Gatilho: autor = quem está logado (INSERT); updated_at sempre (UPDATE); clinic_id, patient_id, tipo e autor não mudam.
CREATE OR REPLACE FUNCTION public.medico_registros_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL THEN
      NEW.autor := auth.uid();
    END IF;
  ELSE
    NEW.clinic_id  := OLD.clinic_id;
    NEW.patient_id := OLD.patient_id;
    NEW.tipo       := OLD.tipo;
    NEW.autor      := OLD.autor;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS medico_registros_before_write ON public.medico_registros;
CREATE TRIGGER medico_registros_before_write
  BEFORE INSERT OR UPDATE ON public.medico_registros
  FOR EACH ROW EXECUTE FUNCTION public.medico_registros_before_write();

-- ─── RLS ───
ALTER TABLE public.medico_registros ENABLE ROW LEVEL SECURITY;

-- Isolamento por clínica (igual a nutri_avaliacoes.clinic_isolation).
DROP POLICY IF EXISTS clinic_isolation ON public.medico_registros;
CREATE POLICY clinic_isolation ON public.medico_registros
  AS PERMISSIVE FOR ALL
  USING      (clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
  WITH CHECK (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

-- Permissão de módulo (igual a nutri_avaliacoes.restrict_prontuario_*): leitura vs. edição.
DROP POLICY IF EXISTS restrict_prontuario_select ON public.medico_registros;
CREATE POLICY restrict_prontuario_select ON public.medico_registros
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('prontuario', false)));

DROP POLICY IF EXISTS restrict_prontuario_insert ON public.medico_registros;
CREATE POLICY restrict_prontuario_insert ON public.medico_registros
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    (SELECT public.has_module_perm('prontuario', true))
    AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = medico_registros.patient_id AND p.clinic_id = medico_registros.clinic_id)
  );

DROP POLICY IF EXISTS restrict_prontuario_update ON public.medico_registros;
CREATE POLICY restrict_prontuario_update ON public.medico_registros
  AS RESTRICTIVE FOR UPDATE
  USING      ((SELECT public.has_module_perm('prontuario', true)))
  WITH CHECK ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_prontuario_delete ON public.medico_registros;
CREATE POLICY restrict_prontuario_delete ON public.medico_registros
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('prontuario', true)));

-- Restrição por área do profissional (igual a restrict_nutri_avaliacoes_by_area): autor = auth.uid() gravado pelo gatilho.
DROP POLICY IF EXISTS restrict_medico_registros_by_area ON public.medico_registros;
CREATE POLICY restrict_medico_registros_by_area ON public.medico_registros
  AS RESTRICTIVE FOR ALL
  USING (public.clinical_row_visible_to_my_area(NULL, autor));

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de aplicar):
--   SELECT polname, polcmd, polpermissive FROM pg_policy WHERE polrelid = 'public.medico_registros'::regclass ORDER BY 1;
--   -- esperado: clinic_isolation (permissiva, *) e restrict_prontuario_select/insert/update/delete +
--   --           restrict_medico_registros_by_area (restritivas)
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.medico_registros'::regclass;  -- esperado: true
--
-- ROLLBACK (rodar manualmente; apaga o histórico de pedidos, receitas e medidas de crescimento):
--   DROP TRIGGER IF EXISTS medico_registros_before_write ON public.medico_registros;
--   DROP FUNCTION IF EXISTS public.medico_registros_before_write();
--   DROP TABLE IF EXISTS public.medico_registros;
-- ═══════════════════════════════════════════════════════════════════════════
