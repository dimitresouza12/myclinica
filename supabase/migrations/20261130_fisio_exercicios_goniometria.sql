-- ═══════════════════════════════════════════════════════════════════════════
-- FISIOTERAPIA: BIBLIOTECA DE EXERCÍCIOS, PRESCRIÇÃO, EXECUÇÃO PELO PACIENTE E GONIOMETRIA SERIADA
-- Criado em: 2026-11-30
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Cinco tabelas novas, todas aditivas (nada existente é alterado, exceto a lista de escopos aceitos
-- em patient_portal_links, que ganha 'exercicios' — ver bloco 6).
--   * fisio_exercicios           — biblioteca de exercícios da clínica (nome, descrição, região,
--                                  séries/repetições padrão, link de vídeo YouTube/Vimeo, foto no Storage).
--                                  Sem DELETE: para tirar da lista, active = false (as prescrições já
--                                  feitas guardam uma cópia dos dados do exercício).
--   * fisio_prescricoes          — um programa de exercícios de um paciente (título, orientações, status).
--                                  Sem DELETE: encerrar = status 'encerrada' (o histórico de execução fica).
--   * fisio_prescricao_itens     — os exercícios do programa. Cada item guarda uma CÓPIA do nome, da descrição,
--                                  do vídeo e da foto no momento da prescrição, então editar a biblioteca
--                                  depois não muda o que o paciente já recebeu.
--   * fisio_execucoes            — "marquei como feito": uma linha por item por dia (UNIQUE item + dia).
--                                  Quem grava é a página pública do paciente (/p/[token]), pelo servidor com
--                                  a chave de serviço; a clínica só LÊ (histórico de execução).
--   * fisio_goniometrias         — goniometria seriada: articulação, movimento, lado, ativo/passivo, ângulo
--                                  medido e o valor de referência (cópia do valor normal usado na hora).
--
-- Segurança: RLS ligado em todas. Mesmo desenho do prontuário (metas terapêuticas):
--   leitura  = (clinic_id = get_my_clinic_id() OR is_superadmin()) E has_module_perm('prontuario', false)
--   escrita  = (clinic_id = get_my_clinic_id() OR is_superadmin()) E has_module_perm('prontuario', true)
--   o paciente (e a prescrição/o exercício, nos itens) precisam pertencer à mesma clínica.
--   fisio_execucoes não tem policy de escrita: só o servidor (chave de serviço) grava, depois de
--   conferir o token do link, o escopo 'exercicios' e que o item é do paciente do link.
--
-- Fotos dos exercícios: reaproveitam o bucket privado `pacientes`, no caminho
--   exercicios/<clinic_id>/<exercicio_id>/<arquivo>
-- A 2a pasta é a clínica, então já valem as policies pacientes_select/insert/delete da migration
-- 20261127_pacientes_storage_por_clinica.sql (isolamento por clínica). Nada de bucket novo e nenhuma
-- policy de storage nova nesta migration. O CHECK de image_path abaixo garante que o caminho gravado
-- na linha aponta para a pasta da PRÓPRIA clínica (o servidor assina o caminho com a chave de serviço).
-- A página do paciente recebe URL assinada de 1 hora, gerada no servidor.
--
-- Vídeo: só link normalizado de YouTube (watch?v=ID) ou Vimeo (vimeo.com/ID); o app converte qualquer
-- formato colado para esse e o CHECK impede outra coisa (nada de endereço arbitrário na página pública).
--
-- Sem gatilhos: created_by usa DEFAULT auth.uid(); updated_at é enviado pelo app.
--
-- Desfazer: bloco ROLLBACK no fim do arquivo (apaga as cinco tabelas e os dados delas e devolve
-- a lista antiga de escopos).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Biblioteca de exercícios ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fisio_exercicios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(btrim(name)) > 0 AND length(name) <= 120),
  description  text CHECK (description IS NULL OR length(description) <= 2000),
  region       text CHECK (region IS NULL OR length(region) <= 40),
  default_sets smallint CHECK (default_sets IS NULL OR default_sets BETWEEN 1 AND 20),
  default_reps text CHECK (default_reps IS NULL OR length(default_reps) <= 40),
  video_url    text CHECK (video_url IS NULL OR video_url ~ '^https://(www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com/[0-9]{1,12}(/[0-9a-f]{6,20})?)$'),
  image_path   text CHECK (image_path IS NULL OR (length(image_path) <= 300 AND image_path LIKE ('exercicios/' || clinic_id::text || '/%'))),
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fisio_exercicios_clinic_idx ON public.fisio_exercicios (clinic_id, active, name);

-- ── 2. Prescrição (programa do paciente) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fisio_prescricoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title           text NOT NULL CHECK (length(btrim(title)) > 0 AND length(title) <= 120),
  notes           text CHECK (notes IS NULL OR length(notes) <= 2000),
  status          text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  started_on      date NOT NULL DEFAULT current_date,
  ended_on        date,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fisio_prescricoes_patient_idx ON public.fisio_prescricoes (clinic_id, patient_id, status, created_at DESC);

-- ── 3. Itens da prescrição (com cópia dos dados do exercício) ──────────────
CREATE TABLE IF NOT EXISTS public.fisio_prescricao_itens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id    uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  prescricao_id uuid NOT NULL REFERENCES public.fisio_prescricoes(id) ON DELETE CASCADE,
  exercicio_id  uuid REFERENCES public.fisio_exercicios(id) ON DELETE SET NULL,
  name          text NOT NULL CHECK (length(btrim(name)) > 0 AND length(name) <= 120),
  description   text CHECK (description IS NULL OR length(description) <= 2000),
  region        text CHECK (region IS NULL OR length(region) <= 40),
  video_url     text CHECK (video_url IS NULL OR video_url ~ '^https://(www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com/[0-9]{1,12}(/[0-9a-f]{6,20})?)$'),
  image_path    text CHECK (image_path IS NULL OR (length(image_path) <= 300 AND image_path LIKE ('exercicios/' || clinic_id::text || '/%'))),
  sets          smallint CHECK (sets IS NULL OR sets BETWEEN 1 AND 20),
  reps          text CHECK (reps IS NULL OR length(reps) <= 40),
  times_per_week smallint NOT NULL DEFAULT 7 CHECK (times_per_week BETWEEN 1 AND 7),
  notes         text CHECK (notes IS NULL OR length(notes) <= 500),
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fisio_prescricao_itens_presc_idx ON public.fisio_prescricao_itens (prescricao_id, sort_order);
CREATE INDEX IF NOT EXISTS fisio_prescricao_itens_patient_idx ON public.fisio_prescricao_itens (clinic_id, patient_id);

-- ── 4. Execução marcada pelo paciente ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fisio_execucoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES public.fisio_prescricao_itens(id) ON DELETE CASCADE,
  done_on    date NOT NULL,
  done_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, done_on)
);

CREATE INDEX IF NOT EXISTS fisio_execucoes_patient_idx ON public.fisio_execucoes (clinic_id, patient_id, done_on DESC);

-- ── 5. Goniometria seriada ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fisio_goniometrias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  measured_on     date NOT NULL DEFAULT current_date,
  joint           text NOT NULL CHECK (length(btrim(joint)) > 0 AND length(joint) <= 40),
  movement        text NOT NULL CHECK (length(btrim(movement)) > 0 AND length(movement) <= 40),
  side            text NOT NULL DEFAULT 'nao_se_aplica' CHECK (side IN ('direito', 'esquerdo', 'nao_se_aplica')),
  mode            text NOT NULL DEFAULT 'ativo' CHECK (mode IN ('ativo', 'passivo')),
  angle_deg       numeric(5,1) NOT NULL CHECK (angle_deg >= 0 AND angle_deg <= 360),
  reference_deg   numeric(5,1) CHECK (reference_deg IS NULL OR (reference_deg >= 0 AND reference_deg <= 360)),
  note            text CHECK (note IS NULL OR length(note) <= 300),
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  created_by      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fisio_goniometrias_patient_idx ON public.fisio_goniometrias (clinic_id, patient_id, joint, movement, measured_on);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.fisio_exercicios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fisio_prescricoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fisio_prescricao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fisio_execucoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fisio_goniometrias     ENABLE ROW LEVEL SECURITY;

-- fisio_exercicios: sem DELETE (desativar = active false)
DROP POLICY IF EXISTS fisio_exercicios_select ON public.fisio_exercicios;
CREATE POLICY fisio_exercicios_select ON public.fisio_exercicios FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS fisio_exercicios_insert ON public.fisio_exercicios;
CREATE POLICY fisio_exercicios_insert ON public.fisio_exercicios FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true));

DROP POLICY IF EXISTS fisio_exercicios_update ON public.fisio_exercicios;
CREATE POLICY fisio_exercicios_update ON public.fisio_exercicios FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true));

-- fisio_prescricoes: sem DELETE (encerrar = status 'encerrada')
DROP POLICY IF EXISTS fisio_prescricoes_select ON public.fisio_prescricoes;
CREATE POLICY fisio_prescricoes_select ON public.fisio_prescricoes FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS fisio_prescricoes_insert ON public.fisio_prescricoes;
CREATE POLICY fisio_prescricoes_insert ON public.fisio_prescricoes FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = fisio_prescricoes.clinic_id));

DROP POLICY IF EXISTS fisio_prescricoes_update ON public.fisio_prescricoes;
CREATE POLICY fisio_prescricoes_update ON public.fisio_prescricoes FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = fisio_prescricoes.clinic_id));

-- fisio_prescricao_itens: DELETE liberado (tirar um exercício do programa na edição)
DROP POLICY IF EXISTS fisio_prescricao_itens_select ON public.fisio_prescricao_itens;
CREATE POLICY fisio_prescricao_itens_select ON public.fisio_prescricao_itens FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS fisio_prescricao_itens_insert ON public.fisio_prescricao_itens;
CREATE POLICY fisio_prescricao_itens_insert ON public.fisio_prescricao_itens FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.fisio_prescricoes r
                          WHERE r.id = prescricao_id AND r.clinic_id = fisio_prescricao_itens.clinic_id AND r.patient_id = fisio_prescricao_itens.patient_id)
              AND (exercicio_id IS NULL OR EXISTS (SELECT 1 FROM public.fisio_exercicios e
                                                    WHERE e.id = exercicio_id AND e.clinic_id = fisio_prescricao_itens.clinic_id)));

DROP POLICY IF EXISTS fisio_prescricao_itens_update ON public.fisio_prescricao_itens;
CREATE POLICY fisio_prescricao_itens_update ON public.fisio_prescricao_itens FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.fisio_prescricoes r
                          WHERE r.id = prescricao_id AND r.clinic_id = fisio_prescricao_itens.clinic_id AND r.patient_id = fisio_prescricao_itens.patient_id)
              AND (exercicio_id IS NULL OR EXISTS (SELECT 1 FROM public.fisio_exercicios e
                                                    WHERE e.id = exercicio_id AND e.clinic_id = fisio_prescricao_itens.clinic_id)));

DROP POLICY IF EXISTS fisio_prescricao_itens_delete ON public.fisio_prescricao_itens;
CREATE POLICY fisio_prescricao_itens_delete ON public.fisio_prescricao_itens FOR DELETE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true));

-- fisio_execucoes: só leitura para a clínica. A escrita é do servidor (chave de serviço), nunca do navegador.
DROP POLICY IF EXISTS fisio_execucoes_select ON public.fisio_execucoes;
CREATE POLICY fisio_execucoes_select ON public.fisio_execucoes FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

-- fisio_goniometrias
DROP POLICY IF EXISTS fisio_goniometrias_select ON public.fisio_goniometrias;
CREATE POLICY fisio_goniometrias_select ON public.fisio_goniometrias FOR SELECT
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', false));

DROP POLICY IF EXISTS fisio_goniometrias_insert ON public.fisio_goniometrias;
CREATE POLICY fisio_goniometrias_insert ON public.fisio_goniometrias FOR INSERT
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = fisio_goniometrias.clinic_id));

DROP POLICY IF EXISTS fisio_goniometrias_update ON public.fisio_goniometrias;
CREATE POLICY fisio_goniometrias_update ON public.fisio_goniometrias FOR UPDATE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true))
  WITH CHECK ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
              AND public.has_module_perm('prontuario', true)
              AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.clinic_id = fisio_goniometrias.clinic_id));

DROP POLICY IF EXISTS fisio_goniometrias_delete ON public.fisio_goniometrias;
CREATE POLICY fisio_goniometrias_delete ON public.fisio_goniometrias FOR DELETE
  USING ((clinic_id = public.get_my_clinic_id() OR public.is_superadmin())
         AND public.has_module_perm('prontuario', true));

COMMENT ON TABLE public.fisio_exercicios IS
  'Biblioteca de exercícios de fisioterapia da clínica. Sem DELETE: desativar = active false.';
COMMENT ON TABLE public.fisio_prescricoes IS
  'Programa de exercícios prescrito a um paciente. Sem DELETE: encerrar = status encerrada.';
COMMENT ON TABLE public.fisio_prescricao_itens IS
  'Exercícios do programa, com cópia do nome, descrição, vídeo e foto do momento da prescrição.';
COMMENT ON TABLE public.fisio_execucoes IS
  'Marcações de "feito" do paciente (uma por item por dia). Gravadas só pelo servidor, a partir da página /p/[token].';
COMMENT ON TABLE public.fisio_goniometrias IS
  'Goniometria seriada: ângulo por articulação, movimento, lado e modo (ativo/passivo), com o valor de referência usado.';

-- ── 6. Portal do paciente: novo escopo 'exercicios' ────────────────────────
-- O CHECK de patient_portal_links.scopes lista os escopos aceitos. Troca pela lista com 'exercicios'
-- (superconjunto da anterior: nenhuma linha existente deixa de valer). Pula sozinho se a tabela do
-- portal ainda não existe. Idempotente: remove o CHECK de escopos, qualquer que seja o nome, e recria.
DO $$
DECLARE c record;
BEGIN
  IF to_regclass('public.patient_portal_links') IS NULL THEN
    RETURN;
  END IF;
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.patient_portal_links'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%plano_alimentar%'
  LOOP
    EXECUTE format('ALTER TABLE public.patient_portal_links DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.patient_portal_links
    ADD CONSTRAINT patient_portal_links_scopes_check CHECK (
      cardinality(scopes) > 0
      AND scopes <@ ARRAY['plano_alimentar','vacinas_peso','proximas_consultas','orientacoes','assinatura','exercicios']::text[]);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodar depois; somente leitura):
--   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'fisio\_%' ORDER BY 1;   -- 5 linhas, rowsecurity = true
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'fisio\_%' ORDER BY 1, 2;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.patient_portal_links'::regclass AND contype = 'c';
--
-- ROLLBACK (rodar à mão, só se precisar desfazer; apaga prescrições, execuções e medidas gravadas):
--
-- DROP TABLE IF EXISTS public.fisio_execucoes;
-- DROP TABLE IF EXISTS public.fisio_prescricao_itens;
-- DROP TABLE IF EXISTS public.fisio_prescricoes;
-- DROP TABLE IF EXISTS public.fisio_exercicios;
-- DROP TABLE IF EXISTS public.fisio_goniometrias;
-- -- links que já tenham o escopo 'exercicios' precisam ser corrigidos/revogados ANTES de voltar a lista antiga:
-- -- UPDATE public.patient_portal_links SET scopes = array_remove(scopes, 'exercicios') WHERE 'exercicios' = ANY(scopes) AND cardinality(scopes) > 1;
-- -- DELETE FROM public.patient_portal_links WHERE scopes = ARRAY['exercicios']::text[];
-- -- ALTER TABLE public.patient_portal_links DROP CONSTRAINT IF EXISTS patient_portal_links_scopes_check;
-- -- ALTER TABLE public.patient_portal_links ADD CONSTRAINT patient_portal_links_scopes_check CHECK (
-- --   cardinality(scopes) > 0
-- --   AND scopes <@ ARRAY['plano_alimentar','vacinas_peso','proximas_consultas','orientacoes','assinatura']::text[]);
-- ═══════════════════════════════════════════════════════════════════════════
