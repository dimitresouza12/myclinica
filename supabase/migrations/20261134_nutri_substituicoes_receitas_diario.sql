-- ═══════════════════════════════════════════════════════════════════════════
-- NUTRIÇÃO — banco de receitas da clínica e diário alimentar do paciente (portal)
-- Criado em: 2026-11-16 (NÃO APLICADA: arquivo para o Dimitre revisar e aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A lista de substituições de alimentos NÃO precisa de tabela: é uma base pequena e fixa, escrita no código
-- (src/lib/nutri/substituicoes.ts), calculada sobre a TACO que já existe. Esta migração cobre só as outras duas
-- frentes, com duas tabelas novas e uma mudança de CHECK:
--
--   * nutri_receitas  — banco de receitas da CLÍNICA (não é por paciente): título, porções, tempo de preparo,
--                       ingredientes (jsonb), modo de preparo e observações. Quando a nutricionista anexa uma receita
--                       a uma refeição do plano, o plano guarda uma CÓPIA (snapshot dentro de nutri_avaliacoes.dados),
--                       então editar ou apagar a receita depois não muda o plano que o paciente já recebeu.
--   * nutri_diario    — diário alimentar: uma linha por refeição registrada pelo PACIENTE na página /p/[token]
--                       (dia, refeição, horário, descrição e foto opcional). Quem grava é o servidor, com a chave de
--                       serviço, depois de conferir o token do link, o escopo 'diario' e o paciente do link. A
--                       clínica só LÊ (ficha de Nutrição). Sem policy de escrita para o navegador, igual a fisio_execucoes.
--   * patient_portal_links.scopes passa a aceitar também 'diario' (ver bloco 4).
--
-- Fotos do diário: reaproveitam o bucket privado `pacientes`, no caminho
--   diario/<clinic_id>/<patient_id>/<arquivo>
-- A 2ª pasta é a clínica, então já valem as policies pacientes_select/insert/delete da migration
-- 20261127_pacientes_storage_por_clinica.sql. Nada de bucket novo e nenhuma policy de storage nova aqui. O CHECK
-- de foto_path garante que o caminho gravado aponta para a pasta da PRÓPRIA clínica e do PRÓPRIO paciente da linha.
-- A foto é enviada pelo servidor (a página pública não tem sessão) e vista pela clínica por URL assinada.
--
-- RLS (mesmo padrão de nutri_avaliacoes e de 20261131/20261133, em camadas somadas):
--   * clinic_isolation (permissiva): só a própria clínica (ou superadmin). Em nutri_diario só LEITURA (FOR SELECT).
--   * restrict_prontuario_* (RESTRICTIVE, por comando): exige has_module_perm('prontuario'), leitura (false) ou
--     edição (true). Em nutri_receitas o INSERT confere ainda a clínica da linha.
--   * restrição por área (RESTRICTIVE), criada só se clinical_row_visible_to_my_area existir (vem de
--     20261111_pacientes_unicos_e_area.sql): nutri_receitas usa o autor (gravado por gatilho); nutri_diario não tem
--     autor humano, então segue a visibilidade do PACIENTE (policy restrict_pacientes_by_area de patients, que o
--     EXISTS abaixo herda). Sem a função, vale clínica + permissão do módulo; reaplicar este arquivo depois cria a policy.
--
-- Dependências (a migração para com mensagem clara se faltar alguma): public.clinics, public.patients,
-- get_my_clinic_id(), is_superadmin(), has_module_perm(text, boolean) (20261111_permissoes_por_modulo.sql).
--
-- Idempotente: CREATE ... IF NOT EXISTS, CREATE OR REPLACE e DROP ... IF EXISTS antes de cada CREATE. Pode rodar duas
-- vezes. Aditiva: nenhuma tabela existente é alterada, exceto o CHECK de escopos do link (superconjunto do atual).
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_falta text;
BEGIN
  IF to_regclass('public.clinics') IS NULL OR to_regclass('public.patients') IS NULL THEN
    RAISE EXCEPTION 'public.clinics / public.patients não existem';
  END IF;
  SELECT string_agg(f, ', ') INTO v_falta
    FROM unnest(ARRAY['get_my_clinic_id', 'is_superadmin', 'has_module_perm']) AS f
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = f);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'faltam funções: % (aplique antes 20261111_permissoes_por_modulo.sql)', v_falta;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) nutri_receitas
-- ═══════════════════════════════════════════════════════════════════════════

-- Gatilho: autor = quem está logado (INSERT); clínica, autor e criação não mudam (UPDATE); updated_at sempre.
CREATE OR REPLACE FUNCTION public.nutri_receitas_before_write()
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
    NEW.autor      := OLD.autor;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.nutri_receitas (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id         uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  titulo            text        NOT NULL CHECK (length(btrim(titulo)) > 0 AND length(titulo) <= 120),
  porcoes           smallint    CHECK (porcoes IS NULL OR porcoes BETWEEN 1 AND 200),
  tempo_preparo_min smallint    CHECK (tempo_preparo_min IS NULL OR tempo_preparo_min BETWEEN 1 AND 1440),
  ingredientes      jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(ingredientes) = 'array' AND jsonb_array_length(ingredientes) <= 80 AND pg_column_size(ingredientes) <= 65536),
  modo_preparo      text        NOT NULL DEFAULT '' CHECK (length(modo_preparo) <= 8000),
  observacoes       text        CHECK (observacoes IS NULL OR length(observacoes) <= 2000),
  autor             uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nutri_receitas IS 'Nutrição: banco de receitas da clínica (ingredientes e modo de preparo). O plano alimentar guarda uma cópia da receita anexada.';
COMMENT ON COLUMN public.nutri_receitas.ingredientes IS 'Lista jsonb de { texto } (um ingrediente por item, com a quantidade em texto livre). Formato em src/lib/nutri/receitas.ts.';
COMMENT ON COLUMN public.nutri_receitas.autor IS 'auth.users.id de quem gravou, definido pelo gatilho nutri_receitas_before_write.';

CREATE INDEX IF NOT EXISTS idx_nutri_receitas_clinica ON public.nutri_receitas (clinic_id, titulo);

DROP TRIGGER IF EXISTS nutri_receitas_before_write ON public.nutri_receitas;
CREATE TRIGGER nutri_receitas_before_write
  BEFORE INSERT OR UPDATE ON public.nutri_receitas
  FOR EACH ROW EXECUTE FUNCTION public.nutri_receitas_before_write();

ALTER TABLE public.nutri_receitas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation ON public.nutri_receitas;
CREATE POLICY clinic_isolation ON public.nutri_receitas
  AS PERMISSIVE FOR ALL
  USING      (clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
  WITH CHECK (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

DROP POLICY IF EXISTS restrict_prontuario_select ON public.nutri_receitas;
CREATE POLICY restrict_prontuario_select ON public.nutri_receitas
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('prontuario', false)));

DROP POLICY IF EXISTS restrict_prontuario_insert ON public.nutri_receitas;
CREATE POLICY restrict_prontuario_insert ON public.nutri_receitas
  AS RESTRICTIVE FOR INSERT
  WITH CHECK ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_prontuario_update ON public.nutri_receitas;
CREATE POLICY restrict_prontuario_update ON public.nutri_receitas
  AS RESTRICTIVE FOR UPDATE
  USING      ((SELECT public.has_module_perm('prontuario', true)))
  WITH CHECK ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_prontuario_delete ON public.nutri_receitas;
CREATE POLICY restrict_prontuario_delete ON public.nutri_receitas
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('prontuario', true)));

-- Escopo por área: só cria se clinical_row_visible_to_my_area existir (vem de 20261111_pacientes_unicos_e_area).
DO $area$
BEGIN
  DROP POLICY IF EXISTS restrict_nutri_receitas_by_area ON public.nutri_receitas;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
              WHERE ns.nspname = 'public' AND p.proname = 'clinical_row_visible_to_my_area') THEN
    EXECUTE 'CREATE POLICY restrict_nutri_receitas_by_area ON public.nutri_receitas AS RESTRICTIVE FOR ALL USING (public.clinical_row_visible_to_my_area(NULL, autor))';
  END IF;
END
$area$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) nutri_diario
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.nutri_diario (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id  uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  dia         date        NOT NULL,
  refeicao    text        NOT NULL CHECK (refeicao IN ('cafe_manha', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia', 'outro')),
  horario     text        CHECK (horario IS NULL OR horario ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  descricao   text        NOT NULL CHECK (length(btrim(descricao)) > 0 AND length(descricao) <= 1000),
  foto_path   text        CHECK (foto_path IS NULL OR (length(foto_path) <= 300 AND foto_path LIKE ('diario/' || clinic_id::text || '/' || patient_id::text || '/%'))),
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nutri_diario IS 'Nutrição: diário alimentar registrado pelo paciente na página pública /p/[token] (escopo diario). Gravado só pelo servidor; a clínica lê.';
COMMENT ON COLUMN public.nutri_diario.dia IS 'Dia (fuso de Brasília) a que a refeição se refere. O app só aceita hoje e ontem.';
COMMENT ON COLUMN public.nutri_diario.foto_path IS 'Caminho no bucket privado pacientes: diario/<clinic_id>/<patient_id>/<arquivo>.';

CREATE INDEX IF NOT EXISTS idx_nutri_diario_paciente ON public.nutri_diario (patient_id, dia DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nutri_diario_clinica  ON public.nutri_diario (clinic_id);

ALTER TABLE public.nutri_diario ENABLE ROW LEVEL SECURITY;

-- só leitura para o navegador: não há policy de INSERT/UPDATE/DELETE (a chave de serviço do servidor ignora RLS)
DROP POLICY IF EXISTS clinic_isolation ON public.nutri_diario;
DROP POLICY IF EXISTS clinic_isolation_select ON public.nutri_diario;
CREATE POLICY clinic_isolation_select ON public.nutri_diario
  AS PERMISSIVE FOR SELECT
  USING (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

DROP POLICY IF EXISTS restrict_prontuario_select ON public.nutri_diario;
CREATE POLICY restrict_prontuario_select ON public.nutri_diario
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('prontuario', false)));

-- Escopo por área: segue a visibilidade do paciente (o EXISTS passa pelas policies de patients).
DO $area$
BEGIN
  DROP POLICY IF EXISTS restrict_nutri_diario_by_area ON public.nutri_diario;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
              WHERE ns.nspname = 'public' AND p.proname = 'clinical_row_visible_to_my_area') THEN
    EXECUTE 'CREATE POLICY restrict_nutri_diario_by_area ON public.nutri_diario AS RESTRICTIVE FOR SELECT USING (EXISTS (SELECT 1 FROM public.patients pa WHERE pa.id = nutri_diario.patient_id))';
  END IF;
END
$area$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Portal do paciente: novo escopo 'diario'
-- ═══════════════════════════════════════════════════════════════════════════
-- O CHECK de patient_portal_links.scopes lista os escopos aceitos. Em vez de repetir uma lista fixa (que apagaria
-- escopos acrescentados por outras migrações, como 'exercicios' de 20261130), lê a lista atual do próprio CHECK,
-- junta 'diario' e recria. Se o CHECK já aceita 'diario', não faz nada. Pula sozinho se a tabela do portal não existe.
-- Os escopos de base (os de 20261117) entram sempre, mesmo que o CHECK atual esteja fora do padrão.
DO $$
DECLARE
  c       record;
  v_lista text[];
BEGIN
  IF to_regclass('public.patient_portal_links') IS NULL THEN
    RETURN;
  END IF;

  SELECT conname, pg_get_constraintdef(oid) AS def INTO c
    FROM pg_constraint
   WHERE conrelid = 'public.patient_portal_links'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%plano_alimentar%'
   LIMIT 1;

  -- O Postgres guarda a lista de escopos de duas formas (ARRAY['a'::text, ...] ou, quando simplifica a expressão,
  -- '{a,b,...}'::text[]). Em ambas, os escopos são as palavras [a-z_] depois do operador <@, menos o nome do tipo.
  SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::text[]) INTO v_lista
    FROM regexp_matches(coalesce(substring(c.def FROM '<@(.*)$'), ''), '([a-z_]+)', 'g') AS m
   WHERE m[1] <> 'text';

  -- já aceita 'diario': nada a fazer
  IF 'diario' = ANY(v_lista) THEN
    RETURN;
  END IF;

  v_lista := ARRAY(
    SELECT DISTINCT x FROM unnest(
      v_lista || ARRAY['plano_alimentar', 'vacinas_peso', 'proximas_consultas', 'orientacoes', 'assinatura', 'diario']
    ) AS x ORDER BY x
  );

  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.patient_portal_links'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%plano_alimentar%'
  LOOP
    EXECUTE format('ALTER TABLE public.patient_portal_links DROP CONSTRAINT %I', c.conname);
  END LOOP;

  EXECUTE format(
    'ALTER TABLE public.patient_portal_links ADD CONSTRAINT patient_portal_links_scopes_check CHECK (cardinality(scopes) > 0 AND scopes <@ %L::text[])',
    v_lista
  );
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de aplicar; somente leitura):
--   -- RLS ligada nas duas tabelas (esperado: true, true)
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE oid IN ('public.nutri_receitas'::regclass, 'public.nutri_diario'::regclass);
--   -- nutri_receitas: clinic_isolation + restrict_prontuario_(select|insert|update|delete) + restrict_nutri_receitas_by_area
--   -- nutri_diario:   clinic_isolation_select + restrict_prontuario_select + restrict_nutri_diario_by_area (sem INSERT/UPDATE/DELETE)
--   SELECT tablename, policyname, permissive, cmd FROM pg_policies
--    WHERE tablename IN ('nutri_receitas', 'nutri_diario') ORDER BY tablename, policyname;
--   -- escopos aceitos pelo link (esperado: lista com 'diario' e sem perder nenhum escopo que já existia)
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.patient_portal_links'::regclass AND contype = 'c';
--
-- ROLLBACK (rodar manualmente; APAGA receitas e o diário; as fotos ficam no storage, pasta diario/ do bucket pacientes):
--   DROP TABLE IF EXISTS public.nutri_diario;
--   DROP TABLE IF EXISTS public.nutri_receitas;
--   DROP FUNCTION IF EXISTS public.nutri_receitas_before_write();
--   -- links que já tenham o escopo 'diario' precisam ser corrigidos/revogados ANTES de tirar o escopo do CHECK:
--   -- UPDATE public.patient_portal_links SET scopes = array_remove(scopes, 'diario') WHERE 'diario' = ANY(scopes) AND cardinality(scopes) > 1;
--   -- DELETE FROM public.patient_portal_links WHERE scopes = ARRAY['diario']::text[];
--   -- depois recrie o CHECK sem 'diario' (mantenha os demais escopos que o seu banco já aceita):
--   -- ALTER TABLE public.patient_portal_links DROP CONSTRAINT IF EXISTS patient_portal_links_scopes_check;
--   -- ALTER TABLE public.patient_portal_links ADD CONSTRAINT patient_portal_links_scopes_check CHECK (
--   --   cardinality(scopes) > 0
--   --   AND scopes <@ ARRAY['plano_alimentar','vacinas_peso','proximas_consultas','orientacoes','assinatura','exercicios']::text[]);
-- ═══════════════════════════════════════════════════════════════════════════
