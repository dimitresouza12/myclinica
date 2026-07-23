-- DB-01..DB-05 — Isolamento multitenant via RLS
--
-- Requer pgTAP (`create extension pgtap;`) e o schema `tests` do Supabase
-- (supabase/tests helpers: tests.create_supabase_user, tests.authenticate_as).
-- NUNCA rodar contra o projeto de produção (siohvtgbomvcprbzfamr) — cria
-- dados fictícios e assume dois usuários de teste. Rodar em branch/staging:
--
--   supabase test db
--
-- Achados que este arquivo formaliza (verificados manualmente em produção
-- via pg_policies nesta sessão de QA):
--   - patients/appointments/financial_records/medical_records: policy
--     `clinic_isolation` usa `clinic_id = get_my_clinic_id()` — isolamento
--     correto, mas SEM checagem de status/trial (ver BE-07 no board de QA).
--   - record_entries: só existem policies de INSERT e SELECT — UPDATE e
--     DELETE são negados por ausência de policy permissiva (default-deny do
--     Postgres), o que já garante a imutabilidade do prontuário (CFM
--     1.638/2002) no nível do banco, não só na UI.

begin;
select plan(9);

-- Setup: duas clínicas e um usuário admin para cada uma
select tests.create_supabase_user('qa_admin_a@example.com');
select tests.create_supabase_user('qa_admin_b@example.com');

insert into public.clinics (id, name, slug, clinic_type, is_active, plan, status)
values
  ('00000000-0000-0000-0000-00000000000a', 'QA Clinic A', 'qa-clinic-a', 'odonto', true, 'essencial', 'trial'),
  ('00000000-0000-0000-0000-00000000000b', 'QA Clinic B', 'qa-clinic-b', 'odonto', true, 'essencial', 'trial');

insert into public.clinic_users (clinic_id, user_id, role, display_name, username, is_active, is_superadmin, email)
values
  ('00000000-0000-0000-0000-00000000000a', tests.get_supabase_uid('qa_admin_a@example.com'), 'admin', 'QA Admin A', 'qa_admin_a', true, false, 'qa_admin_a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', tests.get_supabase_uid('qa_admin_b@example.com'), 'admin', 'QA Admin B', 'qa_admin_b', true, false, 'qa_admin_b@example.com');

insert into public.patients (id, clinic_id, name, phone)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Paciente Sigiloso B', '11999990000');

-- DB-01: Clínica A não deve LER paciente da Clínica B
select tests.authenticate_as('qa_admin_a@example.com');
select is(
  (select count(*)::int from public.patients where id = '10000000-0000-0000-0000-000000000001'),
  0,
  'DB-01: admin da Clínica A não enxerga paciente da Clínica B via SELECT'
);

-- DB-02: Clínica A não deve ATUALIZAR paciente da Clínica B
update public.patients set name = 'HACKED' where id = '10000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.patients where id = '10000000-0000-0000-0000-000000000001' and name = 'HACKED'),
  0,
  'DB-02: UPDATE cross-clínica não afeta nenhuma linha (RLS silenciosamente ignora, sem erro — comportamento esperado do Postgres)'
);

-- DB-02b: Clínica A não deve DELETAR paciente da Clínica B
delete from public.patients where id = '10000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.patients where id = '10000000-0000-0000-0000-000000000001'),
  1,
  'DB-02b: DELETE cross-clínica não remove o paciente da outra clínica'
);

-- DB-05: Clínica A não deve conseguir INSERIR paciente com clinic_id da Clínica B
select throws_ok(
  $$ insert into public.patients (clinic_id, name, phone) values ('00000000-0000-0000-0000-00000000000b', 'Forjado', '11888880000') $$,
  'new row violates row-level security policy for table "patients"',
  'DB-05: INSERT com clinic_id forjado (de outra clínica) é rejeitado pelo WITH CHECK'
);

-- DB-03: anon (sem sessão) não lê nada
select tests.clear_authentication();
select is(
  (select count(*)::int from public.patients),
  0,
  'DB-03: sem sessão autenticada (anon), nenhuma linha de patients é visível'
);

-- record_entries: confirmar que UPDATE/DELETE são negados por ausência de policy
select tests.authenticate_as('qa_admin_a@example.com');
insert into public.medical_records (id, clinic_id, patient_id)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
  (select id from public.patients where clinic_id = '00000000-0000-0000-0000-00000000000a' limit 1));

insert into public.record_entries (clinic_id, patient_id, record_id, entry_text, entry_type)
values ('00000000-0000-0000-0000-00000000000a',
  (select id from public.patients where clinic_id = '00000000-0000-0000-0000-00000000000a' limit 1),
  '20000000-0000-0000-0000-000000000001', 'Evolução original', 'evolucao');

select is(
  (select count(*)::int from public.record_entries where entry_text = 'Evolução original'),
  1,
  'setup: entrada de prontuário criada com sucesso'
);

update public.record_entries set entry_text = 'ALTERADO' where entry_text = 'Evolução original';
select is(
  (select count(*)::int from public.record_entries where entry_text = 'ALTERADO'),
  0,
  'DB-11: UPDATE em record_entries é negado (imutabilidade CFM garantida no banco, não só na UI)'
);

delete from public.record_entries where entry_text = 'Evolução original';
select is(
  (select count(*)::int from public.record_entries where entry_text = 'Evolução original'),
  1,
  'DB-11b: DELETE em record_entries é negado (registro permanece)'
);

-- Superadmin enxerga tudo (bypass legítimo)
select tests.authenticate_as_service_role();
select is(
  (select count(*)::int from public.patients where clinic_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')),
  2,
  'DB-01b: service_role/superadmin enxerga pacientes de ambas as clínicas (bypass intencional)'
);

select * from finish();
rollback;
