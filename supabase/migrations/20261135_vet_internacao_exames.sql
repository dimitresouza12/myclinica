-- ═══════════════════════════════════════════════════════════════════════════
-- VETERINÁRIA — vínculo tutor-pet, internação simples e exames do pet
-- Criado em: 2026-11-16 (NÃO APLICADA: arquivo para o Dimitre revisar e aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hoje cada pet é uma linha de `patients` e o tutor é o contato dessa linha (nome, telefone, CPF copiados em cada
-- pet). Não existe vínculo entre os pets do mesmo tutor, e o índice único patients_clinic_cpf_digits_uq
-- (20261111_pacientes_unicos_e_area) impede o segundo pet de receber o CPF copiado do tutor (erro 23505).
--
-- 1) patients.tutor_id (ALTER aditivo, coluna anulável): aponta para o cadastro principal do tutor (o primeiro pet
--    cadastrado, que continua guardando CPF e contato). O principal tem tutor_id NULL; os demais pets do mesmo tutor
--    apontam para ele. Com isso: um tutor tem N pets, a ficha troca entre eles e o CPF do tutor fica em UMA linha só.
--    Nada existente é alterado: linhas atuais ficam com tutor_id NULL (cada uma é "tutor de si mesma") e o app agrupa
--    por heurística de telefone/CPF até alguém vincular na tela. Gatilho de integridade só dispara quando tutor_id vem
--    preenchido: o tutor tem de ser da mesma clínica e ser um cadastro principal (sem corrente de vínculos).
--
-- 2) vet_internacoes: uma linha por internação (entrada, saída, motivo, leito/baia, status). Colunas estruturadas
--    (status, entrada_em, saida_em, leito) porque a tela e relatórios filtram por elas; o resto em `dados` jsonb v:1
--    (diagnóstico e o resumo de alta). Um pet só pode ter UMA internação aberta por vez (índice único parcial).
--      dados  formato em src/lib/vet/internacao.ts
--
-- 3) vet_internacao_itens: prescrições e evoluções por turno de cada internação. Linhas separadas (e não um jsonb
--    único na internação) para que plantões diferentes gravem ao mesmo tempo sem sobrescrever o registro um do outro.
--      tipo   'prescricao' | 'evolucao'
--      turno  'manha' | 'tarde' | 'noite' (calculado pelo app a partir de registrado_em, no fuso de Brasília)
--      dados  jsonb v:1, formato em src/lib/vet/internacao.ts
--
-- 4) vet_exames: solicitação de exames do pet e o resultado (hemograma, bioquímico etc. em campos livres com
--    referência opcional) na MESMA linha. status: 'solicitado' | 'com_resultado'.
--      data   dia da solicitação
--      dados  jsonb v:1, formato em src/lib/vet/exames.ts. Anexos (PDF/foto do laudo): o jsonb guarda só o caminho no
--             bucket `pacientes`, em vet-exames/<clinic_id>/<patient_id>/<arquivo>. A 2ª pasta é a clínica, que é o
--             que as policies de storage por clínica (20261127_pacientes_storage_por_clinica.sql) já conferem:
--             NÃO há policy de storage nova aqui.
--
-- RLS (mesmo conjunto de medico_registros / odonto_*, em camadas somadas):
--   * clinic_isolation (permissiva): só a própria clínica (ou superadmin), na leitura e na escrita
--   * restrict_prontuario_* (RESTRICTIVE, por comando): has_module_perm('prontuario') — leitura (false), edição (true);
--     o INSERT confere que o paciente é da mesma clínica da linha (e, nos itens, que a internação é do mesmo paciente)
--   * restrict_<tabela>_by_area (RESTRICTIVE): em clínica com escopo por profissional, só vê/grava quem é da mesma área
--     do autor (clinical_row_visible_to_my_area). Padrão condicional da 20261131: só cria se a função existir.
-- service_role ignora RLS (como nas demais tabelas).
--
-- Guarda de funções: o script PARA com mensagem clara se faltarem as funções de permissão ou as tabelas-base, em vez
-- de criar tabelas sem a proteção.
--
-- Idempotente: IF NOT EXISTS, CREATE OR REPLACE e DROP ... IF EXISTS antes de cada policy e gatilho; pode rodar duas
-- vezes. Aditiva: só altera patients para ACRESCENTAR uma coluna, um índice, uma constraint e um gatilho condicional.
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_falta text;
BEGIN
  IF to_regclass('public.clinics') IS NULL OR to_regclass('public.patients') IS NULL THEN
    RAISE EXCEPTION 'public.clinics ou public.patients não existe';
  END IF;
  SELECT string_agg(f, ', ') INTO v_falta
    FROM unnest(ARRAY[
      'public.get_my_clinic_id()',
      'public.is_superadmin()',
      'public.has_module_perm(text, boolean)'
    ]) AS f
   WHERE to_regprocedure(f) IS NULL;
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam funções de permissão (%): aplique antes 20261111_permissoes_por_modulo.sql e 20261111_pacientes_unicos_e_area.sql', v_falta;
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Vínculo tutor-pet: patients.tutor_id
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS tutor_id uuid REFERENCES public.patients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.patients.tutor_id IS
  'Veterinária: cadastro principal do tutor (o primeiro pet dele, que guarda CPF e contato). NULL = este é o cadastro principal (ou não é pet). Os outros pets do mesmo tutor apontam para ele.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_tutor_id_not_self' AND conrelid = 'public.patients'::regclass) THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_tutor_id_not_self CHECK (tutor_id IS NULL OR tutor_id <> id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS patients_tutor_id_idx ON public.patients (tutor_id) WHERE tutor_id IS NOT NULL;

-- Integridade: só roda em linha com tutor_id preenchido. O tutor precisa ser da mesma clínica e ser um cadastro
-- principal (tutor_id NULL), para não formar corrente de vínculos. SECURITY INVOKER: sob RLS, tutor que o usuário não
-- enxerga conta como inexistente.
CREATE OR REPLACE FUNCTION public.patients_tutor_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.patients t
     WHERE t.id = NEW.tutor_id AND t.clinic_id = NEW.clinic_id AND t.tutor_id IS NULL
  ) THEN
    RAISE EXCEPTION 'tutor_id inválido: o tutor precisa ser um cadastro principal da mesma clínica'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_tutor_check ON public.patients;
CREATE TRIGGER patients_tutor_check
  BEFORE INSERT OR UPDATE OF tutor_id, clinic_id ON public.patients
  FOR EACH ROW
  WHEN (NEW.tutor_id IS NOT NULL)
  EXECUTE FUNCTION public.patients_tutor_check();

-- Nenhuma policy nova em patients: o vínculo é uma coluna da própria linha e herda clinic_isolation,
-- restrict_pacientes_modulo_* e restrict_pacientes_by_area já existentes.

-- ═══════════════════════════════════════════════════════════════════════════
-- Gatilhos comuns: autor = quem está logado (INSERT); updated_at sempre (UPDATE); chaves de ligação não mudam
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.vet_ficha_before_write()
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

CREATE OR REPLACE FUNCTION public.vet_internacao_itens_before_write()
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
    NEW.clinic_id     := OLD.clinic_id;
    NEW.patient_id    := OLD.patient_id;
    NEW.internacao_id := OLD.internacao_id;
    NEW.tipo          := OLD.tipo;
    NEW.autor         := OLD.autor;
    NEW.created_at    := OLD.created_at;
    NEW.updated_at    := now();
  END IF;
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) vet_internacoes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vet_internacoes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id  uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'internado' CHECK (status IN ('internado', 'alta', 'obito', 'transferido')),
  entrada_em  timestamptz NOT NULL DEFAULT now(),
  saida_em    timestamptz,
  leito       text        CHECK (leito IS NULL OR char_length(leito) <= 60),
  motivo      text        NOT NULL CHECK (char_length(btrim(motivo)) > 0 AND char_length(motivo) <= 600),
  dados       jsonb       NOT NULL DEFAULT '{}'::jsonb
              CHECK (jsonb_typeof(dados) = 'object' AND octet_length(dados::text) <= 100000),
  autor       uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (saida_em IS NULL OR saida_em >= entrada_em),
  CHECK ((status = 'internado') = (saida_em IS NULL))
);

COMMENT ON TABLE  public.vet_internacoes IS 'Veterinária: internações do pet (entrada, saída, motivo, leito/baia, status). Prescrições e evoluções em vet_internacao_itens.';
COMMENT ON COLUMN public.vet_internacoes.status IS 'internado = aberta (saida_em nula); alta, obito e transferido = encerrada (saida_em preenchida).';
COMMENT ON COLUMN public.vet_internacoes.dados IS 'JSON versionado (v:1). Formato em src/lib/vet/internacao.ts: diagnostico e alta (condição, resumo, medicação e orientações pós-alta, retorno, profissional).';
COMMENT ON COLUMN public.vet_internacoes.autor IS 'auth.users.id de quem gravou, definido pelo gatilho vet_internacoes_before_write.';

CREATE INDEX IF NOT EXISTS idx_vet_internacoes_paciente ON public.vet_internacoes (patient_id, entrada_em DESC);
CREATE INDEX IF NOT EXISTS idx_vet_internacoes_clinica  ON public.vet_internacoes (clinic_id, status, entrada_em DESC);
-- um pet só pode ter uma internação aberta
CREATE UNIQUE INDEX IF NOT EXISTS vet_internacoes_uma_aberta_por_pet ON public.vet_internacoes (patient_id) WHERE status = 'internado';

DROP TRIGGER IF EXISTS vet_internacoes_before_write ON public.vet_internacoes;
CREATE TRIGGER vet_internacoes_before_write
  BEFORE INSERT OR UPDATE ON public.vet_internacoes
  FOR EACH ROW EXECUTE FUNCTION public.vet_ficha_before_write();

ALTER TABLE public.vet_internacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation ON public.vet_internacoes;
CREATE POLICY clinic_isolation ON public.vet_internacoes
  AS PERMISSIVE FOR ALL
  USING      (clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
  WITH CHECK (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

DROP POLICY IF EXISTS restrict_prontuario_select ON public.vet_internacoes;
CREATE POLICY restrict_prontuario_select ON public.vet_internacoes
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('prontuario', false)));

DROP POLICY IF EXISTS restrict_prontuario_insert ON public.vet_internacoes;
CREATE POLICY restrict_prontuario_insert ON public.vet_internacoes
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    (SELECT public.has_module_perm('prontuario', true))
    AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = vet_internacoes.patient_id AND p.clinic_id = vet_internacoes.clinic_id)
  );

DROP POLICY IF EXISTS restrict_prontuario_update ON public.vet_internacoes;
CREATE POLICY restrict_prontuario_update ON public.vet_internacoes
  AS RESTRICTIVE FOR UPDATE
  USING      ((SELECT public.has_module_perm('prontuario', true)))
  WITH CHECK ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_prontuario_delete ON public.vet_internacoes;
CREATE POLICY restrict_prontuario_delete ON public.vet_internacoes
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('prontuario', true)));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) vet_internacao_itens (prescrições e evoluções por turno)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vet_internacao_itens (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id     uuid        NOT NULL REFERENCES public.clinics(id)         ON DELETE CASCADE,
  patient_id    uuid        NOT NULL REFERENCES public.patients(id)        ON DELETE CASCADE,
  internacao_id uuid        NOT NULL REFERENCES public.vet_internacoes(id) ON DELETE CASCADE,
  tipo          text        NOT NULL CHECK (tipo IN ('prescricao', 'evolucao')),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  turno         text        NOT NULL CHECK (turno IN ('manha', 'tarde', 'noite')),
  dados         jsonb       NOT NULL DEFAULT '{}'::jsonb
                CHECK (jsonb_typeof(dados) = 'object' AND octet_length(dados::text) <= 100000),
  autor         uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.vet_internacao_itens IS 'Veterinária: prescrições (tipo prescricao) e evoluções por turno (tipo evolucao) de uma internação. Uma linha por registro, para plantões diferentes não sobrescreverem uns aos outros.';
COMMENT ON COLUMN public.vet_internacao_itens.turno IS 'manha (07h-12h59), tarde (13h-18h59) ou noite (19h-06h59), no fuso de Brasília; calculado pelo app.';
COMMENT ON COLUMN public.vet_internacao_itens.dados IS 'JSON versionado (v:1). Formato em src/lib/vet/internacao.ts: prescrição (medicamento, dose, via, frequência, observação, suspensa) ou evolução (texto, temperatura, FC, FR).';
COMMENT ON COLUMN public.vet_internacao_itens.autor IS 'auth.users.id de quem gravou, definido pelo gatilho vet_internacao_itens_before_write.';

CREATE INDEX IF NOT EXISTS idx_vet_internacao_itens_internacao ON public.vet_internacao_itens (internacao_id, registrado_em);
CREATE INDEX IF NOT EXISTS idx_vet_internacao_itens_paciente   ON public.vet_internacao_itens (patient_id, registrado_em DESC);
CREATE INDEX IF NOT EXISTS idx_vet_internacao_itens_clinica    ON public.vet_internacao_itens (clinic_id);

DROP TRIGGER IF EXISTS vet_internacao_itens_before_write ON public.vet_internacao_itens;
CREATE TRIGGER vet_internacao_itens_before_write
  BEFORE INSERT OR UPDATE ON public.vet_internacao_itens
  FOR EACH ROW EXECUTE FUNCTION public.vet_internacao_itens_before_write();

ALTER TABLE public.vet_internacao_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation ON public.vet_internacao_itens;
CREATE POLICY clinic_isolation ON public.vet_internacao_itens
  AS PERMISSIVE FOR ALL
  USING      (clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
  WITH CHECK (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

DROP POLICY IF EXISTS restrict_prontuario_select ON public.vet_internacao_itens;
CREATE POLICY restrict_prontuario_select ON public.vet_internacao_itens
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('prontuario', false)));

-- o item só entra em internação do mesmo paciente e da mesma clínica
DROP POLICY IF EXISTS restrict_prontuario_insert ON public.vet_internacao_itens;
CREATE POLICY restrict_prontuario_insert ON public.vet_internacao_itens
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    (SELECT public.has_module_perm('prontuario', true))
    AND EXISTS (
      SELECT 1 FROM public.vet_internacoes i
       WHERE i.id = vet_internacao_itens.internacao_id
         AND i.patient_id = vet_internacao_itens.patient_id
         AND i.clinic_id  = vet_internacao_itens.clinic_id
    )
  );

DROP POLICY IF EXISTS restrict_prontuario_update ON public.vet_internacao_itens;
CREATE POLICY restrict_prontuario_update ON public.vet_internacao_itens
  AS RESTRICTIVE FOR UPDATE
  USING      ((SELECT public.has_module_perm('prontuario', true)))
  WITH CHECK ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_prontuario_delete ON public.vet_internacao_itens;
CREATE POLICY restrict_prontuario_delete ON public.vet_internacao_itens
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('prontuario', true)));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) vet_exames
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vet_exames (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id  uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado', 'com_resultado')),
  data        date        NOT NULL DEFAULT CURRENT_DATE,
  dados       jsonb       NOT NULL DEFAULT '{}'::jsonb
              CHECK (jsonb_typeof(dados) = 'object' AND octet_length(dados::text) <= 100000),
  autor       uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.vet_exames IS 'Veterinária: solicitações de exames do pet e o resultado (campos livres com referência opcional, interpretação e anexos) na mesma linha.';
COMMENT ON COLUMN public.vet_exames.data IS 'Dia da solicitação.';
COMMENT ON COLUMN public.vet_exames.dados IS 'JSON versionado (v:1). Formato em src/lib/vet/exames.ts. Anexos: só os caminhos no bucket pacientes (vet-exames/<clinic_id>/<patient_id>/...).';
COMMENT ON COLUMN public.vet_exames.autor IS 'auth.users.id de quem gravou, definido pelo gatilho vet_exames_before_write.';

CREATE INDEX IF NOT EXISTS idx_vet_exames_paciente ON public.vet_exames (patient_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_vet_exames_clinica  ON public.vet_exames (clinic_id, status);

DROP TRIGGER IF EXISTS vet_exames_before_write ON public.vet_exames;
CREATE TRIGGER vet_exames_before_write
  BEFORE INSERT OR UPDATE ON public.vet_exames
  FOR EACH ROW EXECUTE FUNCTION public.vet_ficha_before_write();

ALTER TABLE public.vet_exames ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_isolation ON public.vet_exames;
CREATE POLICY clinic_isolation ON public.vet_exames
  AS PERMISSIVE FOR ALL
  USING      (clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
  WITH CHECK (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

DROP POLICY IF EXISTS restrict_prontuario_select ON public.vet_exames;
CREATE POLICY restrict_prontuario_select ON public.vet_exames
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('prontuario', false)));

DROP POLICY IF EXISTS restrict_prontuario_insert ON public.vet_exames;
CREATE POLICY restrict_prontuario_insert ON public.vet_exames
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    (SELECT public.has_module_perm('prontuario', true))
    AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = vet_exames.patient_id AND p.clinic_id = vet_exames.clinic_id)
  );

DROP POLICY IF EXISTS restrict_prontuario_update ON public.vet_exames;
CREATE POLICY restrict_prontuario_update ON public.vet_exames
  AS RESTRICTIVE FOR UPDATE
  USING      ((SELECT public.has_module_perm('prontuario', true)))
  WITH CHECK ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_prontuario_delete ON public.vet_exames;
CREATE POLICY restrict_prontuario_delete ON public.vet_exames
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('prontuario', true)));

-- ═══════════════════════════════════════════════════════════════════════════
-- Restrição por área do profissional nas três tabelas (padrão condicional da 20261131).
-- Escopo por área: só cria se clinical_row_visible_to_my_area existir (vem de 20261111_pacientes_unicos_e_area).
-- Sem ela, vale o isolamento por clínica + permissão do módulo; reaplicar este arquivo depois cria as policies.
-- ═══════════════════════════════════════════════════════════════════════════
DO $area$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vet_internacoes', 'vet_internacao_itens', 'vet_exames'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'restrict_' || t || '_by_area', t);
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
                WHERE ns.nspname = 'public' AND p.proname = 'clinical_row_visible_to_my_area') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL USING (public.clinical_row_visible_to_my_area(NULL, autor))',
        'restrict_' || t || '_by_area', t
      );
    END IF;
  END LOOP;
END
$area$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de aplicar; somente leitura):
--   -- coluna e gatilho do vínculo (esperado: 1 linha cada)
--   SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'tutor_id';
--   SELECT tgname FROM pg_trigger WHERE tgname = 'patients_tutor_check';
--   -- RLS ligada nas três tabelas (esperado: true, true, true)
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE oid IN ('public.vet_internacoes'::regclass, 'public.vet_internacao_itens'::regclass, 'public.vet_exames'::regclass);
--   -- 6 policies por tabela: clinic_isolation + restrict_prontuario_(select|insert|update|delete) + restrict_<tabela>_by_area
--   SELECT tablename, policyname, permissive, cmd FROM pg_policies
--    WHERE tablename IN ('vet_internacoes', 'vet_internacao_itens', 'vet_exames') ORDER BY tablename, policyname;
--   -- índice único parcial (um pet, uma internação aberta)
--   SELECT indexname FROM pg_indexes WHERE indexname = 'vet_internacoes_uma_aberta_por_pet';
--
-- ROLLBACK (rodar manualmente; APAGA internações, prescrições, evoluções e exames; remove o vínculo tutor-pet, que
-- volta ao comportamento anterior sem perder nenhum cadastro; os anexos no storage ficam: bucket pacientes, pasta
-- vet-exames/, apague pelo painel se quiser):
--   DROP TABLE IF EXISTS public.vet_internacao_itens;
--   DROP TABLE IF EXISTS public.vet_internacoes;
--   DROP TABLE IF EXISTS public.vet_exames;
--   DROP FUNCTION IF EXISTS public.vet_internacao_itens_before_write();
--   DROP FUNCTION IF EXISTS public.vet_ficha_before_write();
--   DROP TRIGGER IF EXISTS patients_tutor_check ON public.patients;
--   DROP FUNCTION IF EXISTS public.patients_tutor_check();
--   DROP INDEX IF EXISTS public.patients_tutor_id_idx;
--   ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_tutor_id_not_self;
--   ALTER TABLE public.patients DROP COLUMN IF EXISTS tutor_id;
-- ═══════════════════════════════════════════════════════════════════════════
