-- ═══════════════════════════════════════════════════════════════════════════
-- NUTRIÇÃO — recordatório alimentar de 24 horas estruturado
-- Criado em: 2026-11-29 (NÃO APLICADA: arquivo para o Dimitre revisar e aplicar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O recordatório 24h (o que o paciente comeu no dia anterior, refeição por refeição, com horário, alimento e
-- quantidade) passa a ser guardado em nutri_avaliacoes com tipo 'recordatorio', ao lado de 'avaliacao' e 'plano'.
-- Cada recordatório é uma linha, um por data: a regra é da tela (RecordatorioPanel avisa e abre o existente quando a data já
-- tem registro), SEM índice único no banco, para não travar dois profissionais atendendo o mesmo paciente no mesmo dia. JSON versionado (v:1) definido em
-- src/lib/nutri/recordatorio.ts: refeições, horários, alimentos (ids da TACO ou personalizados), gramas e medida caseira.
--
-- Única mudança de schema: o CHECK de `tipo`, que só aceitava ('avaliacao','plano'), passa a aceitar também 'recordatorio'.
-- Colunas, índices, gatilho e RLS NÃO mudam: as policies da tabela (isolamento por clínica, permissão do módulo
-- prontuário, restrição por área do profissional) valem para todos os tipos. Por isso não há policy nova aqui.
--
-- Idempotente: descobre o CHECK atual de `tipo` pelo catálogo (o nome automático pode variar), remove só ele e
-- recria com o nome fixo `nutri_avaliacoes_tipo_check`. Se já estiver com os três valores, não faz nada.
-- Aditiva: nenhuma linha existente é alterada (todas continuam 'avaliacao' ou 'plano', valores aceitos).
-- Desfazer: bloco ROLLBACK no fim do arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_nome text;
  v_def  text;
BEGIN
  IF to_regclass('public.nutri_avaliacoes') IS NULL THEN
    RAISE EXCEPTION 'public.nutri_avaliacoes não existe: aplique antes 20261113_nutri_avaliacoes.sql';
  END IF;

  -- CHECK(s) da tabela que mencionam a coluna tipo
  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO v_nome, v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.nutri_avaliacoes'::regclass
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ~ '\mtipo\M'
   LIMIT 1;

  -- já aceita 'recordatorio': nada a fazer
  IF v_def IS NOT NULL AND v_def LIKE '%recordatorio%' THEN
    RETURN;
  END IF;

  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.nutri_avaliacoes DROP CONSTRAINT %I', v_nome);
  END IF;

  ALTER TABLE public.nutri_avaliacoes
    ADD CONSTRAINT nutri_avaliacoes_tipo_check
    CHECK (tipo IN ('avaliacao', 'plano', 'recordatorio'));
END
$$;

COMMENT ON TABLE public.nutri_avaliacoes IS 'Nutrição: avaliações antropométricas (tipo avaliacao), planos alimentares (tipo plano) e recordatórios alimentares 24h (tipo recordatorio) por paciente, com histórico por data.';
COMMENT ON COLUMN public.nutri_avaliacoes.dados IS 'JSON versionado (v:1). Formato em src/lib/nutri/avaliacao.ts (avaliacao), plano.ts (plano) e recordatorio.ts (recordatorio).';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (depois de aplicar):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.nutri_avaliacoes'::regclass AND conname = 'nutri_avaliacoes_tipo_check';
--   -- esperado: CHECK ((tipo = ANY (ARRAY['avaliacao'::text, 'plano'::text, 'recordatorio'::text])))
--
-- ROLLBACK (rodar manualmente; antes, apague ou converta as linhas 'recordatorio', senão o ADD CONSTRAINT falha):
--   DELETE FROM public.nutri_avaliacoes WHERE tipo = 'recordatorio';
--   ALTER TABLE public.nutri_avaliacoes DROP CONSTRAINT IF EXISTS nutri_avaliacoes_tipo_check;
--   ALTER TABLE public.nutri_avaliacoes ADD CONSTRAINT nutri_avaliacoes_tipo_check CHECK (tipo IN ('avaliacao', 'plano'));
-- ═══════════════════════════════════════════════════════════════════════════
