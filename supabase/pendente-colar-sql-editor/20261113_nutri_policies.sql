-- ═══════════════════════════════════════════════════════════════════════════
-- NUTRIÇÃO — gatilho e policies de nutri_avaliacoes  (COLAR NO SQL EDITOR DO SUPABASE)
-- Criado em: 2026-11-13
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A tabela public.nutri_avaliacoes JÁ FOI CRIADA em produção (com RLS ligado e índices), mas sem policies:
-- com RLS ligado e nenhuma policy, ninguém lê nem grava (negado por padrão). A aba "Avaliação nutricional"
-- do prontuário detecta isso e mostra o aviso "Histórico indisponível" até este arquivo ser executado.
--
-- Este arquivo cria o gatilho (autor = auth.uid(); updated_at) e as policies de isolamento por clínica +
-- permissão do módulo prontuário, no mesmo desenho de medical_records. É idempotente (DROP IF EXISTS antes).
-- O desenho completo e o rollback estão em supabase/migrations/20261113_nutri_avaliacoes.sql.
--
-- Depois de executar: abrir o prontuário de um paciente de nutrição, aba Avaliação nutricional, e salvar uma
-- avaliação de teste na conta "QA Cobranca Dia Pagamento" (nunca criar clínica de teste).
-- ═══════════════════════════════════════════════════════════════════════════

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
