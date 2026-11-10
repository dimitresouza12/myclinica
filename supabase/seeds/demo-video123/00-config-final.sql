-- =============================================================================
-- Seed demo video123 | configuração final da clínica | arquivo 00-config-final.sql
-- =============================================================================
-- RODAR POR ÚLTIMO, depois da migração 20261109_clinics_demo_mode.sql e dos arquivos 01 a 09.
-- Motivo da ordem: os seeds por área só precisam da clínica existir; ligar as 9 áreas e o
-- demo_mode por último evita que a demo apareça meio montada para quem estiver logado.
--
-- Altera UMA linha de public.clinics (id da demo + slug video123). Nenhuma outra clínica é tocada.
--   - demo_mode = true
--   - plan = 'completo_plus' (libera os recursos do plano mais alto, inclusive IA)
--   - specialties = as 9 áreas, is_multi_specialty = true
-- O gatilho trg_default_clinic_specialties só atua em INSERT, por isso a lista de áreas é
-- gravada aqui de forma explícita.
-- clinic_type continua 'estetica' (área de origem da demo).
-- Reexecutável: o UPDATE é idempotente.
-- =============================================================================
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'clinics' and column_name = 'demo_mode') then
    raise exception 'Coluna clinics.demo_mode não existe: rode antes a migração 20261109_clinics_demo_mode.sql';
  end if;
  if not exists (select 1 from public.clinics where id = '3916d37d-b247-485e-bd2f-b47be8d44207' and slug = 'video123') then
    raise exception 'Clínica demo video123 não encontrada: configuração abortada';
  end if;
end $$;

update public.clinics
   set demo_mode = true,
       plan = 'completo_plus',
       specialties = array['estetica', 'odonto', 'medico', 'vet', 'fisio', 'psico', 'nutri', 'fono', 'to'],
       is_multi_specialty = true
 where id = '3916d37d-b247-485e-bd2f-b47be8d44207'
   and slug = 'video123';

-- Verificação (esperado: 1 linha; demo_mode true; completo_plus; 9 áreas; multi true; trial_ends_at nulo e
-- billing_paid true => computeClinicStatus resulta em 'active')
select id, slug, clinic_type, plan, demo_mode, is_multi_specialty, cardinality(specialties) as n_areas,
       billing_paid, trial_ends_at, billing_overdue_since, max_patients, max_users
  from public.clinics
 where id = '3916d37d-b247-485e-bd2f-b47be8d44207';

-- Garantia de que nenhuma outra clínica ficou marcada como demo (esperado: 1)
select count(*) as clinicas_demo from public.clinics where demo_mode;

commit;

-- =============================================================================
-- OPCIONAL (descomente se quiser): a coluna legada clinics.status está 'trial' e is_active está false
-- na demo. O app não usa esses dois campos para bloquear (computeClinicStatus lê billing/trial),
-- então não é necessário. Se preferir deixar coerente:
-- begin;
-- update public.clinics set status = 'active', is_active = true
--  where id = '3916d37d-b247-485e-bd2f-b47be8d44207' and slug = 'video123';
-- commit;
-- desfazer: status = 'trial', is_active = false (valores originais).
-- =============================================================================

-- =============================================================================
-- ROLLBACK (descomente tudo, de "begin" a "commit", e rode inteiro): volta aos valores anteriores
-- (plan 'completo', só estética, sem multi-especialidade, demo_mode desligado).
-- =============================================================================
-- begin;
-- update public.clinics
--    set demo_mode = false, plan = 'completo', specialties = array['estetica'], is_multi_specialty = false
--  where id = '3916d37d-b247-485e-bd2f-b47be8d44207' and slug = 'video123';
-- commit;
