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
    FROM unnest(ARRAY['get_my_clinic_id', 'is_superadmin', 'has_module_perm']) AS f
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
-- Escopo por área: só cria se clinical_row_visible_to_my_area existir (vem de 20261111_pacientes_unicos_e_area).
-- Sem ela, vale o isolamento por clínica + permissão do módulo; reaplicar este arquivo depois cria a policy.
DO $area$
BEGIN
  DROP POLICY IF EXISTS restrict_medico_registros_by_area ON public.medico_registros;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
              WHERE ns.nspname = 'public' AND p.proname = 'clinical_row_visible_to_my_area') THEN
    EXECUTE 'CREATE POLICY restrict_medico_registros_by_area ON public.medico_registros AS RESTRICTIVE FOR ALL USING (public.clinical_row_visible_to_my_area(NULL, autor))';
  END IF;
END
$area$;

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
