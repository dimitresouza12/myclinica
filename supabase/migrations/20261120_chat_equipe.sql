-- ═══════════════════════════════════════════════════════════════════════════
-- CHAT DA EQUIPE — conversas internas entre os logins (clinic_users) de uma clínica
-- Criado em: 2026-11-12 (arquivo 20261120) | Projeto Supabase: siohvtgbomvcprbzfamr
-- Depende de: get_my_clinic_id() (já existe). NÃO depende de has_module_perm: o chat não tem
-- permissão por módulo, vale para todo login ativo (clinic_users.is_active = true).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tipos de canal (team_channels.kind):
--   general  1 por clínica. Membros = todos os logins ativos.
--   area     1 por specialty_type presente na clínica. Membros = logins daquela área
--            + TODA a recepção/auxiliar + admins (role admin ou is_superadmin).
--   direct   2 pessoas. Chave única direct_key = menor:maior dos clinic_users.id.
--   group    livre; qualquer login ativo cria (RPC team_create_group).
--
-- Habilitação: o chat só funciona para clínica com >= 3 linhas em professionals
-- (team_chat_enabled). A habilitação é exigida nas policies de INSERT (canais, membros de
-- grupo e mensagens) e nas RPCs de escrita. O SELECT não exige (histórico continua legível).
--
-- Acesso (RLS, tudo isolado por clinic_id = get_my_clinic_id(); usuário desativado perde acesso
-- porque get_my_clinic_id() só devolve a clínica de login ativo):
--   * Ler canal/membros/mensagens: ser MEMBRO do canal, OU ser admin/superadmin DA PRÓPRIA clínica
--     (admin lê direct e group de outros; nunca de outra clínica).
--   * Escrever mensagem: só como o próprio sender e só em canal em que é membro, não arquivado.
--   * Sem UPDATE/DELETE direto em mensagem pelo navegador (sem GRANT). Apagar (soft delete) e
--     editar o PRÓPRIO texto passam pelas RPCs team_delete_message / team_edit_message.
--   * Membros: o navegador só lê, atualiza o próprio last_read_at/muted (GRANT por coluna),
--     e (só em grupo) o criador adiciona/remove gente e qualquer membro sai.
--   * Canais general/area e seus membros: só os gatilhos de sincronia (service/definer) mexem.
--
-- Sincronia (gatilhos AFTER em clinic_users e professionals): garantem o canal general e os
-- canais area e adicionam/removem a pessoa dos membros. Só criam canal para clínica habilitada.
-- Quando a clínica cai abaixo de 3 profissionais, general/area são ARQUIVADOS (archived_at; nada
-- é apagado) e voltam a ser desarquivados quando a clínica cruza 3 de novo.
-- Decisão: a clínica só ganha canais de área quando tem >= 2 áreas distintas (com uma só área o canal
-- seria idêntico ao general). Se cair para 1 área, os canais de área são arquivados.
-- "Área presente" = specialty_type em professionals da clínica OU em clinic_users ativos.
-- Área de um login = clinic_users.specialty_type + professionals.specialty_type ligados a ele
-- (professionals.clinic_user_id).
-- Falha na sincronia NUNCA derruba o cadastro de login/profissional: o gatilho captura o erro
-- e emite WARNING (a próxima mudança, ou rodar team_sync_clinic, repara).
--
-- Realtime: SOMENTE team_messages entra na publicação supabase_realtime (a RLS vale no Realtime:
-- cada usuário só recebe eventos de canais que pode ler).
--
-- Inventário prévio (somente leitura, 2026-11-12): nenhuma função/tabela team_* existia no banco,
-- então não há overload/colisão. Funções novas: team_my_member_id, team_is_clinic_admin,
-- team_clinic_has_chat, team_chat_enabled, is_team_channel_member, team_can_read_channel,
-- team_channel_writable, team_is_group, team_is_group_creator, team_member_in_my_clinic,
-- team_area_label, team_user_areas, team_area_eligible, team_sync_clinic, team_trg_*,
-- RPCs: team_unread_counts, team_mark_read, team_open_direct, team_create_group,
-- team_delete_message, team_edit_message, team_members_directory.
--
-- Por que team_members_directory existe (fora da lista pedida): a policy de clinic_users só deixa o
-- login não-admin ler a PRÓPRIA linha; sem a RPC o chat não teria como mostrar o nome de quem
-- escreveu. Ela devolve só id, nome, cargo e áreas (sem cpf/e-mail/username) dos logins ativos.
--
-- Aditiva: só tabelas, funções, policies e gatilhos novos (gatilhos em clinic_users e
-- professionals são AFTER e novos; nenhum existente é alterado).
-- Desfazer: bloco ROLLBACK no fim.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Tabelas ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_channels (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id      uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  kind           text        NOT NULL CHECK (kind IN ('general', 'area', 'direct', 'group')),
  specialty_type text        CHECK (specialty_type IS NULL OR specialty_type IN
                               ('odonto', 'medico', 'estetica', 'vet', 'fisio', 'psico', 'nutri', 'fono', 'to')),
  name           text,
  -- só em direct: menor:maior dos clinic_users.id (garante 1 conversa por par)
  direct_key     text,
  created_by     uuid        REFERENCES public.clinic_users(id) ON DELETE SET NULL,
  archived_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT team_channels_area_shape CHECK (
    (kind = 'area' AND specialty_type IS NOT NULL) OR (kind <> 'area' AND specialty_type IS NULL)
  ),
  CONSTRAINT team_channels_direct_shape CHECK ((kind = 'direct') = (direct_key IS NOT NULL)),
  CONSTRAINT team_channels_name_shape CHECK (
    (kind = 'direct' AND name IS NULL)
    OR (kind <> 'direct' AND name IS NOT NULL AND char_length(btrim(name)) BETWEEN 1 AND 80)
  ),
  -- alvo de FK composta (team_messages garante que clinic_id da mensagem = clinic_id do canal)
  CONSTRAINT team_channels_id_clinic_key UNIQUE (id, clinic_id)
);

-- um general por clínica; um area por (clínica, especialidade); um direct por par
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_channels_general ON public.team_channels (clinic_id) WHERE kind = 'general';
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_channels_area    ON public.team_channels (clinic_id, specialty_type) WHERE kind = 'area';
-- índice ÚNICO COMPLETO (não parcial): NULL é distinto no Postgres e o ON CONFLICT (direct_key) funciona
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_channels_direct  ON public.team_channels (direct_key);
CREATE INDEX        IF NOT EXISTS idx_team_channels_clinic ON public.team_channels (clinic_id, kind);

CREATE TABLE IF NOT EXISTS public.team_channel_members (
  channel_id     uuid        NOT NULL REFERENCES public.team_channels(id) ON DELETE CASCADE,
  clinic_user_id uuid        NOT NULL REFERENCES public.clinic_users(id)  ON DELETE CASCADE,
  -- entra "lido até agora": quem é adicionado depois não recebe o histórico inteiro como não lido
  last_read_at   timestamptz NOT NULL DEFAULT now(),
  muted          boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, clinic_user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_channel_members (clinic_user_id);

CREATE TABLE IF NOT EXISTS public.team_messages (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id            uuid        NOT NULL,
  clinic_id             uuid        NOT NULL,
  sender_clinic_user_id uuid        REFERENCES public.clinic_users(id) ON DELETE SET NULL,
  -- 1..4000 para mensagem viva. Mensagem apagada (deleted_at) tem o texto zerado pela RPC.
  body                  text        NOT NULL,
  reply_to_id           uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  edited_at             timestamptz,
  deleted_at            timestamptz,

  CONSTRAINT team_messages_body_len CHECK (
    char_length(body) <= 4000 AND (deleted_at IS NOT NULL OR char_length(btrim(body)) >= 1)
  ),
  -- clinic_id da mensagem tem que ser o da clínica do canal
  CONSTRAINT team_messages_channel_fk FOREIGN KEY (channel_id, clinic_id)
    REFERENCES public.team_channels (id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT team_messages_id_channel_key UNIQUE (id, channel_id),
  -- a resposta tem que ser a uma mensagem do MESMO canal
  CONSTRAINT team_messages_reply_fk FOREIGN KEY (reply_to_id, channel_id)
    REFERENCES public.team_messages (id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_team_messages_channel_recent ON public.team_messages (channel_id, created_at DESC);


-- ─── 2. Helpers (STABLE SECURITY DEFINER, search_path fixo) ─────────────────

-- clinic_users.id do login atual (ativo) na clínica atual
CREATE OR REPLACE FUNCTION public.team_my_member_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT cu.id FROM public.clinic_users cu
  WHERE cu.user_id = auth.uid()
    AND cu.is_active = true
    AND cu.clinic_id = public.get_my_clinic_id()
  LIMIT 1;
$function$;

-- admin ou superadmin DA PRÓPRIA clínica (linha do próprio login; não cruza clínica)
CREATE OR REPLACE FUNCTION public.team_is_clinic_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.is_active = true
      AND cu.clinic_id = public.get_my_clinic_id()
      AND (cu.role = 'admin' OR COALESCE(cu.is_superadmin, false))
  );
$function$;

-- INTERNO (gatilhos, backfill, sincronia): >= 3 profissionais, para qualquer clínica
CREATE OR REPLACE FUNCTION public.team_clinic_has_chat(p_clinic uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_clinic IS NOT NULL
     AND (SELECT count(*) FROM public.professionals p WHERE p.clinic_id = p_clinic) >= 3;
$function$;

-- Habilitação usada pelas policies, RPCs e pelo app: só responde pela clínica do próprio login
-- (não vira oráculo "quantos profissionais tem a clínica X" para quem chuta um uuid).
CREATE OR REPLACE FUNCTION public.team_chat_enabled(p_clinic uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_clinic IS NOT NULL
     AND p_clinic = public.get_my_clinic_id()
     AND public.team_clinic_has_chat(p_clinic);
$function$;

-- sou membro (e o canal é da minha clínica)
CREATE OR REPLACE FUNCTION public.is_team_channel_member(p_channel uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_channel_members m
    JOIN public.team_channels c ON c.id = m.channel_id
    WHERE m.channel_id = p_channel
      AND m.clinic_user_id = public.team_my_member_id()
      AND c.clinic_id = public.get_my_clinic_id()
  );
$function$;

-- posso LER o canal: membro, ou admin/superadmin da clínica dona do canal
CREATE OR REPLACE FUNCTION public.team_can_read_channel(p_channel uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_channels c
    WHERE c.id = p_channel
      AND c.clinic_id = public.get_my_clinic_id()
      AND (public.is_team_channel_member(c.id) OR public.team_is_clinic_admin())
  );
$function$;

-- posso ESCREVER: membro, canal da clínica informada (= a minha) e não arquivado
CREATE OR REPLACE FUNCTION public.team_channel_writable(p_channel uuid, p_clinic uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_channels c
    JOIN public.team_channel_members m ON m.channel_id = c.id
    WHERE c.id = p_channel
      AND c.clinic_id = p_clinic
      AND c.clinic_id = public.get_my_clinic_id()
      AND c.archived_at IS NULL
      AND m.clinic_user_id = public.team_my_member_id()
  );
$function$;

CREATE OR REPLACE FUNCTION public.team_is_group(p_channel uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_channels c
    WHERE c.id = p_channel AND c.kind = 'group' AND c.clinic_id = public.get_my_clinic_id()
  );
$function$;

CREATE OR REPLACE FUNCTION public.team_is_group_creator(p_channel uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.team_channels c
    WHERE c.id = p_channel
      AND c.kind = 'group'
      AND c.clinic_id = public.get_my_clinic_id()
      AND c.created_by = public.team_my_member_id()
  );
$function$;

-- p_cu é login ATIVO da minha clínica
CREATE OR REPLACE FUNCTION public.team_member_in_my_clinic(p_cu uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.id = p_cu
      AND cu.clinic_id = public.get_my_clinic_id()
      AND cu.is_active = true
  );
$function$;

-- Rótulo pt-BR da área (vira o name do canal area)
CREATE OR REPLACE FUNCTION public.team_area_label(p_area text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE p_area
    WHEN 'odonto'   THEN 'Odontologia'
    WHEN 'medico'   THEN 'Medicina'
    WHEN 'estetica' THEN 'Estética'
    WHEN 'vet'      THEN 'Veterinária'
    WHEN 'fisio'    THEN 'Fisioterapia'
    WHEN 'psico'    THEN 'Psicologia'
    WHEN 'nutri'    THEN 'Nutrição'
    WHEN 'fono'     THEN 'Fonoaudiologia'
    WHEN 'to'       THEN 'Terapia Ocupacional'
    ELSE p_area
  END;
$function$;

-- INTERNO: áreas de um login (clinic_users.specialty_type + professionals ligados a ele)
CREATE OR REPLACE FUNCTION public.team_user_areas(p_cu uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT t.s ORDER BY t.s), '{}'::text[])
  FROM (
    SELECT cu.specialty_type AS s FROM public.clinic_users cu
      WHERE cu.id = p_cu AND cu.specialty_type IS NOT NULL
    UNION
    SELECT p.specialty_type FROM public.professionals p
      WHERE p.clinic_user_id = p_cu AND p.specialty_type IS NOT NULL
  ) t;
$function$;

-- INTERNO: este login entra no canal da área p_area? (ativo e: recepção/auxiliar, admin,
-- superadmin, ou da própria área)
CREATE OR REPLACE FUNCTION public.team_area_eligible(p_cu uuid, p_area text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_users cu
    WHERE cu.id = p_cu
      AND cu.is_active = true
      AND (
        cu.role IN ('recepcao', 'auxiliar', 'admin')
        OR COALESCE(cu.is_superadmin, false)
        OR cu.specialty_type = p_area
        OR EXISTS (SELECT 1 FROM public.professionals p
                   WHERE p.clinic_user_id = cu.id AND p.specialty_type = p_area)
      )
  );
$function$;


-- ─── 3. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.team_channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_messages        ENABLE ROW LEVEL SECURITY;

-- Privilégios: nada para anon; o navegador (authenticated) só o necessário, e por coluna onde
-- convém. service_role mantém tudo (rotas de servidor e a sincronia).
REVOKE ALL ON public.team_channels, public.team_channel_members, public.team_messages FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.team_channels, public.team_channel_members, public.team_messages TO authenticated;
-- criar grupo direto pela API (o caminho normal é a RPC team_create_group); renomear grupo
GRANT INSERT (id, clinic_id, kind, name, created_by) ON public.team_channels TO authenticated;
GRANT UPDATE (name)                                    ON public.team_channels TO authenticated;
-- membros: adicionar em grupo, atualizar só o próprio marcador/silêncio, sair/remover de grupo
GRANT INSERT (channel_id, clinic_user_id)              ON public.team_channel_members TO authenticated;
GRANT UPDATE (last_read_at, muted)                     ON public.team_channel_members TO authenticated;
GRANT DELETE                                           ON public.team_channel_members TO authenticated;
-- mensagens: só ler e inserir (sem created_at/edited_at/deleted_at; sem UPDATE/DELETE)
GRANT INSERT (id, channel_id, clinic_id, sender_clinic_user_id, body, reply_to_id) ON public.team_messages TO authenticated;

-- team_channels
DROP POLICY IF EXISTS team_channels_select ON public.team_channels;
CREATE POLICY team_channels_select ON public.team_channels
  FOR SELECT TO authenticated
  USING (
    clinic_id = (SELECT public.get_my_clinic_id())
    AND (
      (SELECT public.team_is_clinic_admin())
      OR public.is_team_channel_member(id)
      OR created_by = (SELECT public.team_my_member_id())   -- permite INSERT ... RETURNING do criador
    )
  );

DROP POLICY IF EXISTS team_channels_insert_group ON public.team_channels;
CREATE POLICY team_channels_insert_group ON public.team_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    kind = 'group'
    AND clinic_id = (SELECT public.get_my_clinic_id())
    AND created_by = (SELECT public.team_my_member_id())
    AND public.team_chat_enabled(clinic_id)
  );

DROP POLICY IF EXISTS team_channels_update_group_name ON public.team_channels;
CREATE POLICY team_channels_update_group_name ON public.team_channels
  FOR UPDATE TO authenticated
  USING (
    kind = 'group'
    AND clinic_id = (SELECT public.get_my_clinic_id())
    AND created_by = (SELECT public.team_my_member_id())
  )
  WITH CHECK (
    kind = 'group'
    AND clinic_id = (SELECT public.get_my_clinic_id())
    AND created_by = (SELECT public.team_my_member_id())
  );

-- team_channel_members
DROP POLICY IF EXISTS team_members_select ON public.team_channel_members;
CREATE POLICY team_members_select ON public.team_channel_members
  FOR SELECT TO authenticated
  USING (public.team_can_read_channel(channel_id));

DROP POLICY IF EXISTS team_members_insert_group ON public.team_channel_members;
CREATE POLICY team_members_insert_group ON public.team_channel_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.team_is_group_creator(channel_id)
    AND public.team_member_in_my_clinic(clinic_user_id)
    AND public.team_chat_enabled((SELECT public.get_my_clinic_id()))
  );

DROP POLICY IF EXISTS team_members_update_own ON public.team_channel_members;
CREATE POLICY team_members_update_own ON public.team_channel_members
  FOR UPDATE TO authenticated
  USING (clinic_user_id = (SELECT public.team_my_member_id()))
  WITH CHECK (clinic_user_id = (SELECT public.team_my_member_id()));

-- só em grupo: o criador remove gente; qualquer membro sai
DROP POLICY IF EXISTS team_members_delete_group ON public.team_channel_members;
CREATE POLICY team_members_delete_group ON public.team_channel_members
  FOR DELETE TO authenticated
  USING (
    public.team_is_group_creator(channel_id)
    OR (clinic_user_id = (SELECT public.team_my_member_id()) AND public.team_is_group(channel_id))
  );

-- team_messages
DROP POLICY IF EXISTS team_messages_select ON public.team_messages;
CREATE POLICY team_messages_select ON public.team_messages
  FOR SELECT TO authenticated
  USING (
    clinic_id = (SELECT public.get_my_clinic_id())
    AND public.team_can_read_channel(channel_id)
  );

DROP POLICY IF EXISTS team_messages_insert ON public.team_messages;
CREATE POLICY team_messages_insert ON public.team_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = (SELECT public.get_my_clinic_id())
    AND sender_clinic_user_id = (SELECT public.team_my_member_id())
    AND public.team_chat_enabled(clinic_id)
    AND public.team_channel_writable(channel_id, clinic_id)
  );
-- (sem policy de UPDATE/DELETE em team_messages: negado; apagar/editar só pelas RPCs)


-- ─── 4. Integridade extra: membro e canal da mesma clínica ───────────────────

CREATE OR REPLACE FUNCTION public.team_trg_member_same_clinic()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF (SELECT c.clinic_id FROM public.team_channels c WHERE c.id = NEW.channel_id)
     IS DISTINCT FROM
     (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.id = NEW.clinic_user_id) THEN
    RAISE EXCEPTION 'member_other_clinic' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_team_members_same_clinic ON public.team_channel_members;
CREATE TRIGGER trg_team_members_same_clinic
  BEFORE INSERT ON public.team_channel_members
  FOR EACH ROW EXECUTE FUNCTION public.team_trg_member_same_clinic();


-- ─── 5. Sincronia de canais e membros ────────────────────────────────────────

-- Reconcilia UMA clínica de forma idempotente. Concorrência: advisory lock por clínica.
CREATE OR REPLACE FUNCTION public.team_sync_clinic(p_clinic uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_general uuid;
  v_areas   text[];
  v_n       int;
BEGIN
  IF p_clinic IS NULL THEN RETURN; END IF;
  -- clínica sendo apagada (cascade) ou inexistente: nada a fazer
  IF NOT EXISTS (SELECT 1 FROM public.clinics WHERE id = p_clinic) THEN RETURN; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('team_sync:' || p_clinic::text, 0));

  -- Abaixo de 3 profissionais: arquiva general/area (nada é apagado)
  IF NOT public.team_clinic_has_chat(p_clinic) THEN
    UPDATE public.team_channels
       SET archived_at = now()
     WHERE clinic_id = p_clinic AND kind IN ('general', 'area') AND archived_at IS NULL;
    RETURN;
  END IF;

  -- general
  INSERT INTO public.team_channels (clinic_id, kind, name)
  VALUES (p_clinic, 'general', 'Geral')
  ON CONFLICT DO NOTHING;

  UPDATE public.team_channels
     SET archived_at = NULL
   WHERE clinic_id = p_clinic AND kind = 'general' AND archived_at IS NOT NULL;

  SELECT c.id INTO v_general
  FROM public.team_channels c WHERE c.clinic_id = p_clinic AND c.kind = 'general';

  IF v_general IS NOT NULL THEN
    INSERT INTO public.team_channel_members (channel_id, clinic_user_id)
    SELECT v_general, cu.id
    FROM public.clinic_users cu
    WHERE cu.clinic_id = p_clinic AND cu.is_active = true
    ON CONFLICT DO NOTHING;

    DELETE FROM public.team_channel_members m
    WHERE m.channel_id = v_general
      AND NOT EXISTS (
        SELECT 1 FROM public.clinic_users cu
        WHERE cu.id = m.clinic_user_id AND cu.clinic_id = p_clinic AND cu.is_active = true
      );
  END IF;

  -- áreas presentes (profissionais da clínica + logins ativos com specialty_type)
  SELECT COALESCE(array_agg(DISTINCT a.s ORDER BY a.s), '{}'::text[]) INTO v_areas
  FROM (
    SELECT p.specialty_type AS s FROM public.professionals p
      WHERE p.clinic_id = p_clinic AND p.specialty_type IS NOT NULL
    UNION
    SELECT cu.specialty_type FROM public.clinic_users cu
      WHERE cu.clinic_id = p_clinic AND cu.is_active = true AND cu.specialty_type IS NOT NULL
  ) a;
  v_n := COALESCE(array_length(v_areas, 1), 0);

  IF v_n >= 2 THEN
    INSERT INTO public.team_channels (clinic_id, kind, specialty_type, name)
    SELECT p_clinic, 'area', a, public.team_area_label(a)
    FROM unnest(v_areas) AS a
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.team_channels
     SET archived_at = NULL
   WHERE clinic_id = p_clinic AND kind = 'area' AND archived_at IS NOT NULL
     AND v_n >= 2 AND specialty_type = ANY (v_areas);

  UPDATE public.team_channels
     SET archived_at = now()
   WHERE clinic_id = p_clinic AND kind = 'area' AND archived_at IS NULL
     AND NOT (v_n >= 2 AND specialty_type = ANY (v_areas));

  INSERT INTO public.team_channel_members (channel_id, clinic_user_id)
  SELECT c.id, cu.id
  FROM public.team_channels c
  JOIN public.clinic_users cu ON cu.clinic_id = c.clinic_id
  WHERE c.clinic_id = p_clinic AND c.kind = 'area' AND c.archived_at IS NULL
    AND public.team_area_eligible(cu.id, c.specialty_type)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.team_channel_members m
  USING public.team_channels c
  WHERE m.channel_id = c.id
    AND c.clinic_id = p_clinic AND c.kind = 'area' AND c.archived_at IS NULL
    AND NOT public.team_area_eligible(m.clinic_user_id, c.specialty_type);
END;
$function$;

-- Gatilho em clinic_users: login novo, ativação/desativação, troca de área, de cargo ou de clínica
CREATE OR REPLACE FUNCTION public.team_trg_clinic_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    PERFORM public.team_sync_clinic(NEW.clinic_id);
    IF TG_OP = 'UPDATE' AND OLD.clinic_id IS DISTINCT FROM NEW.clinic_id THEN
      PERFORM public.team_sync_clinic(OLD.clinic_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'team_trg_clinic_users: % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$function$;

-- Gatilho em professionals: provisiona/desprovisiona ao cruzar 3 e acompanha mudança de área/vínculo
CREATE OR REPLACE FUNCTION public.team_trg_professionals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      PERFORM public.team_sync_clinic(OLD.clinic_id);
    ELSE
      PERFORM public.team_sync_clinic(NEW.clinic_id);
      IF TG_OP = 'UPDATE' AND OLD.clinic_id IS DISTINCT FROM NEW.clinic_id THEN
        PERFORM public.team_sync_clinic(OLD.clinic_id);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'team_trg_professionals: % (%)', SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_team_sync_cu_insert ON public.clinic_users;
CREATE TRIGGER trg_team_sync_cu_insert
  AFTER INSERT ON public.clinic_users
  FOR EACH ROW EXECUTE FUNCTION public.team_trg_clinic_users();

DROP TRIGGER IF EXISTS trg_team_sync_cu_update ON public.clinic_users;
CREATE TRIGGER trg_team_sync_cu_update
  AFTER UPDATE OF is_active, specialty_type, role, is_superadmin, clinic_id ON public.clinic_users
  FOR EACH ROW
  WHEN (OLD.is_active      IS DISTINCT FROM NEW.is_active
     OR OLD.specialty_type IS DISTINCT FROM NEW.specialty_type
     OR OLD.role           IS DISTINCT FROM NEW.role
     OR OLD.is_superadmin  IS DISTINCT FROM NEW.is_superadmin
     OR OLD.clinic_id      IS DISTINCT FROM NEW.clinic_id)
  EXECUTE FUNCTION public.team_trg_clinic_users();

DROP TRIGGER IF EXISTS trg_team_sync_prof_insert ON public.professionals;
CREATE TRIGGER trg_team_sync_prof_insert
  AFTER INSERT ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.team_trg_professionals();

DROP TRIGGER IF EXISTS trg_team_sync_prof_delete ON public.professionals;
CREATE TRIGGER trg_team_sync_prof_delete
  AFTER DELETE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.team_trg_professionals();

DROP TRIGGER IF EXISTS trg_team_sync_prof_update ON public.professionals;
CREATE TRIGGER trg_team_sync_prof_update
  AFTER UPDATE OF specialty_type, clinic_user_id, clinic_id ON public.professionals
  FOR EACH ROW
  WHEN (OLD.specialty_type  IS DISTINCT FROM NEW.specialty_type
     OR OLD.clinic_user_id  IS DISTINCT FROM NEW.clinic_user_id
     OR OLD.clinic_id       IS DISTINCT FROM NEW.clinic_id)
  EXECUTE FUNCTION public.team_trg_professionals();


-- ─── 6. RPCs (SECURITY DEFINER, só authenticated) ───────────────────────────

-- Não lidas do login logado, por canal (só canais em que ele é membro, não arquivados).
-- Conta mensagens de outras pessoas, não apagadas, depois do last_read_at.
CREATE OR REPLACE FUNCTION public.team_unread_counts()
 RETURNS TABLE (channel_id uuid, unread bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT m.channel_id, count(msg.id)::bigint AS unread
  FROM public.team_channel_members m
  JOIN public.team_channels c ON c.id = m.channel_id
  LEFT JOIN public.team_messages msg
         ON msg.channel_id = m.channel_id
        AND msg.created_at > m.last_read_at
        AND msg.deleted_at IS NULL
        AND msg.sender_clinic_user_id IS DISTINCT FROM m.clinic_user_id
  WHERE m.clinic_user_id = public.team_my_member_id()
    AND c.clinic_id = public.get_my_clinic_id()
    AND c.archived_at IS NULL
  GROUP BY m.channel_id;
$function$;

CREATE OR REPLACE FUNCTION public.team_mark_read(p_channel uuid)
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

  UPDATE public.team_channel_members
     SET last_read_at = now()
   WHERE channel_id = p_channel AND clinic_user_id = v_me;
END;
$function$;

-- Acha ou cria a conversa direta com p_other (clinic_users.id de outro login ativo da MESMA clínica)
CREATE OR REPLACE FUNCTION public.team_open_direct(p_other uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me     uuid := public.team_my_member_id();
  v_clinic uuid := public.get_my_clinic_id();
  v_key    text;
  v_id     uuid;
BEGIN
  IF v_me IS NULL OR v_clinic IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_other IS NULL OR p_other = v_me THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;
  IF NOT public.team_member_in_my_clinic(p_other) THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = '42501';
  END IF;
  IF NOT public.team_clinic_has_chat(v_clinic) THEN
    RAISE EXCEPTION 'chat_disabled' USING ERRCODE = '42501';
  END IF;

  v_key := least(v_me, p_other)::text || ':' || greatest(v_me, p_other)::text;

  INSERT INTO public.team_channels (clinic_id, kind, direct_key, created_by)
  VALUES (v_clinic, 'direct', v_key, v_me)
  ON CONFLICT (direct_key) DO NOTHING;

  SELECT c.id INTO v_id
  FROM public.team_channels c
  WHERE c.direct_key = v_key AND c.clinic_id = v_clinic;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'direct_unavailable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.team_channel_members (channel_id, clinic_user_id)
  VALUES (v_id, v_me), (v_id, p_other)
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$function$;

-- Cria grupo; o criador entra sozinho. p_members = clinic_users.id (outros logins ativos da clínica).
CREATE OR REPLACE FUNCTION public.team_create_group(p_name text, p_members uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me     uuid := public.team_my_member_id();
  v_clinic uuid := public.get_my_clinic_id();
  v_name   text := btrim(COALESCE(p_name, ''));
  v_ids    uuid[];
  v_id     uuid;
BEGIN
  IF v_me IS NULL OR v_clinic IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.team_clinic_has_chat(v_clinic) THEN
    RAISE EXCEPTION 'chat_disabled' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT x FROM unnest(COALESCE(p_members, '{}'::uuid[])) AS x
    WHERE x IS NOT NULL AND x <> v_me
  );
  IF COALESCE(cardinality(v_ids), 0) < 1 THEN
    RAISE EXCEPTION 'group_needs_members' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_ids) > 199 THEN
    RAISE EXCEPTION 'too_many_members' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.clinic_users cu
      WHERE cu.id = ANY (v_ids) AND cu.clinic_id = v_clinic AND cu.is_active = true) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'invalid_member' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.team_channels (clinic_id, kind, name, created_by)
  VALUES (v_clinic, 'group', v_name, v_me)
  RETURNING id INTO v_id;

  INSERT INTO public.team_channel_members (channel_id, clinic_user_id)
  SELECT v_id, x FROM unnest(v_ids || v_me) AS x;

  RETURN v_id;
END;
$function$;

-- Apaga (soft delete) a PRÓPRIA mensagem: marca deleted_at e zera o texto.
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
END;
$function$;

-- Edita o texto da PRÓPRIA mensagem (não apagada), em canal em que ainda pode escrever.
CREATE OR REPLACE FUNCTION public.team_edit_message(p_message uuid, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me     uuid := public.team_my_member_id();
  v_clinic uuid := public.get_my_clinic_id();
BEGIN
  IF v_me IS NULL OR v_clinic IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.team_clinic_has_chat(v_clinic) THEN
    RAISE EXCEPTION 'chat_disabled' USING ERRCODE = '42501';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'invalid_body' USING ERRCODE = '22023';
  END IF;

  UPDATE public.team_messages msg
     SET body = p_body, edited_at = now()
   WHERE msg.id = p_message
     AND msg.sender_clinic_user_id = v_me
     AND msg.clinic_id = v_clinic
     AND msg.deleted_at IS NULL
     AND public.team_channel_writable(msg.channel_id, v_clinic);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- Quem está na clínica (para mostrar nome/cargo no chat). Sem cpf, e-mail nem username.
CREATE OR REPLACE FUNCTION public.team_members_directory()
 RETURNS TABLE (clinic_user_id uuid, display_name text, role text, areas text[], is_me boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT cu.id, cu.display_name, cu.role, public.team_user_areas(cu.id), (cu.id = public.team_my_member_id())
  FROM public.clinic_users cu
  WHERE cu.clinic_id = public.get_my_clinic_id()
    AND cu.is_active = true
    AND public.team_my_member_id() IS NOT NULL
  ORDER BY cu.display_name;
$function$;


-- ─── 7. Grants das funções ───────────────────────────────────────────────────

-- Usadas dentro das policies (executam como o usuário): authenticated precisa de EXECUTE.
-- anon e PUBLIC não.
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.team_my_member_id()',
    'public.team_is_clinic_admin()',
    'public.team_chat_enabled(uuid)',
    'public.is_team_channel_member(uuid)',
    'public.team_can_read_channel(uuid)',
    'public.team_channel_writable(uuid, uuid)',
    'public.team_is_group(uuid)',
    'public.team_is_group_creator(uuid)',
    'public.team_member_in_my_clinic(uuid)',
    'public.team_unread_counts()',
    'public.team_mark_read(uuid)',
    'public.team_open_direct(uuid)',
    'public.team_create_group(text, uuid[])',
    'public.team_delete_message(uuid)',
    'public.team_edit_message(uuid, text)',
    'public.team_members_directory()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;

  -- Internas: só o dono (definer) e, na sincronia, o service_role. Nada para o navegador.
  FOREACH f IN ARRAY ARRAY[
    'public.team_clinic_has_chat(uuid)',
    'public.team_area_label(text)',
    'public.team_user_areas(uuid)',
    'public.team_area_eligible(uuid, text)',
    'public.team_sync_clinic(uuid)',
    'public.team_trg_member_same_clinic()',
    'public.team_trg_clinic_users()',
    'public.team_trg_professionals()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.team_sync_clinic(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.team_clinic_has_chat(uuid) TO service_role;


-- ─── 8. Realtime: SOMENTE team_messages ─────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'team_messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
    END IF;
  END IF;
END $$;


-- ─── 9. Backfill idempotente das clínicas atuais ────────────────────────────

-- Reconcilia todas as clínicas; só as elegíveis (>= 3 profissionais) ganham canais.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.clinics LOOP
    PERFORM public.team_sync_clinic(r.id);
  END LOOP;
END $$;


COMMENT ON TABLE public.team_channels IS
  'Chat da equipe: canais (general, area, direct, group) de uma clínica. general/area são mantidos por gatilhos (team_sync_clinic).';
COMMENT ON TABLE public.team_channel_members IS
  'Chat da equipe: quem está em cada canal e até onde leu (last_read_at). Cada login só altera o próprio last_read_at/muted.';
COMMENT ON TABLE public.team_messages IS
  'Chat da equipe: mensagens. Sem UPDATE/DELETE direto; apagar/editar pelas RPCs team_delete_message/team_edit_message. Está na publicação supabase_realtime.';


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar à mão, em ordem; DESTRUTIVO: apaga todas as conversas do chat)
-- ═══════════════════════════════════════════════════════════════════════════
--   -- 1) gatilhos em tabelas existentes (os mais seguros de remover primeiro)
--   DROP TRIGGER IF EXISTS trg_team_sync_cu_insert   ON public.clinic_users;
--   DROP TRIGGER IF EXISTS trg_team_sync_cu_update   ON public.clinic_users;
--   DROP TRIGGER IF EXISTS trg_team_sync_prof_insert ON public.professionals;
--   DROP TRIGGER IF EXISTS trg_team_sync_prof_delete ON public.professionals;
--   DROP TRIGGER IF EXISTS trg_team_sync_prof_update ON public.professionals;
--
--   -- 2) publicação realtime (opcional: DROP TABLE já tira da publicação)
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.team_messages;
--
--   -- 3) tabelas (cascateiam policies, índices, gatilho de membros e as FKs)
--   DROP TABLE IF EXISTS public.team_messages;
--   DROP TABLE IF EXISTS public.team_channel_members;
--   DROP TABLE IF EXISTS public.team_channels;
--
--   -- 4) funções
--   DROP FUNCTION IF EXISTS public.team_members_directory();
--   DROP FUNCTION IF EXISTS public.team_edit_message(uuid, text);
--   DROP FUNCTION IF EXISTS public.team_delete_message(uuid);
--   DROP FUNCTION IF EXISTS public.team_create_group(text, uuid[]);
--   DROP FUNCTION IF EXISTS public.team_open_direct(uuid);
--   DROP FUNCTION IF EXISTS public.team_mark_read(uuid);
--   DROP FUNCTION IF EXISTS public.team_unread_counts();
--   DROP FUNCTION IF EXISTS public.team_trg_professionals();
--   DROP FUNCTION IF EXISTS public.team_trg_clinic_users();
--   DROP FUNCTION IF EXISTS public.team_trg_member_same_clinic();
--   DROP FUNCTION IF EXISTS public.team_sync_clinic(uuid);
--   DROP FUNCTION IF EXISTS public.team_area_eligible(uuid, text);
--   DROP FUNCTION IF EXISTS public.team_user_areas(uuid);
--   DROP FUNCTION IF EXISTS public.team_area_label(text);
--   DROP FUNCTION IF EXISTS public.team_member_in_my_clinic(uuid);
--   DROP FUNCTION IF EXISTS public.team_is_group_creator(uuid);
--   DROP FUNCTION IF EXISTS public.team_is_group(uuid);
--   DROP FUNCTION IF EXISTS public.team_channel_writable(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.team_can_read_channel(uuid);
--   DROP FUNCTION IF EXISTS public.is_team_channel_member(uuid);
--   DROP FUNCTION IF EXISTS public.team_chat_enabled(uuid);
--   DROP FUNCTION IF EXISTS public.team_clinic_has_chat(uuid);
--   DROP FUNCTION IF EXISTS public.team_is_clinic_admin();
--   DROP FUNCTION IF EXISTS public.team_my_member_id();
--
--   -- Reversão parcial (sem perder dados): para só pausar o chat, drope os 5 gatilhos do item 1
--   -- e deixe as tabelas; as policies de INSERT já bloqueiam escrita em clínica sem 3 profissionais.
-- ═══════════════════════════════════════════════════════════════════════════
