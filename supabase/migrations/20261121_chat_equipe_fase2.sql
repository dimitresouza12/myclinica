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
