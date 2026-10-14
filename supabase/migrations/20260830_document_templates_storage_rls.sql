-- ═══════════════════════════════════════════════════════════════════════════
-- RLS FALTANDO NO BUCKET document-templates — corrige upload sempre falhando
-- Criado em: 2026-08-30
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O bucket "document-templates" (papel timbrado de Configurações → Modelos
-- de Documentos) existe e é público, mas nunca teve nenhuma policy de RLS
-- em storage.objects — nem INSERT, nem SELECT, nem nada. Com RLS habilitado
-- por padrão, isso bloqueia QUALQUER upload (PDF ou imagem, não é
-- específico de um tipo de arquivo). Mesmo padrão já usado no bucket
-- "clinic-logos" (admin da própria clínica grava na pasta {clinic_id}/,
-- leitura pública, superadmin com acesso total).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'public can read document templates'
  ) THEN
    CREATE POLICY "public can read document templates" ON storage.objects
      FOR SELECT
      USING (bucket_id = 'document-templates');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'clinic admin can upload document templates'
  ) THEN
    CREATE POLICY "clinic admin can upload document templates" ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'document-templates'
        AND (storage.foldername(name))[1] = (
          SELECT clinic_users.clinic_id::text FROM clinic_users
          WHERE clinic_users.user_id = auth.uid() AND clinic_users.is_active = true AND clinic_users.role = 'admin'
          LIMIT 1
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'clinic admin can update document templates'
  ) THEN
    CREATE POLICY "clinic admin can update document templates" ON storage.objects
      FOR UPDATE
      USING (
        bucket_id = 'document-templates'
        AND (storage.foldername(name))[1] = (
          SELECT clinic_users.clinic_id::text FROM clinic_users
          WHERE clinic_users.user_id = auth.uid() AND clinic_users.is_active = true AND clinic_users.role = 'admin'
          LIMIT 1
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'clinic admin can delete document templates'
  ) THEN
    CREATE POLICY "clinic admin can delete document templates" ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'document-templates'
        AND (storage.foldername(name))[1] = (
          SELECT clinic_users.clinic_id::text FROM clinic_users
          WHERE clinic_users.user_id = auth.uid() AND clinic_users.is_active = true AND clinic_users.role = 'admin'
          LIMIT 1
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'superadmin can manage document templates'
  ) THEN
    CREATE POLICY "superadmin can manage document templates" ON storage.objects
      FOR ALL
      USING (
        bucket_id = 'document-templates'
        AND EXISTS (SELECT 1 FROM clinic_users WHERE clinic_users.user_id = auth.uid() AND clinic_users.is_superadmin = true AND clinic_users.is_active = true)
      )
      WITH CHECK (
        bucket_id = 'document-templates'
        AND EXISTS (SELECT 1 FROM clinic_users WHERE clinic_users.user_id = auth.uid() AND clinic_users.is_superadmin = true AND clinic_users.is_active = true)
      );
  END IF;
END $$;
