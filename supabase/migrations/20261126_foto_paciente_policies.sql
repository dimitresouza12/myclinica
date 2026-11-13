-- Foto do paciente no prontuário: o bucket `patient-avatars` existia sem nenhuma policy em storage.objects,
-- então nenhum login conseguia enviar, trocar, assinar ou remover a foto (0 pacientes com foto em produção).
-- Esta migração torna o bucket privado (a tela já usa URL assinada) e cria policies por pasta da clínica:
-- caminho `<clinic_id>/<patient_id>/avatar.(webp|jpg)`. Limite de 100 KB e só webp/jpeg.
-- Idempotente. Desfazer: bloco ROLLBACK no fim.

BEGIN;

UPDATE storage.buckets
   SET public = false,
       file_size_limit = 102400,
       allowed_mime_types = ARRAY['image/webp', 'image/jpeg']
 WHERE id = 'patient-avatars';

DROP POLICY IF EXISTS patient_avatars_select ON storage.objects;
CREATE POLICY patient_avatars_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'patient-avatars' AND (storage.foldername(name))[1] = (SELECT public.get_my_clinic_id())::text);

DROP POLICY IF EXISTS patient_avatars_insert ON storage.objects;
CREATE POLICY patient_avatars_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-avatars' AND (storage.foldername(name))[1] = (SELECT public.get_my_clinic_id())::text);

DROP POLICY IF EXISTS patient_avatars_update ON storage.objects;
CREATE POLICY patient_avatars_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'patient-avatars' AND (storage.foldername(name))[1] = (SELECT public.get_my_clinic_id())::text)
  WITH CHECK (bucket_id = 'patient-avatars' AND (storage.foldername(name))[1] = (SELECT public.get_my_clinic_id())::text);

DROP POLICY IF EXISTS patient_avatars_delete ON storage.objects;
CREATE POLICY patient_avatars_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'patient-avatars' AND (storage.foldername(name))[1] = (SELECT public.get_my_clinic_id())::text);

COMMIT;

-- ROLLBACK:
-- DROP POLICY IF EXISTS patient_avatars_select ON storage.objects;
-- DROP POLICY IF EXISTS patient_avatars_insert ON storage.objects;
-- DROP POLICY IF EXISTS patient_avatars_update ON storage.objects;
-- DROP POLICY IF EXISTS patient_avatars_delete ON storage.objects;
-- UPDATE storage.buckets SET public = true, file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'patient-avatars';
