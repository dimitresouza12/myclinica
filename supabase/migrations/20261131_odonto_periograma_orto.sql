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
    FROM unnest(ARRAY['get_my_clinic_id', 'is_superadmin', 'has_module_perm']) AS f
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = f);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'faltam funções: % (aplique antes 20261111_permissoes_por_modulo.sql)', v_falta;
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

-- Escopo por área: só cria se clinical_row_visible_to_my_area existir (vem de 20261111_pacientes_unicos_e_area).
-- Sem ela, vale o isolamento por clínica + permissão do módulo; reaplicar este arquivo depois cria a policy.
DO $area$
BEGIN
  DROP POLICY IF EXISTS restrict_odonto_periogramas_by_area ON public.odonto_periogramas;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
              WHERE ns.nspname = 'public' AND p.proname = 'clinical_row_visible_to_my_area') THEN
    EXECUTE 'CREATE POLICY restrict_odonto_periogramas_by_area ON public.odonto_periogramas AS RESTRICTIVE FOR ALL USING (public.clinical_row_visible_to_my_area(NULL, autor))';
  END IF;
END
$area$;

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

-- Escopo por área: só cria se clinical_row_visible_to_my_area existir (vem de 20261111_pacientes_unicos_e_area).
-- Sem ela, vale o isolamento por clínica + permissão do módulo; reaplicar este arquivo depois cria a policy.
DO $area$
BEGIN
  DROP POLICY IF EXISTS restrict_odonto_ortodontia_by_area ON public.odonto_ortodontia;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
              WHERE ns.nspname = 'public' AND p.proname = 'clinical_row_visible_to_my_area') THEN
    EXECUTE 'CREATE POLICY restrict_odonto_ortodontia_by_area ON public.odonto_ortodontia AS RESTRICTIVE FOR ALL USING (public.clinical_row_visible_to_my_area(NULL, autor))';
  END IF;
END
$area$;

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
