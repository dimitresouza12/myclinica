-- ═══════════════════════════════════════════════════════════════════════════
-- WhatsApp — respostas rápidas, tique de entrega/leitura, reações, mensagem apagada e editada (Etapa 2, fase D)
-- Criado em: 2026-10-14
-- ═══════════════════════════════════════════════════════════════════════════
--
-- whatsapp_quick_replies  textos prontos da clínica ("Endereço", "Valores"). LEITURA: ver o módulo 'crm';
--                         ESCRITA: editar o módulo 'crm' (mesma regra do CRM). {nome} vira o primeiro nome do contato.
--
-- whatsapp_messages (colunas novas)
--   delivery_status  só em mensagem enviada: sent (WhatsApp recebeu) | delivered (chegou no aparelho) | read (lida)
--   reactions        {"contato": "<reação>", "clinica": "<reação>"}; uma por quem reage, como no WhatsApp
--   deleted_at       quando a mensagem foi apagada para todos (o texto e o arquivo somem da tela)
--   edited_at        quando a mensagem foi editada
--
-- Aditiva: tabela nova e ADD COLUMN com padrão ou nulo. Nada existente muda.

CREATE TABLE IF NOT EXISTS public.whatsapp_quick_replies (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 40),
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, title)
);

ALTER TABLE public.whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_quick_replies' AND policyname = 'tenant_read_wa_quick_replies') THEN
    CREATE POLICY "tenant_read_wa_quick_replies" ON public.whatsapp_quick_replies FOR SELECT
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', false)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_quick_replies' AND policyname = 'tenant_insert_wa_quick_replies') THEN
    CREATE POLICY "tenant_insert_wa_quick_replies" ON public.whatsapp_quick_replies FOR INSERT
      WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_quick_replies' AND policyname = 'tenant_update_wa_quick_replies') THEN
    CREATE POLICY "tenant_update_wa_quick_replies" ON public.whatsapp_quick_replies FOR UPDATE
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', true)))
      WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', true)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_quick_replies' AND policyname = 'tenant_delete_wa_quick_replies') THEN
    CREATE POLICY "tenant_delete_wa_quick_replies" ON public.whatsapp_quick_replies FOR DELETE
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', true)));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.wa_quick_replies_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_wa_quick_replies_touch ON public.whatsapp_quick_replies;
CREATE TRIGGER trg_wa_quick_replies_touch BEFORE UPDATE ON public.whatsapp_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.wa_quick_replies_touch();

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS delivery_status text CHECK (delivery_status IN ('sent', 'delivered', 'read')),
  ADD COLUMN IF NOT EXISTS reactions       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS edited_at       timestamptz;
