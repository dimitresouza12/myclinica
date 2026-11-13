-- ═══════════════════════════════════════════════════════════════════════════
-- CHAT DA EQUIPE — gestão de grupos já criados (adicionar, remover, sair, renomear)
-- Criado em: 2026-11-13 (arquivo 20261124) | Projeto Supabase: siohvtgbomvcprbzfamr
-- Depende de: 20261120_chat_equipe.sql (team_channels, team_channel_members, team_messages e os
-- helpers team_my_member_id, team_is_clinic_admin, team_is_group_creator, team_clinic_has_chat) e
-- get_my_clinic_id(). NÃO depende das migrações 20261121 (presença) nem 20261123 (anexos).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- PROBLEMA
--   Hoje o grupo (team_channels.kind = 'group') só pode ser CRIADO (RPC team_create_group). Depois de
--   criado não há como entrar gente, tirar gente, sair ou trocar o nome por um caminho que respeite as
--   regras de negócio: as policies de team_channel_members deixam o criador inserir/apagar linhas
--   direto pela API, sem limite de tamanho, sem passar o "bastão" de criador e sem arquivar o grupo
--   que ficou vazio.
--
-- DECISÃO
--   * 4 RPCs SECURITY DEFINER (mesmo padrão das irmãs: search_path fixo, REVOKE de PUBLIC/anon,
--     GRANT só authenticated + service_role) concentram as regras:
--       team_group_add_members(p_channel_id, p_member_ids)   criador do grupo OU admin da clínica
--       team_group_remove_member(p_channel_id, p_member_id)  criador OU admin
--       team_group_leave(p_channel_id)                       qualquer membro
--       team_group_rename(p_channel_id, p_name)              criador OU admin
--   * Todas exigem: login ativo, clínica com chat habilitado (>= 3 profissionais), canal de kind
--     'group' DA MESMA clínica do chamador e NÃO arquivado. A checagem comum mora num helper interno
--     (team_group_guard), que também trava a linha do canal (FOR NO KEY UPDATE) para serializar
--     add/remove/leave concorrentes (contagem de membros e passagem de criador ficam consistentes) sem
--     bloquear o INSERT de mensagens (que só toma FOR KEY SHARE no canal).
--   * Quem é o criador: coluna team_channels.created_by (clinic_users.id; ON DELETE SET NULL, então
--     pode ser NULL se o login for apagado; nesse caso só admin gerencia).
--   * Regra do criador (não deixa o grupo "órfão de dono"):
--       - Criador SAI e restam membros ATIVOS: created_by passa para o membro ativo mais antigo
--         restante (team_channel_members.created_at; empate = menor clinic_users.id, pois os membros
--         de um grupo recém-criado entram na mesma transação e têm o mesmo created_at).
--       - Admin REMOVE o criador: mesma passagem (senão o criador removido continuaria mandando no
--         grupo: team_is_group_creator não olha se ele ainda é membro e a policy de DELETE em
--         team_channel_members deixa o criador apagar linhas).
--       - Não restou nenhum membro ativo (saída do último, ou remoção do último): o canal é
--         ARQUIVADO (archived_at = now(); nada é apagado, o histórico fica para o admin) e
--         created_by vira NULL (quem saiu não mantém acesso ao canal pela policy de SELECT, que
--         libera created_by).
--       - Quem sai/é removido sendo NÃO criador: created_by não muda.
--   * "Ativo" = clinic_users.is_active = true. Membro de grupo desativado continua com a linha em
--     team_channel_members (os gatilhos de sincronia só limpam general/area), mas não conta para
--     "restam membros" nem para herdar o grupo.
--   * Admin gerencia (adicionar, remover, renomear) sem precisar ser membro; admin NÃO "sai" de
--     grupo em que não é membro (not_a_member).
--   * Limite de membros = o de team_create_group: 199 convidados + o criador = 200 no total
--     (group_full ao passar disso; conta também membros desativados que ainda têm linha).
--   * Adicionar: ignora quem já é membro (idempotente; se todos já são, não faz nada), só aceita
--     logins ATIVOS da mesma clínica (invalid_member se algum não for). Entra com last_read_at =
--     now() (default da tabela): o recém-chegado não recebe o histórico inteiro como não lido.
--   * Remover: não permite remover a si mesmo (use team_group_leave) nem remover o criador quando
--     quem chama não é admin (cannot_remove_creator; na prática inalcançável: quem passa em
--     team_is_group_creator e não é admin só poderia mirar a si mesmo, barrado antes por
--     cannot_remove_self; fica como defesa em profundidade).
--   * Histórico: remover/sair NÃO apaga mensagem. team_messages.sender_clinic_user_id referencia
--     clinic_users (não a linha de membro), então as mensagens de quem saiu seguem legíveis para
--     quem ficou (a leitura é por membership do leitor + admin da clínica). Quem saiu deixa de ver o
--     canal (team_can_read_channel / is_team_channel_member / team_unread_counts já exigem
--     membership) e não consegue mais escrever (team_channel_writable idem).
--
-- MUDANÇA
--   Só funções novas (5): team_group_guard (interna), team_group_add_members,
--   team_group_remove_member, team_group_leave, team_group_rename. NENHUMA tabela, coluna, policy ou
--   gatilho existente é alterado. As RPCs são SECURITY DEFINER (donas das tabelas), então não dependem
--   das policies de INSERT/DELETE/UPDATE de team_channel_members/team_channels; o gatilho BEFORE
--   INSERT trg_team_members_same_clinic continua valendo nos INSERTs delas.
--
-- NOTA DE SEGURANÇA (fora do escopo desta migração, só registrada)
--   As policies/GRANTs diretos continuam abertos ao criador do grupo: team_members_insert_group,
--   team_members_delete_group (e o GRANT INSERT/DELETE em team_channel_members) e
--   team_channels_update_group_name. Pela API direta o criador ainda consegue contornar o limite de
--   200, não passar o bastão ao sair e não arquivar o grupo vazio. Quando o app inteiro usar estas
--   RPCs, vale revogar esses caminhos (bloco OPCIONAL comentado no fim). Não aplicado aqui porque
--   remover policy/GRANT é mudança destrutiva e quebraria o app atual.
--
-- Erros (RAISE EXCEPTION com string curta; o app casa por substring):
--   not_authenticated (28000)   sem login ativo / sem clínica
--   chat_disabled     (42501)   clínica com menos de 3 profissionais
--   not_a_group       (42501)   canal inexistente, de outra clínica ou de kind <> 'group' (não distingue)
--   group_archived    (22023)   canal arquivado
--   not_group_manager (42501)   add/remove/rename sem ser criador nem admin
--   not_a_member      (42501)   leave por quem não é membro
--   member_not_found  (42501)   remove: alvo nulo ou que não é membro
--   cannot_remove_self (22023)  remove: alvo = quem chama
--   cannot_remove_creator (42501) remove o criador sem ser admin (defesa; ver acima)
--   invalid_name      (22023)   rename: nome fora de 1..80 caracteres (após btrim)
--   group_needs_members (22023) add: lista vazia/nula
--   invalid_member    (42501)   add: algum id não é login ativo da clínica
--   group_full        (22023)   add: passaria de 200 membros
--
-- Aditiva e idempotente (CREATE OR REPLACE; REVOKE/GRANT repetíveis).
-- Impacto no app: o front (mc-backend/mc-frontend) passa a chamar as RPCs abaixo; assinaturas:
--   public.team_group_add_members(p_channel_id uuid, p_member_ids uuid[]) RETURNS void
--   public.team_group_remove_member(p_channel_id uuid, p_member_id uuid)  RETURNS void
--   public.team_group_leave(p_channel_id uuid)                            RETURNS void
--   public.team_group_rename(p_channel_id uuid, p_name text)              RETURNS void
-- Desfazer: bloco ROLLBACK no fim (só DROP FUNCTION; não toca em dado).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Helper interno: valida o chamador e o canal, e trava a linha do canal ──

-- INTERNO (sem GRANT para authenticated). Devolve a linha do canal já travada.
CREATE OR REPLACE FUNCTION public.team_group_guard(p_channel uuid)
 RETURNS public.team_channels
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me     uuid := public.team_my_member_id();
  v_clinic uuid := public.get_my_clinic_id();
  v_ch     public.team_channels;
BEGIN
  IF v_me IS NULL OR v_clinic IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.team_clinic_has_chat(v_clinic) THEN
    RAISE EXCEPTION 'chat_disabled' USING ERRCODE = '42501';
  END IF;

  -- FOR NO KEY UPDATE: serializa as RPCs de gestão entre si sem bloquear INSERT de mensagem
  -- (a FK de team_messages toma FOR KEY SHARE no canal, que não conflita com NO KEY UPDATE).
  SELECT c.* INTO v_ch
  FROM public.team_channels c
  WHERE c.id = p_channel
    AND c.kind = 'group'
    AND c.clinic_id = v_clinic
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_group' USING ERRCODE = '42501';
  END IF;
  IF v_ch.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'group_archived' USING ERRCODE = '22023';
  END IF;

  RETURN v_ch;
END;
$function$;

-- INTERNO: depois de tirar alguém do grupo, acerta o criador e arquiva se esvaziou.
--   p_was_creator = a pessoa que saiu/foi removida era o criador.
CREATE OR REPLACE FUNCTION public.team_group_after_departure(p_channel uuid, p_was_creator boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_next uuid;
BEGIN
  -- membro ATIVO mais antigo restante (empate: menor id, determinístico)
  SELECT m.clinic_user_id INTO v_next
  FROM public.team_channel_members m
  JOIN public.team_channels c  ON c.id = m.channel_id
  JOIN public.clinic_users cu  ON cu.id = m.clinic_user_id
                              AND cu.clinic_id = c.clinic_id
                              AND cu.is_active = true
  WHERE m.channel_id = p_channel
  ORDER BY m.created_at, m.clinic_user_id
  LIMIT 1;

  IF v_next IS NULL THEN
    -- ninguém ativo restou: arquiva (nada é apagado) e solta o criador
    UPDATE public.team_channels
       SET archived_at = now(), created_by = NULL
     WHERE id = p_channel AND archived_at IS NULL;
  ELSIF p_was_creator THEN
    UPDATE public.team_channels
       SET created_by = v_next
     WHERE id = p_channel;
  END IF;
END;
$function$;


-- ─── 2. RPCs ─────────────────────────────────────────────────────────────────

-- Adiciona membros a um grupo. p_member_ids = clinic_users.id. Quem já é membro é ignorado.
CREATE OR REPLACE FUNCTION public.team_group_add_members(p_channel_id uuid, p_member_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- mesmo teto de team_create_group: 199 convidados + o criador
  v_max     constant int := 200;
  v_clinic  uuid := public.get_my_clinic_id();
  v_ch      public.team_channels;
  v_ids     uuid[];
  v_current int;
BEGIN
  v_ch := public.team_group_guard(p_channel_id);

  IF NOT (public.team_is_group_creator(p_channel_id) OR public.team_is_clinic_admin()) THEN
    RAISE EXCEPTION 'not_group_manager' USING ERRCODE = '42501';
  END IF;

  v_ids := ARRAY(
    SELECT DISTINCT x FROM unnest(COALESCE(p_member_ids, '{}'::uuid[])) AS x
    WHERE x IS NOT NULL
  );
  IF COALESCE(cardinality(v_ids), 0) < 1 THEN
    RAISE EXCEPTION 'group_needs_members' USING ERRCODE = '22023';
  END IF;

  -- só quem ainda NÃO é membro entra na conta (idempotente)
  v_ids := ARRAY(
    SELECT x FROM unnest(v_ids) AS x
    WHERE NOT EXISTS (
      SELECT 1 FROM public.team_channel_members m
      WHERE m.channel_id = v_ch.id AND m.clinic_user_id = x
    )
  );
  IF COALESCE(cardinality(v_ids), 0) = 0 THEN
    RETURN;
  END IF;

  -- todos os novos têm que ser logins ATIVOS desta clínica
  IF (SELECT count(*) FROM public.clinic_users cu
      WHERE cu.id = ANY (v_ids) AND cu.clinic_id = v_clinic AND cu.is_active = true)
     <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'invalid_member' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_current
  FROM public.team_channel_members m WHERE m.channel_id = v_ch.id;
  IF v_current + cardinality(v_ids) > v_max THEN
    RAISE EXCEPTION 'group_full' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.team_channel_members (channel_id, clinic_user_id)
  SELECT v_ch.id, x FROM unnest(v_ids) AS x
  ON CONFLICT DO NOTHING;
END;
$function$;

-- Remove OUTRO membro do grupo. Para sair o próprio login use team_group_leave.
CREATE OR REPLACE FUNCTION public.team_group_remove_member(p_channel_id uuid, p_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me         uuid := public.team_my_member_id();
  v_ch         public.team_channels;
  v_was_creator boolean;
BEGIN
  v_ch := public.team_group_guard(p_channel_id);

  IF NOT (public.team_is_group_creator(p_channel_id) OR public.team_is_clinic_admin()) THEN
    RAISE EXCEPTION 'not_group_manager' USING ERRCODE = '42501';
  END IF;

  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = '42501';
  END IF;
  IF p_member_id = v_me THEN
    RAISE EXCEPTION 'cannot_remove_self' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_channel_members m
    WHERE m.channel_id = v_ch.id AND m.clinic_user_id = p_member_id
  ) THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = '42501';
  END IF;

  v_was_creator := (v_ch.created_by IS NOT DISTINCT FROM p_member_id);
  IF v_was_creator AND NOT public.team_is_clinic_admin() THEN
    RAISE EXCEPTION 'cannot_remove_creator' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.team_channel_members
   WHERE channel_id = v_ch.id AND clinic_user_id = p_member_id;

  PERFORM public.team_group_after_departure(v_ch.id, v_was_creator);
END;
$function$;

-- Qualquer membro sai do grupo. Criador que sai passa o grupo ao membro ativo mais antigo; último a
-- sair arquiva o canal.
CREATE OR REPLACE FUNCTION public.team_group_leave(p_channel_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_me          uuid := public.team_my_member_id();
  v_ch          public.team_channels;
  v_was_creator boolean;
BEGIN
  v_ch := public.team_group_guard(p_channel_id);

  DELETE FROM public.team_channel_members
   WHERE channel_id = v_ch.id AND clinic_user_id = v_me;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = '42501';
  END IF;

  v_was_creator := (v_ch.created_by IS NOT DISTINCT FROM v_me);

  PERFORM public.team_group_after_departure(v_ch.id, v_was_creator);
END;
$function$;

-- Renomeia o grupo (1..80 caracteres após btrim, como team_create_group).
CREATE OR REPLACE FUNCTION public.team_group_rename(p_channel_id uuid, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ch   public.team_channels;
  v_name text := btrim(COALESCE(p_name, ''));
BEGIN
  v_ch := public.team_group_guard(p_channel_id);

  IF NOT (public.team_is_group_creator(p_channel_id) OR public.team_is_clinic_admin()) THEN
    RAISE EXCEPTION 'not_group_manager' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  UPDATE public.team_channels SET name = v_name WHERE id = v_ch.id;
END;
$function$;


-- ─── 3. Grants ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.team_group_add_members(uuid, uuid[])',
    'public.team_group_remove_member(uuid, uuid)',
    'public.team_group_leave(uuid)',
    'public.team_group_rename(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;

  -- Internas: só o dono (definer) as executa, chamadas de dentro das RPCs acima.
  FOREACH f IN ARRAY ARRAY[
    'public.team_group_guard(uuid)',
    'public.team_group_after_departure(uuid, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.team_group_add_members(uuid, uuid[]) IS
  'Chat da equipe: adiciona logins ativos da clínica a um grupo. Criador ou admin. Máx. 200 membros.';
COMMENT ON FUNCTION public.team_group_remove_member(uuid, uuid) IS
  'Chat da equipe: remove OUTRO membro do grupo (criador ou admin). Se removeu o criador, passa o grupo ao membro ativo mais antigo; se esvaziou, arquiva.';
COMMENT ON FUNCTION public.team_group_leave(uuid) IS
  'Chat da equipe: o login sai do grupo. Criador que sai passa o grupo ao membro ativo mais antigo; último a sair arquiva o canal.';
COMMENT ON FUNCTION public.team_group_rename(uuid, text) IS
  'Chat da equipe: renomeia o grupo (criador ou admin), 1..80 caracteres.';


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (somente leitura; rodar depois de aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--   -- 1) as 6 funções existem, são SECURITY DEFINER com search_path fixo
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, p.proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname IN
--     ('team_group_guard','team_group_after_departure','team_group_add_members',
--      'team_group_remove_member','team_group_leave','team_group_rename')
--   ORDER BY 1;
--
--   -- 2) quem executa: as 4 RPCs => authenticated + service_role (+ owner); as 2 internas => só owner.
--   --    Não pode aparecer PUBLIC nem anon em nenhuma.
--   SELECT p.proname,
--          string_agg(COALESCE(r.rolname, 'PUBLIC'), ',' ORDER BY r.rolname) AS executam
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
--   LEFT JOIN pg_roles r ON r.oid = a.grantee
--   WHERE n.nspname = 'public' AND p.proname LIKE 'team\_group\_%'
--   GROUP BY p.proname ORDER BY 1;
--
--   -- 3) nada em tabela/policy mudou: as policies de membros seguem as mesmas 4
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'team_channel_members' ORDER BY 1;
--
--   -- 4) grupos e criador (sem dado de paciente): só contagens
--   SELECT count(*) FILTER (WHERE archived_at IS NULL)     AS grupos_ativos,
--          count(*) FILTER (WHERE archived_at IS NOT NULL) AS grupos_arquivados,
--          count(*) FILTER (WHERE created_by IS NULL)      AS grupos_sem_criador
--   FROM public.team_channels WHERE kind = 'group';


-- ═══════════════════════════════════════════════════════════════════════════
-- OPCIONAL, SÓ DEPOIS que o app inteiro usar as RPCs (DESTRUTIVO: remove caminhos diretos; pedir OK)
-- Fecha o contorno pela API direta. Não rodar antes do front migrar.
-- ═══════════════════════════════════════════════════════════════════════════
--   DROP POLICY IF EXISTS team_members_insert_group ON public.team_channel_members;
--   DROP POLICY IF EXISTS team_members_delete_group ON public.team_channel_members;
--   REVOKE INSERT, DELETE ON public.team_channel_members FROM authenticated;
--   DROP POLICY IF EXISTS team_channels_update_group_name ON public.team_channels;
--   REVOKE UPDATE (name) ON public.team_channels FROM authenticated;
--   -- (team_create_group é SECURITY DEFINER e não depende dessas policies/grants)


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar à mão; só remove funções, não toca em dado)
-- ═══════════════════════════════════════════════════════════════════════════
--   DROP FUNCTION IF EXISTS public.team_group_rename(uuid, text);
--   DROP FUNCTION IF EXISTS public.team_group_leave(uuid);
--   DROP FUNCTION IF EXISTS public.team_group_remove_member(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.team_group_add_members(uuid, uuid[]);
--   DROP FUNCTION IF EXISTS public.team_group_after_departure(uuid, boolean);
--   DROP FUNCTION IF EXISTS public.team_group_guard(uuid);
--   -- Grupos que a RPC arquivou (archived_at) ou cujo created_by foi passado adiante NÃO voltam
--   -- sozinhos; se precisar, desarquive à mão: UPDATE public.team_channels SET archived_at = NULL
--   -- WHERE id = '<canal>' AND kind = 'group';
-- ═══════════════════════════════════════════════════════════════════════════
