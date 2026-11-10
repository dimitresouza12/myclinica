-- =============================================================================
-- Seed demo video123 | área: Terapia Ocupacional (to) | arquivo 07-to.sql
-- =============================================================================
-- Insere SOMENTE na clínica demo (clinic_id 3916d37d-b247-485e-bd2f-b47be8d44207).
-- Convenção de IDs determinísticos: de3a0000-0007-<tabela>-0000-<seq>
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
  ('de3a0000-0007-0001-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dra. Natália Cruz Bezerra', 'Infantil/TEA', 'to', 50, 'CREFITO-6 / 21544-TO', now() - interval '208 days'),
  ('de3a0000-0007-0001-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dr. Ícaro Matos Feitosa', 'Neurofuncional', 'to', 50, 'CREFITO-6 / 19871-TO', now() - interval '206 days')
on conflict (id) do nothing;

-- 2. Pacientes (8): CPF e RG ficam nulos de propósito; is_active/registration_status usam o default
insert into public.patients (id, clinic_id, name, phone, email, birth_date, gender, address, occupation, emergency_contact, referred_by,
  notes, pet_name, pet_species, pet_breed, pet_weight, pet_age, pet_coat, pet_neutered, convenio, convenio_carteirinha, lgpd_consent, lgpd_consent_at, created_at, updated_at)
values
  ('de3a0000-0007-0002-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Arthur Gabriel Farias', '(85) 90000-7001', 'arthur.farias@example.com', '2019-06-11', 'Masculino', 'Rua Marcos Macedo, 450 - Aldeota, Fortaleza/CE', 'Criança', 'Mãe: Bruna Farias (responsável)', 'Encaminhamento da neuropediatra', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 556677 8899', true, now() - interval '97 days', now() - interval '97 days', now() - interval '97 days'),
  ('de3a0000-0007-0002-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Maria Clara Evangelista', '(85) 90000-7002', 'maria.evangelista@example.com', '2017-02-26', 'Feminino', 'Rua Ana Bilhar, 300 - Meireles, Fortaleza/CE', 'Criança', 'Pai: Sérgio Evangelista (responsável)', 'Indicação da escola', null, null, null, null, null, null, null, null, null, null, true, now() - interval '94 days', now() - interval '94 days', now() - interval '94 days'),
  ('de3a0000-0007-0002-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Lucas Emanuel Rocha', '(85) 90000-7003', 'lucas.rocha@example.com', '2021-08-19', 'Masculino', 'Rua Osvaldo Cruz, 700 - Meireles, Fortaleza/CE', 'Criança', 'Mãe: Camila Rocha (responsável)', 'Indicação do pediatra', null, null, null, null, null, null, null, null, null, null, true, now() - interval '91 days', now() - interval '91 days', now() - interval '91 days'),
  ('de3a0000-0007-0002-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'José Raimundo Pires', '(85) 90000-7004', 'jose.pires@example.com', '1958-11-12', 'Masculino', 'Rua Barão do Rio Branco, 800 - Centro, Fortaleza/CE', 'Aposentado', 'Esposa: Marlene Pires', 'Encaminhamento do neurologista', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 778800 2233', true, now() - interval '88 days', now() - interval '88 days', now() - interval '88 days'),
  ('de3a0000-0007-0002-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Edna Maria Cavalcante', '(85) 90000-7005', 'edna.cavalcante@example.com', '1949-01-27', 'Feminino', 'Rua Pereira Filgueiras, 1200 - Centro, Fortaleza/CE', 'Aposentada', 'Filha: Regina Cavalcante', 'Encaminhamento do neurologista', null, null, null, null, null, null, null, null, null, null, true, now() - interval '85 days', now() - interval '85 days', now() - interval '85 days'),
  ('de3a0000-0007-0002-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Isadora Pinheiro Lacerda', '(85) 90000-7006', 'isadora.lacerda@example.com', '2015-09-04', 'Feminino', 'Av. Dom Luís, 800 - Aldeota, Fortaleza/CE', 'Estudante', 'Mãe: Fabiana Lacerda (responsável)', 'Indicação da escola', null, null, null, null, null, null, null, null, null, null, true, now() - interval '82 days', now() - interval '82 days', now() - interval '82 days'),
  ('de3a0000-0007-0002-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Wellington Costa Sousa', '(85) 90000-7007', 'wellington.sousa@example.com', '1985-04-08', 'Masculino', 'Rua Pedro Pereira, 220 - Centro, Fortaleza/CE', 'Mecânico', null, 'Indicação do ortopedista', null, null, null, null, null, null, null, null, null, null, true, now() - interval '79 days', now() - interval '79 days', now() - interval '79 days'),
  ('de3a0000-0007-0002-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Yasmin Teles Albuquerque', '(85) 90000-7008', 'yasmin.albuquerque@example.com', '2018-12-30', 'Feminino', 'Rua Carlos Vasconcelos, 900 - Aldeota, Fortaleza/CE', 'Criança', 'Mãe: Ticiane Albuquerque (responsável)', 'Indicação da nutricionista', null, null, null, null, null, null, null, null, null, null, true, now() - interval '76 days', now() - interval '76 days', now() - interval '76 days')
on conflict (id) do nothing;

-- 3. Procedimentos (4): nomes/categorias de procedureSuggestions de specialtyConfig.tsx
insert into public.procedures (id, clinic_id, name, price, category, is_active, is_free, created_at)
values
  ('de3a0000-0007-0003-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Avaliação Ocupacional', 200, 'Avaliação', true, false, now() - interval '150 days'),
  ('de3a0000-0007-0003-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Sessão de Integração Sensorial', 140, 'Integração Sensorial', true, false, now() - interval '150 days'),
  ('de3a0000-0007-0003-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Treino de AVDs', 120, 'AVDs', true, false, now() - interval '150 days'),
  ('de3a0000-0007-0003-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Adaptação de Órtese', 260, 'Adaptação/Órtese', true, false, now() - interval '150 days')
on conflict (id) do nothing;

-- 4. Estoque (6 itens; categorias = slugs de stockCategories)
insert into public.stock_items (id, clinic_id, name, category, unit, quantity, min_quantity, cost_price, supplier, is_active, created_at, updated_at)
values
  ('de3a0000-0007-0004-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Bola terapêutica 55 cm', 'equipamento', 'un', 4, 2, 72.0, 'TerapiaKids Brasil', true, now() - interval '120 days', now() - interval '5 days'),
  ('de3a0000-0007-0004-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Massinha de modelar (kit com 12 cores)', 'material', 'kit', 15, 6, 18.0, 'TerapiaKids Brasil', true, now() - interval '120 days', now() - interval '7 days'),
  ('de3a0000-0007-0004-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Balanço terapêutico de teto', 'equipamento', 'un', 2, 1, 480.0, 'TerapiaKids Brasil', true, now() - interval '120 days', now() - interval '9 days'),
  ('de3a0000-0007-0004-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Placa de termoplástico para órteses', 'material', 'un', 7, 3, 95.0, 'OrtoTerapia Materiais', true, now() - interval '120 days', now() - interval '11 days'),
  ('de3a0000-0007-0004-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Jogos de coordenação motora fina (kit)', 'material', 'kit', 8, 3, 64.0, 'TerapiaKids Brasil', true, now() - interval '120 days', now() - interval '13 days'),
  ('de3a0000-0007-0004-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Tapete tátil sensorial', 'equipamento', 'un', 5, 2, 110.0, 'TerapiaKids Brasil', true, now() - interval '120 days', now() - interval '15 days')
on conflict (id) do nothing;

-- 5. Movimentações de estoque (12); a quantidade atual do item já considera as saídas
insert into public.stock_movements (id, clinic_id, item_id, type, quantity, reason, user_name, created_at)
values
  ('de3a0000-0007-0009-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000001', 'entrada', 16, 'Compra de reposicao', 'Dra. Natália Cruz Bezerra', now() - interval '61 days'),
  ('de3a0000-0007-0009-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000001', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Ícaro Matos Feitosa', now() - interval '13 days'),
  ('de3a0000-0007-0009-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000002', 'entrada', 27, 'Compra de reposicao', 'Dra. Natália Cruz Bezerra', now() - interval '62 days'),
  ('de3a0000-0007-0009-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000002', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Ícaro Matos Feitosa', now() - interval '14 days'),
  ('de3a0000-0007-0009-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000003', 'entrada', 14, 'Compra de reposicao', 'Dra. Natália Cruz Bezerra', now() - interval '63 days'),
  ('de3a0000-0007-0009-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000003', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Ícaro Matos Feitosa', now() - interval '15 days'),
  ('de3a0000-0007-0009-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000004', 'entrada', 19, 'Compra de reposicao', 'Dra. Natália Cruz Bezerra', now() - interval '64 days'),
  ('de3a0000-0007-0009-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000004', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Ícaro Matos Feitosa', now() - interval '16 days'),
  ('de3a0000-0007-0009-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000005', 'entrada', 20, 'Compra de reposicao', 'Dra. Natália Cruz Bezerra', now() - interval '65 days'),
  ('de3a0000-0007-0009-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000005', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Ícaro Matos Feitosa', now() - interval '17 days'),
  ('de3a0000-0007-0009-0000-000000000011', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000006', 'entrada', 17, 'Compra de reposicao', 'Dra. Natália Cruz Bezerra', now() - interval '66 days'),
  ('de3a0000-0007-0009-0000-000000000012', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0007-0004-0000-000000000006', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Ícaro Matos Feitosa', now() - interval '18 days')
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
  ('de3a0000-0007-0005-0000-000000000001', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000001', 'Avaliação Ocupacional', 200, 'concluido', -38, '15:30', 60, null),
  ('de3a0000-0007-0005-0000-000000000002', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -31, '15:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000003', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'faltou', -24, '15:30', 50, 'Não compareceu; a recepção tentou contato.'),
  ('de3a0000-0007-0005-0000-000000000004', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -17, '15:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000005', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -10, '15:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000006', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -3, '15:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000007', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'auto_c', 4, '15:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000008', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'agendado', 11, '15:30', 50, 'Sessão semanal'),
  ('de3a0000-0007-0005-0000-000000000009', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'agendado', 18, '15:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000010', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000001', 'Avaliação Ocupacional', 200, 'concluido', -34, '14:30', 60, null),
  ('de3a0000-0007-0005-0000-000000000011', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -27, '14:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000012', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -20, '14:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000013', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -13, '14:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000014', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -6, '14:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000015', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'auto_a', 1, '14:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000016', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'confirmado', 8, '14:30', 50, 'Sessão semanal'),
  ('de3a0000-0007-0005-0000-000000000017', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'confirmado', 15, '14:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000018', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000001', 'Avaliação Ocupacional', 200, 'concluido', -17, '16:30', 60, null),
  ('de3a0000-0007-0005-0000-000000000019', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -10, '16:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000020', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -3, '16:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000021', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'auto_c', 4, '16:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000022', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'confirmado', 11, '16:30', 50, 'Sessão semanal'),
  ('de3a0000-0007-0005-0000-000000000023', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'confirmado', 18, '16:30', 50, null),
  ('de3a0000-0007-0005-0000-000000000024', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000001', 'Avaliação Ocupacional', 200, 'concluido', -41, '15:00', 60, null),
  ('de3a0000-0007-0005-0000-000000000025', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'concluido', -34, '15:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000026', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'concluido', -27, '15:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000027', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'concluido', -20, '15:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000028', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'faltou', -13, '15:00', 50, 'Não compareceu e não avisou.'),
  ('de3a0000-0007-0005-0000-000000000029', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'concluido', -6, '15:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000030', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'auto_a', 1, '15:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000031', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'confirmado', 8, '15:00', 50, 'Sessão semanal'),
  ('de3a0000-0007-0005-0000-000000000032', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'confirmado', 15, '15:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000033', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000001', 'Avaliação Ocupacional', 200, 'concluido', -35, '14:00', 60, null),
  ('de3a0000-0007-0005-0000-000000000034', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'concluido', -28, '14:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000035', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'concluido', -21, '14:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000036', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'concluido', -14, '14:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000037', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'concluido', -7, '14:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000038', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'auto_a', 0, '14:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000039', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'confirmado', 7, '14:00', 50, 'Sessão semanal'),
  ('de3a0000-0007-0005-0000-000000000040', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'agendado', 14, '14:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000041', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000001', 'Avaliação Ocupacional', 200, 'concluido', -25, '17:00', 60, null),
  ('de3a0000-0007-0005-0000-000000000042', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -18, '17:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000043', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'faltou', -11, '17:00', 50, 'Não compareceu; a recepção tentou contato.'),
  ('de3a0000-0007-0005-0000-000000000044', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -4, '17:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000045', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'auto_a', 3, '17:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000046', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'confirmado', 10, '17:00', 50, 'Sessão semanal'),
  ('de3a0000-0007-0005-0000-000000000047', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'agendado', 17, '17:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000048', 'de3a0000-0007-0002-0000-000000000007', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000001', 'Avaliação Ocupacional', 200, 'concluido', -35, '08:00', 60, null),
  ('de3a0000-0007-0005-0000-000000000049', 'de3a0000-0007-0002-0000-000000000007', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000004', 'Adaptação de Órtese', 260, 'concluido', -21, '13:00', 40, null),
  ('de3a0000-0007-0005-0000-000000000050', 'de3a0000-0007-0002-0000-000000000007', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'concluido', -10, '14:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000051', 'de3a0000-0007-0002-0000-000000000007', 'de3a0000-0007-0001-0000-000000000002', 'de3a0000-0007-0003-0000-000000000003', 'Treino de AVDs', 120, 'agendado', 7, '10:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000052', 'de3a0000-0007-0002-0000-000000000008', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000001', 'Avaliação Ocupacional', 200, 'concluido', -21, '11:00', 60, null),
  ('de3a0000-0007-0005-0000-000000000053', 'de3a0000-0007-0002-0000-000000000008', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'concluido', -14, '11:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000054', 'de3a0000-0007-0002-0000-000000000008', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'faltou', -7, '11:00', 50, 'Não compareceu; a recepção tentou contato.'),
  ('de3a0000-0007-0005-0000-000000000055', 'de3a0000-0007-0002-0000-000000000008', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'auto_c', 0, '11:00', 50, null),
  ('de3a0000-0007-0005-0000-000000000056', 'de3a0000-0007-0002-0000-000000000008', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'agendado', 7, '11:00', 50, 'Sessão semanal'),
  ('de3a0000-0007-0005-0000-000000000057', 'de3a0000-0007-0002-0000-000000000008', 'de3a0000-0007-0001-0000-000000000001', 'de3a0000-0007-0003-0000-000000000002', 'Sessão de Integração Sensorial', 140, 'confirmado', 14, '11:00', 50, null)
) as v(id, pat, prof, proc, pname, price, st, d, t, dur, notes)
cross join lateral (select ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') as ts) x
on conflict (id) do nothing;

-- 7. Receitas (31): uma por consulta concluída (semanas passadas), no valor do procedimento.
-- O gatilho de comissão só gera linhas para beneficiários ativos (hoje o único está inativo).
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.financial_records (id, clinic_id, patient_id, appointment_id, procedure_id, professional_id,
  total_amount, discount_percent, payment_method, convenio, type, category, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.appt::uuid, v.proc::uuid, v.prof::uuid,
       v.total::numeric, v.disc::numeric, v.pm, v.conv, 'receita', v.cat, '[]'::jsonb,
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0007-0006-0000-000000000001', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0005-0000-000000000001', 'de3a0000-0007-0003-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 200.0, 0, 'convenio', 'Unimed Fortaleza', 'Avaliação', -38, '15:30', 60),
  ('de3a0000-0007-0006-0000-000000000002', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0005-0000-000000000002', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -31, '15:30', 50),
  ('de3a0000-0007-0006-0000-000000000004', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0005-0000-000000000004', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -17, '15:30', 50),
  ('de3a0000-0007-0006-0000-000000000005', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0005-0000-000000000005', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 126.0, 10, 'cartao_credito', null, 'Sessão', -10, '15:30', 50),
  ('de3a0000-0007-0006-0000-000000000006', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0005-0000-000000000006', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -3, '15:30', 50),
  ('de3a0000-0007-0006-0000-000000000010', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0005-0000-000000000010', 'de3a0000-0007-0003-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 200.0, 0, 'cartao_debito', null, 'Avaliação', -34, '14:30', 60),
  ('de3a0000-0007-0006-0000-000000000011', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0005-0000-000000000011', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'cartao_credito', null, 'Sessão', -27, '14:30', 50),
  ('de3a0000-0007-0006-0000-000000000012', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0005-0000-000000000012', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'cartao_debito', null, 'Sessão', -20, '14:30', 50),
  ('de3a0000-0007-0006-0000-000000000013', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0005-0000-000000000013', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'dinheiro', null, 'Sessão', -13, '14:30', 50),
  ('de3a0000-0007-0006-0000-000000000014', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0005-0000-000000000014', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'cartao_debito', null, 'Sessão', -6, '14:30', 50),
  ('de3a0000-0007-0006-0000-000000000018', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0005-0000-000000000018', 'de3a0000-0007-0003-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 200.0, 0, 'dinheiro', null, 'Avaliação', -17, '16:30', 60),
  ('de3a0000-0007-0006-0000-000000000019', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0005-0000-000000000019', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 126.0, 10, 'cartao_credito', null, 'Sessão', -10, '16:30', 50),
  ('de3a0000-0007-0006-0000-000000000020', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0005-0000-000000000020', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'cartao_credito', null, 'Sessão', -3, '16:30', 50),
  ('de3a0000-0007-0006-0000-000000000024', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0005-0000-000000000024', 'de3a0000-0007-0003-0000-000000000001', 'de3a0000-0007-0001-0000-000000000002', 200.0, 0, 'convenio', 'Unimed Fortaleza', 'Avaliação', -41, '15:00', 60),
  ('de3a0000-0007-0006-0000-000000000025', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0005-0000-000000000025', 'de3a0000-0007-0003-0000-000000000003', 'de3a0000-0007-0001-0000-000000000002', 120.0, 0, 'pix', null, 'Sessão', -34, '15:00', 50),
  ('de3a0000-0007-0006-0000-000000000026', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0005-0000-000000000026', 'de3a0000-0007-0003-0000-000000000003', 'de3a0000-0007-0001-0000-000000000002', 120.0, 0, 'cartao_debito', null, 'Sessão', -27, '15:00', 50),
  ('de3a0000-0007-0006-0000-000000000027', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0005-0000-000000000027', 'de3a0000-0007-0003-0000-000000000003', 'de3a0000-0007-0001-0000-000000000002', 120.0, 0, 'pix', null, 'Sessão', -20, '15:00', 50),
  ('de3a0000-0007-0006-0000-000000000029', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0005-0000-000000000029', 'de3a0000-0007-0003-0000-000000000003', 'de3a0000-0007-0001-0000-000000000002', 120.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -6, '15:00', 50),
  ('de3a0000-0007-0006-0000-000000000033', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0005-0000-000000000033', 'de3a0000-0007-0003-0000-000000000001', 'de3a0000-0007-0001-0000-000000000002', 200.0, 0, 'cartao_credito', null, 'Avaliação', -35, '14:00', 60),
  ('de3a0000-0007-0006-0000-000000000034', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0005-0000-000000000034', 'de3a0000-0007-0003-0000-000000000003', 'de3a0000-0007-0001-0000-000000000002', 120.0, 0, 'pix', null, 'Sessão', -28, '14:00', 50),
  ('de3a0000-0007-0006-0000-000000000035', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0005-0000-000000000035', 'de3a0000-0007-0003-0000-000000000003', 'de3a0000-0007-0001-0000-000000000002', 108.0, 10, 'dinheiro', null, 'Sessão', -21, '14:00', 50),
  ('de3a0000-0007-0006-0000-000000000036', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0005-0000-000000000036', 'de3a0000-0007-0003-0000-000000000003', 'de3a0000-0007-0001-0000-000000000002', 120.0, 0, 'cartao_credito', null, 'Sessão', -14, '14:00', 50),
  ('de3a0000-0007-0006-0000-000000000037', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0005-0000-000000000037', 'de3a0000-0007-0003-0000-000000000003', 'de3a0000-0007-0001-0000-000000000002', 120.0, 0, 'dinheiro', null, 'Sessão', -7, '14:00', 50),
  ('de3a0000-0007-0006-0000-000000000041', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0005-0000-000000000041', 'de3a0000-0007-0003-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 200.0, 0, 'cartao_debito', null, 'Avaliação', -25, '17:00', 60),
  ('de3a0000-0007-0006-0000-000000000042', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0005-0000-000000000042', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'pix', null, 'Sessão', -18, '17:00', 50),
  ('de3a0000-0007-0006-0000-000000000044', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0005-0000-000000000044', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'cartao_debito', null, 'Sessão', -4, '17:00', 50),
  ('de3a0000-0007-0006-0000-000000000048', 'de3a0000-0007-0002-0000-000000000007', 'de3a0000-0007-0005-0000-000000000048', 'de3a0000-0007-0003-0000-000000000001', 'de3a0000-0007-0001-0000-000000000002', 200.0, 0, 'dinheiro', null, 'Avaliação', -35, '08:00', 60),
  ('de3a0000-0007-0006-0000-000000000049', 'de3a0000-0007-0002-0000-000000000007', 'de3a0000-0007-0005-0000-000000000049', 'de3a0000-0007-0003-0000-000000000004', 'de3a0000-0007-0001-0000-000000000002', 234.0, 10, 'cartao_debito', null, 'Pacote', -21, '13:00', 40),
  ('de3a0000-0007-0006-0000-000000000050', 'de3a0000-0007-0002-0000-000000000007', 'de3a0000-0007-0005-0000-000000000050', 'de3a0000-0007-0003-0000-000000000003', 'de3a0000-0007-0001-0000-000000000002', 120.0, 0, 'pix', null, 'Sessão', -10, '14:00', 50),
  ('de3a0000-0007-0006-0000-000000000052', 'de3a0000-0007-0002-0000-000000000008', 'de3a0000-0007-0005-0000-000000000052', 'de3a0000-0007-0003-0000-000000000001', 'de3a0000-0007-0001-0000-000000000001', 200.0, 0, 'pix', null, 'Avaliação', -21, '11:00', 60),
  ('de3a0000-0007-0006-0000-000000000053', 'de3a0000-0007-0002-0000-000000000008', 'de3a0000-0007-0005-0000-000000000053', 'de3a0000-0007-0003-0000-000000000002', 'de3a0000-0007-0001-0000-000000000001', 140.0, 0, 'pix', null, 'Sessão', -14, '11:00', 50)
) as v(id, pat, appt, proc, prof, total, disc, pm, conv, cat, d, t, dur)
on conflict (id) do nothing;

-- 8. Despesas da área (3); aluguel e folha já existem na clínica, não são repetidos
insert into public.financial_records (id, clinic_id, total_amount, discount_percent, payment_method, type, category, notes, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.amt::numeric, 0, v.pm, 'despesa', v.cat, v.note, '[]'::jsonb, v.at::timestamptz
from (values
  ('de3a0000-0007-0006-0000-000000000901', 820.0, 'cartao_credito', 'Material', 'Massinhas, tatames e brinquedos sensoriais', now() - interval '16 days'),
  ('de3a0000-0007-0006-0000-000000000902', 1150.0, 'pix', 'Equipamento', 'Balanço terapêutico de teto', now() - interval '37 days'),
  ('de3a0000-0007-0006-0000-000000000903', 380.0, 'pix', 'Marketing', 'Palestra para pais sobre integração sensorial', now() - interval '62 days')
) as v(id, amt, pm, cat, note, at)
on conflict (id) do nothing;

-- 9. Prontuários (8): anamnese e exame clínico namespaced por área ("to"), chaves reais de specialtyConfig.tsx
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.medical_records (id, clinic_id, patient_id, anamnesis, clinical_exam, treatment_plan, odontogram, treatment_plan_items, created_at, updated_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.anam, v.exam, v.tp, v.odo, v.items,
       ((m.monday + v.d1::int + v.t1::time) at time zone 'America/Sao_Paulo'),
       ((m.monday + v.d2::int + v.t2::time) at time zone 'America/Sao_Paulo')
from m
cross join (values
  ('de3a0000-0007-0007-0000-000000000001', 'de3a0000-0007-0002-0000-000000000001', $j${"to":{"a-queixa":"Evita texturas, incomoda-se com barulhos e tem muitas crises na escola","a-rotina":"Rotina rígida; dificuldade nas transições, higiene e vestir roupas","a-marcos":"Atraso na fala; andou aos 15 meses","a-perfil_sensorial":"Hipersensível a som e toque; busca movimento e balanço","a-escola_trabalho":"Pré-escola com mediadora","a-autonomia":"Precisa de ajuda para vestir e se alimentar","a-diagnosticos":"Transtorno do Espectro Autista (nível 2 de suporte)","a-outras_terapias":"Fonoaudiologia e psicologia"}}$j$::jsonb, $j${"to":{"e-orteses":"Não utiliza órtese ou adaptação no momento","e-avds":"Alimenta-se com ajuda parcial; veste-se com ajuda","e-coord_fina":"Preensão em pinça com imprecisão","e-coord_grossa":"Boa, com busca por movimento","e-perfil_sensorial":"Hiper-responsividade tátil e auditiva; hipo-responsividade vestibular","e-cognicao":"Atenção compartilhada reduzida","e-participacao":"Brinca ao lado dos pares, pouca interação","e-obs":"Elaborada dieta sensorial para casa e escola."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -38, '15:30', -3, '15:30'),
  ('de3a0000-0007-0007-0000-000000000002', 'de3a0000-0007-0002-0000-000000000002', $j${"to":{"a-queixa":"Letra ilegível, derruba objetos com frequência e se distrai com facilidade","a-rotina":"Demora nas tarefas de casa e em se arrumar","a-marcos":"Engatinhou tarde; andou aos 14 meses","a-perfil_sensorial":"Procura movimento intenso; evita atividades de precisão","a-escola_trabalho":"3º ano; dificuldade na escrita","a-autonomia":"Independente, com lentidão para vestir e amarrar sapatos","a-diagnosticos":"TDAH em investigação","a-outras_terapias":"Psicopedagogia"}}$j$::jsonb, $j${"to":{"e-orteses":"Não utiliza órtese ou adaptação no momento","e-avds":"Autonomia preservada, com lentidão","e-coord_fina":"Preensão imatura, pressão excessiva no lápis","e-coord_grossa":"Dificuldade em saltar alternando os pés","e-perfil_sensorial":"Busca vestibular e proprioceptiva","e-cognicao":"Atenção sustentada reduzida","e-participacao":"Boa interação social","e-obs":"Prioridade: coordenação motora fina e grafomotricidade."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -34, '14:30', -6, '14:30'),
  ('de3a0000-0007-0007-0000-000000000003', 'de3a0000-0007-0002-0000-000000000003', $j${"to":{"a-queixa":"Atraso no desenvolvimento motor e quedas frequentes","a-rotina":"Rotina estável, frequenta creche","a-marcos":"Sentou aos 9 meses, andou aos 20 meses","a-perfil_sensorial":"Sem queixas sensoriais marcantes","a-escola_trabalho":"Creche em período integral","a-autonomia":"Em fase de desfralde","a-diagnosticos":"Atraso do desenvolvimento neuropsicomotor leve","a-outras_terapias":"Fisioterapia"}}$j$::jsonb, $j${"to":{"e-orteses":"Não utiliza órtese ou adaptação no momento","e-avds":"Come sozinho com colher; veste-se com ajuda","e-coord_fina":"Empilha 4 cubos, imprecisão na pinça","e-coord_grossa":"Marcha com base alargada, dificuldade em escadas","e-perfil_sensorial":"Dentro do esperado","e-cognicao":"Atenção e imitação adequadas","e-participacao":"Brinca com outras crianças","e-obs":"Trabalho conjunto com fisioterapia."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -17, '16:30', -3, '16:30'),
  ('de3a0000-0007-0007-0000-000000000004', 'de3a0000-0007-0002-0000-000000000004', $j${"to":{"a-queixa":"Dificuldade para se vestir, comer e usar a mão direita após AVC","a-rotina":"Depende da esposa para banho e vestuário","a-marcos":"Não se aplica","a-perfil_sensorial":"Hipoestesia em mão direita","a-escola_trabalho":"Aposentado; antes comerciante","a-autonomia":"Semidependente nas AVDs","a-diagnosticos":"AVC isquêmico há 4 meses, hemiparesia direita","a-outras_terapias":"Fisioterapia neurológica e fonoaudiologia"}}$j$::jsonb, $j${"to":{"e-orteses":"Utiliza tala de repouso noturna; engrossadores de talheres sugeridos","e-avds":"Come com adaptação, necessita ajuda para banho e abotoar","e-coord_fina":"Pinça direita fraca e lenta","e-coord_grossa":"Marcha com bengala","e-perfil_sensorial":"Sensibilidade tátil diminuída em dedos da mão direita","e-cognicao":"Preservada; planejamento motor lentificado","e-participacao":"Motivado, retraído em ambientes sociais","e-obs":"Meta: independência para alimentação e vestuário em 10 semanas."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -41, '15:00', -6, '15:00'),
  ('de3a0000-0007-0007-0000-000000000005', 'de3a0000-0007-0002-0000-000000000005', $j${"to":{"a-queixa":"Tremor e lentidão que dificultam comer, escrever e se vestir","a-rotina":"Rotina estável com ajuda da filha","a-perfil_sensorial":"Sem alterações","a-escola_trabalho":"Aposentada","a-autonomia":"Independente com dificuldade; risco de quedas","a-diagnosticos":"Doença de Parkinson há 6 anos","a-outras_terapias":"Fisioterapia"}}$j$::jsonb, $j${"to":{"e-orteses":"Sugerido copo com tampa e punho adaptado","e-avds":"Come com tremor; precisa de tempo extra para vestir","e-coord_fina":"Micrografia e tremor de repouso","e-coord_grossa":"Marcha com passos curtos","e-cognicao":"Preservada","e-participacao":"Mantém atividades religiosas e familiares","e-obs":"Orientada a organizar a casa para reduzir risco de quedas."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -35, '14:00', -7, '14:00'),
  ('de3a0000-0007-0007-0000-000000000006', 'de3a0000-0007-0002-0000-000000000006', $j${"to":{"a-queixa":"Escrita lenta, letra irregular e cansaço ao copiar do quadro","a-rotina":"Evita tarefas escritas","a-marcos":"Normais","a-perfil_sensorial":"Sem queixas relevantes","a-escola_trabalho":"5º ano, bom rendimento oral","a-autonomia":"Plenamente independente","a-diagnosticos":"Disgrafia em investigação","a-outras_terapias":"Reforço escolar"}}$j$::jsonb, $j${"to":{"e-orteses":"Não utiliza órtese ou adaptação no momento","e-avds":"Independente","e-coord_fina":"Preensão em tripé dinâmico com tensão excessiva","e-coord_grossa":"Adequada","e-cognicao":"Bom raciocínio; fadiga na escrita","e-participacao":"Participativa nas aulas orais","e-obs":"Sugeridas adaptações: mais tempo e uso de pauta ampliada."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -25, '17:00', -4, '17:00'),
  ('de3a0000-0007-0007-0000-000000000007', 'de3a0000-0007-0002-0000-000000000007', $j${"to":{"a-queixa":"Lesão de tendão flexor na mão direita após acidente de trabalho","a-rotina":"Afastado do trabalho; dificuldade para segurar objetos","a-perfil_sensorial":"Sensibilidade preservada","a-escola_trabalho":"Mecânico; precisa de preensão forte","a-autonomia":"Independente, com limitação funcional","a-diagnosticos":"Reparo de tendão flexor zona II há 3 semanas","a-outras_terapias":"Fisioterapia da mão"}}$j$::jsonb, $j${"to":{"e-orteses":"Órtese dorsal de bloqueio confeccionada em termoplástico","e-avds":"Independente com mão esquerda; direita apenas apoio","e-coord_fina":"Preensão direita limitada","e-coord_grossa":"Preservada","e-participacao":"Ansioso quanto ao retorno ao trabalho","e-obs":"Protocolo de mobilização precoce com orientação do cirurgião."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -35, '08:00', -10, '14:00'),
  ('de3a0000-0007-0007-0000-000000000008', 'de3a0000-0007-0002-0000-000000000008', $j${"to":{"a-queixa":"Recusa muitos alimentos pela textura e se incomoda com etiquetas de roupa","a-rotina":"Refeições longas e conflituosas","a-marcos":"Normais","a-perfil_sensorial":"Hipersensibilidade oral e tátil","a-escola_trabalho":"1º ano, adaptada","a-autonomia":"Independente nas AVDs, exceto alimentação","a-diagnosticos":"Seletividade alimentar de origem sensorial","a-outras_terapias":"Nutrição"}}$j$::jsonb, $j${"to":{"e-orteses":"Não utiliza órtese ou adaptação no momento","e-avds":"Alimenta-se sozinha, repertório de 12 alimentos","e-coord_fina":"Adequada","e-coord_grossa":"Adequada","e-perfil_sensorial":"Hiper-responsividade oral e tátil","e-participacao":"Evita festas com comida","e-obs":"Abordagem lúdica de exposição gradual a texturas."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -21, '11:00', -14, '11:00')
) as v(id, pat, anam, exam, tp, odo, items, d1, t1, d2, t2)
on conflict (id) do nothing;

-- 10. Evoluções no prontuário (16); author_name = profissional que atendeu, professional_id preenchido
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.record_entries (id, clinic_id, patient_id, record_id, author_name, professional_id, entry_text, entry_type, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.rec::uuid, v.author, v.prof::uuid, v.txt, 'evolucao',
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0007-0008-0000-000000000001', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0007-0000-000000000001', 'Dra. Natália Cruz Bezerra', 'de3a0000-0007-0001-0000-000000000001', 'Avaliação ocupacional e perfil sensorial. Iniciada integração sensorial com balanço, circuito e brincadeiras táteis.', -38, '15:30', 60),
  ('de3a0000-0007-0008-0000-000000000002', 'de3a0000-0007-0002-0000-000000000001', 'de3a0000-0007-0007-0000-000000000001', 'Dra. Natália Cruz Bezerra', 'de3a0000-0007-0001-0000-000000000001', 'Tolerância maior a texturas e transições. Escola relata menos crises; dieta sensorial mantida.', -3, '15:30', 50),
  ('de3a0000-0007-0008-0000-000000000003', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0007-0000-000000000002', 'Dra. Natália Cruz Bezerra', 'de3a0000-0007-0001-0000-000000000001', 'Avaliação: coordenação motora fina imatura e busca por estímulo proprioceptivo. Iniciado treino grafomotor com atividades sensoriais.', -34, '14:30', 60),
  ('de3a0000-0007-0008-0000-000000000004', 'de3a0000-0007-0002-0000-000000000002', 'de3a0000-0007-0007-0000-000000000002', 'Dra. Natália Cruz Bezerra', 'de3a0000-0007-0001-0000-000000000001', 'Pressão no lápis reduzida; letra mais legível em 3 linhas consecutivas. Mantidos exercícios de preensão.', -6, '14:30', 50),
  ('de3a0000-0007-0008-0000-000000000005', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0007-0000-000000000003', 'Dra. Natália Cruz Bezerra', 'de3a0000-0007-0001-0000-000000000001', 'Avaliação do desenvolvimento motor e das AVDs. Iniciada estimulação motora fina e planejamento motor por meio de brincadeiras.', -17, '16:30', 60),
  ('de3a0000-0007-0008-0000-000000000006', 'de3a0000-0007-0002-0000-000000000003', 'de3a0000-0007-0007-0000-000000000003', 'Dra. Natália Cruz Bezerra', 'de3a0000-0007-0001-0000-000000000001', 'Empilha 6 cubos e usa pinça com mais precisão. Em treino de escadas com apoio.', -3, '16:30', 50),
  ('de3a0000-0007-0008-0000-000000000007', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0007-0000-000000000004', 'Dr. Ícaro Matos Feitosa', 'de3a0000-0007-0001-0000-000000000002', 'Avaliação funcional. Iniciado treino de AVDs com adaptações: talheres engrossados, velcro e tábua de corte.', -41, '15:00', 60),
  ('de3a0000-0007-0008-0000-000000000008', 'de3a0000-0007-0002-0000-000000000004', 'de3a0000-0007-0007-0000-000000000004', 'Dr. Ícaro Matos Feitosa', 'de3a0000-0007-0001-0000-000000000002', 'Alimenta-se sozinho com talher adaptado e abotoa camisa em 3 minutos. Iniciado treino de higiene.', -6, '15:00', 50),
  ('de3a0000-0007-0008-0000-000000000009', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0007-0000-000000000005', 'Dr. Ícaro Matos Feitosa', 'de3a0000-0007-0001-0000-000000000002', 'Avaliação ocupacional. Treino de AVDs com estratégias de pistas visuais e adaptações para alimentação.', -35, '14:00', 60),
  ('de3a0000-0007-0008-0000-000000000010', 'de3a0000-0007-0002-0000-000000000005', 'de3a0000-0007-0007-0000-000000000005', 'Dr. Ícaro Matos Feitosa', 'de3a0000-0007-0001-0000-000000000002', 'Melhora na autonomia para vestir. Casa avaliada: retirados tapetes e instaladas barras no banheiro.', -7, '14:00', 50),
  ('de3a0000-0007-0008-0000-000000000011', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0007-0000-000000000006', 'Dra. Natália Cruz Bezerra', 'de3a0000-0007-0001-0000-000000000001', 'Avaliação ocupacional: disgrafia motora com fadiga. Iniciado treino de preensão e fortalecimento intrínseco da mão.', -25, '17:00', 60),
  ('de3a0000-0007-0008-0000-000000000012', 'de3a0000-0007-0002-0000-000000000006', 'de3a0000-0007-0007-0000-000000000006', 'Dra. Natália Cruz Bezerra', 'de3a0000-0007-0001-0000-000000000001', 'Escrita mais fluida e menos cansaço. Escola adotou pauta ampliada e tempo extra.', -4, '17:00', 50),
  ('de3a0000-0007-0008-0000-000000000013', 'de3a0000-0007-0002-0000-000000000007', 'de3a0000-0007-0007-0000-000000000007', 'Dr. Ícaro Matos Feitosa', 'de3a0000-0007-0001-0000-000000000002', 'Avaliação e confecção de órtese dorsal de bloqueio em termoplástico; orientações de uso e mobilização.', -35, '08:00', 60),
  ('de3a0000-0007-0008-0000-000000000014', 'de3a0000-0007-0002-0000-000000000007', 'de3a0000-0007-0007-0000-000000000007', 'Dr. Ícaro Matos Feitosa', 'de3a0000-0007-0001-0000-000000000002', 'Órtese ajustada, sem pontos de pressão. Iniciada mobilização ativa protegida conforme protocolo.', -10, '14:00', 50),
  ('de3a0000-0007-0008-0000-000000000015', 'de3a0000-0007-0002-0000-000000000008', 'de3a0000-0007-0007-0000-000000000008', 'Dra. Natália Cruz Bezerra', 'de3a0000-0007-0001-0000-000000000001', 'Avaliação do perfil sensorial. Iniciadas brincadeiras com texturas fora da refeição e exploração oral gradual.', -21, '11:00', 60),
  ('de3a0000-0007-0008-0000-000000000016', 'de3a0000-0007-0002-0000-000000000008', 'de3a0000-0007-0007-0000-000000000008', 'Dra. Natália Cruz Bezerra', 'de3a0000-0007-0001-0000-000000000001', 'Experimentou 2 novos alimentos em sessão e aceitou etiquetas cortadas. Orientações para refeições sem pressão.', -14, '11:00', 50)
) as v(id, pat, rec, author, prof, txt, d, t, dur)
on conflict (id) do nothing;

-- Verificação (contagens esperadas em docs/demo-seed-video123.md)
select 'professionals' as tabela, count(*) as linhas from public.professionals where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0001-%'
union all
select 'patients' as tabela, count(*) as linhas from public.patients where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0002-%'
union all
select 'procedures' as tabela, count(*) as linhas from public.procedures where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0003-%'
union all
select 'stock_items' as tabela, count(*) as linhas from public.stock_items where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0004-%'
union all
select 'stock_movements' as tabela, count(*) as linhas from public.stock_movements where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0009-%'
union all
select 'appointments' as tabela, count(*) as linhas from public.appointments where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0005-%'
union all
select 'financial_records' as tabela, count(*) as linhas from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0006-%'
union all
select 'medical_records' as tabela, count(*) as linhas from public.medical_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0007-%'
union all
select 'record_entries' as tabela, count(*) as linhas from public.record_entries where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0008-%'
order by 1;

commit;

-- =============================================================================
-- ROLLBACK (descomente tudo, de "begin" a "commit", e rode inteiro).
-- Apaga só o que este arquivo criou: clinic_id da demo + ids com o prefixo de3a0000-0007-.
-- Ordem respeita as FKs (receitas e comissões -> evoluções -> prontuários -> consultas -> estoque -> procedimentos -> pacientes -> profissionais).
-- =============================================================================
-- begin;
-- delete from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0006-%';
-- delete from public.record_entries    where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0008-%';
-- delete from public.medical_records   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0007-%';
-- delete from public.appointments      where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0005-%';
-- delete from public.stock_movements   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0009-%';
-- delete from public.stock_items       where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0004-%';
-- delete from public.procedures        where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0003-%';
-- delete from public.patients          where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0002-%';
-- delete from public.professionals     where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0007-0001-%';
-- commit;
