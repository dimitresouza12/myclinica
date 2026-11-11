-- ═══════════════════════════════════════════════════════════════════════════
-- NUTRIÇÃO — avaliações antropométricas e planos alimentares por paciente
-- Criado em: 2026-11-13
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Por que uma tabela nova: medical_records guarda UMA linha por paciente e a ficha atual sobrescreve o
-- valor anterior (peso, dobras...). A Nutrição precisa de HISTÓRICO por data (um peso por consulta, gráficos
-- de evolução) e de vários planos alimentares por paciente. Reaproveitar medical_records.body_protocols
-- (corpograma) misturaria dado de outra aba.
--
-- nutri_avaliacoes  1 linha por avaliação (tipo 'avaliacao') ou por plano alimentar (tipo 'plano').
--   data   dia da avaliação / da versão do plano (várias linhas no mesmo dia são permitidas)
--   dados  jsonb com o formato versionado (v:1) definido em src/lib/nutri/avaliacao.ts e plano.ts
--   autor  auth.users.id de quem gravou; preenchido pelo gatilho a partir de auth.uid() (não dá para forjar)
--
-- RLS: mesmo desenho de medical_records — policy permissiva de isolamento por clínica (+ superadmin) e policies
-- RESTRICTIVE por comando exigindo has_module_perm('prontuario'), de leitura (false) ou edição (true).
-- O INSERT confere ainda que o paciente pertence à mesma clínica da linha.
--
-- Aditiva: só cria tabela, índices, gatilhos e policies. Nenhuma tabela existente é alterada.
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.nutri_avaliacoes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id  uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  tipo        text        NOT NULL CHECK (tipo IN ('avaliacao', 'plano')),
  data        date        NOT NULL DEFAULT CURRENT_DATE,
  dados       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  autor       uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.nutri_avaliacoes IS 'Nutrição: avaliações antropométricas (tipo avaliacao) e planos alimentares (tipo plano) por paciente, com histórico por data.';
COMMENT ON COLUMN public.nutri_avaliacoes.dados IS 'JSON versionado (v:1). Formato em src/lib/nutri/avaliacao.ts (avaliacao) e src/lib/nutri/plano.ts (plano).';
COMMENT ON COLUMN public.nutri_avaliacoes.autor IS 'auth.users.id de quem gravou, definido pelo gatilho nutri_avaliacoes_before_write.';

CREATE INDEX IF NOT EXISTS idx_nutri_avaliacoes_paciente
  ON public.nutri_avaliacoes (patient_id, tipo, data DESC);
CREATE INDEX IF NOT EXISTS idx_nutri_avaliacoes_clinica
  ON public.nutri_avaliacoes (clinic_id);

-- Gatilho: autor = quem está logado (INSERT); updated_at sempre (UPDATE); clinic_id e patient_id não mudam.
CREATE OR REPLACE FUNCTION public.nutri_avaliacoes_before_write()
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

DROP TRIGGER IF EXISTS nutri_avaliacoes_before_write ON public.nutri_avaliacoes;
CREATE TRIGGER nutri_avaliacoes_before_write
  BEFORE INSERT OR UPDATE ON public.nutri_avaliacoes
  FOR EACH ROW EXECUTE FUNCTION public.nutri_avaliacoes_before_write();

-- ─── RLS ───
ALTER TABLE public.nutri_avaliacoes ENABLE ROW LEVEL SECURITY;

-- Isolamento por clínica (igual a medical_records.clinic_isolation).
DROP POLICY IF EXISTS clinic_isolation ON public.nutri_avaliacoes;
CREATE POLICY clinic_isolation ON public.nutri_avaliacoes
  AS PERMISSIVE FOR ALL
  USING      (clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
  WITH CHECK (clinic_id = public.get_my_clinic_id() OR public.is_superadmin());

-- Permissão de módulo (igual a medical_records.restrict_prontuario_*): leitura vs. edição.
DROP POLICY IF EXISTS restrict_prontuario_select ON public.nutri_avaliacoes;
CREATE POLICY restrict_prontuario_select ON public.nutri_avaliacoes
  AS RESTRICTIVE FOR SELECT
  USING ((SELECT public.has_module_perm('prontuario', false)));

DROP POLICY IF EXISTS restrict_prontuario_insert ON public.nutri_avaliacoes;
CREATE POLICY restrict_prontuario_insert ON public.nutri_avaliacoes
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    (SELECT public.has_module_perm('prontuario', true))
    AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = nutri_avaliacoes.patient_id AND p.clinic_id = nutri_avaliacoes.clinic_id)
  );

DROP POLICY IF EXISTS restrict_prontuario_update ON public.nutri_avaliacoes;
CREATE POLICY restrict_prontuario_update ON public.nutri_avaliacoes
  AS RESTRICTIVE FOR UPDATE
  USING      ((SELECT public.has_module_perm('prontuario', true)))
  WITH CHECK ((SELECT public.has_module_perm('prontuario', true)));

DROP POLICY IF EXISTS restrict_prontuario_delete ON public.nutri_avaliacoes;
CREATE POLICY restrict_prontuario_delete ON public.nutri_avaliacoes
  AS RESTRICTIVE FOR DELETE
  USING ((SELECT public.has_module_perm('prontuario', true)));

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (rodar manualmente; apaga os dados da Nutrição):
--   DROP TRIGGER IF EXISTS nutri_avaliacoes_before_write ON public.nutri_avaliacoes;
--   DROP FUNCTION IF EXISTS public.nutri_avaliacoes_before_write();
--   DROP TABLE IF EXISTS public.nutri_avaliacoes;
-- ═══════════════════════════════════════════════════════════════════════════
