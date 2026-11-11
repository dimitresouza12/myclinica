-- ═══════════════════════════════════════════════════════════════════════════
-- SIGILO DE PSICOLOGIA — anotações confidenciais por autor em record_entries
-- Criado em: 2026-11-11
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Base normativa: Res. CFP 001/2009 e Código de Ética do Psicólogo (CFP 10/2005):
-- anotações técnicas/pessoais da psicoterapia não são compartilháveis com o resto
-- da equipe. Hoje qualquer membro da clínica com acesso ao módulo prontuário lê
-- todas as evoluções (o botão "só as minhas" da Timeline é filtro de tela).
--
-- Desenho (o mais conservador, ADITIVO):
--   * record_entries.is_confidential  boolean NOT NULL DEFAULT false
--       false = comportamento de hoje (toda a equipe com acesso lê).
--       true  = só o autor (e superadmin) lê.
--   * record_entries.author_user_id   uuid NULL
--       auth.users.id de quem gravou. Preenchido pelo banco (gatilho) em todo
--       INSERT feito por usuário autenticado; o cliente não consegue forjar.
--       Sem FK para auth.users de propósito: se o usuário for apagado, a nota
--       continua existindo (só o superadmin passa a lê-la), nunca é apagada.
--   * Policy RESTRICTIVE de SELECT: linha só é visível se
--       NOT is_confidential OR author_user_id = auth.uid() OR is_superadmin().
--     Como é RESTRICTIVE ela é combinada por AND com as policies permissivas
--     existentes (record_entries_select, record_entries_superadmin_select,
--     restrict_prontuario_select): nenhuma delas é alterada nem removida.
--   * Policy RESTRICTIVE de INSERT: não dá para gravar nota confidencial em nome
--     de outro usuário.
--
-- Por que nenhuma entrada existente some: a coluna nova nasce com DEFAULT false
-- para todas as linhas já gravadas; a policy nova só filtra linhas com true.
-- Nenhum UPDATE/backfill é feito. UPDATE e DELETE continuam negados (não existe
-- policy permissiva para eles: prontuário imutável), portanto uma entrada não
-- muda de confidencial para pública depois de criada.
--
-- Limites conhecidos (ver docs/psico-sigilo-record-entries.md):
--   * service role (n8n, rotas de API com chave de serviço) ignora RLS e enxerga
--     tudo; nenhuma rota atual do app lê record_entries com service role.
--   * medical_records.anamnesis['psico'] (ficha) NÃO está coberta por esta
--     migração: segue visível como hoje.
--   * fotos/arquivos anexados a uma nota confidencial ficam no bucket de storage
--     com as regras do bucket (não herdam esta policy).
--
-- Desfazer: bloco ROLLBACK no fim do arquivo (remove policies, gatilho e as
-- duas colunas; só perde dado se já existirem notas confidenciais gravadas).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.record_entries
  ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT false;

ALTER TABLE public.record_entries
  ADD COLUMN IF NOT EXISTS author_user_id uuid;

COMMENT ON COLUMN public.record_entries.is_confidential IS
  'true = anotação sigilosa (Res. CFP 001/2009): só o autor (author_user_id) e o superadmin leem. false (padrão) = visível a quem já tem acesso ao prontuário. Imutável após o INSERT.';
COMMENT ON COLUMN public.record_entries.author_user_id IS
  'auth.users.id de quem criou a entrada. Preenchido pelo gatilho record_entries_set_author_user_id a partir de auth.uid(); nulo em entradas antigas.';

-- Gatilho: o autor é sempre quem está logado (evita forjar author_user_id).
-- auth.uid() nulo (service role / SQL direto) mantém o valor enviado.
CREATE OR REPLACE FUNCTION public.record_entries_set_author_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.author_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_entries_set_author_user_id ON public.record_entries;
CREATE TRIGGER record_entries_set_author_user_id
  BEFORE INSERT ON public.record_entries
  FOR EACH ROW EXECUTE FUNCTION public.record_entries_set_author_user_id();

-- Leitura: restritiva, soma-se (AND) às policies de SELECT existentes.
DROP POLICY IF EXISTS record_entries_confidential_select ON public.record_entries;
CREATE POLICY record_entries_confidential_select ON public.record_entries
  AS RESTRICTIVE
  FOR SELECT
  USING (
    NOT is_confidential
    OR author_user_id = (SELECT auth.uid())
    OR (SELECT public.is_superadmin())
  );

-- Escrita: nota confidencial só em nome de si mesmo.
DROP POLICY IF EXISTS record_entries_confidential_insert ON public.record_entries;
CREATE POLICY record_entries_confidential_insert ON public.record_entries
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    NOT is_confidential
    OR author_user_id = (SELECT auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (executar em bloco; só com confirmação do dono — DROP COLUMN apaga
-- o flag e o autor. Confira antes: select count(*) from record_entries where is_confidential;
-- se > 0, as notas continuam existindo, mas passam a ser lidas por toda a equipe)
--
--   DROP POLICY IF EXISTS record_entries_confidential_insert ON public.record_entries;
--   DROP POLICY IF EXISTS record_entries_confidential_select ON public.record_entries;
--   DROP TRIGGER IF EXISTS record_entries_set_author_user_id ON public.record_entries;
--   DROP FUNCTION IF EXISTS public.record_entries_set_author_user_id();
--   ALTER TABLE public.record_entries DROP COLUMN IF EXISTS is_confidential;
--   ALTER TABLE public.record_entries DROP COLUMN IF EXISTS author_user_id;
-- ═══════════════════════════════════════════════════════════════════════════
