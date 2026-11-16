-- Bucket `pacientes` (anexos da evolução do prontuário): isolamento por clínica + bucket privado.
--
-- Problema: o bucket era público e as 3 policies de storage.objects (SELECT, INSERT, DELETE) valiam para
-- qualquer `authenticated` no bucket inteiro (bucket_id = 'pacientes', sem filtro de pasta). Qualquer login de
-- qualquer clínica lia, enviava e apagava arquivo de paciente de outra clínica. Com o bucket público, qualquer
-- pessoa (sem login) que tivesse a URL também lia.
--
-- Caminho único em uso: evolucao/<clinic_id>/<patient_id>/<timestamp>-<rand>[-<nome>].<ext>
-- (src/lib/prontuarioAttachments.ts, buildAttachmentPath). Em produção, 48 de 48 objetos seguem
-- <tipo>/<clinic_id>/..., todos com tipo `evolucao` e profundidade 4. A 2a pasta é sempre a clínica.
--
-- O que muda:
--   1) Remove as 3 policies abertas (nomes exatos abaixo).
--   2) Cria pacientes_select / pacientes_insert / pacientes_delete: a 2a pasta do caminho precisa ser a clínica
--      do usuário (get_my_clinic_id(), o mesmo helper de patient-avatars), OU o usuário ser superadmin
--      (mesmo padrão de medical_records/record_entries; o modo suporte do admin precisa ver as fotos da clínica
--      que ele está acessando).
--   3) Torna o bucket privado. O app só lê por URL assinada (createSignedUrls em TabTimeline e TabComparador);
--      os 7 registros antigos que guardam URL pública completa têm o caminho extraído (extractStoragePath /
--      storagePathFromPhotoUrl) e viram URL assinada na tela. Nada em src usa getPublicUrl no bucket `pacientes`.
--
-- Não há policy de UPDATE: o app sobe com upsert:false e nunca atualiza objeto desse bucket.
-- Não altera dado, nem file_size_limit/allowed_mime_types (anexos incluem pdf, áudio e vídeo).
-- Idempotente (DROP IF EXISTS + recria). Desfazer: bloco ROLLBACK no fim.
--
-- Se quiser fazer em dois passos, rode primeiro tudo menos o UPDATE de storage.buckets, valide, e rode o UPDATE depois.

BEGIN;

-- 1) Policies abertas antigas (qualquer authenticated, bucket inteiro)
DROP POLICY IF EXISTS "Authenticated can view photos"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload"    ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete"    ON storage.objects;

-- 2) Policies por pasta da clínica: evolucao/<clinic_id>/...  ->  (storage.foldername(name))[2]
DROP POLICY IF EXISTS pacientes_select ON storage.objects;
CREATE POLICY pacientes_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pacientes'
    AND (
      (storage.foldername(name))[2] = (SELECT public.get_my_clinic_id())::text
      OR (SELECT public.is_superadmin())
    )
  );

DROP POLICY IF EXISTS pacientes_insert ON storage.objects;
CREATE POLICY pacientes_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pacientes'
    AND (
      (storage.foldername(name))[2] = (SELECT public.get_my_clinic_id())::text
      OR (SELECT public.is_superadmin())
    )
  );

DROP POLICY IF EXISTS pacientes_delete ON storage.objects;
CREATE POLICY pacientes_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pacientes'
    AND (
      (storage.foldername(name))[2] = (SELECT public.get_my_clinic_id())::text
      OR (SELECT public.is_superadmin())
    )
  );

-- 3) Bucket privado. A investigação (src/, banco e produção) não achou dependência de URL pública:
--    leitura só via createSignedUrls. Único getPublicUrl no bucket `pacientes` está em legacy/app.js (app estático
--    de maio/2026, fora do build do Next, escreve em `pacientes/<arquivo>` e hoje não há nenhum objeto nesse prefixo).
--    Se preferir adiar este passo, comente o UPDATE abaixo (as policies por clínica já valem sozinhas para
--    leitura autenticada, mas URLs públicas antigas continuariam abrindo sem login).
UPDATE storage.buckets SET public = false WHERE id = 'pacientes';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO (rodar depois; somente leitura; nada de dado de paciente)
-- ─────────────────────────────────────────────────────────────────────────────
-- a) Bucket privado e policies novas (esperado: public=false; 3 policies pacientes_* e nenhuma das 3 antigas):
--   SELECT id, public FROM storage.buckets WHERE id = 'pacientes';
--   SELECT policyname, cmd, roles FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects' AND (policyname LIKE 'pacientes\_%' OR qual LIKE '%''pacientes''%' OR with_check LIKE '%''pacientes''%')
--    ORDER BY policyname;
--
-- b) Nenhum objeto fora do padrão <tipo>/<clinic_id>/... (esperado: fora_do_padrao = 0; total = 48 na data desta migração):
--   SELECT count(*) AS total, count(*) FILTER (WHERE name !~ '^[a-z_-]+/[0-9a-f-]{36}/') AS fora_do_padrao
--     FROM storage.objects WHERE bucket_id = 'pacientes';
--
-- c) Isolamento simulado como um usuário comum (troque <USER_UUID> por o auth.users.id de um usuário ATIVO de uma clínica;
--    rode as linhas juntas e termine com ROLLBACK). Esperado: visiveis_minha_clinica = total de objetos da pasta da clínica dele,
--    visiveis_de_outras = 0:
--   BEGIN;
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims', '{"sub":"<USER_UUID>","role":"authenticated"}', true);
--     SELECT count(*) FILTER (WHERE (storage.foldername(name))[2] = (SELECT public.get_my_clinic_id())::text) AS visiveis_minha_clinica,
--            count(*) FILTER (WHERE (storage.foldername(name))[2] <> (SELECT public.get_my_clinic_id())::text) AS visiveis_de_outras
--       FROM storage.objects WHERE bucket_id = 'pacientes';
--   ROLLBACK;
--
-- d) Teste no app (conta de QA, bucket já privado): abrir um prontuário com anexo de evolução (a foto carrega por URL
--    assinada), anexar uma foto nova, apagar uma. Abrir a URL antiga /storage/v1/object/public/pacientes/... em aba anônima
--    deve dar erro (Bucket not found / not found).

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (descomentar e rodar para voltar ao estado anterior, que é o estado INSEGURO original)
-- ─────────────────────────────────────────────────────────────────────────────
-- BEGIN;
--   DROP POLICY IF EXISTS pacientes_select ON storage.objects;
--   DROP POLICY IF EXISTS pacientes_insert ON storage.objects;
--   DROP POLICY IF EXISTS pacientes_delete ON storage.objects;
--   DROP POLICY IF EXISTS "Authenticated can view photos"  ON storage.objects;
--   CREATE POLICY "Authenticated can view photos" ON storage.objects FOR SELECT TO authenticated
--     USING (bucket_id = 'pacientes');
--   DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
--   CREATE POLICY "Authenticated users can upload" ON storage.objects FOR INSERT TO authenticated
--     WITH CHECK (bucket_id = 'pacientes');
--   DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
--   CREATE POLICY "Authenticated users can delete" ON storage.objects FOR DELETE TO authenticated
--     USING (bucket_id = 'pacientes');
--   UPDATE storage.buckets SET public = true WHERE id = 'pacientes';
-- COMMIT;
