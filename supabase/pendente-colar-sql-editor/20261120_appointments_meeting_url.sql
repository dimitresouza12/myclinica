-- PENDENTE: colar no SQL Editor do Supabase (projeto siohvtgbomvcprbzfamr).
--
-- Link da teleconsulta no agendamento. O app funciona SEM este arquivo: enquanto a coluna não existe,
-- a Agenda esconde o campo "Link da teleconsulta" e não envia meeting_url no insert/update.
-- Depois de colar, recarregue a Agenda (a detecção da coluna é feita ao abrir a página).
-- Idempotente. As policies de appointments já cobrem a coluna nova (RLS é por linha, não por coluna).

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS meeting_url text;

-- Rollback:
--   ALTER TABLE public.appointments DROP COLUMN IF EXISTS meeting_url;
