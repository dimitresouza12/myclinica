-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRATO DA CLÍNICA — bucket privado dos PDFs assinados
-- Projeto Supabase: siohvtgbomvcprbzfamr | NÃO APLICADA: revisar e aplicar pelo mc-db.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DECISÃO
--   Bucket PRIVADO `clinic-agreements`, caminho `<clinic_id>/<agreement_id>-<hash12>.pdf`.
--   Sem nenhuma policy em storage.objects: escrita e leitura só pelo servidor (service role); o navegador
--   baixa por URL assinada de 5 minutos emitida pela rota GET /api/contrato-clinica/[id].
--   Só application/pdf, até 5 MB.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('clinic-agreements', 'clinic-agreements', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- VERIFICAÇÃO (esperado: public = false, 5242880, {application/pdf}; nenhuma policy):
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'clinic-agreements';
--
-- ROLLBACK (depois de esvaziado o bucket):
--   DELETE FROM storage.buckets WHERE id = 'clinic-agreements';
