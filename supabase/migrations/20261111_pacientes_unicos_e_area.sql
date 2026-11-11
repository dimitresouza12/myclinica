-- ═══════════════════════════════════════════════════════════════════════════
-- PACIENTES ÚNICOS POR CLÍNICA + VISIBILIDADE POR ÁREA (specialty_type)
-- Criado em: 2026-11-11
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Decisões de produto (usuário):
--   * Em clínica com professional_scoped_access = true a visibilidade continua
--     POR ÁREA (specialty_type). Admin, recepção e superadmin veem tudo.
--   * Qualquer agendamento (passado/futuro, qualquer status — como hoje) libera
--     o paciente para a área do profissional agendado.
--   * Evolução / dado clínico de uma área NÃO é visto por profissional de outra
--     área (admin vê tudo).
--
-- O que este arquivo faz (tudo idempotente; pode rodar mais de uma vez):
--   1. patients.created_by_user_id (DEFAULT auth.uid(), imutável por gatilho) e
--      "paciente criado por mim" passa a liberar o paciente: na função
--      patient_visible_to_my_area E direto na policy restrict_pacientes_by_area
--      (dentro da função o INSERT ... RETURNING não enxerga a linha recém-criada;
--      por isso a checagem da coluna também fica na própria policy).
--   2. Anti-duplicidade de CPF: o app grava patients.cpf em claro (cpf_encrypted
--      não é lido nem gravado pelo app; 3 linhas legadas). Logo não há cpf_hash:
--      índice por expressão sobre os dígitos do CPF. UNIQUE só é criado se, NO
--      MOMENTO da execução, não houver duplicado; senão cai para índice comum e
--      emite NOTICE (ver bloco DO). Índices de apoio para telefone e nome+nascimento.
--   3. find_possible_duplicate_patients(nome, nascimento, telefone, cpf): busca
--      SECURITY DEFINER (enxerga a clínica inteira, por design, para evitar
--      cadastro duplicado entre áreas); devolve só id, nome, telefone mascarado,
--      nascimento e motivo. Nunca CPF nem dado clínico. Exige módulo 'pacientes'.
--   4. RLS RESTRICTIVE por área nas tabelas com dado clínico de autor conhecido
--      (record_entries, nutri_avaliacoes, therapy_assessments, therapy_goals,
--      therapy_goal_logs, issued_documents) via helper
--      clinical_row_visible_to_my_area(professional_id, author_user_id).
--
-- NÃO tocado (e por quê):
--   * contracts, signature_requests, signed_documents: documentos administrativos/
--     de consentimento, em geral criados pela recepção (sem área); filtrar por
--     área esconderia o termo assinado do próprio profissional. Já exigem módulo
--     prontuário. Tabelas vazias em produção hoje.
--   * medical_records (ficha: anamnese, odontograma, protocolos): uma ficha única
--     por paciente, sem autor/profissional; não há como atribuir área. Segue com
--     módulo prontuário + visibilidade do paciente por área.
--   * Recepção sem permissão de prontuário: JÁ bloqueada hoje (restrict_prontuario_*
--     em record_entries/nutri_avaliacoes/medical_records; has_module_perm('prontuario')
--     dentro das policies de therapy_*, issued_documents, contracts, signature_*,
--     signed_documents). Nada a acrescentar.
--
-- Limites conhecidos:
--   * service role (n8n, rotas com chave de serviço) ignora RLS.
--   * Linha clínica sem autor identificável (professional_id e author nulos; só
--     existem 105 entradas legadas, todas em clínicas SEM acesso por profissional)
--     só é visível a admin/recepção/superadmin em clínica com escopo ligado.
--   * Autor sem área (specialty_type nulo) só vê o que ele mesmo escreveu.
--   * Índice UNIQUE de CPF: o app passará a receber 23505 (patients_clinic_cpf_digits_uq)
--     ao cadastrar/editar CPF repetido na mesma clínica (inclui paciente inativo).
--
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. patients.created_by_user_id + visibilidade "criado por mim" ──────────

-- Coluna nullable SEM default no ADD (um default STABLE seria avaliado uma vez
-- e carimbado em todas as linhas existentes); o default vem num passo separado
-- e só vale para linhas novas. Linhas antigas ficam NULL (autor desconhecido).
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

ALTER TABLE public.patients
  ALTER COLUMN created_by_user_id SET DEFAULT auth.uid();

COMMENT ON COLUMN public.patients.created_by_user_id IS
  'auth.users.id de quem cadastrou o paciente (preenchido por default/gatilho a partir de auth.uid()). Libera o paciente ao criador mesmo sem agendamento. Nulo em pacientes antigos. Sem FK de propósito.';

-- Gatilho: não dá para forjar nem trocar o criador via API do usuário.
-- Sem sessão (service role / SQL Editor) mantém o valor enviado (permite backfill).
CREATE OR REPLACE FUNCTION public.patients_set_created_by_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by_user_id := auth.uid();
    ELSE
      NEW.created_by_user_id := OLD.created_by_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_set_created_by_user_id ON public.patients;
CREATE TRIGGER patients_set_created_by_user_id
  BEFORE INSERT OR UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.patients_set_created_by_user_id();

-- Mesma assinatura/segurança de produção; mantém as duas condições antigas
-- (agendamento com profissional da minha área; evolução de profissional da minha
-- área) e soma "paciente criado por mim".
CREATE OR REPLACE FUNCTION public.patient_visible_to_my_area(p_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from appointments a
    join professionals p on p.id = a.professional_id
    where a.patient_id = p_patient_id
      and p.specialty_type = public.get_my_specialty_type()
  ) or exists (
    select 1 from record_entries re
    join professionals p on p.id = re.professional_id
    where re.patient_id = p_patient_id
      and p.specialty_type = public.get_my_specialty_type()
  ) or exists (
    select 1 from patients pt
    where pt.id = p_patient_id
      and pt.created_by_user_id = auth.uid()
  );
$function$;

-- ALTER POLICY (não DROP): troca só a expressão USING; WITH CHECK (true) e o
-- tipo RESTRICTIVE ficam como estão. A checagem direta da coluna cobre o
-- INSERT ... RETURNING (a linha nova não é visível à função acima).
ALTER POLICY restrict_pacientes_by_area ON public.patients
  USING (
    (NOT clinic_scopes_by_professional())
    OR is_admin_or_recepcao()
    OR patient_visible_to_my_area(id)
    OR created_by_user_id = (SELECT auth.uid())
  );


-- ─── 2. Anti-duplicidade (CPF) + índices de apoio ────────────────────────────

-- Normalização de nome para comparação: minúsculas, sem acento, espaços colapsados.
-- (unaccent não está instalada; translate cobre o português.)
CREATE OR REPLACE FUNCTION public.normalize_person_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(
      coalesce(p_name, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )),
    '\s+', ' ', 'g'
  ));
$$;

-- CPF: valem só 11 dígitos (lixo/CPF incompleto fica fora do índice).
-- UNIQUE só se não houver duplicado agora; caso contrário índice comum + NOTICE.
-- Em 2026-11-11 a consulta em produção não achou nenhum duplicado.
DO $$
DECLARE
  v_dups integer;
BEGIN
  SELECT count(*) INTO v_dups
  FROM (
    SELECT 1
    FROM public.patients
    WHERE cpf IS NOT NULL
      AND regexp_replace(cpf, '\D', '', 'g') ~ '^\d{11}$'
    GROUP BY clinic_id, regexp_replace(cpf, '\D', '', 'g')
    HAVING count(*) > 1
  ) d;

  IF v_dups = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS patients_clinic_cpf_digits_uq
      ON public.patients (clinic_id, (regexp_replace(cpf, '\D', '', 'g')))
      WHERE cpf IS NOT NULL AND regexp_replace(cpf, '\D', '', 'g') ~ '^\d{11}$';
  ELSE
    RAISE NOTICE 'patients_clinic_cpf_digits_uq NAO criado: % grupo(s) de CPF duplicado (clinic_id, cpf). Criado indice comum patients_clinic_cpf_digits_idx. Liste com: select clinic_id, regexp_replace(cpf,''\D'','''',''g'') as cpf_digitos, array_agg(id) from patients where cpf is not null and regexp_replace(cpf,''\D'','''',''g'') ~ ''^\d{11}$'' group by 1,2 having count(*)>1;', v_dups;
    CREATE INDEX IF NOT EXISTS patients_clinic_cpf_digits_idx
      ON public.patients (clinic_id, (regexp_replace(cpf, '\D', '', 'g')))
      WHERE cpf IS NOT NULL AND regexp_replace(cpf, '\D', '', 'g') ~ '^\d{11}$';
  END IF;
END
$$;

-- Telefone: NÃO é único (familiares compartilham telefone; há casos reais em
-- produção). Índice só para a busca; compara os 10 últimos dígitos (ignora +55
-- e o nono dígito de forma aproximada).
CREATE INDEX IF NOT EXISTS patients_clinic_phone_tail_idx
  ON public.patients (clinic_id, (right(regexp_replace(phone, '\D', '', 'g'), 10)))
  WHERE phone IS NOT NULL AND length(regexp_replace(phone, '\D', '', 'g')) >= 10;

-- Nome normalizado + nascimento (busca; também não é único: homônimos existem).
CREATE INDEX IF NOT EXISTS patients_clinic_name_birth_idx
  ON public.patients (clinic_id, birth_date, (public.normalize_person_name(name)))
  WHERE birth_date IS NOT NULL;


-- ─── 3. find_possible_duplicate_patients ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.find_possible_duplicate_patients(
  p_name  text,
  p_birth date,
  p_phone text,
  p_cpf   text
)
RETURNS TABLE (
  id           uuid,
  name         text,
  phone_masked text,
  birth_date   date,
  match_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
  v_cpf    text;
  v_phone  text;
  v_name   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  v_clinic := public.get_my_clinic_id();
  IF v_clinic IS NULL OR NOT public.has_module_perm('pacientes', false) THEN
    RETURN;
  END IF;

  v_cpf   := regexp_replace(coalesce(p_cpf, ''),   '\D', '', 'g');
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name  := public.normalize_person_name(p_name);

  -- Só busca com critério completo (evita varredura por trecho de nome/telefone).
  IF length(v_cpf) <> 11 THEN v_cpf := NULL; END IF;
  IF length(v_phone) < 10 THEN v_phone := NULL; END IF;
  IF v_name = '' OR p_birth IS NULL THEN v_name := NULL; END IF;

  IF v_cpf IS NULL AND v_phone IS NULL AND v_name IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT x.pid, x.pname, x.pphone_masked, x.pbirth, x.reason
  FROM (
    SELECT
      pt.id         AS pid,
      pt.name       AS pname,
      CASE
        WHEN length(regexp_replace(coalesce(pt.phone, ''), '\D', '', 'g')) >= 4
          THEN '*****' || right(regexp_replace(pt.phone, '\D', '', 'g'), 4)
        ELSE NULL
      END           AS pphone_masked,
      pt.birth_date AS pbirth,
      concat_ws(' + ',
        CASE WHEN m.by_cpf   THEN 'cpf' END,
        CASE WHEN m.by_phone THEN 'telefone' END,
        CASE WHEN m.by_name  THEN 'nome_nascimento' END
      )             AS reason,
      m.by_cpf, m.by_phone, m.by_name
    FROM public.patients pt
    CROSS JOIN LATERAL (
      SELECT
        (v_cpf IS NOT NULL
          AND pt.cpf IS NOT NULL
          AND regexp_replace(pt.cpf, '\D', '', 'g') = v_cpf)                         AS by_cpf,
        (v_phone IS NOT NULL
          AND pt.phone IS NOT NULL
          AND length(regexp_replace(pt.phone, '\D', '', 'g')) >= 10
          AND right(regexp_replace(pt.phone, '\D', '', 'g'), 10) = right(v_phone, 10)) AS by_phone,
        (v_name IS NOT NULL
          AND pt.birth_date = p_birth
          AND public.normalize_person_name(pt.name) = v_name)                        AS by_name
    ) m
    WHERE pt.clinic_id = v_clinic
      AND (m.by_cpf OR m.by_phone OR m.by_name)
  ) x
  ORDER BY x.by_cpf DESC, x.by_name DESC, x.by_phone DESC, x.pname
  LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.find_possible_duplicate_patients(text, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_possible_duplicate_patients(text, date, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_possible_duplicate_patients(text, date, text, text) TO authenticated;


-- ─── 4. RLS por área nos dados clínicos ──────────────────────────────────────

-- Linha clínica é visível se: clínica sem escopo por profissional; OU admin/
-- recepção/superadmin; OU o autor sou eu; OU o profissional é o meu; OU o
-- profissional/autor é da MESMA área (specialty_type) que a minha.
-- Recebe os valores da linha (não reconsulta a tabela): funciona também em
-- INSERT ... RETURNING. Autor nulo e profissional nulo => só admin/recepção.
CREATE OR REPLACE FUNCTION public.clinical_row_visible_to_my_area(
  p_professional_id uuid,
  p_author_user_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    NOT coalesce(public.clinic_scopes_by_professional(), false)
    OR public.is_admin_or_recepcao()
    OR (p_author_user_id IS NOT NULL AND p_author_user_id = auth.uid())
    OR (p_professional_id IS NOT NULL AND p_professional_id = public.get_my_professional_id())
    OR EXISTS (
      SELECT 1 FROM public.professionals pr
      WHERE pr.id = p_professional_id
        AND pr.specialty_type IS NOT NULL
        AND pr.specialty_type = public.get_my_specialty_type()
    )
    OR EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = p_author_user_id
        AND cu.specialty_type IS NOT NULL
        AND cu.specialty_type = public.get_my_specialty_type()
    );
$$;

-- RESTRICTIVE = soma (AND) às policies existentes, que NÃO são alteradas:
-- isolamento por clínica, restrict_prontuario_*, record_entries_confidential_*.

-- record_entries: só leitura (entradas são imutáveis; escrita não tem policy permissiva).
DROP POLICY IF EXISTS restrict_record_entries_by_area ON public.record_entries;
CREATE POLICY restrict_record_entries_by_area ON public.record_entries
  AS RESTRICTIVE
  FOR SELECT
  USING (public.clinical_row_visible_to_my_area(professional_id, author_user_id));

-- issued_documents (atestados, receitas): só leitura (emissão é por service role).
DROP POLICY IF EXISTS restrict_issued_documents_by_area ON public.issued_documents;
CREATE POLICY restrict_issued_documents_by_area ON public.issued_documents
  AS RESTRICTIVE
  FOR SELECT
  USING (public.clinical_row_visible_to_my_area(professional_id, issued_by));

-- nutri_avaliacoes: autor = auth.uid() gravado por gatilho (sem professional_id).
DROP POLICY IF EXISTS restrict_nutri_avaliacoes_by_area ON public.nutri_avaliacoes;
CREATE POLICY restrict_nutri_avaliacoes_by_area ON public.nutri_avaliacoes
  AS RESTRICTIVE
  FOR ALL
  USING (public.clinical_row_visible_to_my_area(NULL, autor));

-- therapy_*: professional_id + created_by (default auth.uid()).
DROP POLICY IF EXISTS restrict_therapy_assessments_by_area ON public.therapy_assessments;
CREATE POLICY restrict_therapy_assessments_by_area ON public.therapy_assessments
  AS RESTRICTIVE
  FOR ALL
  USING (public.clinical_row_visible_to_my_area(professional_id, created_by));

DROP POLICY IF EXISTS restrict_therapy_goals_by_area ON public.therapy_goals;
CREATE POLICY restrict_therapy_goals_by_area ON public.therapy_goals
  AS RESTRICTIVE
  FOR ALL
  USING (public.clinical_row_visible_to_my_area(professional_id, created_by));

DROP POLICY IF EXISTS restrict_therapy_goal_logs_by_area ON public.therapy_goal_logs;
CREATE POLICY restrict_therapy_goal_logs_by_area ON public.therapy_goal_logs
  AS RESTRICTIVE
  FOR ALL
  USING (public.clinical_row_visible_to_my_area(professional_id, created_by));


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de aplicar):
--   select indexname from pg_indexes where tablename='patients' and indexname like 'patients_clinic_%';
--   select policyname, permissive, cmd from pg_policies where policyname like 'restrict_%_by_area' order by tablename;
--   select pg_get_functiondef('public.patient_visible_to_my_area(uuid)'::regprocedure);
--   -- anti-duplicidade (como usuário logado, via app): select * from find_possible_duplicate_patients('Nome','1990-01-01',null,null);
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (executar em bloco, só com confirmação do dono; DROP COLUMN apaga o
-- criador gravado em patients.created_by_user_id)
--
--   DROP POLICY IF EXISTS restrict_therapy_goal_logs_by_area  ON public.therapy_goal_logs;
--   DROP POLICY IF EXISTS restrict_therapy_goals_by_area      ON public.therapy_goals;
--   DROP POLICY IF EXISTS restrict_therapy_assessments_by_area ON public.therapy_assessments;
--   DROP POLICY IF EXISTS restrict_nutri_avaliacoes_by_area   ON public.nutri_avaliacoes;
--   DROP POLICY IF EXISTS restrict_issued_documents_by_area   ON public.issued_documents;
--   DROP POLICY IF EXISTS restrict_record_entries_by_area     ON public.record_entries;
--   DROP FUNCTION IF EXISTS public.clinical_row_visible_to_my_area(uuid, uuid);
--
--   DROP FUNCTION IF EXISTS public.find_possible_duplicate_patients(text, date, text, text);
--   DROP INDEX IF EXISTS public.patients_clinic_name_birth_idx;
--   DROP INDEX IF EXISTS public.patients_clinic_phone_tail_idx;
--   DROP INDEX IF EXISTS public.patients_clinic_cpf_digits_uq;
--   DROP INDEX IF EXISTS public.patients_clinic_cpf_digits_idx;
--   DROP FUNCTION IF EXISTS public.normalize_person_name(text);
--
--   -- volta policy e função de patients ao estado anterior:
--   ALTER POLICY restrict_pacientes_by_area ON public.patients
--     USING ((NOT clinic_scopes_by_professional()) OR is_admin_or_recepcao() OR patient_visible_to_my_area(id));
--   CREATE OR REPLACE FUNCTION public.patient_visible_to_my_area(p_patient_id uuid)
--    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
--   AS $f$
--     select exists (
--       select 1 from appointments a join professionals p on p.id = a.professional_id
--       where a.patient_id = p_patient_id and p.specialty_type = public.get_my_specialty_type()
--     ) or exists (
--       select 1 from record_entries re join professionals p on p.id = re.professional_id
--       where re.patient_id = p_patient_id and p.specialty_type = public.get_my_specialty_type()
--     );
--   $f$;
--   DROP TRIGGER IF EXISTS patients_set_created_by_user_id ON public.patients;
--   DROP FUNCTION IF EXISTS public.patients_set_created_by_user_id();
--   ALTER TABLE public.patients DROP COLUMN IF EXISTS created_by_user_id;
-- ═══════════════════════════════════════════════════════════════════════════
