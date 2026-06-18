-- Adiciona 'trial' ao CHECK constraint da coluna status em clinics.
-- O RPC register_clinic_and_admin insere status='trial' em novos cadastros,
-- mas o constraint original só permitia active | inactive | suspended | pending.

ALTER TABLE public.clinics
  DROP CONSTRAINT IF EXISTS clinics_status_check;

ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_status_check
    CHECK (status IN ('active', 'inactive', 'suspended', 'pending', 'trial'));
