-- =============================================================================
-- Seed demo video123 | área: Psicologia (psico) | arquivo 04-psico.sql
-- =============================================================================
-- Insere SOMENTE na clínica demo (clinic_id 3916d37d-b247-485e-bd2f-b47be8d44207).
-- Convenção de IDs determinísticos: de3a0000-0004-<tabela>-0000-<seq>
--   tabelas: 0001 professionals, 0002 patients, 0003 procedures, 0004 stock_items,
--            0005 appointments, 0006 financial_records, 0007 medical_records,
--            0008 record_entries, 0009 stock_movements
-- Reexecutável (on conflict do nothing). Desfazer: bloco ROLLBACK no fim do arquivo.
-- Datas relativas a segunda-feira da semana de execução (America/Sao_Paulo): semanas
-- negativas = passado, 0 = semana atual, positivas = futuro.
-- Telefones: (85) 90000-XXXX (faixa não atribuída; ver docs/demo-seed-video123.md).
-- Todos os dados são fictícios. Sem login: nenhum clinic_users/auth.users é criado.
-- =============================================================================
begin;

-- Trava de segurança: só roda na clínica demo e se o WhatsApp dela estiver desligado.
do $$
begin
  if not exists (select 1 from public.clinics where id = '3916d37d-b247-485e-bd2f-b47be8d44207' and slug = 'video123') then
    raise exception 'Clínica demo video123 não encontrada: seed abortado';
  end if;
  if exists (select 1 from public.clinic_whatsapp
              where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and (status = 'conectado' or confirm_enabled)) then
    raise exception 'WhatsApp da demo está conectado ou com confirmação ativa: seed com consultas futuras abortado';
  end if;
end $$;

-- 1. Profissionais (2), sem login (clinic_user_id nulo)
insert into public.professionals (id, clinic_id, name, specialty, specialty_type, default_duration_minutes, registration_number, created_at)
values
  ('de3a0000-0004-0001-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dra. Mariana Sá Cavalcante', 'TCC', 'psico', 50, 'CRP-11/08219', now() - interval '208 days'),
  ('de3a0000-0004-0001-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dr. Henrique Bastos Aguiar', 'Casal e Família', 'psico', 50, 'CRP-11/06774', now() - interval '206 days')
on conflict (id) do nothing;

-- 2. Pacientes (8): CPF e RG ficam nulos de propósito; is_active/registration_status usam o default
insert into public.patients (id, clinic_id, name, phone, email, birth_date, gender, address, occupation, emergency_contact, referred_by,
  notes, pet_name, pet_species, pet_breed, pet_weight, pet_age, pet_coat, pet_neutered, convenio, convenio_carteirinha, lgpd_consent, lgpd_consent_at, created_at, updated_at)
values
  ('de3a0000-0004-0002-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Letícia Carvalho Sobral', '(85) 90000-4001', 'leticia.sobral@example.com', '1992-05-08', 'Feminino', 'Rua Ana Bilhar, 820 - Meireles, Fortaleza/CE', 'Gerente de projetos', null, 'Indicação do psiquiatra', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 778899 1122', true, now() - interval '97 days', now() - interval '97 days', now() - interval '97 days'),
  ('de3a0000-0004-0002-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Rafael Monteiro Barbosa', '(85) 90000-4002', 'rafael.barbosa@example.com', '1988-10-21', 'Masculino', 'Rua Osvaldo Cruz, 1230 - Meireles, Fortaleza/CE', 'Analista de TI', null, 'Instagram', null, null, null, null, null, null, null, null, null, null, true, now() - interval '94 days', now() - interval '94 days', now() - interval '94 days'),
  ('de3a0000-0004-0002-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Sofia Araújo Pimentel', '(85) 90000-4003', 'sofia.pimentel@example.com', '2012-03-15', 'Feminino', 'Rua Dr. Gilberto Studart, 500 - Cocó, Fortaleza/CE', 'Estudante', 'Mãe: Renata Pimentel (responsável)', 'Indicação da escola', null, null, null, null, null, null, null, null, null, null, true, now() - interval '91 days', now() - interval '91 days', now() - interval '91 days'),
  ('de3a0000-0004-0002-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Gabriel Santiago Ney', '(85) 90000-4004', 'gabriel.ney@example.com', '1999-08-02', 'Masculino', 'Rua Pedro I, 600 - Centro, Fortaleza/CE', 'Estudante de Engenharia', null, 'Indicação de amigo', null, null, null, null, null, null, null, null, null, null, true, now() - interval '88 days', now() - interval '88 days', now() - interval '88 days'),
  ('de3a0000-0004-0002-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Beatriz Cordeiro Vasconcelos', '(85) 90000-4005', 'beatriz.vasconcelos@example.com', '1980-12-11', 'Feminino', 'Av. Eng. Santana Jr., 2020 - Cocó, Fortaleza/CE', 'Professora universitária', null, 'Indicação do clínico geral', null, null, null, null, null, null, null, null, 'Hapvida', '3300 4455 6677', true, now() - interval '85 days', now() - interval '85 days', now() - interval '85 days'),
  ('de3a0000-0004-0002-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Thiago Nascimento Prado', '(85) 90000-4006', 'thiago.prado@example.com', '2004-01-19', 'Masculino', 'Rua Padre Pedro de Alencar, 90 - Aldeota, Fortaleza/CE', 'Estudante pré-vestibular', null, 'Indicação da escola', null, null, null, null, null, null, null, null, null, null, true, now() - interval '82 days', now() - interval '82 days', now() - interval '82 days'),
  ('de3a0000-0004-0002-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Elisa Maria Fontes', '(85) 90000-4007', 'elisa.fontes@example.com', '1975-07-30', 'Feminino', 'Rua Barão de Aracati, 1500 - Aldeota, Fortaleza/CE', 'Médica', null, 'Indicação de paciente', null, null, null, null, null, null, null, null, null, null, true, now() - interval '79 days', now() - interval '79 days', now() - interval '79 days'),
  ('de3a0000-0004-0002-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Caio Ribeiro Sampaio', '(85) 90000-4008', 'caio.sampaio@example.com', '1994-11-09', 'Masculino', 'Rua Torres Câmara, 1000 - Aldeota, Fortaleza/CE', 'Redator', null, 'Instagram', null, null, null, null, null, null, null, null, null, null, true, now() - interval '76 days', now() - interval '76 days', now() - interval '76 days')
on conflict (id) do nothing;

-- 3. Procedimentos (4): nomes/categorias de procedureSuggestions de specialtyConfig.tsx
insert into public.procedures (id, clinic_id, name, price, category, is_active, is_free, created_at)
values
  ('de3a0000-0004-0003-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Sessão de Psicoterapia', 180, 'Psicoterapia', true, false, now() - interval '150 days'),
  ('de3a0000-0004-0003-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Avaliação Psicológica', 450, 'Avaliação Psicológica', true, false, now() - interval '150 days'),
  ('de3a0000-0004-0003-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Terapia de Casal', 260, 'Psicoterapia', true, false, now() - interval '150 days'),
  ('de3a0000-0004-0003-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Orientação Vocacional', 200, 'Outros', true, false, now() - interval '150 days')
on conflict (id) do nothing;

-- 4. Estoque (6 itens; categorias = slugs de stockCategories)
insert into public.stock_items (id, clinic_id, name, category, unit, quantity, min_quantity, cost_price, supplier, is_active, created_at, updated_at)
values
  ('de3a0000-0004-0004-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Testes psicológicos (kit de aplicação)', 'material', 'kit', 3, 1, 640.0, 'PsicoTeste Editora', true, now() - interval '120 days', now() - interval '5 days'),
  ('de3a0000-0004-0004-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Papel sulfite A4 (resma)', 'material', 'un', 8, 3, 28.0, 'Papelaria Central', true, now() - interval '120 days', now() - interval '7 days'),
  ('de3a0000-0004-0004-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Lápis de cor (caixa com 24)', 'material', 'cx', 10, 4, 19.9, 'Papelaria Central', true, now() - interval '120 days', now() - interval '9 days'),
  ('de3a0000-0004-0004-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Jogos terapêuticos (caixa)', 'material', 'cx', 4, 2, 95.0, 'Ludoterapia Brasil', true, now() - interval '120 days', now() - interval '11 days'),
  ('de3a0000-0004-0004-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Lenços de papel (caixa)', 'outro', 'cx', 30, 12, 3.5, 'Atacado Higiene', true, now() - interval '120 days', now() - interval '13 days'),
  ('de3a0000-0004-0004-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Folhas de registro de sessão (bloco)', 'material', 'un', 12, 5, 14.0, 'Papelaria Central', true, now() - interval '120 days', now() - interval '15 days')
on conflict (id) do nothing;

-- 5. Movimentações de estoque (12); a quantidade atual do item já considera as saídas
insert into public.stock_movements (id, clinic_id, item_id, type, quantity, reason, user_name, created_at)
values
  ('de3a0000-0004-0009-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000001', 'entrada', 15, 'Compra de reposicao', 'Dra. Mariana Sá Cavalcante', now() - interval '61 days'),
  ('de3a0000-0004-0009-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000001', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Henrique Bastos Aguiar', now() - interval '13 days'),
  ('de3a0000-0004-0009-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000002', 'entrada', 20, 'Compra de reposicao', 'Dra. Mariana Sá Cavalcante', now() - interval '62 days'),
  ('de3a0000-0004-0009-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000002', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Henrique Bastos Aguiar', now() - interval '14 days'),
  ('de3a0000-0004-0009-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000003', 'entrada', 22, 'Compra de reposicao', 'Dra. Mariana Sá Cavalcante', now() - interval '63 days'),
  ('de3a0000-0004-0009-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000003', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Henrique Bastos Aguiar', now() - interval '15 days'),
  ('de3a0000-0004-0009-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000004', 'entrada', 16, 'Compra de reposicao', 'Dra. Mariana Sá Cavalcante', now() - interval '64 days'),
  ('de3a0000-0004-0009-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000004', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Henrique Bastos Aguiar', now() - interval '16 days'),
  ('de3a0000-0004-0009-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000005', 'entrada', 42, 'Compra de reposicao', 'Dra. Mariana Sá Cavalcante', now() - interval '65 days'),
  ('de3a0000-0004-0009-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000005', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Henrique Bastos Aguiar', now() - interval '17 days'),
  ('de3a0000-0004-0009-0000-000000000011', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000006', 'entrada', 24, 'Compra de reposicao', 'Dra. Mariana Sá Cavalcante', now() - interval '66 days'),
  ('de3a0000-0004-0009-0000-000000000012', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0004-0004-0000-000000000006', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Henrique Bastos Aguiar', now() - interval '18 days')
on conflict (id) do nothing;

-- 6. Consultas (57): passado = concluído/faltou/cancelado; semanas 0..2 = hoje e futuro.
-- 'auto_c'/'auto_a' (semana atual) viram concluído se o horário já passou, senão confirmado/agendado.
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.appointments (id, clinic_id, patient_id, professional_id, procedure_id, procedure_name, procedure_price,
  status, scheduled_at, duration_minutes, notes, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.prof::uuid, v.proc::uuid, v.pname, v.price::numeric,
       case v.st
         when 'auto_c' then case when x.ts < now() then 'concluido' else 'confirmado' end
         when 'auto_a' then case when x.ts < now() then 'concluido' else 'agendado' end
         else v.st end,
       x.ts, v.dur::int, v.notes,
       least(x.ts - interval '6 days', now() - interval '1 day')
from m
cross join (values
  ('de3a0000-0004-0005-0000-000000000001', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000002', 'Avaliação Psicológica', 450, 'concluido', -38, '17:00', 90, null),
  ('de3a0000-0004-0005-0000-000000000002', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -31, '17:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000003', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'cancelado', -24, '17:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000004', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'cancelado', -17, '17:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000005', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -10, '17:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000006', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -3, '17:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000007', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'auto_c', 4, '17:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000008', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'confirmado', 11, '17:00', 50, 'Sessão semanal'),
  ('de3a0000-0004-0005-0000-000000000009', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'confirmado', 18, '17:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000010', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000002', 'Avaliação Psicológica', 450, 'concluido', -32, '15:00', 90, null),
  ('de3a0000-0004-0005-0000-000000000011', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -25, '15:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000012', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -18, '15:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000013', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -11, '15:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000014', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -4, '15:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000015', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'auto_a', 3, '15:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000016', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'confirmado', 10, '15:00', 50, 'Sessão semanal'),
  ('de3a0000-0004-0005-0000-000000000017', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'agendado', 17, '15:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000018', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000002', 'Avaliação Psicológica', 450, 'concluido', -28, '08:00', 90, null),
  ('de3a0000-0004-0005-0000-000000000019', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'cancelado', -21, '08:00', 50, 'Cancelado: paciente viajou.'),
  ('de3a0000-0004-0005-0000-000000000020', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -14, '08:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000021', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -7, '08:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000022', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'auto_c', 0, '08:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000023', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'agendado', 7, '08:00', 50, 'Sessão semanal'),
  ('de3a0000-0004-0005-0000-000000000024', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'agendado', 14, '08:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000025', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000002', 'Avaliação Psicológica', 450, 'concluido', -31, '14:00', 90, null),
  ('de3a0000-0004-0005-0000-000000000026', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -24, '14:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000027', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -17, '14:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000028', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -10, '14:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000029', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'faltou', -3, '14:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000030', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'auto_c', 4, '14:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000031', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'agendado', 11, '14:00', 50, 'Sessão semanal'),
  ('de3a0000-0004-0005-0000-000000000032', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'agendado', 18, '14:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000033', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000002', 'Avaliação Psicológica', 450, 'concluido', -25, '13:00', 90, null),
  ('de3a0000-0004-0005-0000-000000000034', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -18, '13:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000035', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -11, '13:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000036', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'concluido', -4, '13:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000037', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'auto_c', 3, '13:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000038', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'confirmado', 10, '13:00', 50, 'Sessão semanal'),
  ('de3a0000-0004-0005-0000-000000000039', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'confirmado', 17, '13:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000040', 'de3a0000-0004-0002-0000-000000000006', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000004', 'Orientação Vocacional', 200, 'concluido', -21, '16:30', 50, null),
  ('de3a0000-0004-0005-0000-000000000041', 'de3a0000-0004-0002-0000-000000000006', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000004', 'Orientação Vocacional', 200, 'faltou', -14, '16:30', 50, 'Não compareceu e não avisou.'),
  ('de3a0000-0004-0005-0000-000000000042', 'de3a0000-0004-0002-0000-000000000006', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000004', 'Orientação Vocacional', 200, 'concluido', -7, '16:30', 50, null),
  ('de3a0000-0004-0005-0000-000000000043', 'de3a0000-0004-0002-0000-000000000006', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000004', 'Orientação Vocacional', 200, 'auto_c', 0, '16:30', 50, null),
  ('de3a0000-0004-0005-0000-000000000044', 'de3a0000-0004-0002-0000-000000000006', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000004', 'Orientação Vocacional', 200, 'confirmado', 7, '16:30', 50, 'Sessão semanal'),
  ('de3a0000-0004-0005-0000-000000000045', 'de3a0000-0004-0002-0000-000000000006', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000004', 'Orientação Vocacional', 200, 'confirmado', 14, '16:30', 50, null),
  ('de3a0000-0004-0005-0000-000000000046', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000002', 'Avaliação Psicológica', 450, 'concluido', -24, '13:00', 90, null),
  ('de3a0000-0004-0005-0000-000000000047', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000003', 'Terapia de Casal', 260, 'concluido', -17, '13:00', 60, null),
  ('de3a0000-0004-0005-0000-000000000048', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000003', 'Terapia de Casal', 260, 'concluido', -10, '13:00', 60, null),
  ('de3a0000-0004-0005-0000-000000000049', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000003', 'Terapia de Casal', 260, 'concluido', -3, '13:00', 60, null),
  ('de3a0000-0004-0005-0000-000000000050', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000003', 'Terapia de Casal', 260, 'auto_c', 4, '13:00', 60, null),
  ('de3a0000-0004-0005-0000-000000000051', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000003', 'Terapia de Casal', 260, 'agendado', 11, '13:00', 60, 'Sessão semanal'),
  ('de3a0000-0004-0005-0000-000000000052', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0001-0000-000000000002', 'de3a0000-0004-0003-0000-000000000003', 'Terapia de Casal', 260, 'agendado', 18, '13:00', 60, null),
  ('de3a0000-0004-0005-0000-000000000053', 'de3a0000-0004-0002-0000-000000000008', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000002', 'Avaliação Psicológica', 450, 'concluido', -13, '17:00', 90, null),
  ('de3a0000-0004-0005-0000-000000000054', 'de3a0000-0004-0002-0000-000000000008', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'faltou', -6, '17:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000055', 'de3a0000-0004-0002-0000-000000000008', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'auto_a', 1, '17:00', 50, null),
  ('de3a0000-0004-0005-0000-000000000056', 'de3a0000-0004-0002-0000-000000000008', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'agendado', 8, '17:00', 50, 'Sessão semanal'),
  ('de3a0000-0004-0005-0000-000000000057', 'de3a0000-0004-0002-0000-000000000008', 'de3a0000-0004-0001-0000-000000000001', 'de3a0000-0004-0003-0000-000000000001', 'Sessão de Psicoterapia', 180, 'agendado', 15, '17:00', 50, null)
) as v(id, pat, prof, proc, pname, price, st, d, t, dur, notes)
cross join lateral (select ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') as ts) x
on conflict (id) do nothing;

-- 7. Receitas (27): uma por consulta concluída (semanas passadas), no valor do procedimento.
-- O gatilho de comissão só gera linhas para beneficiários ativos (hoje o único está inativo).
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.financial_records (id, clinic_id, patient_id, appointment_id, procedure_id, professional_id,
  total_amount, discount_percent, payment_method, convenio, type, category, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.appt::uuid, v.proc::uuid, v.prof::uuid,
       v.total::numeric, v.disc::numeric, v.pm, v.conv, 'receita', v.cat, '[]'::jsonb,
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0004-0006-0000-000000000001', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0005-0000-000000000001', 'de3a0000-0004-0003-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 450.0, 0, 'convenio', 'Unimed Fortaleza', 'Avaliação Psicológica', -38, '17:00', 90),
  ('de3a0000-0004-0006-0000-000000000002', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0005-0000-000000000002', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -31, '17:00', 50),
  ('de3a0000-0004-0006-0000-000000000005', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0005-0000-000000000005', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -10, '17:00', 50),
  ('de3a0000-0004-0006-0000-000000000006', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0005-0000-000000000006', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -3, '17:00', 50),
  ('de3a0000-0004-0006-0000-000000000010', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0005-0000-000000000010', 'de3a0000-0004-0003-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 450.0, 0, 'pix', null, 'Avaliação Psicológica', -32, '15:00', 90),
  ('de3a0000-0004-0006-0000-000000000011', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0005-0000-000000000011', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'cartao_debito', null, 'Sessão', -25, '15:00', 50),
  ('de3a0000-0004-0006-0000-000000000012', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0005-0000-000000000012', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'pix', null, 'Sessão', -18, '15:00', 50),
  ('de3a0000-0004-0006-0000-000000000013', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0005-0000-000000000013', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'pix', null, 'Sessão', -11, '15:00', 50),
  ('de3a0000-0004-0006-0000-000000000014', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0005-0000-000000000014', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'cartao_debito', null, 'Sessão', -4, '15:00', 50),
  ('de3a0000-0004-0006-0000-000000000018', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0005-0000-000000000018', 'de3a0000-0004-0003-0000-000000000002', 'de3a0000-0004-0001-0000-000000000002', 405.0, 10, 'cartao_debito', null, 'Avaliação Psicológica', -28, '08:00', 90),
  ('de3a0000-0004-0006-0000-000000000020', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0005-0000-000000000020', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000002', 180.0, 0, 'cartao_credito', null, 'Sessão', -14, '08:00', 50),
  ('de3a0000-0004-0006-0000-000000000021', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0005-0000-000000000021', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000002', 162.0, 10, 'pix', null, 'Sessão', -7, '08:00', 50),
  ('de3a0000-0004-0006-0000-000000000025', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0005-0000-000000000025', 'de3a0000-0004-0003-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 450.0, 0, 'cartao_debito', null, 'Avaliação Psicológica', -31, '14:00', 90),
  ('de3a0000-0004-0006-0000-000000000026', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0005-0000-000000000026', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'dinheiro', null, 'Sessão', -24, '14:00', 50),
  ('de3a0000-0004-0006-0000-000000000027', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0005-0000-000000000027', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'pix', null, 'Sessão', -17, '14:00', 50),
  ('de3a0000-0004-0006-0000-000000000028', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0005-0000-000000000028', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'pix', null, 'Sessão', -10, '14:00', 50),
  ('de3a0000-0004-0006-0000-000000000033', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0005-0000-000000000033', 'de3a0000-0004-0003-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 450.0, 0, 'convenio', 'Hapvida', 'Avaliação Psicológica', -25, '13:00', 90),
  ('de3a0000-0004-0006-0000-000000000034', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0005-0000-000000000034', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'convenio', 'Hapvida', 'Sessão', -18, '13:00', 50),
  ('de3a0000-0004-0006-0000-000000000035', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0005-0000-000000000035', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'convenio', 'Hapvida', 'Sessão', -11, '13:00', 50),
  ('de3a0000-0004-0006-0000-000000000036', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0005-0000-000000000036', 'de3a0000-0004-0003-0000-000000000001', 'de3a0000-0004-0001-0000-000000000001', 180.0, 0, 'convenio', 'Hapvida', 'Sessão', -4, '13:00', 50),
  ('de3a0000-0004-0006-0000-000000000040', 'de3a0000-0004-0002-0000-000000000006', 'de3a0000-0004-0005-0000-000000000040', 'de3a0000-0004-0003-0000-000000000004', 'de3a0000-0004-0001-0000-000000000002', 200.0, 0, 'cartao_credito', null, 'Sessão', -21, '16:30', 50),
  ('de3a0000-0004-0006-0000-000000000042', 'de3a0000-0004-0002-0000-000000000006', 'de3a0000-0004-0005-0000-000000000042', 'de3a0000-0004-0003-0000-000000000004', 'de3a0000-0004-0001-0000-000000000002', 200.0, 0, 'pix', null, 'Sessão', -7, '16:30', 50),
  ('de3a0000-0004-0006-0000-000000000046', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0005-0000-000000000046', 'de3a0000-0004-0003-0000-000000000002', 'de3a0000-0004-0001-0000-000000000002', 450.0, 0, 'cartao_credito', null, 'Avaliação Psicológica', -24, '13:00', 90),
  ('de3a0000-0004-0006-0000-000000000047', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0005-0000-000000000047', 'de3a0000-0004-0003-0000-000000000003', 'de3a0000-0004-0001-0000-000000000002', 260.0, 0, 'dinheiro', null, 'Terapia de Casal', -17, '13:00', 60),
  ('de3a0000-0004-0006-0000-000000000048', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0005-0000-000000000048', 'de3a0000-0004-0003-0000-000000000003', 'de3a0000-0004-0001-0000-000000000002', 260.0, 0, 'pix', null, 'Terapia de Casal', -10, '13:00', 60),
  ('de3a0000-0004-0006-0000-000000000049', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0005-0000-000000000049', 'de3a0000-0004-0003-0000-000000000003', 'de3a0000-0004-0001-0000-000000000002', 260.0, 0, 'cartao_debito', null, 'Terapia de Casal', -3, '13:00', 60),
  ('de3a0000-0004-0006-0000-000000000053', 'de3a0000-0004-0002-0000-000000000008', 'de3a0000-0004-0005-0000-000000000053', 'de3a0000-0004-0003-0000-000000000002', 'de3a0000-0004-0001-0000-000000000001', 450.0, 0, 'pix', null, 'Avaliação Psicológica', -13, '17:00', 90)
) as v(id, pat, appt, proc, prof, total, disc, pm, conv, cat, d, t, dur)
on conflict (id) do nothing;

-- 8. Despesas da área (3); aluguel e folha já existem na clínica, não são repetidos
insert into public.financial_records (id, clinic_id, total_amount, discount_percent, payment_method, type, category, notes, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.amt::numeric, 0, v.pm, 'despesa', v.cat, v.note, '[]'::jsonb, v.at::timestamptz
from (values
  ('de3a0000-0004-0006-0000-000000000901', 1200.0, 'cartao_credito', 'Material', 'Renovação de licença de testes psicológicos', now() - interval '24 days'),
  ('de3a0000-0004-0006-0000-000000000902', 290.0, 'pix', 'Marketing', 'Site e agendamento online', now() - interval '44 days'),
  ('de3a0000-0004-0006-0000-000000000903', 260.0, 'pix', 'Material', 'Papelaria e jogos terapêuticos', now() - interval '63 days')
) as v(id, amt, pm, cat, note, at)
on conflict (id) do nothing;

-- 9. Prontuários (8): anamnese e exame clínico namespaced por área ("psico"), chaves reais de specialtyConfig.tsx
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.medical_records (id, clinic_id, patient_id, anamnesis, clinical_exam, treatment_plan, odontogram, treatment_plan_items, created_at, updated_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.anam, v.exam, v.tp, v.odo, v.items,
       ((m.monday + v.d1::int + v.t1::time) at time zone 'America/Sao_Paulo'),
       ((m.monday + v.d2::int + v.t2::time) at time zone 'America/Sao_Paulo')
from m
cross join (values
  ('de3a0000-0004-0007-0000-000000000001', 'de3a0000-0004-0002-0000-000000000001', $j${"psico":{"a-medicamentos":"Não faz uso de medicação psiquiátrica","a-substancias":"Álcool social; nega outras substâncias","a-risco":"Nega ideação suicida e autolesão","a-queixa":"Ansiedade constante, preocupação excessiva com o trabalho e dificuldade para relaxar","a-hist_pessoal":"Infância sem intercorrências; primeira crise de ansiedade aos 26 anos","a-dinamica_familiar":"Mora com o companheiro; boa relação com os pais","a-trat_anteriores":"Psicoterapia por 6 meses em 2022, interrompida","a-sono":"Dificuldade para iniciar o sono; acorda cedo","a-relacionamentos":"Rede de apoio estável; cobra muito de si mesma","a-trabalho":"Liderança de equipe com alta demanda","a-objetivos":"Reduzir a ansiedade e aprender a lidar com cobranças"}}$j$::jsonb, $j${"psico":{"e-percepcao":"Sem alterações da sensopercepção","e-cognicao":"Memória, atenção e orientação preservadas","e-apresentacao":"Bem cuidada, colaborativa, contato visual adequado","e-humor":"Ansioso, afeto congruente","e-pensamento":"Curso normal; conteúdo com ruminações sobre desempenho","e-critica":"Preservada; boa adesão","e-escala_phq":"GAD-7: 14 (ansiedade moderada); PHQ-9: 6","e-hipotese":"Transtorno de ansiedade generalizada (F41.1), em avaliação","e-plano":"TCC semanal: reestruturação cognitiva, respiração diafragmática e manejo do tempo","e-obs":"Encaminhada para avaliação psiquiátrica complementar, sem urgência."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -38, '17:00', -3, '17:00'),
  ('de3a0000-0004-0007-0000-000000000002', 'de3a0000-0004-0002-0000-000000000002', $j${"psico":{"a-medicamentos":"Não faz uso de medicação psiquiátrica","a-substancias":"Álcool social; nega outras substâncias","a-risco":"Nega ideação suicida e autolesão","a-queixa":"Exaustão, irritabilidade e queda de desempenho no trabalho","a-hist_pessoal":"Sem episódios depressivos anteriores","a-dinamica_familiar":"Casado, um filho pequeno","a-trat_anteriores":"Nenhum","a-sono":"Sono curto e fragmentado (5 horas)","a-relacionamentos":"Distanciamento da família por excesso de trabalho","a-trabalho":"Plantões frequentes e metas agressivas","a-objetivos":"Recuperar energia e equilíbrio entre vida e trabalho"}}$j$::jsonb, $j${"psico":{"e-percepcao":"Sem alterações da sensopercepção","e-cognicao":"Memória, atenção e orientação preservadas","e-apresentacao":"Cansado, fala pausada","e-humor":"Rebaixado, afeto restrito","e-pensamento":"Lentificado, com autocrítica intensa","e-critica":"Preservada","e-escala_phq":"PHQ-9: 12 (moderado)","e-hipotese":"Esgotamento profissional (burnout) com sintomas depressivos","e-plano":"Psicoterapia semanal com foco em limites, descanso e reorganização da rotina","e-obs":"Orientado a conversar com o gestor sobre carga de trabalho."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -32, '15:00', -4, '15:00'),
  ('de3a0000-0004-0007-0000-000000000003', 'de3a0000-0004-0002-0000-000000000003', $j${"psico":{"a-medicamentos":"Não faz uso de medicação psiquiátrica","a-substancias":"Álcool social; nega outras substâncias","a-risco":"Nega ideação suicida e autolesão","a-queixa":"Medo de ir à escola, dores de barriga frequentes e choro ao acordar","a-hist_pessoal":"Mudança de escola neste ano; desenvolvimento normal","a-dinamica_familiar":"Mora com os pais e um irmão mais novo","a-trat_anteriores":"Nenhum","a-sono":"Sono agitado nas noites de domingo","a-relacionamentos":"Poucos amigos na escola nova","a-trabalho":"7º ano, rendimento caiu nos últimos meses","a-objetivos":"Voltar a gostar da escola"}}$j$::jsonb, $j${"psico":{"e-percepcao":"Sem alterações da sensopercepção","e-cognicao":"Memória, atenção e orientação preservadas","e-apresentacao":"Tímida, colabora com atividades lúdicas","e-humor":"Ansiosa, afeto adequado","e-pensamento":"Compatível com a idade","e-critica":"Adequada à idade","e-hipotese":"Ansiedade de separação e adaptação escolar","e-plano":"Ludoterapia e orientação de pais, em parceria com a escola","e-obs":"Reunião com a orientação escolar agendada."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -28, '08:00', -7, '08:00'),
  ('de3a0000-0004-0007-0000-000000000004', 'de3a0000-0004-0002-0000-000000000004', $j${"psico":{"a-medicamentos":"Não faz uso de medicação psiquiátrica","a-substancias":"Álcool social; nega outras substâncias","a-risco":"Nega ideação suicida e autolesão","a-queixa":"Tristeza e isolamento após a morte do pai há 4 meses","a-hist_pessoal":"Muito próximo do pai; perda súbita","a-dinamica_familiar":"Mora com a mãe, que também está em luto","a-trat_anteriores":"Nenhum","a-sono":"Acorda várias vezes durante a noite","a-relacionamentos":"Afastou-se de amigos","a-trabalho":"Faltou a disciplinas no semestre","a-objetivos":"Elaborar a perda e retomar a rotina"}}$j$::jsonb, $j${"psico":{"e-percepcao":"Sem alterações da sensopercepção","e-cognicao":"Memória, atenção e orientação preservadas","e-apresentacao":"Cabisbaixo, fala baixa","e-humor":"Tristeza congruente com o luto","e-pensamento":"Curso normal, conteúdo de saudade e culpa","e-critica":"Preservada","e-escala_phq":"PHQ-9: 9","e-hipotese":"Reação de luto com sintomas depressivos leves","e-plano":"Psicoterapia de apoio com foco no processo de luto","e-obs":"Reavaliar necessidade de acompanhamento psiquiátrico em 8 semanas."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -31, '14:00', -10, '14:00'),
  ('de3a0000-0004-0007-0000-000000000005', 'de3a0000-0004-0002-0000-000000000005', $j${"psico":{"a-medicamentos":"Sertralina 50 mg (prescrita pelo psiquiatra)","a-substancias":"Álcool social; nega outras substâncias","a-risco":"Nega ideação suicida e autolesão","a-queixa":"Falta de motivação, cansaço e choro frequente há 3 meses","a-hist_pessoal":"Episódio depressivo aos 30 anos, tratado","a-dinamica_familiar":"Divorciada, dois filhos adolescentes","a-trat_anteriores":"Psicoterapia e antidepressivo em 2011","a-sono":"Sonolência diurna e despertar precoce","a-relacionamentos":"Boa rede de apoio, mas se isolou","a-trabalho":"Sobrecarga de orientações e bancas","a-objetivos":"Retomar prazer em atividades e energia"}}$j$::jsonb, $j${"psico":{"e-percepcao":"Sem alterações da sensopercepção","e-cognicao":"Memória, atenção e orientação preservadas","e-apresentacao":"Cuidada, voz baixa","e-humor":"Deprimido, afeto lábil","e-pensamento":"Lentificado, pessimismo","e-critica":"Preservada","e-escala_phq":"PHQ-9: 15 (moderadamente grave)","e-hipotese":"Episódio depressivo moderado (F32.1), em acompanhamento conjunto com psiquiatria","e-plano":"TCC com ativação comportamental e monitoramento do humor","e-obs":"Contato com o psiquiatra assistente autorizado pela paciente."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -25, '13:00', -4, '13:00'),
  ('de3a0000-0004-0007-0000-000000000006', 'de3a0000-0004-0002-0000-000000000006', $j${"psico":{"a-medicamentos":"Não faz uso de medicação psiquiátrica","a-substancias":"Álcool social; nega outras substâncias","a-risco":"Nega ideação suicida e autolesão","a-queixa":"Indecisão entre Medicina, Engenharia e Design","a-hist_pessoal":"Bom desempenho escolar; pressão da família por carreira tradicional","a-dinamica_familiar":"Pais engenheiros","a-trat_anteriores":"Nenhum","a-sono":"Regular","a-relacionamentos":"Bom círculo de amigos","a-trabalho":"Cursinho em tempo integral","a-objetivos":"Escolher o curso com mais segurança"}}$j$::jsonb, $j${"psico":{"e-percepcao":"Sem alterações da sensopercepção","e-cognicao":"Memória, atenção e orientação preservadas","e-apresentacao":"Comunicativo, interessado","e-humor":"Eutímico","e-pensamento":"Organizado","e-critica":"Preservada","e-hipotese":"Dúvida vocacional sem psicopatologia","e-plano":"Processo de orientação vocacional em 8 encontros, com inventário de interesses","e-obs":"Aplicado inventário de interesses na segunda sessão."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -21, '16:30', -7, '16:30'),
  ('de3a0000-0004-0007-0000-000000000007', 'de3a0000-0004-0002-0000-000000000007', $j${"psico":{"a-medicamentos":"Não faz uso de medicação psiquiátrica","a-substancias":"Álcool social; nega outras substâncias","a-risco":"Nega ideação suicida e autolesão","a-queixa":"Conflitos frequentes e distanciamento do casal após a saída do filho de casa","a-hist_pessoal":"Casada há 22 anos, dois filhos adultos","a-dinamica_familiar":"Casal mora sozinho agora","a-trat_anteriores":"Nenhum como casal","a-sono":"Regular","a-relacionamentos":"Comunicação reduzida e discussões repetidas","a-trabalho":"Ambos com carga horária elevada","a-objetivos":"Reaproximar o casal e melhorar a comunicação"}}$j$::jsonb, $j${"psico":{"e-percepcao":"Sem alterações da sensopercepção","e-cognicao":"Memória, atenção e orientação preservadas","e-apresentacao":"Casal compareceu junto, colaborativo","e-humor":"Eutímica, ansiosa ao falar do relacionamento","e-pensamento":"Organizado","e-critica":"Preservada","e-hipotese":"Dificuldades de comunicação conjugal em fase de ninho vazio","e-plano":"Terapia de casal semanal com exercícios de escuta e tempo de qualidade","e-obs":"Atendimento registrado no prontuário da paciente de referência."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -24, '13:00', -3, '13:00'),
  ('de3a0000-0004-0007-0000-000000000008', 'de3a0000-0004-0002-0000-000000000008', $j${"psico":{"a-medicamentos":"Não faz uso de medicação psiquiátrica","a-substancias":"Álcool social; nega outras substâncias","a-risco":"Nega ideação suicida e autolesão","a-queixa":"Dificuldade de concentração, procrastinação e esquecimentos","a-hist_pessoal":"Desatento desde a escola, nunca avaliado","a-dinamica_familiar":"Mora sozinho","a-trat_anteriores":"Nenhum","a-sono":"Dorme tarde, irregular","a-relacionamentos":"Dificuldade de manter combinados","a-trabalho":"Perde prazos com frequência","a-objetivos":"Investigar TDAH e organizar a rotina"}}$j$::jsonb, $j${"psico":{"e-percepcao":"Sem alterações da sensopercepção","e-cognicao":"Atenção sustentada reduzida na triagem; memória preservada","e-apresentacao":"Inquieto, mas colaborativo","e-humor":"Eutímico, ansioso quanto ao trabalho","e-pensamento":"Acelerado, com desvios de tópico","e-critica":"Preservada","e-hipotese":"Suspeita de TDAH desatento; avaliação neuropsicológica em andamento","e-plano":"Avaliação psicológica completa e psicoterapia com estratégias de organização","e-obs":"Aplicadas escalas de rastreio; resultado à discussão com psiquiatria."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -13, '17:00', -13, '17:00')
) as v(id, pat, anam, exam, tp, odo, items, d1, t1, d2, t2)
on conflict (id) do nothing;

-- 10. Evoluções no prontuário (15); author_name = profissional que atendeu, professional_id preenchido
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.record_entries (id, clinic_id, patient_id, record_id, author_name, professional_id, entry_text, entry_type, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.rec::uuid, v.author, v.prof::uuid, v.txt, 'evolucao',
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0004-0008-0000-000000000001', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0007-0000-000000000001', 'Dra. Mariana Sá Cavalcante', 'de3a0000-0004-0001-0000-000000000001', 'Avaliação inicial concluída. Combinado contrato terapêutico e frequência semanal; psicoeducação sobre ansiedade.', -38, '17:00', 90),
  ('de3a0000-0004-0008-0000-000000000002', 'de3a0000-0004-0002-0000-000000000001', 'de3a0000-0004-0007-0000-000000000001', 'Dra. Mariana Sá Cavalcante', 'de3a0000-0004-0001-0000-000000000001', 'Boa adesão ao registro de pensamentos. GAD-7 reduziu de 14 para 9; trabalhando crenças de perfeccionismo.', -3, '17:00', 50),
  ('de3a0000-0004-0008-0000-000000000003', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0007-0000-000000000002', 'Dra. Mariana Sá Cavalcante', 'de3a0000-0004-0001-0000-000000000001', 'Avaliação: sintomas de esgotamento há 8 meses. Definidas metas semanais de descanso e pausas.', -32, '15:00', 90),
  ('de3a0000-0004-0008-0000-000000000004', 'de3a0000-0004-0002-0000-000000000002', 'de3a0000-0004-0007-0000-000000000002', 'Dra. Mariana Sá Cavalcante', 'de3a0000-0004-0001-0000-000000000001', 'Relata melhora do sono. Conseguiu negociar escala com o gestor; PHQ-9 em 7.', -4, '15:00', 50),
  ('de3a0000-0004-0008-0000-000000000005', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0007-0000-000000000003', 'Dr. Henrique Bastos Aguiar', 'de3a0000-0004-0001-0000-000000000002', 'Primeira sessão com a família e depois com Sofia, com desenhos e jogos. Vínculo bom desde o início.', -28, '08:00', 90),
  ('de3a0000-0004-0008-0000-000000000006', 'de3a0000-0004-0002-0000-000000000003', 'de3a0000-0004-0007-0000-000000000003', 'Dr. Henrique Bastos Aguiar', 'de3a0000-0004-0001-0000-000000000002', 'Frequência escolar regularizada. Trabalhando identificação de emoções e estratégias de enfrentamento.', -7, '08:00', 50),
  ('de3a0000-0004-0008-0000-000000000007', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0007-0000-000000000004', 'Dra. Mariana Sá Cavalcante', 'de3a0000-0004-0001-0000-000000000001', 'Acolhimento do luto. Paciente chorou na maior parte da sessão; combinado ritmo semanal.', -31, '14:00', 90),
  ('de3a0000-0004-0008-0000-000000000008', 'de3a0000-0004-0002-0000-000000000004', 'de3a0000-0004-0007-0000-000000000004', 'Dra. Mariana Sá Cavalcante', 'de3a0000-0004-0001-0000-000000000001', 'Voltou a frequentar as aulas. Fala do pai com mais leveza; iniciou caminhadas.', -10, '14:00', 50),
  ('de3a0000-0004-0008-0000-000000000009', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0007-0000-000000000005', 'Dra. Mariana Sá Cavalcante', 'de3a0000-0004-0001-0000-000000000001', 'Avaliação psicológica. Combinado trabalho conjunto com psiquiatria; iniciada ativação comportamental com atividades prazerosas.', -25, '13:00', 90),
  ('de3a0000-0004-0008-0000-000000000010', 'de3a0000-0004-0002-0000-000000000005', 'de3a0000-0004-0007-0000-000000000005', 'Dra. Mariana Sá Cavalcante', 'de3a0000-0004-0001-0000-000000000001', 'PHQ-9 em 10. Retomou caminhadas e encontros semanais com amigas.', -4, '13:00', 50),
  ('de3a0000-0004-0008-0000-000000000011', 'de3a0000-0004-0002-0000-000000000006', 'de3a0000-0004-0007-0000-000000000006', 'Dr. Henrique Bastos Aguiar', 'de3a0000-0004-0001-0000-000000000002', 'Início do processo: levantamento de interesses, valores e influências familiares.', -21, '16:30', 50),
  ('de3a0000-0004-0008-0000-000000000012', 'de3a0000-0004-0002-0000-000000000006', 'de3a0000-0004-0007-0000-000000000006', 'Dr. Henrique Bastos Aguiar', 'de3a0000-0004-0001-0000-000000000002', 'Resultado do inventário apontou afinidade com áreas de tecnologia e saúde; explorando visitas e conversas com profissionais.', -7, '16:30', 50),
  ('de3a0000-0004-0008-0000-000000000013', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0007-0000-000000000007', 'Dr. Henrique Bastos Aguiar', 'de3a0000-0004-0001-0000-000000000002', 'Primeira sessão com o casal: expectativas e histórico. Combinado atendimento semanal.', -24, '13:00', 90),
  ('de3a0000-0004-0008-0000-000000000014', 'de3a0000-0004-0002-0000-000000000007', 'de3a0000-0004-0007-0000-000000000007', 'Dr. Henrique Bastos Aguiar', 'de3a0000-0004-0001-0000-000000000002', 'Praticaram o exercício de escuta sem interrupção; relatam menos discussões nesta semana.', -3, '13:00', 60),
  ('de3a0000-0004-0008-0000-000000000015', 'de3a0000-0004-0002-0000-000000000008', 'de3a0000-0004-0007-0000-000000000008', 'Dra. Mariana Sá Cavalcante', 'de3a0000-0004-0001-0000-000000000001', 'Triagem inicial. Iniciada avaliação psicológica com entrevistas e escalas de rastreio.', -13, '17:00', 90)
) as v(id, pat, rec, author, prof, txt, d, t, dur)
on conflict (id) do nothing;

-- Verificação (contagens esperadas em docs/demo-seed-video123.md)
select 'professionals' as tabela, count(*) as linhas from public.professionals where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0001-%'
union all
select 'patients' as tabela, count(*) as linhas from public.patients where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0002-%'
union all
select 'procedures' as tabela, count(*) as linhas from public.procedures where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0003-%'
union all
select 'stock_items' as tabela, count(*) as linhas from public.stock_items where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0004-%'
union all
select 'stock_movements' as tabela, count(*) as linhas from public.stock_movements where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0009-%'
union all
select 'appointments' as tabela, count(*) as linhas from public.appointments where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0005-%'
union all
select 'financial_records' as tabela, count(*) as linhas from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0006-%'
union all
select 'medical_records' as tabela, count(*) as linhas from public.medical_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0007-%'
union all
select 'record_entries' as tabela, count(*) as linhas from public.record_entries where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0008-%'
order by 1;

commit;

-- =============================================================================
-- ROLLBACK (descomente tudo, de "begin" a "commit", e rode inteiro).
-- Apaga só o que este arquivo criou: clinic_id da demo + ids com o prefixo de3a0000-0004-.
-- Ordem respeita as FKs (receitas e comissões -> evoluções -> prontuários -> consultas -> estoque -> procedimentos -> pacientes -> profissionais).
-- =============================================================================
-- begin;
-- delete from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0006-%';
-- delete from public.record_entries    where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0008-%';
-- delete from public.medical_records   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0007-%';
-- delete from public.appointments      where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0005-%';
-- delete from public.stock_movements   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0009-%';
-- delete from public.stock_items       where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0004-%';
-- delete from public.procedures        where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0003-%';
-- delete from public.patients          where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0002-%';
-- delete from public.professionals     where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0004-0001-%';
-- commit;
