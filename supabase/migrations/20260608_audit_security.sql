-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO DE SEGURANÇA — My Clinica
-- Criado em: 2026-06-08
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. AUDIT LOGS — tabela imutável de auditoria ───────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  action      text        NOT NULL,
  actor_id    uuid        NOT NULL,
  clinic_id   uuid        NOT NULL,
  resource_id uuid,
  ip          inet,
  user_agent  text,
  -- metadata sem PII: contagens, status codes, nomes de campos alterados
  metadata    jsonb,
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- Índices para consultas de auditoria
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor    ON public.audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic   ON public.audit_logs (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action   ON public.audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs (resource_id) WHERE resource_id IS NOT NULL;

-- RLS: habilitar mas só permitir INSERT (imutável)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode inserir seus próprios logs
CREATE POLICY "audit_insert_own" ON public.audit_logs
  FOR INSERT
  WITH CHECK (actor_id = auth.uid());

-- Superadmin pode visualizar todos os logs da clínica
CREATE POLICY "audit_select_superadmin" ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.is_superadmin = true
    )
  );

-- Admin da clínica pode ver logs da sua própria clínica
CREATE POLICY "audit_select_admin" ON public.audit_logs
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
        AND cu.role = 'admin'
    )
  );

-- Sem política de UPDATE ou DELETE = bloqueado por padrão

-- ─── 2. REFORÇO DE RLS NAS TABELAS CRÍTICAS ─────────────────────────────────
-- Verificar se RLS está ativo (adicionar caso não esteja)

ALTER TABLE IF EXISTS public.patients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.appointments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.medical_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.record_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.professionals     ENABLE ROW LEVEL SECURITY;

-- ─── 3. POLÍTICAS DE ISOLAMENTO DE TENANT ───────────────────────────────────
-- Garante que cada clínica só acessa seus próprios dados

-- Função auxiliar: retorna clinic_ids do usuário autenticado
CREATE OR REPLACE FUNCTION public.my_clinic_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ARRAY(
    SELECT clinic_id FROM public.clinic_users
    WHERE user_id = auth.uid() AND is_active = true
  )
$$;

-- Patients
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patients' AND policyname = 'tenant_isolation_patients'
  ) THEN
    CREATE POLICY "tenant_isolation_patients" ON public.patients
      FOR ALL
      USING (clinic_id = ANY(public.my_clinic_ids()));
  END IF;
END $$;

-- Appointments
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'appointments' AND policyname = 'tenant_isolation_appointments'
  ) THEN
    CREATE POLICY "tenant_isolation_appointments" ON public.appointments
      FOR ALL
      USING (clinic_id = ANY(public.my_clinic_ids()));
  END IF;
END $$;

-- Financial records
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'financial_records' AND policyname = 'tenant_isolation_financial'
  ) THEN
    CREATE POLICY "tenant_isolation_financial" ON public.financial_records
      FOR ALL
      USING (clinic_id = ANY(public.my_clinic_ids()));
  END IF;
END $$;

-- Medical records
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'medical_records' AND policyname = 'tenant_isolation_medical'
  ) THEN
    CREATE POLICY "tenant_isolation_medical" ON public.medical_records
      FOR ALL
      USING (clinic_id = ANY(public.my_clinic_ids()));
  END IF;
END $$;

-- ─── 4. RETENÇÃO DE LOGS (90 dias para dados operacionais) ──────────────────
-- Política de expiração automática via pg_cron (habilitar extensão no Supabase se necessário)
-- SELECT cron.schedule('cleanup-old-audit-logs', '0 3 * * *',
--   'DELETE FROM public.audit_logs WHERE created_at < now() - interval ''1 year''');
-- NOTA: audit_logs de saúde devem ser mantidos por pelo menos 1 ano (LGPD art. 16)

-- ─── 5. COMENTÁRIOS DE COMPLIANCE ───────────────────────────────────────────
COMMENT ON TABLE public.audit_logs IS
  'Registro imutável de eventos de segurança. Retenção mínima: 1 ano (LGPD art. 16). Sem UPDATE/DELETE permitido.';

COMMENT ON COLUMN public.audit_logs.metadata IS
  'Dados extras sem PII. Proibido incluir cpf, nome, email, telefone, senha ou qualquer dado pessoal.';
