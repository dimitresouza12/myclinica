-- =============================================================================
-- Seed demo video123 | área: Medicina (medico) | arquivo 08-medico.sql
-- =============================================================================
-- Insere SOMENTE na clínica demo (clinic_id 3916d37d-b247-485e-bd2f-b47be8d44207).
-- Convenção de IDs determinísticos: de3a0000-0008-<tabela>-0000-<seq>
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

-- 1. Profissionais (4), sem login (clinic_user_id nulo)
insert into public.professionals (id, clinic_id, name, specialty, specialty_type, default_duration_minutes, registration_number, created_at)
values
  ('de3a0000-0008-0001-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dr. Alexandre Fontenele Braga', 'Clínico Geral', 'medico', 30, 'CRM-CE 15823', now() - interval '208 days'),
  ('de3a0000-0008-0001-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dra. Renata Sobral Lima', 'Cardiologia', 'medico', 30, 'CRM-CE 17240', now() - interval '206 days'),
  ('de3a0000-0008-0001-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dr. André Luís Maia', 'Pediatria', 'medico', 30, 'CRM-CE 16092', now() - interval '204 days'),
  ('de3a0000-0008-0001-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dra. Fernanda Teixeira Rocha', 'Ginecologia', 'medico', 30, 'CRM-CE 14377', now() - interval '202 days')
on conflict (id) do nothing;

-- 2. Pacientes (10): CPF e RG ficam nulos de propósito; is_active/registration_status usam o default
insert into public.patients (id, clinic_id, name, phone, email, birth_date, gender, address, occupation, emergency_contact, referred_by,
  notes, pet_name, pet_species, pet_breed, pet_weight, pet_age, pet_coat, pet_neutered, convenio, convenio_carteirinha, lgpd_consent, lgpd_consent_at, created_at, updated_at)
values
  ('de3a0000-0008-0002-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Francisco das Chagas Moura', '(85) 90000-8001', 'francisco.moura@example.com', '1962-03-24', 'Masculino', 'Rua Pereira Filgueiras, 410 - Centro, Fortaleza/CE', 'Aposentado', null, 'Indicação de familiar', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 321654 9870', true, now() - interval '97 days', now() - interval '97 days', now() - interval '97 days'),
  ('de3a0000-0008-0002-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Antônia Valéria Sena', '(85) 90000-8002', 'antonia.sena@example.com', '1970-08-17', 'Feminino', 'Rua Antônio Augusto, 1100 - Meireles, Fortaleza/CE', 'Professora', null, 'Encaminhamento do clínico geral', null, null, null, null, null, null, null, null, 'Hapvida', '3300 5566 7788', true, now() - interval '94 days', now() - interval '94 days', now() - interval '94 days'),
  ('de3a0000-0008-0002-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Roberto Cavalcante Filho', '(85) 90000-8003', 'roberto.cavalcante@example.com', '1957-02-10', 'Masculino', 'Rua Guilherme Rocha, 300 - Centro, Fortaleza/CE', 'Comerciante', null, 'Já era paciente', null, null, null, null, null, null, null, null, null, null, true, now() - interval '91 days', now() - interval '91 days', now() - interval '91 days'),
  ('de3a0000-0008-0002-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Júlia Marques Alencar', '(85) 90000-8004', 'julia.alencar@example.com', '2019-04-18', 'Feminino', 'Rua Nunes Valente, 560 - Aldeota, Fortaleza/CE', 'Criança', 'Mãe: Patrícia Alencar (responsável)', 'Indicação da escola', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 909090 1212', true, now() - interval '88 days', now() - interval '88 days', now() - interval '88 days'),
  ('de3a0000-0008-0002-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Samuel Ribeiro Matos', '(85) 90000-8005', 'samuel.matos@example.com', '2024-09-03', 'Masculino', 'Rua Padre Mororó, 1020 - Cocó, Fortaleza/CE', 'Criança', 'Mãe: Juliana Matos (responsável)', 'Indicação da maternidade', null, null, null, null, null, null, null, null, null, null, true, now() - interval '85 days', now() - interval '85 days', now() - interval '85 days'),
  ('de3a0000-0008-0002-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Camila Ferreira Brandão', '(85) 90000-8006', 'camila.brandao@example.com', '1993-06-02', 'Feminino', 'Rua Torres Câmara, 150 - Aldeota, Fortaleza/CE', 'Arquiteta', null, 'Indicação de amiga', null, null, null, null, null, null, null, null, 'Bradesco Saúde', '8800 4455 1100', true, now() - interval '82 days', now() - interval '82 days', now() - interval '82 days'),
  ('de3a0000-0008-0002-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Débora Lima Siqueira', '(85) 90000-8007', 'debora.siqueira@example.com', '1988-11-14', 'Feminino', 'Rua Barão de Studart, 1800 - Aldeota, Fortaleza/CE', 'Advogada', null, 'Instagram', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 445500 6677', true, now() - interval '79 days', now() - interval '79 days', now() - interval '79 days'),
  ('de3a0000-0008-0002-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Osvaldo Pereira Neto', '(85) 90000-8008', 'osvaldo.neto@example.com', '1975-01-08', 'Masculino', 'Av. Santos Dumont, 2400 - Aldeota, Fortaleza/CE', 'Gerente de logística', null, 'Indicação do trabalho', null, null, null, null, null, null, null, null, 'Hapvida', '3300 7766 2211', true, now() - interval '76 days', now() - interval '76 days', now() - interval '76 days'),
  ('de3a0000-0008-0002-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Tereza Cristina Ávila', '(85) 90000-8009', 'tereza.avila@example.com', '1981-05-29', 'Feminino', 'Rua Silva Paulet, 700 - Aldeota, Fortaleza/CE', 'Gerente de banco', null, 'Indicação de amiga', null, null, null, null, null, null, null, null, null, null, true, now() - interval '73 days', now() - interval '73 days', now() - interval '73 days'),
  ('de3a0000-0008-0002-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Murilo Antunes Gouveia', '(85) 90000-8010', 'murilo.gouveia@example.com', '1999-09-19', 'Masculino', 'Rua Gonçalves Ledo, 120 - Centro, Fortaleza/CE', 'Cozinheiro', null, 'Passou em frente à clínica', null, null, null, null, null, null, null, null, null, null, true, now() - interval '70 days', now() - interval '70 days', now() - interval '70 days')
on conflict (id) do nothing;

-- 3. Procedimentos (14): nomes/categorias de procedureSuggestions de specialtyConfig.tsx
insert into public.procedures (id, clinic_id, name, price, category, is_active, is_free, created_at)
values
  ('de3a0000-0008-0003-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Consulta Médica', 250, 'Consulta', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Retorno', 120, 'Consulta', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Exame de Rotina', 180, 'Exame', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Eletrocardiograma', 120, 'Exame', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Pequena Cirurgia', 600, 'Cirurgia', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Sutura', 220, 'Procedimento', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Aplicação de Vacina', 90, 'Vacinação', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Curativo', 70, 'Procedimento', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Ultrassonografia Abdominal Total', 220, 'Radiologia', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Ultrassonografia Transvaginal', 200, 'Radiologia', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000011', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Ultrassonografia Obstétrica', 230, 'Radiologia', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000012', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Ultrassonografia de Tireoide', 180, 'Radiologia', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000013', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Consulta de Pré-Natal', 220, 'Consulta', true, false, now() - interval '150 days'),
  ('de3a0000-0008-0003-0000-000000000014', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Vídeo Colposcopia', 260, 'Exame', true, false, now() - interval '150 days')
on conflict (id) do nothing;

-- 4. Estoque (7 itens; categorias = slugs de stockCategories)
insert into public.stock_items (id, clinic_id, name, category, unit, quantity, min_quantity, cost_price, supplier, is_active, created_at, updated_at)
values
  ('de3a0000-0008-0004-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Luvas de procedimento (caixa 100)', 'descartavel', 'cx', 12, 8, 31.0, 'MedPrime Hospitalar', true, now() - interval '120 days', now() - interval '5 days'),
  ('de3a0000-0008-0004-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Gaze estéril (pacote com 10)', 'descartavel', 'pct', 40, 20, 3.8, 'MedPrime Hospitalar', true, now() - interval '120 days', now() - interval '7 days'),
  ('de3a0000-0008-0004-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Soro fisiológico 0,9% (500 ml)', 'medicamento', 'un', 24, 10, 6.5, 'FarmaHosp Distribuidora', true, now() - interval '120 days', now() - interval '9 days'),
  ('de3a0000-0008-0004-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Gel para ultrassom (frasco 250 g)', 'material', 'un', 9, 4, 14.0, 'MedPrime Hospitalar', true, now() - interval '120 days', now() - interval '11 days'),
  ('de3a0000-0008-0004-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Eletrodos de ECG (pacote com 50)', 'descartavel', 'pct', 6, 3, 38.0, 'CardioSupply', true, now() - interval '120 days', now() - interval '13 days'),
  ('de3a0000-0008-0004-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Fio de sutura nylon 4-0 (caixa)', 'material', 'cx', 5, 3, 72.0, 'MedPrime Hospitalar', true, now() - interval '120 days', now() - interval '15 days'),
  ('de3a0000-0008-0004-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Esfigmomanômetro aneroide', 'equipamento', 'un', 3, 1, 89.0, 'CardioSupply', true, now() - interval '120 days', now() - interval '17 days')
on conflict (id) do nothing;

-- 5. Movimentações de estoque (14); a quantidade atual do item já considera as saídas
insert into public.stock_movements (id, clinic_id, item_id, type, quantity, reason, user_name, created_at)
values
  ('de3a0000-0008-0009-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000001', 'entrada', 24, 'Compra de reposicao', 'Dr. Alexandre Fontenele Braga', now() - interval '61 days'),
  ('de3a0000-0008-0009-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000001', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Fernanda Teixeira Rocha', now() - interval '13 days'),
  ('de3a0000-0008-0009-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000002', 'entrada', 52, 'Compra de reposicao', 'Dr. Alexandre Fontenele Braga', now() - interval '62 days'),
  ('de3a0000-0008-0009-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000002', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Fernanda Teixeira Rocha', now() - interval '14 days'),
  ('de3a0000-0008-0009-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000003', 'entrada', 36, 'Compra de reposicao', 'Dr. Alexandre Fontenele Braga', now() - interval '63 days'),
  ('de3a0000-0008-0009-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000003', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Fernanda Teixeira Rocha', now() - interval '15 days'),
  ('de3a0000-0008-0009-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000004', 'entrada', 21, 'Compra de reposicao', 'Dr. Alexandre Fontenele Braga', now() - interval '64 days'),
  ('de3a0000-0008-0009-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000004', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Fernanda Teixeira Rocha', now() - interval '16 days'),
  ('de3a0000-0008-0009-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000005', 'entrada', 18, 'Compra de reposicao', 'Dr. Alexandre Fontenele Braga', now() - interval '65 days'),
  ('de3a0000-0008-0009-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000005', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Fernanda Teixeira Rocha', now() - interval '17 days'),
  ('de3a0000-0008-0009-0000-000000000011', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000006', 'entrada', 17, 'Compra de reposicao', 'Dr. Alexandre Fontenele Braga', now() - interval '66 days'),
  ('de3a0000-0008-0009-0000-000000000012', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000006', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Fernanda Teixeira Rocha', now() - interval '18 days'),
  ('de3a0000-0008-0009-0000-000000000013', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000007', 'entrada', 15, 'Compra de reposicao', 'Dr. Alexandre Fontenele Braga', now() - interval '67 days'),
  ('de3a0000-0008-0009-0000-000000000014', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0008-0004-0000-000000000007', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Fernanda Teixeira Rocha', now() - interval '19 days')
on conflict (id) do nothing;

-- 6. Consultas (37): passado = concluído/faltou/cancelado; semanas 0..2 = hoje e futuro.
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
  ('de3a0000-0008-0005-0000-000000000001', 'de3a0000-0008-0002-0000-000000000001', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000001', 'Consulta Médica', 250, 'concluido', -47, '13:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000002', 'de3a0000-0008-0002-0000-000000000001', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000003', 'Exame de Rotina', 180, 'concluido', -39, '15:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000003', 'de3a0000-0008-0002-0000-000000000001', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'concluido', -35, '10:30', 20, null),
  ('de3a0000-0008-0005-0000-000000000004', 'de3a0000-0008-0002-0000-000000000001', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'confirmado', 8, '09:30', 20, 'Resultados do controle glicêmico'),
  ('de3a0000-0008-0005-0000-000000000005', 'de3a0000-0008-0002-0000-000000000002', 'de3a0000-0008-0001-0000-000000000002', 'de3a0000-0008-0003-0000-000000000001', 'Consulta Médica', 250, 'concluido', -42, '08:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000006', 'de3a0000-0008-0002-0000-000000000002', 'de3a0000-0008-0001-0000-000000000002', 'de3a0000-0008-0003-0000-000000000004', 'Eletrocardiograma', 120, 'concluido', -20, '13:30', 20, null),
  ('de3a0000-0008-0005-0000-000000000007', 'de3a0000-0008-0002-0000-000000000002', 'de3a0000-0008-0001-0000-000000000002', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'faltou', -6, '11:30', 20, null),
  ('de3a0000-0008-0005-0000-000000000008', 'de3a0000-0008-0002-0000-000000000002', 'de3a0000-0008-0001-0000-000000000002', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'confirmado', 18, '08:30', 20, null),
  ('de3a0000-0008-0005-0000-000000000009', 'de3a0000-0008-0002-0000-000000000003', 'de3a0000-0008-0001-0000-000000000002', 'de3a0000-0008-0003-0000-000000000001', 'Consulta Médica', 250, 'concluido', -52, '11:30', 30, null),
  ('de3a0000-0008-0005-0000-000000000010', 'de3a0000-0008-0002-0000-000000000003', 'de3a0000-0008-0001-0000-000000000002', 'de3a0000-0008-0003-0000-000000000004', 'Eletrocardiograma', 120, 'concluido', -41, '16:30', 20, null),
  ('de3a0000-0008-0005-0000-000000000011', 'de3a0000-0008-0002-0000-000000000003', 'de3a0000-0008-0001-0000-000000000002', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'faltou', -5, '09:00', 20, 'Não compareceu; a recepção tentou contato.'),
  ('de3a0000-0008-0005-0000-000000000012', 'de3a0000-0008-0002-0000-000000000003', 'de3a0000-0008-0001-0000-000000000002', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'confirmado', 10, '13:00', 20, 'Revisão da anticoagulação'),
  ('de3a0000-0008-0005-0000-000000000013', 'de3a0000-0008-0002-0000-000000000004', 'de3a0000-0008-0001-0000-000000000003', 'de3a0000-0008-0003-0000-000000000001', 'Consulta Médica', 250, 'concluido', -56, '08:30', 30, null),
  ('de3a0000-0008-0005-0000-000000000014', 'de3a0000-0008-0002-0000-000000000004', 'de3a0000-0008-0001-0000-000000000003', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'concluido', -14, '10:00', 20, null),
  ('de3a0000-0008-0005-0000-000000000015', 'de3a0000-0008-0002-0000-000000000004', 'de3a0000-0008-0001-0000-000000000003', 'de3a0000-0008-0003-0000-000000000007', 'Aplicação de Vacina', 90, 'confirmado', 11, '14:00', 15, 'Reforço vacinal do calendário'),
  ('de3a0000-0008-0005-0000-000000000016', 'de3a0000-0008-0002-0000-000000000005', 'de3a0000-0008-0001-0000-000000000003', 'de3a0000-0008-0003-0000-000000000001', 'Consulta Médica', 250, 'concluido', -41, '11:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000017', 'de3a0000-0008-0002-0000-000000000005', 'de3a0000-0008-0001-0000-000000000003', 'de3a0000-0008-0003-0000-000000000007', 'Aplicação de Vacina', 90, 'concluido', -33, '14:00', 15, null),
  ('de3a0000-0008-0005-0000-000000000018', 'de3a0000-0008-0002-0000-000000000005', 'de3a0000-0008-0001-0000-000000000003', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'faltou', -18, '08:00', 20, null),
  ('de3a0000-0008-0005-0000-000000000019', 'de3a0000-0008-0002-0000-000000000005', 'de3a0000-0008-0001-0000-000000000003', 'de3a0000-0008-0003-0000-000000000001', 'Consulta Médica', 250, 'confirmado', 14, '14:00', 30, 'Puericultura de 26 meses'),
  ('de3a0000-0008-0005-0000-000000000020', 'de3a0000-0008-0002-0000-000000000006', 'de3a0000-0008-0001-0000-000000000004', 'de3a0000-0008-0003-0000-000000000013', 'Consulta de Pré-Natal', 220, 'concluido', -40, '17:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000021', 'de3a0000-0008-0002-0000-000000000006', 'de3a0000-0008-0001-0000-000000000004', 'de3a0000-0008-0003-0000-000000000011', 'Ultrassonografia Obstétrica', 230, 'concluido', -11, '15:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000022', 'de3a0000-0008-0002-0000-000000000006', 'de3a0000-0008-0001-0000-000000000004', 'de3a0000-0008-0003-0000-000000000013', 'Consulta de Pré-Natal', 220, 'concluido', -5, '14:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000023', 'de3a0000-0008-0002-0000-000000000006', 'de3a0000-0008-0001-0000-000000000004', 'de3a0000-0008-0003-0000-000000000013', 'Consulta de Pré-Natal', 220, 'confirmado', 8, '14:30', 30, null),
  ('de3a0000-0008-0005-0000-000000000024', 'de3a0000-0008-0002-0000-000000000007', 'de3a0000-0008-0001-0000-000000000004', 'de3a0000-0008-0003-0000-000000000001', 'Consulta Médica', 250, 'concluido', -25, '08:30', 30, null),
  ('de3a0000-0008-0005-0000-000000000025', 'de3a0000-0008-0002-0000-000000000007', 'de3a0000-0008-0001-0000-000000000004', 'de3a0000-0008-0003-0000-000000000014', 'Vídeo Colposcopia', 260, 'concluido', -17, '15:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000026', 'de3a0000-0008-0002-0000-000000000007', 'de3a0000-0008-0001-0000-000000000004', 'de3a0000-0008-0003-0000-000000000010', 'Ultrassonografia Transvaginal', 200, 'concluido', -3, '17:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000027', 'de3a0000-0008-0002-0000-000000000007', 'de3a0000-0008-0001-0000-000000000004', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'agendado', 11, '15:00', 20, 'Resultado de exames'),
  ('de3a0000-0008-0005-0000-000000000028', 'de3a0000-0008-0002-0000-000000000008', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000001', 'Consulta Médica', 250, 'concluido', -48, '08:30', 30, null),
  ('de3a0000-0008-0005-0000-000000000029', 'de3a0000-0008-0002-0000-000000000008', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000003', 'Exame de Rotina', 180, 'concluido', -42, '09:30', 30, null),
  ('de3a0000-0008-0005-0000-000000000030', 'de3a0000-0008-0002-0000-000000000008', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'concluido', -3, '11:00', 20, null),
  ('de3a0000-0008-0005-0000-000000000031', 'de3a0000-0008-0002-0000-000000000009', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000001', 'Consulta Médica', 250, 'concluido', -35, '08:30', 30, null),
  ('de3a0000-0008-0005-0000-000000000032', 'de3a0000-0008-0002-0000-000000000009', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000009', 'Ultrassonografia Abdominal Total', 220, 'concluido', -28, '13:30', 30, null),
  ('de3a0000-0008-0005-0000-000000000033', 'de3a0000-0008-0002-0000-000000000009', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'agendado', 18, '10:30', 20, null),
  ('de3a0000-0008-0005-0000-000000000034', 'de3a0000-0008-0002-0000-000000000010', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000001', 'Consulta Médica', 250, 'concluido', -45, '17:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000035', 'de3a0000-0008-0002-0000-000000000010', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000006', 'Sutura', 220, 'concluido', -25, '16:00', 30, null),
  ('de3a0000-0008-0005-0000-000000000036', 'de3a0000-0008-0002-0000-000000000010', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000008', 'Curativo', 70, 'concluido', -21, '16:30', 20, null),
  ('de3a0000-0008-0005-0000-000000000037', 'de3a0000-0008-0002-0000-000000000010', 'de3a0000-0008-0001-0000-000000000001', 'de3a0000-0008-0003-0000-000000000002', 'Retorno', 120, 'auto_a', 1, '08:30', 20, 'Retirada de pontos')
) as v(id, pat, prof, proc, pname, price, st, d, t, dur, notes)
cross join lateral (select ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') as ts) x
on conflict (id) do nothing;

-- 7. Receitas (25): uma por consulta concluída (semanas passadas), no valor do procedimento.
-- O gatilho de comissão só gera linhas para beneficiários ativos (hoje o único está inativo).
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.financial_records (id, clinic_id, patient_id, appointment_id, procedure_id, professional_id,
  total_amount, discount_percent, payment_method, convenio, type, category, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.appt::uuid, v.proc::uuid, v.prof::uuid,
       v.total::numeric, v.disc::numeric, v.pm, v.conv, 'receita', v.cat, '[]'::jsonb,
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0008-0006-0000-000000000001', 'de3a0000-0008-0002-0000-000000000001', 'de3a0000-0008-0005-0000-000000000001', 'de3a0000-0008-0003-0000-000000000001', 'de3a0000-0008-0001-0000-000000000001', 250.0, 0, 'convenio', 'Unimed Fortaleza', 'Consulta', -47, '13:00', 30),
  ('de3a0000-0008-0006-0000-000000000002', 'de3a0000-0008-0002-0000-000000000001', 'de3a0000-0008-0005-0000-000000000002', 'de3a0000-0008-0003-0000-000000000003', 'de3a0000-0008-0001-0000-000000000001', 180.0, 0, 'pix', null, 'Exame', -39, '15:00', 30),
  ('de3a0000-0008-0006-0000-000000000003', 'de3a0000-0008-0002-0000-000000000001', 'de3a0000-0008-0005-0000-000000000003', 'de3a0000-0008-0003-0000-000000000002', 'de3a0000-0008-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Consulta', -35, '10:30', 20),
  ('de3a0000-0008-0006-0000-000000000005', 'de3a0000-0008-0002-0000-000000000002', 'de3a0000-0008-0005-0000-000000000005', 'de3a0000-0008-0003-0000-000000000001', 'de3a0000-0008-0001-0000-000000000002', 250.0, 0, 'cartao_credito', null, 'Consulta', -42, '08:00', 30),
  ('de3a0000-0008-0006-0000-000000000006', 'de3a0000-0008-0002-0000-000000000002', 'de3a0000-0008-0005-0000-000000000006', 'de3a0000-0008-0003-0000-000000000004', 'de3a0000-0008-0001-0000-000000000002', 120.0, 0, 'convenio', 'Hapvida', 'Exame', -20, '13:30', 20),
  ('de3a0000-0008-0006-0000-000000000009', 'de3a0000-0008-0002-0000-000000000003', 'de3a0000-0008-0005-0000-000000000009', 'de3a0000-0008-0003-0000-000000000001', 'de3a0000-0008-0001-0000-000000000002', 250.0, 0, 'pix', null, 'Consulta', -52, '11:30', 30),
  ('de3a0000-0008-0006-0000-000000000010', 'de3a0000-0008-0002-0000-000000000003', 'de3a0000-0008-0005-0000-000000000010', 'de3a0000-0008-0003-0000-000000000004', 'de3a0000-0008-0001-0000-000000000002', 120.0, 0, 'pix', null, 'Exame', -41, '16:30', 20),
  ('de3a0000-0008-0006-0000-000000000013', 'de3a0000-0008-0002-0000-000000000004', 'de3a0000-0008-0005-0000-000000000013', 'de3a0000-0008-0003-0000-000000000001', 'de3a0000-0008-0001-0000-000000000003', 250.0, 0, 'pix', null, 'Consulta', -56, '08:30', 30),
  ('de3a0000-0008-0006-0000-000000000014', 'de3a0000-0008-0002-0000-000000000004', 'de3a0000-0008-0005-0000-000000000014', 'de3a0000-0008-0003-0000-000000000002', 'de3a0000-0008-0001-0000-000000000003', 120.0, 0, 'convenio', 'Unimed Fortaleza', 'Consulta', -14, '10:00', 20),
  ('de3a0000-0008-0006-0000-000000000016', 'de3a0000-0008-0002-0000-000000000005', 'de3a0000-0008-0005-0000-000000000016', 'de3a0000-0008-0003-0000-000000000001', 'de3a0000-0008-0001-0000-000000000003', 250.0, 0, 'pix', null, 'Consulta', -41, '11:00', 30),
  ('de3a0000-0008-0006-0000-000000000017', 'de3a0000-0008-0002-0000-000000000005', 'de3a0000-0008-0005-0000-000000000017', 'de3a0000-0008-0003-0000-000000000007', 'de3a0000-0008-0001-0000-000000000003', 90.0, 0, 'pix', null, 'Procedimento', -33, '14:00', 15),
  ('de3a0000-0008-0006-0000-000000000020', 'de3a0000-0008-0002-0000-000000000006', 'de3a0000-0008-0005-0000-000000000020', 'de3a0000-0008-0003-0000-000000000013', 'de3a0000-0008-0001-0000-000000000004', 220.0, 0, 'convenio', 'Bradesco Saúde', 'Consulta', -40, '17:00', 30),
  ('de3a0000-0008-0006-0000-000000000021', 'de3a0000-0008-0002-0000-000000000006', 'de3a0000-0008-0005-0000-000000000021', 'de3a0000-0008-0003-0000-000000000011', 'de3a0000-0008-0001-0000-000000000004', 230.0, 0, 'convenio', 'Bradesco Saúde', 'Exame', -11, '15:00', 30),
  ('de3a0000-0008-0006-0000-000000000022', 'de3a0000-0008-0002-0000-000000000006', 'de3a0000-0008-0005-0000-000000000022', 'de3a0000-0008-0003-0000-000000000013', 'de3a0000-0008-0001-0000-000000000004', 220.0, 0, 'dinheiro', null, 'Consulta', -5, '14:00', 30),
  ('de3a0000-0008-0006-0000-000000000024', 'de3a0000-0008-0002-0000-000000000007', 'de3a0000-0008-0005-0000-000000000024', 'de3a0000-0008-0003-0000-000000000001', 'de3a0000-0008-0001-0000-000000000004', 250.0, 0, 'convenio', 'Unimed Fortaleza', 'Consulta', -25, '08:30', 30),
  ('de3a0000-0008-0006-0000-000000000025', 'de3a0000-0008-0002-0000-000000000007', 'de3a0000-0008-0005-0000-000000000025', 'de3a0000-0008-0003-0000-000000000014', 'de3a0000-0008-0001-0000-000000000004', 260.0, 0, 'convenio', 'Unimed Fortaleza', 'Exame', -17, '15:00', 30),
  ('de3a0000-0008-0006-0000-000000000026', 'de3a0000-0008-0002-0000-000000000007', 'de3a0000-0008-0005-0000-000000000026', 'de3a0000-0008-0003-0000-000000000010', 'de3a0000-0008-0001-0000-000000000004', 200.0, 0, 'pix', null, 'Exame', -3, '17:00', 30),
  ('de3a0000-0008-0006-0000-000000000028', 'de3a0000-0008-0002-0000-000000000008', 'de3a0000-0008-0005-0000-000000000028', 'de3a0000-0008-0003-0000-000000000001', 'de3a0000-0008-0001-0000-000000000001', 250.0, 0, 'pix', null, 'Consulta', -48, '08:30', 30),
  ('de3a0000-0008-0006-0000-000000000029', 'de3a0000-0008-0002-0000-000000000008', 'de3a0000-0008-0005-0000-000000000029', 'de3a0000-0008-0003-0000-000000000003', 'de3a0000-0008-0001-0000-000000000001', 180.0, 0, 'cartao_credito', null, 'Exame', -42, '09:30', 30),
  ('de3a0000-0008-0006-0000-000000000030', 'de3a0000-0008-0002-0000-000000000008', 'de3a0000-0008-0005-0000-000000000030', 'de3a0000-0008-0003-0000-000000000002', 'de3a0000-0008-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Consulta', -3, '11:00', 20),
  ('de3a0000-0008-0006-0000-000000000031', 'de3a0000-0008-0002-0000-000000000009', 'de3a0000-0008-0005-0000-000000000031', 'de3a0000-0008-0003-0000-000000000001', 'de3a0000-0008-0001-0000-000000000001', 250.0, 0, 'dinheiro', null, 'Consulta', -35, '08:30', 30),
  ('de3a0000-0008-0006-0000-000000000032', 'de3a0000-0008-0002-0000-000000000009', 'de3a0000-0008-0005-0000-000000000032', 'de3a0000-0008-0003-0000-000000000009', 'de3a0000-0008-0001-0000-000000000001', 220.0, 0, 'cartao_debito', null, 'Exame', -28, '13:30', 30),
  ('de3a0000-0008-0006-0000-000000000034', 'de3a0000-0008-0002-0000-000000000010', 'de3a0000-0008-0005-0000-000000000034', 'de3a0000-0008-0003-0000-000000000001', 'de3a0000-0008-0001-0000-000000000001', 250.0, 0, 'pix', null, 'Consulta', -45, '17:00', 30),
  ('de3a0000-0008-0006-0000-000000000035', 'de3a0000-0008-0002-0000-000000000010', 'de3a0000-0008-0005-0000-000000000035', 'de3a0000-0008-0003-0000-000000000006', 'de3a0000-0008-0001-0000-000000000001', 220.0, 0, 'cartao_credito', null, 'Procedimento', -25, '16:00', 30),
  ('de3a0000-0008-0006-0000-000000000036', 'de3a0000-0008-0002-0000-000000000010', 'de3a0000-0008-0005-0000-000000000036', 'de3a0000-0008-0003-0000-000000000008', 'de3a0000-0008-0001-0000-000000000001', 70.0, 0, 'cartao_credito', null, 'Procedimento', -21, '16:30', 20)
) as v(id, pat, appt, proc, prof, total, disc, pm, conv, cat, d, t, dur)
on conflict (id) do nothing;

-- 8. Despesas da área (3); aluguel e folha já existem na clínica, não são repetidos
insert into public.financial_records (id, clinic_id, total_amount, discount_percent, payment_method, type, category, notes, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.amt::numeric, 0, v.pm, 'despesa', v.cat, v.note, '[]'::jsonb, v.at::timestamptz
from (values
  ('de3a0000-0008-0006-0000-000000000901', 1690.0, 'cartao_credito', 'Material', 'Descartáveis e medicamentos do mês', now() - interval '15 days'),
  ('de3a0000-0008-0006-0000-000000000902', 900.0, 'pix', 'Equipamento', 'Manutenção do aparelho de ultrassom', now() - interval '40 days'),
  ('de3a0000-0008-0006-0000-000000000903', 700.0, 'pix', 'Marketing', 'Anúncios no Google', now() - interval '64 days')
) as v(id, amt, pm, cat, note, at)
on conflict (id) do nothing;

-- 9. Prontuários (10): anamnese e exame clínico namespaced por área ("medico"), chaves reais de specialtyConfig.tsx
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.medical_records (id, clinic_id, patient_id, anamnesis, clinical_exam, treatment_plan, odontogram, treatment_plan_items, created_at, updated_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.anam, v.exam, v.tp, v.odo, v.items,
       ((m.monday + v.d1::int + v.t1::time) at time zone 'America/Sao_Paulo'),
       ((m.monday + v.d2::int + v.t2::time) at time zone 'America/Sao_Paulo')
from m
cross join (values
  ('de3a0000-0008-0007-0000-000000000001', 'de3a0000-0008-0002-0000-000000000001', $j${"medico":{"a-alergia":"Nega alergias medicamentosas","a-motivo":"Acompanhamento de hipertensão e diabetes; cansaço nas últimas semanas","a-hist_doenca":"Hipertenso há 15 anos e diabético há 8; piora do cansaço aos esforços","a-comorbidades":"Hipertensão arterial, diabetes tipo 2, dislipidemia","a-hist_familiar":"Pai com infarto e mãe diabética","a-cirurgias":"Hérnia inguinal há 12 anos","a-medicamentos":"Losartana, anlodipino, metformina, sinvastatina","a-habitos":"Ex-fumante; sedentário; dieta com excesso de carboidratos","a-sono":"Regular, ronca","a-sintomas":"Cansaço, sem dor torácica ou falta de ar em repouso"}}$j$::jsonb, $j${"medico":{"e-spo2":"98","e-fr":"16","e-pressao":"148/92","e-fc":"78","e-temp":"36,4","e-glicemia":"162","e-antropometria":"92 kg / 1,72 m / IMC 31,1","e-ausculta":"Bulhas rítmicas normofonéticas; murmúrio vesicular presente","e-exame_fisico":"Sem edema; pulsos simétricos","e-hipotese":"HAS e DM2 descompensados (I10, E11)","e-conduta":"Solicitados HbA1c, perfil lipídico, creatinina e urina tipo 1; ajuste da medicação e retorno em 30 dias","e-obs":"Orientado sobre dieta e caminhada diária."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -47, '13:00', -35, '10:30'),
  ('de3a0000-0008-0007-0000-000000000002', 'de3a0000-0008-0002-0000-000000000002', $j${"medico":{"a-alergia":"Nega alergias medicamentosas","a-motivo":"Dor torácica atípica ocasional e palpitações","a-hist_doenca":"Episódios de dor em aperto de curta duração há 2 meses, sem relação clara com esforço","a-comorbidades":"Hipertensão arterial","a-hist_familiar":"Mãe com doença coronariana","a-cirurgias":"Histerectomia aos 45 anos","a-medicamentos":"Losartana 50 mg","a-habitos":"Não fuma; caminha 3 vezes por semana","a-sono":"Bom","a-sintomas":"Palpitações sem síncope","a-fatores_risco_cv":"Hipertensão, histórico familiar e dislipidemia leve","a-eventos_cardiacos":"Nunca teve infarto, AVC ou arritmia diagnosticada","a-exames_previos":"ECG de 2024 normal"}}$j$::jsonb, $j${"medico":{"e-spo2":"98","e-fr":"16","e-pressao":"132/84","e-fc":"72","e-temp":"36,3","e-glicemia":"98","e-antropometria":"68 kg / 1,60 m / IMC 26,6","e-ausculta":"Bulhas normofonéticas, sem sopros","e-hipotese":"Dor torácica atípica; risco cardiovascular intermediário","e-conduta":"ECG de repouso, teste ergométrico e Holter 24 horas","e-ausculta_detalhada":"Ritmo regular, sem sopros ou extrassístoles à ausculta","e-pulsos_perifericos":"Simétricos e normais","e-edema_mmii":"Ausente"}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -42, '08:00', -20, '13:30'),
  ('de3a0000-0008-0007-0000-000000000003', 'de3a0000-0008-0002-0000-000000000003', $j${"medico":{"a-alergia":"Nega alergias medicamentosas","a-motivo":"Controle de fibrilação atrial e anticoagulação","a-hist_doenca":"Fibrilação atrial permanente diagnosticada há 2 anos, assintomático em repouso","a-comorbidades":"Hipertensão arterial e fibrilação atrial","a-hist_familiar":"Pai com AVC","a-cirurgias":"Nenhuma","a-medicamentos":"Rivaroxabana 20 mg, metoprolol 50 mg, losartana 50 mg","a-habitos":"Não fuma; álcool socialmente","a-sono":"Regular","a-sintomas":"Palpitações aos esforços intensos","a-fatores_risco_cv":"Idade, hipertensão e fibrilação atrial","a-eventos_cardiacos":"Fibrilação atrial; sem AVC prévio","a-exames_previos":"Ecocardiograma de 2025 com átrio esquerdo aumentado e FE 58%"}}$j$::jsonb, $j${"medico":{"e-spo2":"98","e-fr":"16","e-pressao":"126/78","e-fc":"84 (irregular)","e-temp":"36,5","e-glicemia":"96","e-antropometria":"82 kg / 1,70 m / IMC 28,4","e-ausculta":"Ritmo irregular, sem sopros","e-hipotese":"Fibrilação atrial permanente com FC controlada (I48)","e-conduta":"Manter anticoagulante e betabloqueador; solicitar função renal e hemograma de controle","e-ausculta_detalhada":"Bulhas arrítmicas, sem sopros","e-pulsos_perifericos":"Irregulares, simétricos","e-edema_mmii":"Ausente"}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -52, '11:30', -41, '16:30'),
  ('de3a0000-0008-0007-0000-000000000004', 'de3a0000-0008-0002-0000-000000000004', $j${"medico":{"a-alergia":"Nega alergias medicamentosas","a-motivo":"Febre, tosse e coriza há 3 dias","a-hist_doenca":"Febre de até 38,8 graus, tosse produtiva e inapetência; sem falta de ar","a-comorbidades":"Rinite alérgica","a-hist_familiar":"Pai asmático","a-cirurgias":"Nenhuma","a-medicamentos":"Antitérmico conforme peso","a-habitos":"Frequenta a escola em período integral","a-sono":"Sono agitado nas últimas noites","a-sintomas":"Febre, tosse e coriza","a-gestacao_parto":"Parto cesáreo a termo, sem intercorrências","a-aleitamento":"Aleitamento materno até 1 ano","a-calendario_vacinal":"Em dia","a-marcos_dev":"Adequados para a idade"}}$j$::jsonb, $j${"medico":{"e-spo2":"97","e-fr":"28","e-temp":"38,1","e-fc":"112","e-glicemia":"Não aferida","e-ausculta":"Roncos esparsos, sem sibilos","e-exame_fisico":"Orofaringe hiperemiada, otoscopia sem alterações","e-hipotese":"Infecção viral de vias aéreas superiores (J06)","e-conduta":"Sintomáticos, hidratação e sinais de alerta orientados; retorno se persistir febre","e-peso_altura_pc":"20,5 kg (P50) / 112 cm (P50)","e-reflexos":"Presentes e simétricos","e-dnpm":"Desenvolvimento adequado para a idade"}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -56, '08:30', -14, '10:00'),
  ('de3a0000-0008-0007-0000-000000000005', 'de3a0000-0008-0002-0000-000000000005', $j${"medico":{"a-alergia":"Nega alergias medicamentosas","a-motivo":"Consulta de puericultura e atualização do calendário vacinal","a-hist_doenca":"Sem queixas; ganho de peso e crescimento adequados","a-comorbidades":"Nenhuma","a-hist_familiar":"Sem doenças hereditárias relevantes","a-cirurgias":"Nenhuma","a-medicamentos":"Vitamina D","a-habitos":"Alimentação complementar variada; frequenta creche","a-sono":"Dorme a noite toda","a-sintomas":"Nenhum","a-gestacao_parto":"Parto normal a termo, peso 3.250 g","a-aleitamento":"Aleitamento materno exclusivo até 6 meses","a-calendario_vacinal":"Em dia; aplicadas hoje as vacinas do calendário","a-marcos_dev":"Anda sem apoio e fala 10 palavras"}}$j$::jsonb, $j${"medico":{"e-spo2":"99","e-fr":"26","e-temp":"36,6","e-fc":"110","e-antropometria":"12,2 kg / 86 cm","e-ausculta":"Sem alterações","e-exame_fisico":"Bom estado geral, hidratado, ativo","e-hipotese":"Criança hígida com crescimento adequado (Z00.1)","e-conduta":"Vacinação do calendário e retorno em 6 meses","e-peso_altura_pc":"12,2 kg (P55) / 86 cm (P60) / PC 48 cm (P50)","e-reflexos":"Adequados para a idade","e-dnpm":"Marcos adequados para a idade"}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -41, '11:00', -33, '14:00'),
  ('de3a0000-0008-0007-0000-000000000006', 'de3a0000-0008-0002-0000-000000000006', $j${"medico":{"a-alergia":"Nega alergias medicamentosas","a-motivo":"Pré-natal de rotina com 24 semanas","a-hist_doenca":"Gestação de baixo risco, sem sangramentos ou perdas","a-comorbidades":"Nenhuma","a-hist_familiar":"Mãe com diabetes gestacional","a-cirurgias":"Nenhuma","a-medicamentos":"Ácido fólico e polivitamínico","a-habitos":"Não fuma; caminhadas leves","a-sono":"Bom","a-sintomas":"Leve dor lombar","a-dum":"Há 24 semanas e 2 dias; DPP calculada","a-hist_obstetrico":"G1P0A0","a-metodo_contraceptivo":"Preservativo antes da gestação","a-ultimo_preventivo":"Há 8 meses, normal","a-semanas_gestacao":"24 semanas e 2 dias","a-calendario_pre_natal":"Ultrassom morfológico realizado; TOTG agendado para a próxima consulta","a-tipo_parto_planejado":"A definir; preferência por parto normal"}}$j$::jsonb, $j${"medico":{"e-spo2":"98","e-fr":"16","e-pressao":"112/70","e-fc":"82","e-temp":"36,5","e-glicemia":"84","e-antropometria":"66,8 kg / 1,67 m (pré-gestacional 59 kg)","e-ausculta":"Sem alterações","e-exame_fisico":"Altura uterina 24 cm; BCF 144 bpm","e-hipotese":"Gestação tópica de 24 semanas, evolução normal (Z34)","e-conduta":"TOTG 75 g na próxima consulta, rotina laboratorial do 2º trimestre e retorno em 4 semanas","e-exame_ginecologico":"Não realizado nesta consulta","e-mamas":"Sem nódulos","e-evolucao_parto":"Não se aplica"}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -40, '17:00', -5, '14:00'),
  ('de3a0000-0008-0007-0000-000000000007', 'de3a0000-0008-0002-0000-000000000007', $j${"medico":{"a-alergia":"Nega alergias medicamentosas","a-motivo":"Rastreamento ginecológico anual e queixa de cólicas intensas","a-hist_doenca":"Cólica menstrual intensa há 1 ano, com piora progressiva","a-comorbidades":"Nenhuma","a-hist_familiar":"Mãe com endometriose","a-cirurgias":"Nenhuma","a-medicamentos":"Anticoncepcional oral","a-habitos":"Pratica pilates 2 vezes por semana","a-sono":"Regular","a-sintomas":"Dismenorreia e dor pélvica cíclica","a-dum":"Há 12 dias","a-hist_obstetrico":"G0","a-metodo_contraceptivo":"Pílula combinada","a-ultimo_preventivo":"Há 14 meses, normal"}}$j$::jsonb, $j${"medico":{"e-spo2":"98","e-fr":"16","e-pressao":"110/70","e-fc":"76","e-temp":"36,4","e-antropometria":"63 kg / 1,65 m / IMC 23,1","e-ausculta":"Sem alterações","e-exame_fisico":"Abdome indolor, sem massas","e-hipotese":"Dismenorreia; suspeita de endometriose (N94.6)","e-conduta":"Ultrassonografia transvaginal com preparo intestinal e colposcopia; retorno com resultados","e-exame_ginecologico":"Colo sem lesões; útero em AVF, móvel; fundo de saco doloroso à palpação","e-mamas":"Sem nódulos palpáveis","e-achados_colposcopia":"Epitélio acetobranco ausente; sem lesões suspeitas","e-evolucao_parto":"Não se aplica"}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -25, '08:30', -3, '17:00'),
  ('de3a0000-0008-0007-0000-000000000008', 'de3a0000-0008-0002-0000-000000000008', $j${"medico":{"a-alergia":"Nega alergias medicamentosas","a-motivo":"Check-up anual e dor lombar ocasional","a-hist_doenca":"Dor lombar após esforço, sem irradiação, resolve com repouso","a-comorbidades":"Nenhuma conhecida","a-hist_familiar":"Pai hipertenso","a-cirurgias":"Nenhuma","a-medicamentos":"Nenhum","a-habitos":"Sedentário; consumo moderado de álcool","a-sono":"6 horas por noite","a-sintomas":"Lombalgia mecânica leve"}}$j$::jsonb, $j${"medico":{"e-spo2":"98","e-fr":"16","e-pressao":"126/80","e-fc":"70","e-temp":"36,4","e-glicemia":"92","e-antropometria":"88 kg / 1,78 m / IMC 27,8","e-ausculta":"Sem alterações","e-exame_fisico":"Coluna sem dor à palpação; Lasègue negativo","e-hipotese":"Lombalgia mecânica; sobrepeso","e-conduta":"Exames de rotina e encaminhamento para fisioterapia; orientado a manter atividade física regular"}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -48, '08:30', -3, '11:00'),
  ('de3a0000-0008-0007-0000-000000000009', 'de3a0000-0008-0002-0000-000000000009', $j${"medico":{"a-alergia":"Nega alergias medicamentosas","a-motivo":"Dor em abdome superior após refeições gordurosas","a-hist_doenca":"Dor em cólica no hipocôndrio direito há 2 meses, associada a náuseas","a-comorbidades":"Nenhuma","a-hist_familiar":"Mãe colecistectomizada","a-cirurgias":"Cesáreas (2)","a-medicamentos":"Nenhum","a-habitos":"Alimentação irregular; não fuma","a-sono":"Bom","a-sintomas":"Náuseas e plenitude pós-prandial"}}$j$::jsonb, $j${"medico":{"e-spo2":"98","e-fr":"16","e-pressao":"118/76","e-fc":"74","e-temp":"36,5","e-glicemia":"90","e-antropometria":"71 kg / 1,63 m / IMC 26,7","e-ausculta":"Sem alterações","e-exame_fisico":"Dor à palpação em hipocôndrio direito; Murphy duvidoso","e-hipotese":"Suspeita de colelitíase (K80)","e-conduta":"Ultrassonografia abdominal total e retorno com laudo"}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -35, '08:30', -28, '13:30'),
  ('de3a0000-0008-0007-0000-000000000010', 'de3a0000-0008-0002-0000-000000000010', $j${"medico":{"a-alergia":"Nega alergias medicamentosas","a-motivo":"Corte profundo no dedo da mão esquerda com faca de cozinha","a-hist_doenca":"Acidente há 1 hora; sangramento controlado com compressão","a-comorbidades":"Nenhuma","a-hist_familiar":"Sem relevância","a-cirurgias":"Nenhuma","a-medicamentos":"Nenhum","a-habitos":"Não fuma","a-sono":"Bom","a-sintomas":"Dor local"}}$j$::jsonb, $j${"medico":{"e-spo2":"98","e-fr":"16","e-pressao":"120/78","e-fc":"88","e-temp":"36,6","e-ausculta":"Sem alterações","e-exame_fisico":"Laceração de 2 cm em polpa do 3º dedo esquerdo, sem exposição óssea e com mobilidade preservada","e-hipotese":"Ferida corto-contusa de dedo (S61.2)","e-conduta":"Limpeza, anestesia local e sutura com 3 pontos; atualização do tétano; retirada de pontos em 10 dias"}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -45, '17:00', -21, '16:30')
) as v(id, pat, anam, exam, tp, odo, items, d1, t1, d2, t2)
on conflict (id) do nothing;

-- 10. Evoluções no prontuário (20); author_name = profissional que atendeu, professional_id preenchido
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.record_entries (id, clinic_id, patient_id, record_id, author_name, professional_id, entry_text, entry_type, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.rec::uuid, v.author, v.prof::uuid, v.txt, 'evolucao',
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0008-0008-0000-000000000001', 'de3a0000-0008-0002-0000-000000000001', 'de3a0000-0008-0007-0000-000000000001', 'Dr. Alexandre Fontenele Braga', 'de3a0000-0008-0001-0000-000000000001', 'Consulta de rotina com PA 148/92 e glicemia capilar elevada. Solicitados exames laboratoriais e reforçadas medidas de estilo de vida.', -47, '13:00', 30),
  ('de3a0000-0008-0008-0000-000000000002', 'de3a0000-0008-0002-0000-000000000001', 'de3a0000-0008-0007-0000-000000000001', 'Dr. Alexandre Fontenele Braga', 'de3a0000-0008-0001-0000-000000000001', 'Exames mostram HbA1c 8,1%. Ajustada metformina e mantido anti-hipertensivo; encaminhado à nutrição.', -35, '10:30', 20),
  ('de3a0000-0008-0008-0000-000000000003', 'de3a0000-0008-0002-0000-000000000002', 'de3a0000-0008-0007-0000-000000000002', 'Dra. Renata Sobral Lima', 'de3a0000-0008-0001-0000-000000000002', 'Avaliação cardiológica. ECG de repouso normal; solicitados teste ergométrico e Holter para esclarecer palpitações.', -42, '08:00', 30),
  ('de3a0000-0008-0008-0000-000000000004', 'de3a0000-0008-0002-0000-000000000002', 'de3a0000-0008-0007-0000-000000000002', 'Dra. Renata Sobral Lima', 'de3a0000-0008-0001-0000-000000000002', 'Teste ergométrico sem isquemia e Holter com extrassístoles raras. Mantida conduta clínica e orientado seguimento anual.', -20, '13:30', 20),
  ('de3a0000-0008-0008-0000-000000000005', 'de3a0000-0008-0002-0000-000000000003', 'de3a0000-0008-0007-0000-000000000003', 'Dra. Renata Sobral Lima', 'de3a0000-0008-0001-0000-000000000002', 'Consulta de seguimento: FC controlada, sem sangramentos. ECG confirma fibrilação atrial com resposta ventricular de 84 bpm.', -52, '11:30', 30),
  ('de3a0000-0008-0008-0000-000000000006', 'de3a0000-0008-0002-0000-000000000003', 'de3a0000-0008-0007-0000-000000000003', 'Dra. Renata Sobral Lima', 'de3a0000-0008-0001-0000-000000000002', 'Exames de função renal e hemograma normais. Mantida anticoagulação e orientado a evitar anti-inflamatórios.', -41, '16:30', 20),
  ('de3a0000-0008-0008-0000-000000000007', 'de3a0000-0008-0002-0000-000000000004', 'de3a0000-0008-0007-0000-000000000004', 'Dr. André Luís Maia', 'de3a0000-0008-0001-0000-000000000003', 'Quadro de IVAS viral. Prescrito sintomático, lavagem nasal e orientados sinais de alerta aos pais.', -56, '08:30', 30),
  ('de3a0000-0008-0008-0000-000000000008', 'de3a0000-0008-0002-0000-000000000004', 'de3a0000-0008-0007-0000-000000000004', 'Dr. André Luís Maia', 'de3a0000-0008-0001-0000-000000000003', 'Afebril há 3 dias, sem tosse noturna. Alta com orientações de hidratação.', -14, '10:00', 20),
  ('de3a0000-0008-0008-0000-000000000009', 'de3a0000-0008-0002-0000-000000000005', 'de3a0000-0008-0007-0000-000000000005', 'Dr. André Luís Maia', 'de3a0000-0008-0001-0000-000000000003', 'Puericultura: crescimento adequado e DNPM normal. Orientações sobre alimentação e prevenção de acidentes.', -41, '11:00', 30),
  ('de3a0000-0008-0008-0000-000000000010', 'de3a0000-0008-0002-0000-000000000005', 'de3a0000-0008-0007-0000-000000000005', 'Dr. André Luís Maia', 'de3a0000-0008-0001-0000-000000000003', 'Vacinas do calendário aplicadas sem reações imediatas. Orientados cuidados com febre pós-vacinal.', -33, '14:00', 15),
  ('de3a0000-0008-0008-0000-000000000011', 'de3a0000-0008-0002-0000-000000000006', 'de3a0000-0008-0007-0000-000000000006', 'Dra. Fernanda Teixeira Rocha', 'de3a0000-0008-0001-0000-000000000004', 'Pré-natal de 24 semanas: BCF 144, altura uterina compatível. Solicitados exames do 2º trimestre e TOTG.', -40, '17:00', 30),
  ('de3a0000-0008-0008-0000-000000000012', 'de3a0000-0008-0002-0000-000000000006', 'de3a0000-0008-0007-0000-000000000006', 'Dra. Fernanda Teixeira Rocha', 'de3a0000-0008-0001-0000-000000000004', 'Ultrassonografia obstétrica com crescimento fetal no percentil 55 e líquido amniótico normal. Mantida rotina de pré-natal.', -5, '14:00', 30),
  ('de3a0000-0008-0008-0000-000000000013', 'de3a0000-0008-0002-0000-000000000007', 'de3a0000-0008-0007-0000-000000000007', 'Dra. Fernanda Teixeira Rocha', 'de3a0000-0008-0001-0000-000000000004', 'Consulta ginecológica. Dor pélvica cíclica com suspeita de endometriose; solicitados ultrassonografia e colposcopia.', -25, '08:30', 30),
  ('de3a0000-0008-0008-0000-000000000014', 'de3a0000-0008-0002-0000-000000000007', 'de3a0000-0008-0007-0000-000000000007', 'Dra. Fernanda Teixeira Rocha', 'de3a0000-0008-0001-0000-000000000004', 'Colposcopia sem lesões. Ultrassonografia sem cistos endometrioides; conduta clínica e retorno em 3 meses.', -3, '17:00', 30),
  ('de3a0000-0008-0008-0000-000000000015', 'de3a0000-0008-0002-0000-000000000008', 'de3a0000-0008-0007-0000-000000000008', 'Dr. Alexandre Fontenele Braga', 'de3a0000-0008-0001-0000-000000000001', 'Check-up: exame físico sem alterações. Solicitados exames laboratoriais e orientadas medidas posturais.', -48, '08:30', 30),
  ('de3a0000-0008-0008-0000-000000000016', 'de3a0000-0008-0002-0000-000000000008', 'de3a0000-0008-0007-0000-000000000008', 'Dr. Alexandre Fontenele Braga', 'de3a0000-0008-0001-0000-000000000001', 'Exames laboratoriais dentro da normalidade. Orientações sobre atividade física e acompanhamento anual.', -3, '11:00', 20),
  ('de3a0000-0008-0008-0000-000000000017', 'de3a0000-0008-0002-0000-000000000009', 'de3a0000-0008-0007-0000-000000000009', 'Dr. Alexandre Fontenele Braga', 'de3a0000-0008-0001-0000-000000000001', 'Suspeita de colelitíase. Solicitada ultrassonografia abdominal e orientada dieta com baixo teor de gordura.', -35, '08:30', 30),
  ('de3a0000-0008-0008-0000-000000000018', 'de3a0000-0008-0002-0000-000000000009', 'de3a0000-0008-0007-0000-000000000009', 'Dr. Alexandre Fontenele Braga', 'de3a0000-0008-0001-0000-000000000001', 'Ultrassonografia com cálculos biliares pequenos, sem espessamento de parede. Encaminhada à cirurgia geral eletiva.', -28, '13:30', 30),
  ('de3a0000-0008-0008-0000-000000000019', 'de3a0000-0008-0002-0000-000000000010', 'de3a0000-0008-0007-0000-000000000010', 'Dr. Alexandre Fontenele Braga', 'de3a0000-0008-0001-0000-000000000001', 'Ferida corto-contusa limpa e suturada com 3 pontos de nylon 4-0 sob anestesia local. Atualizada vacina antitetânica.', -45, '17:00', 30),
  ('de3a0000-0008-0008-0000-000000000020', 'de3a0000-0008-0002-0000-000000000010', 'de3a0000-0008-0007-0000-000000000010', 'Dr. Alexandre Fontenele Braga', 'de3a0000-0008-0001-0000-000000000001', 'Ferida sem sinais de infecção. Curativo trocado e orientados cuidados até a retirada dos pontos.', -21, '16:30', 20)
) as v(id, pat, rec, author, prof, txt, d, t, dur)
on conflict (id) do nothing;

-- Verificação (contagens esperadas em docs/demo-seed-video123.md)
select 'professionals' as tabela, count(*) as linhas from public.professionals where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0001-%'
union all
select 'patients' as tabela, count(*) as linhas from public.patients where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0002-%'
union all
select 'procedures' as tabela, count(*) as linhas from public.procedures where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0003-%'
union all
select 'stock_items' as tabela, count(*) as linhas from public.stock_items where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0004-%'
union all
select 'stock_movements' as tabela, count(*) as linhas from public.stock_movements where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0009-%'
union all
select 'appointments' as tabela, count(*) as linhas from public.appointments where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0005-%'
union all
select 'financial_records' as tabela, count(*) as linhas from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0006-%'
union all
select 'medical_records' as tabela, count(*) as linhas from public.medical_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0007-%'
union all
select 'record_entries' as tabela, count(*) as linhas from public.record_entries where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0008-%'
order by 1;

commit;

-- =============================================================================
-- ROLLBACK (descomente tudo, de "begin" a "commit", e rode inteiro).
-- Apaga só o que este arquivo criou: clinic_id da demo + ids com o prefixo de3a0000-0008-.
-- Ordem respeita as FKs (receitas e comissões -> evoluções -> prontuários -> consultas -> estoque -> procedimentos -> pacientes -> profissionais).
-- =============================================================================
-- begin;
-- delete from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0006-%';
-- delete from public.record_entries    where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0008-%';
-- delete from public.medical_records   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0007-%';
-- delete from public.appointments      where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0005-%';
-- delete from public.stock_movements   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0009-%';
-- delete from public.stock_items       where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0004-%';
-- delete from public.procedures        where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0003-%';
-- delete from public.patients          where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0002-%';
-- delete from public.professionals     where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0008-0001-%';
-- commit;
