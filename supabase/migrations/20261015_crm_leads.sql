-- ═══════════════════════════════════════════════════════════════════════════
-- CRM — funil de leads (quadro Novo → Em conversa → Agendado → Compareceu → Perdido)
-- Criado em: 2026-10-13
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plano: vault Obsidian → MyClinica/Plano — WhatsApp, Confirmação e CRM.md (Etapa 3)
--
-- crm_leads  1 linha por lead de cada clínica. O vínculo com a conversa do WhatsApp é pelo
--            phone_key (mesma chave de whatsapp_conversations), sem chave estrangeira: o lead
--            existe com ou sem conversa (cadastro manual, lead que veio do Instagram etc.).
--
-- LEITURA:  usuário da clínica com permissão de VISUALIZAR o módulo 'crm' (admin e superadmin sempre).
-- ESCRITA:  permissão de EDITAR o módulo 'crm'. O servidor (service role) também grava: o lead nasce
--           sozinho quando um número desconhecido escreve pela primeira vez.
--
-- Aditiva: só cria tabela, índices, função de gatilho e política. Nada existente é alterado.

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id         uuid          NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

  name              text,         -- vazio quando só se conhece o telefone (a tela mostra o telefone)
  phone             text,         -- como foi digitado / como veio do WhatsApp
  -- DDD + 8 últimos dígitos, 'lid:<id>' ou 'raw:<dígitos>' (mesma chave de whatsapp_conversations).
  -- NULL em lead cadastrado sem telefone. NULL nunca colide na UNIQUE.
  phone_key         text,

  stage             text          NOT NULL DEFAULT 'novo'
                                  CHECK (stage IN ('novo', 'em_conversa', 'agendado', 'compareceu', 'perdido')),
  stage_changed_at  timestamptz   NOT NULL DEFAULT now(),
  lost_reason       text,

  source            text          NOT NULL DEFAULT 'outro'
                                  CHECK (source IN ('whatsapp', 'instagram', 'google', 'anuncio', 'indicacao', 'site', 'outro')),
  interest          text,         -- procedimento / motivo de interesse
  estimated_value   numeric(12,2) CHECK (estimated_value IS NULL OR estimated_value >= 0),
  notes             text,
  next_contact_at   timestamptz,  -- "retomar em"

  assigned_to       uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_id        uuid          REFERENCES public.patients(id) ON DELETE SET NULL,
  created_by        uuid          REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (clinic_id, phone_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_clinic_stage ON public.crm_leads (clinic_id, stage);
CREATE INDEX IF NOT EXISTS idx_crm_leads_patient      ON public.crm_leads (patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_assigned     ON public.crm_leads (clinic_id, assigned_to) WHERE assigned_to IS NOT NULL;

-- updated_at sempre; stage_changed_at só quando a etapa muda ("há 3 dias na etapa").
CREATE OR REPLACE FUNCTION public.crm_leads_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_leads_touch ON public.crm_leads;
CREATE TRIGGER trg_crm_leads_touch
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_leads_touch();

-- ─── RLS ───
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_leads' AND policyname = 'tenant_read_crm_leads') THEN
    CREATE POLICY "tenant_read_crm_leads" ON public.crm_leads
      FOR SELECT
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', false)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_leads' AND policyname = 'tenant_insert_crm_leads') THEN
    CREATE POLICY "tenant_insert_crm_leads" ON public.crm_leads
      FOR INSERT
      WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', true)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_leads' AND policyname = 'tenant_update_crm_leads') THEN
    CREATE POLICY "tenant_update_crm_leads" ON public.crm_leads
      FOR UPDATE
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', true)))
      WITH CHECK (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', true)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_leads' AND policyname = 'tenant_delete_crm_leads') THEN
    CREATE POLICY "tenant_delete_crm_leads" ON public.crm_leads
      FOR DELETE
      USING (public.is_superadmin() OR (clinic_id = public.get_my_clinic_id() AND public.has_module_perm('crm', true)));
  END IF;
END $$;

-- ─── Realtime: o quadro se atualiza quando outra pessoa (ou o webhook) mexe num lead ───
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'crm_leads') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_leads;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.crm_leads IS
  'Leads do CRM (funil Novo, Em conversa, Agendado, Compareceu, Perdido). Vínculo com a conversa do WhatsApp por phone_key.';
