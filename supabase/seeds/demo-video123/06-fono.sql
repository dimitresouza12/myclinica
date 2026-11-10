-- =============================================================================
-- Seed demo video123 | área: Fonoaudiologia (fono) | arquivo 06-fono.sql
-- =============================================================================
-- Insere SOMENTE na clínica demo (clinic_id 3916d37d-b247-485e-bd2f-b47be8d44207).
-- Convenção de IDs determinísticos: de3a0000-0006-<tabela>-0000-<seq>
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
  ('de3a0000-0006-0001-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dra. Rafaela Pontes Vidal', 'Linguagem', 'fono', 40, 'CRFa 4-11582', now() - interval '208 days'),
  ('de3a0000-0006-0001-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dr. Leonardo Aguiar Sobreira', 'Audiologia', 'fono', 40, 'CRFa 4-09746', now() - interval '206 days')
on conflict (id) do nothing;

-- 2. Pacientes (8): CPF e RG ficam nulos de propósito; is_active/registration_status usam o default
insert into public.patients (id, clinic_id, name, phone, email, birth_date, gender, address, occupation, emergency_contact, referred_by,
  notes, pet_name, pet_species, pet_breed, pet_weight, pet_age, pet_coat, pet_neutered, convenio, convenio_carteirinha, lgpd_consent, lgpd_consent_at, created_at, updated_at)
values
  ('de3a0000-0006-0002-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Miguel Arruda Sales', '(85) 90000-6001', 'miguel.sales@example.com', '2020-02-10', 'Masculino', 'Rua Vicente Leite, 130 - Varjota, Fortaleza/CE', 'Criança', 'Mãe: Juliana Sales (responsável)', 'Indicação do pediatra', null, null, null, null, null, null, null, null, null, null, true, now() - interval '97 days', now() - interval '97 days', now() - interval '97 days'),
  ('de3a0000-0006-0002-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Helena Brito Magalhães', '(85) 90000-6002', 'helena.magalhaes@example.com', '2018-07-22', 'Feminino', 'Av. Washington Soares, 1500 - Edson Queiroz, Fortaleza/CE', 'Criança', 'Pai: Rogério Magalhães (responsável)', 'Indicação da escola', null, null, null, null, null, null, null, null, null, null, true, now() - interval '94 days', now() - interval '94 days', now() - interval '94 days'),
  ('de3a0000-0006-0002-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Davi Lucca Peixoto', '(85) 90000-6003', 'davi.peixoto@example.com', '2019-05-30', 'Masculino', 'Rua Antônio Augusto, 700 - Meireles, Fortaleza/CE', 'Criança', 'Mãe: Tatiana Peixoto (responsável)', 'Encaminhamento da neuropediatra', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 445566 7788', true, now() - interval '91 days', now() - interval '91 days', now() - interval '91 days'),
  ('de3a0000-0006-0002-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Alice Nobre Fontenele', '(85) 90000-6004', 'alice.fontenele@example.com', '2016-11-14', 'Feminino', 'Rua Pereira Filgueiras, 300 - Centro, Fortaleza/CE', 'Criança', 'Mãe: Marta Fontenele (responsável)', 'Indicação da ortodontista', null, null, null, null, null, null, null, null, null, null, true, now() - interval '88 days', now() - interval '88 days', now() - interval '88 days'),
  ('de3a0000-0006-0002-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Bento Ximenes Pinto', '(85) 90000-6005', 'bento.pinto@example.com', '2026-03-08', 'Masculino', 'Rua Eduardo Garcia, 205 - Aldeota, Fortaleza/CE', null, 'Mãe: Larissa Pinto (responsável)', 'Indicação da maternidade', null, null, null, null, null, null, null, null, null, null, true, now() - interval '85 days', now() - interval '85 days', now() - interval '85 days'),
  ('de3a0000-0006-0002-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Joaquim Rego Lima', '(85) 90000-6006', 'joaquim.lima@example.com', '2013-09-05', 'Masculino', 'Rua Padre Mororó, 800 - Cocó, Fortaleza/CE', 'Estudante', 'Pai: Ricardo Lima (responsável)', 'Indicação da escola', null, null, null, null, null, null, null, null, null, null, true, now() - interval '82 days', now() - interval '82 days', now() - interval '82 days'),
  ('de3a0000-0006-0002-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Marlene Ribeiro de Sousa', '(85) 90000-6007', 'marlene.sousa@example.com', '1950-04-19', 'Feminino', 'Rua Dr. João Moreira, 500 - Centro, Fortaleza/CE', 'Aposentada', 'Filho: Paulo Sousa', 'Encaminhamento do neurologista', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 112233 4400', true, now() - interval '79 days', now() - interval '79 days', now() - interval '79 days'),
  ('de3a0000-0006-0002-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Renato Alencar Duarte', '(85) 90000-6008', 'renato.duarte@example.com', '1971-12-02', 'Masculino', 'Rua Capitão Gustavo, 900 - Aldeota, Fortaleza/CE', 'Professor', null, 'Indicação do otorrino', null, null, null, null, null, null, null, null, 'Hapvida', '3300 9988 1122', true, now() - interval '76 days', now() - interval '76 days', now() - interval '76 days')
on conflict (id) do nothing;

-- 3. Procedimentos (7): nomes/categorias de procedureSuggestions de specialtyConfig.tsx
insert into public.procedures (id, clinic_id, name, price, category, is_active, is_free, created_at)
values
  ('de3a0000-0006-0003-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Avaliação Fonoaudiológica', 220, 'Avaliação', true, false, now() - interval '150 days'),
  ('de3a0000-0006-0003-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Sessão de Terapia de Linguagem', 120, 'Terapia de Linguagem', true, false, now() - interval '150 days'),
  ('de3a0000-0006-0003-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Terapia de Motricidade Orofacial', 120, 'Motricidade Orofacial', true, false, now() - interval '150 days'),
  ('de3a0000-0006-0003-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Audiometria', 150, 'Audiometria', true, false, now() - interval '150 days'),
  ('de3a0000-0006-0003-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Terapia de Fluência', 120, 'Outros', true, false, now() - interval '150 days'),
  ('de3a0000-0006-0003-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Teste da Orelhinha (Emissões Otoacústicas)', 140, 'Triagem Neonatal', true, false, now() - interval '150 days'),
  ('de3a0000-0006-0003-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Teste da Linguinha (Avaliação do Frênulo Lingual)', 120, 'Triagem Neonatal', true, false, now() - interval '150 days')
on conflict (id) do nothing;

-- 4. Estoque (6 itens; categorias = slugs de stockCategories)
insert into public.stock_items (id, clinic_id, name, category, unit, quantity, min_quantity, cost_price, supplier, is_active, created_at, updated_at)
values
  ('de3a0000-0006-0004-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Espátulas descartáveis (caixa 100)', 'descartavel', 'cx', 8, 4, 16.0, 'FonoMed Distribuidora', true, now() - interval '120 days', now() - interval '5 days'),
  ('de3a0000-0006-0004-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Luvas de procedimento (caixa 100)', 'descartavel', 'cx', 9, 5, 29.0, 'FonoMed Distribuidora', true, now() - interval '120 days', now() - interval '7 days'),
  ('de3a0000-0006-0004-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Olivas descartáveis para audiometria (pacote)', 'descartavel', 'pct', 14, 6, 38.0, 'AudioCare Brasil', true, now() - interval '120 days', now() - interval '9 days'),
  ('de3a0000-0006-0004-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Jogos de estimulação de linguagem (kit)', 'material', 'kit', 6, 2, 120.0, 'Ludoterapia Brasil', true, now() - interval '120 days', now() - interval '11 days'),
  ('de3a0000-0006-0004-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Espelho de fonoterapia', 'equipamento', 'un', 4, 2, 58.0, 'FonoMed Distribuidora', true, now() - interval '120 days', now() - interval '13 days'),
  ('de3a0000-0006-0004-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Abaixadores de língua (caixa 100)', 'descartavel', 'cx', 10, 5, 12.0, 'FonoMed Distribuidora', true, now() - interval '120 days', now() - interval '15 days')
on conflict (id) do nothing;

-- 5. Movimentações de estoque (12); a quantidade atual do item já considera as saídas
insert into public.stock_movements (id, clinic_id, item_id, type, quantity, reason, user_name, created_at)
values
  ('de3a0000-0006-0009-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000001', 'entrada', 20, 'Compra de reposicao', 'Dra. Rafaela Pontes Vidal', now() - interval '61 days'),
  ('de3a0000-0006-0009-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000001', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Leonardo Aguiar Sobreira', now() - interval '13 days'),
  ('de3a0000-0006-0009-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000002', 'entrada', 21, 'Compra de reposicao', 'Dra. Rafaela Pontes Vidal', now() - interval '62 days'),
  ('de3a0000-0006-0009-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000002', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Leonardo Aguiar Sobreira', now() - interval '14 days'),
  ('de3a0000-0006-0009-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000003', 'entrada', 26, 'Compra de reposicao', 'Dra. Rafaela Pontes Vidal', now() - interval '63 days'),
  ('de3a0000-0006-0009-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000003', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Leonardo Aguiar Sobreira', now() - interval '15 days'),
  ('de3a0000-0006-0009-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000004', 'entrada', 18, 'Compra de reposicao', 'Dra. Rafaela Pontes Vidal', now() - interval '64 days'),
  ('de3a0000-0006-0009-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000004', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Leonardo Aguiar Sobreira', now() - interval '16 days'),
  ('de3a0000-0006-0009-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000005', 'entrada', 16, 'Compra de reposicao', 'Dra. Rafaela Pontes Vidal', now() - interval '65 days'),
  ('de3a0000-0006-0009-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000005', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Leonardo Aguiar Sobreira', now() - interval '17 days'),
  ('de3a0000-0006-0009-0000-000000000011', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000006', 'entrada', 22, 'Compra de reposicao', 'Dra. Rafaela Pontes Vidal', now() - interval '66 days'),
  ('de3a0000-0006-0009-0000-000000000012', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0006-0004-0000-000000000006', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Leonardo Aguiar Sobreira', now() - interval '18 days')
on conflict (id) do nothing;

-- 6. Consultas (55): passado = concluído/faltou/cancelado; semanas 0..2 = hoje e futuro.
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
  ('de3a0000-0006-0005-0000-000000000001', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000001', 'Avaliação Fonoaudiológica', 220, 'concluido', -38, '11:30', 60, null),
  ('de3a0000-0006-0005-0000-000000000002', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -31, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000003', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -24, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000004', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -17, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000005', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -10, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000006', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -3, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000007', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'auto_a', 4, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000008', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'confirmado', 11, '11:30', 40, 'Sessão semanal'),
  ('de3a0000-0006-0005-0000-000000000009', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'confirmado', 18, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000010', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000001', 'Avaliação Fonoaudiológica', 220, 'concluido', -35, '11:30', 60, null),
  ('de3a0000-0006-0005-0000-000000000011', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -28, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000012', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -21, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000013', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -14, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000014', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -7, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000015', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'auto_a', 0, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000016', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'confirmado', 7, '11:30', 40, 'Sessão semanal'),
  ('de3a0000-0006-0005-0000-000000000017', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'confirmado', 14, '11:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000018', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000001', 'Avaliação Fonoaudiológica', 220, 'concluido', -41, '15:00', 60, null),
  ('de3a0000-0006-0005-0000-000000000019', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -34, '15:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000020', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -27, '15:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000021', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -20, '15:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000022', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -13, '15:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000023', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'concluido', -6, '15:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000024', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'auto_c', 1, '15:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000025', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'confirmado', 8, '15:00', 40, 'Sessão semanal'),
  ('de3a0000-0006-0005-0000-000000000026', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000002', 'Sessão de Terapia de Linguagem', 120, 'agendado', 15, '15:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000027', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000001', 'Avaliação Fonoaudiológica', 220, 'concluido', -25, '13:30', 60, null),
  ('de3a0000-0006-0005-0000-000000000028', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'concluido', -18, '13:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000029', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'concluido', -11, '13:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000030', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'concluido', -4, '13:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000031', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'auto_c', 3, '13:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000032', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'agendado', 10, '13:30', 40, 'Sessão semanal'),
  ('de3a0000-0006-0005-0000-000000000033', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'confirmado', 17, '13:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000034', 'de3a0000-0006-0002-0000-000000000005', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000006', 'Teste da Orelhinha (Emissões Otoacústicas)', 140, 'concluido', -56, '16:30', 20, null),
  ('de3a0000-0006-0005-0000-000000000035', 'de3a0000-0006-0002-0000-000000000005', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000007', 'Teste da Linguinha (Avaliação do Frênulo Lingual)', 120, 'concluido', -47, '08:00', 20, null),
  ('de3a0000-0006-0005-0000-000000000036', 'de3a0000-0006-0002-0000-000000000005', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000001', 'Avaliação Fonoaudiológica', 220, 'agendado', 15, '08:30', 60, 'Reavaliação da mamada'),
  ('de3a0000-0006-0005-0000-000000000037', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000001', 'Avaliação Fonoaudiológica', 220, 'concluido', -31, '14:00', 60, null),
  ('de3a0000-0006-0005-0000-000000000038', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000005', 'Terapia de Fluência', 120, 'concluido', -24, '14:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000039', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000005', 'Terapia de Fluência', 120, 'concluido', -17, '14:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000040', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000005', 'Terapia de Fluência', 120, 'concluido', -10, '14:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000041', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000005', 'Terapia de Fluência', 120, 'concluido', -3, '14:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000042', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000005', 'Terapia de Fluência', 120, 'auto_c', 4, '14:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000043', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000005', 'Terapia de Fluência', 120, 'agendado', 11, '14:00', 40, 'Sessão semanal'),
  ('de3a0000-0006-0005-0000-000000000044', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0001-0000-000000000001', 'de3a0000-0006-0003-0000-000000000005', 'Terapia de Fluência', 120, 'agendado', 18, '14:00', 40, null),
  ('de3a0000-0006-0005-0000-000000000045', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000001', 'Avaliação Fonoaudiológica', 220, 'concluido', -25, '15:30', 60, null),
  ('de3a0000-0006-0005-0000-000000000046', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'concluido', -18, '15:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000047', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'concluido', -11, '15:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000048', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'concluido', -4, '15:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000049', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'auto_a', 3, '15:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000050', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'agendado', 10, '15:30', 40, 'Sessão semanal'),
  ('de3a0000-0006-0005-0000-000000000051', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000003', 'Terapia de Motricidade Orofacial', 120, 'confirmado', 17, '15:30', 40, null),
  ('de3a0000-0006-0005-0000-000000000052', 'de3a0000-0006-0002-0000-000000000008', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000001', 'Avaliação Fonoaudiológica', 220, 'concluido', -28, '08:00', 60, null),
  ('de3a0000-0006-0005-0000-000000000053', 'de3a0000-0006-0002-0000-000000000008', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000004', 'Audiometria', 150, 'faltou', -17, '10:30', 30, 'Não compareceu; a recepção tentou contato.'),
  ('de3a0000-0006-0005-0000-000000000054', 'de3a0000-0006-0002-0000-000000000008', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000004', 'Audiometria', 150, 'faltou', -5, '16:30', 30, 'Não compareceu e não avisou.'),
  ('de3a0000-0006-0005-0000-000000000055', 'de3a0000-0006-0002-0000-000000000008', 'de3a0000-0006-0001-0000-000000000002', 'de3a0000-0006-0003-0000-000000000001', 'Avaliação Fonoaudiológica', 220, 'agendado', 14, '13:30', 60, 'Devolutiva e adaptação de aparelho auditivo')
) as v(id, pat, prof, proc, pname, price, st, d, t, dur, notes)
cross join lateral (select ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') as ts) x
on conflict (id) do nothing;

-- 7. Receitas (33): uma por consulta concluída (semanas passadas), no valor do procedimento.
-- O gatilho de comissão só gera linhas para beneficiários ativos (hoje o único está inativo).
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.financial_records (id, clinic_id, patient_id, appointment_id, procedure_id, professional_id,
  total_amount, discount_percent, payment_method, convenio, type, category, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.appt::uuid, v.proc::uuid, v.prof::uuid,
       v.total::numeric, v.disc::numeric, v.pm, v.conv, 'receita', v.cat, '[]'::jsonb,
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0006-0006-0000-000000000001', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0005-0000-000000000001', 'de3a0000-0006-0003-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 220.0, 0, 'dinheiro', null, 'Avaliação Fonoaudiológica', -38, '11:30', 60),
  ('de3a0000-0006-0006-0000-000000000002', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0005-0000-000000000002', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'cartao_credito', null, 'Sessão', -31, '11:30', 40),
  ('de3a0000-0006-0006-0000-000000000003', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0005-0000-000000000003', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Sessão', -24, '11:30', 40),
  ('de3a0000-0006-0006-0000-000000000004', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0005-0000-000000000004', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'dinheiro', null, 'Sessão', -17, '11:30', 40),
  ('de3a0000-0006-0006-0000-000000000005', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0005-0000-000000000005', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Sessão', -10, '11:30', 40),
  ('de3a0000-0006-0006-0000-000000000006', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0005-0000-000000000006', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Sessão', -3, '11:30', 40),
  ('de3a0000-0006-0006-0000-000000000010', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0005-0000-000000000010', 'de3a0000-0006-0003-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 220.0, 0, 'dinheiro', null, 'Avaliação Fonoaudiológica', -35, '11:30', 60),
  ('de3a0000-0006-0006-0000-000000000011', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0005-0000-000000000011', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Sessão', -28, '11:30', 40),
  ('de3a0000-0006-0006-0000-000000000012', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0005-0000-000000000012', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'cartao_credito', null, 'Sessão', -21, '11:30', 40),
  ('de3a0000-0006-0006-0000-000000000013', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0005-0000-000000000013', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'dinheiro', null, 'Sessão', -14, '11:30', 40),
  ('de3a0000-0006-0006-0000-000000000014', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0005-0000-000000000014', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Sessão', -7, '11:30', 40),
  ('de3a0000-0006-0006-0000-000000000018', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0005-0000-000000000018', 'de3a0000-0006-0003-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 220.0, 0, 'convenio', 'Unimed Fortaleza', 'Avaliação Fonoaudiológica', -41, '15:00', 60),
  ('de3a0000-0006-0006-0000-000000000019', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0005-0000-000000000019', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'cartao_debito', null, 'Sessão', -34, '15:00', 40),
  ('de3a0000-0006-0006-0000-000000000020', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0005-0000-000000000020', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 108.0, 10, 'pix', null, 'Sessão', -27, '15:00', 40),
  ('de3a0000-0006-0006-0000-000000000021', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0005-0000-000000000021', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Sessão', -20, '15:00', 40),
  ('de3a0000-0006-0006-0000-000000000022', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0005-0000-000000000022', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'cartao_debito', null, 'Sessão', -13, '15:00', 40),
  ('de3a0000-0006-0006-0000-000000000023', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0005-0000-000000000023', 'de3a0000-0006-0003-0000-000000000002', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Sessão', -6, '15:00', 40),
  ('de3a0000-0006-0006-0000-000000000027', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0005-0000-000000000027', 'de3a0000-0006-0003-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 220.0, 0, 'pix', null, 'Avaliação Fonoaudiológica', -25, '13:30', 60),
  ('de3a0000-0006-0006-0000-000000000028', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0005-0000-000000000028', 'de3a0000-0006-0003-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'cartao_credito', null, 'Sessão', -18, '13:30', 40),
  ('de3a0000-0006-0006-0000-000000000029', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0005-0000-000000000029', 'de3a0000-0006-0003-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'cartao_debito', null, 'Sessão', -11, '13:30', 40),
  ('de3a0000-0006-0006-0000-000000000030', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0005-0000-000000000030', 'de3a0000-0006-0003-0000-000000000003', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'cartao_credito', null, 'Sessão', -4, '13:30', 40),
  ('de3a0000-0006-0006-0000-000000000034', 'de3a0000-0006-0002-0000-000000000005', 'de3a0000-0006-0005-0000-000000000034', 'de3a0000-0006-0003-0000-000000000006', 'de3a0000-0006-0001-0000-000000000002', 140.0, 0, 'cartao_credito', null, 'Avaliação Fonoaudiológica', -56, '16:30', 20),
  ('de3a0000-0006-0006-0000-000000000035', 'de3a0000-0006-0002-0000-000000000005', 'de3a0000-0006-0005-0000-000000000035', 'de3a0000-0006-0003-0000-000000000007', 'de3a0000-0006-0001-0000-000000000002', 120.0, 0, 'pix', null, 'Avaliação Fonoaudiológica', -47, '08:00', 20),
  ('de3a0000-0006-0006-0000-000000000037', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0005-0000-000000000037', 'de3a0000-0006-0003-0000-000000000001', 'de3a0000-0006-0001-0000-000000000001', 220.0, 0, 'pix', null, 'Avaliação Fonoaudiológica', -31, '14:00', 60),
  ('de3a0000-0006-0006-0000-000000000038', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0005-0000-000000000038', 'de3a0000-0006-0003-0000-000000000005', 'de3a0000-0006-0001-0000-000000000001', 108.0, 10, 'cartao_credito', null, 'Sessão', -24, '14:00', 40),
  ('de3a0000-0006-0006-0000-000000000039', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0005-0000-000000000039', 'de3a0000-0006-0003-0000-000000000005', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'cartao_debito', null, 'Sessão', -17, '14:00', 40),
  ('de3a0000-0006-0006-0000-000000000040', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0005-0000-000000000040', 'de3a0000-0006-0003-0000-000000000005', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'cartao_credito', null, 'Sessão', -10, '14:00', 40),
  ('de3a0000-0006-0006-0000-000000000041', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0005-0000-000000000041', 'de3a0000-0006-0003-0000-000000000005', 'de3a0000-0006-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Sessão', -3, '14:00', 40),
  ('de3a0000-0006-0006-0000-000000000045', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0005-0000-000000000045', 'de3a0000-0006-0003-0000-000000000001', 'de3a0000-0006-0001-0000-000000000002', 220.0, 0, 'convenio', 'Unimed Fortaleza', 'Avaliação Fonoaudiológica', -25, '15:30', 60),
  ('de3a0000-0006-0006-0000-000000000046', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0005-0000-000000000046', 'de3a0000-0006-0003-0000-000000000003', 'de3a0000-0006-0001-0000-000000000002', 120.0, 0, 'cartao_credito', null, 'Sessão', -18, '15:30', 40),
  ('de3a0000-0006-0006-0000-000000000047', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0005-0000-000000000047', 'de3a0000-0006-0003-0000-000000000003', 'de3a0000-0006-0001-0000-000000000002', 108.0, 10, 'cartao_credito', null, 'Sessão', -11, '15:30', 40),
  ('de3a0000-0006-0006-0000-000000000048', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0005-0000-000000000048', 'de3a0000-0006-0003-0000-000000000003', 'de3a0000-0006-0001-0000-000000000002', 120.0, 0, 'cartao_debito', null, 'Sessão', -4, '15:30', 40),
  ('de3a0000-0006-0006-0000-000000000052', 'de3a0000-0006-0002-0000-000000000008', 'de3a0000-0006-0005-0000-000000000052', 'de3a0000-0006-0003-0000-000000000001', 'de3a0000-0006-0001-0000-000000000002', 220.0, 0, 'convenio', 'Hapvida', 'Avaliação Fonoaudiológica', -28, '08:00', 60)
) as v(id, pat, appt, proc, prof, total, disc, pm, conv, cat, d, t, dur)
on conflict (id) do nothing;

-- 8. Despesas da área (3); aluguel e folha já existem na clínica, não são repetidos
insert into public.financial_records (id, clinic_id, total_amount, discount_percent, payment_method, type, category, notes, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.amt::numeric, 0, v.pm, 'despesa', v.cat, v.note, '[]'::jsonb, v.at::timestamptz
from (values
  ('de3a0000-0006-0006-0000-000000000901', 480.0, 'pix', 'Material', 'Espátulas, olivas e jogos de linguagem', now() - interval '17 days'),
  ('de3a0000-0006-0006-0000-000000000902', 650.0, 'cartao_credito', 'Equipamento', 'Calibração anual do audiômetro', now() - interval '39 days'),
  ('de3a0000-0006-0006-0000-000000000903', 300.0, 'pix', 'Marketing', 'Panfletos para escolas parceiras', now() - interval '59 days')
) as v(id, amt, pm, cat, note, at)
on conflict (id) do nothing;

-- 9. Prontuários (8): anamnese e exame clínico namespaced por área ("fono"), chaves reais de specialtyConfig.tsx
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.medical_records (id, clinic_id, patient_id, anamnesis, clinical_exam, treatment_plan, odontogram, treatment_plan_items, created_at, updated_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.anam, v.exam, v.tp, v.odo, v.items,
       ((m.monday + v.d1::int + v.t1::time) at time zone 'America/Sao_Paulo'),
       ((m.monday + v.d2::int + v.t2::time) at time zone 'America/Sao_Paulo')
from m
cross join (values
  ('de3a0000-0006-0007-0000-000000000001', 'de3a0000-0006-0002-0000-000000000001', $j${"fono":{"a-medicamentos":"Nenhum","a-queixa":"Fala poucas palavras aos 6 anos e usa muitos gestos","a-marcos":"Sentou aos 7 meses, andou aos 14 meses, primeiras palavras aos 2 anos","a-gestacao":"Gestação sem intercorrências; parto cesáreo a termo","a-alimentacao":"Mamou até 1 ano; mastiga bem","a-hist_escolar":"Frequenta o jardim III desde os 4 anos","a-hist_auditivo":"Triagem neonatal normal; sem otites de repetição","a-diagnosticos":"Nenhum até o momento","a-outras_terapias":"Nenhuma"}}$j$::jsonb, $j${"fono":{"e-voz":"Qualidade vocal adequada","e-ling_receptiva":"Compreende ordens simples e de dois comandos","e-ling_expressiva":"Vocabulário reduzido, frases de 2 palavras","e-fala":"Substituições e omissões de fonemas compatíveis com atraso","e-fluencia":"Fluente","e-motricidade":"Tônus labial e lingual adequados","e-degluticao":"Sem alterações","e-obs":"Meta: ampliar vocabulário e formar frases de 3 palavras em 3 meses."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -38, '11:30', -3, '11:30'),
  ('de3a0000-0006-0007-0000-000000000002', 'de3a0000-0006-0002-0000-000000000002', $j${"fono":{"a-medicamentos":"Nenhum","a-queixa":"Troca o R pelo L e tem dificuldade em encontros consonantais","a-marcos":"Desenvolvimento motor e de fala dentro do esperado","a-gestacao":"Sem intercorrências","a-alimentacao":"Alimentação variada","a-hist_escolar":"2º ano do ensino fundamental, boa aprendizagem","a-hist_auditivo":"Audiometria normal aos 5 anos","a-diagnosticos":"Nenhum","a-outras_terapias":"Nenhuma"}}$j$::jsonb, $j${"fono":{"e-voz":"Qualidade vocal adequada","e-ling_receptiva":"Adequada à idade","e-ling_expressiva":"Adequada à idade","e-fala":"Distorção do /r/ e omissão de líquida em encontros consonantais","e-motricidade":"Língua com mobilidade adequada","e-degluticao":"Atípica leve, com projeção lingual","e-obs":"Boa consciência fonológica; prognóstico favorável."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -35, '11:30', -7, '11:30'),
  ('de3a0000-0006-0007-0000-000000000003', 'de3a0000-0006-0002-0000-000000000003', $j${"fono":{"a-medicamentos":"Nenhum","a-queixa":"Pouca comunicação verbal e dificuldade de interação","a-marcos":"Atraso na fala, primeiras palavras aos 3 anos","a-gestacao":"Gestação com pré-eclâmpsia leve; parto a termo","a-alimentacao":"Seletividade alimentar leve","a-hist_escolar":"Escola regular com mediadora","a-hist_auditivo":"Audição normal em avaliação recente","a-diagnosticos":"Transtorno do Espectro Autista (nível 1 de suporte)","a-outras_terapias":"Terapia ocupacional e psicologia comportamental"}}$j$::jsonb, $j${"fono":{"e-voz":"Qualidade vocal adequada","e-ling_receptiva":"Compreende rotinas e ordens contextualizadas","e-ling_expressiva":"Frases curtas, ecolalia tardia","e-fala":"Articulação inteligível em 70%","e-fluencia":"Fluente","e-motricidade":"Sem alterações","e-degluticao":"Sem alterações","e-obs":"Usar pistas visuais e comunicação funcional; articulação com a equipe terapêutica."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -41, '15:00', -6, '15:00'),
  ('de3a0000-0006-0007-0000-000000000004', 'de3a0000-0006-0002-0000-000000000004', $j${"fono":{"a-medicamentos":"Anti-histamínico em crise","a-queixa":"Respira pela boca e dorme de boca aberta; encaminhada pela ortodontista","a-marcos":"Normais","a-gestacao":"Sem intercorrências","a-alimentacao":"Chupeta até os 4 anos; mastiga com a boca aberta","a-hist_escolar":"Sem dificuldades","a-hist_auditivo":"Otites de repetição na primeira infância","a-diagnosticos":"Rinite alérgica","a-outras_terapias":"Ortodontia (aparelho expansor)"}}$j$::jsonb, $j${"fono":{"e-voz":"Qualidade vocal adequada","e-fala":"Distorção leve de /s/ (ceceio anterior)","e-motricidade":"Lábios hipotônicos, língua baixa e anteriorizada","e-degluticao":"Atípica, com interposição lingual","e-obs":"Respiração oral com predomínio noturno; avaliar com otorrino."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -25, '13:30', -4, '13:30'),
  ('de3a0000-0006-0007-0000-000000000005', 'de3a0000-0006-0002-0000-000000000005', $j${"fono":{"a-medicamentos":"Nenhum","a-queixa":"Triagem neonatal e dificuldade na amamentação","a-marcos":"Adequados para a idade","a-gestacao":"Parto cesáreo a termo, sem intercorrências","a-alimentacao":"Aleitamento materno exclusivo; dor nos mamilos e mamadas longas","a-hist_auditivo":"Sem histórico de risco para perda auditiva","a-diagnosticos":"Nenhum","a-outras_terapias":"Nenhuma"}}$j$::jsonb, $j${"fono":{"e-voz":"Qualidade vocal adequada","e-triagem_auditiva":"Passou em ambas as orelhas (emissões otoacústicas presentes)","e-freio_lingual":"Frênulo lingual com inserção anteriorizada, classificação alterada (escore 8); discreta limitação de protrusão","e-motricidade":"Sucção e coordenação sucção-deglutição adequadas","e-obs":"Indicada avaliação conjunta com o pediatra; reavaliar a mamada em 2 semanas."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -56, '16:30', -47, '08:00'),
  ('de3a0000-0006-0007-0000-000000000006', 'de3a0000-0006-0002-0000-000000000006', $j${"fono":{"a-medicamentos":"Nenhum","a-queixa":"Gagueira com repetições e bloqueios, pior em apresentações na escola","a-marcos":"Normais","a-gestacao":"Sem intercorrências","a-alimentacao":"Sem queixas","a-hist_escolar":"8º ano, evita falar em sala","a-hist_auditivo":"Normal","a-diagnosticos":"Gagueira desenvolvimental persistente","a-outras_terapias":"Nenhuma"}}$j$::jsonb, $j${"fono":{"e-voz":"Qualidade vocal adequada","e-fala":"Articulação preservada","e-fluencia":"Disfluências em 8% das sílabas: repetições de sílabas e bloqueios; tensão em face","e-motricidade":"Sem alterações","e-obs":"Presença de evitação de palavras e situações de fala."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -31, '14:00', -3, '14:00'),
  ('de3a0000-0006-0007-0000-000000000007', 'de3a0000-0006-0002-0000-000000000007', $j${"fono":{"a-medicamentos":"AAS, losartana","a-queixa":"Engasgos com líquidos e demora para se alimentar após AVC","a-marcos":"Não se aplica","a-alimentacao":"Dieta pastosa, líquidos engrossados","a-diagnosticos":"AVC isquêmico há 3 meses; disfagia orofaríngea","a-hist_auditivo":"Perda auditiva leve bilateral por idade","a-outras_terapias":"Fisioterapia"}}$j$::jsonb, $j${"fono":{"e-voz":"Voz rouca e soprosa","e-fala":"Disartria leve","e-motricidade":"Paresia em língua e lábio direito","e-degluticao":"Tosse após líquidos finos; sem sinais após pastosos","e-obs":"Liberada dieta pastosa; manter líquidos engrossados."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -25, '15:30', -4, '15:30'),
  ('de3a0000-0006-0007-0000-000000000008', 'de3a0000-0006-0002-0000-000000000008', $j${"fono":{"a-medicamentos":"Losartana","a-queixa":"Dificuldade de entender conversas em ambientes com ruído e zumbido no ouvido esquerdo","a-marcos":"Não se aplica","a-alimentacao":"Sem queixas","a-hist_escolar":"Professor há 25 anos, exposição a ruído de sala de aula","a-hist_auditivo":"Perda gradual nos últimos 3 anos; sem cirurgias de ouvido","a-diagnosticos":"Hipertensão","a-outras_terapias":"Nenhuma"}}$j$::jsonb, $j${"fono":{"e-voz":"Disfonia leve ocupacional","e-fala":"Sem alterações","e-triagem_auditiva":"Perda neurossensorial leve a moderada em frequências agudas bilateral","e-obs":"Indicada reabilitação auditiva e proteção vocal."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -28, '08:00', -28, '08:00')
) as v(id, pat, anam, exam, tp, odo, items, d1, t1, d2, t2)
on conflict (id) do nothing;

-- 10. Evoluções no prontuário (15); author_name = profissional que atendeu, professional_id preenchido
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.record_entries (id, clinic_id, patient_id, record_id, author_name, professional_id, entry_text, entry_type, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.rec::uuid, v.author, v.prof::uuid, v.txt, 'evolucao',
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0006-0008-0000-000000000001', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0007-0000-000000000001', 'Dra. Rafaela Pontes Vidal', 'de3a0000-0006-0001-0000-000000000001', 'Avaliação de linguagem: atraso expressivo com boa compreensão. Iniciada terapia lúdica com foco em vocabulário.', -38, '11:30', 60),
  ('de3a0000-0006-0008-0000-000000000002', 'de3a0000-0006-0002-0000-000000000001', 'de3a0000-0006-0007-0000-000000000001', 'Dra. Rafaela Pontes Vidal', 'de3a0000-0006-0001-0000-000000000001', 'Aumento de vocabulário funcional e início de frases de 3 palavras. Orientação aos pais para leitura diária.', -3, '11:30', 40),
  ('de3a0000-0006-0008-0000-000000000003', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0007-0000-000000000002', 'Dra. Rafaela Pontes Vidal', 'de3a0000-0006-0001-0000-000000000001', 'Avaliação fonológica. Distorção do /r/ e líquidas nos encontros; iniciado treino articulatório com jogos.', -35, '11:30', 60),
  ('de3a0000-0006-0008-0000-000000000004', 'de3a0000-0006-0002-0000-000000000002', 'de3a0000-0006-0007-0000-000000000002', 'Dra. Rafaela Pontes Vidal', 'de3a0000-0006-0001-0000-000000000001', '/r/ em início de palavra adquirido. Trabalhando encontros consonantais e generalização.', -7, '11:30', 40),
  ('de3a0000-0006-0008-0000-000000000005', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0007-0000-000000000003', 'Dra. Rafaela Pontes Vidal', 'de3a0000-0006-0001-0000-000000000001', 'Avaliação de linguagem e comunicação social. Terapia com pistas visuais e rotinas estruturadas.', -41, '15:00', 60),
  ('de3a0000-0006-0008-0000-000000000006', 'de3a0000-0006-0002-0000-000000000003', 'de3a0000-0006-0007-0000-000000000003', 'Dra. Rafaela Pontes Vidal', 'de3a0000-0006-0001-0000-000000000001', 'Aumento de iniciativas comunicativas e uso de frases de 4 palavras em rotinas. Devolutiva à escola realizada.', -6, '15:00', 40),
  ('de3a0000-0006-0008-0000-000000000007', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0007-0000-000000000004', 'Dra. Rafaela Pontes Vidal', 'de3a0000-0006-0001-0000-000000000001', 'Avaliação miofuncional: respiração oral e deglutição atípica. Iniciados exercícios de lábios e língua.', -25, '13:30', 60),
  ('de3a0000-0006-0008-0000-000000000008', 'de3a0000-0006-0002-0000-000000000004', 'de3a0000-0006-0007-0000-000000000004', 'Dra. Rafaela Pontes Vidal', 'de3a0000-0006-0001-0000-000000000001', 'Vedamento labial em repouso mais frequente. Ceceio em redução; mantidos exercícios domiciliares.', -4, '13:30', 40),
  ('de3a0000-0006-0008-0000-000000000009', 'de3a0000-0006-0002-0000-000000000005', 'de3a0000-0006-0007-0000-000000000005', 'Dr. Leonardo Aguiar Sobreira', 'de3a0000-0006-0001-0000-000000000002', 'Triagem auditiva neonatal com resultado normal bilateral; frênulo lingual avaliado.', -56, '16:30', 20),
  ('de3a0000-0006-0008-0000-000000000010', 'de3a0000-0006-0002-0000-000000000005', 'de3a0000-0006-0007-0000-000000000005', 'Dr. Leonardo Aguiar Sobreira', 'de3a0000-0006-0001-0000-000000000002', 'Orientações de pega e posição na amamentação. Encaminhamento ao pediatra para conduta sobre o frênulo.', -47, '08:00', 20),
  ('de3a0000-0006-0008-0000-000000000011', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0007-0000-000000000006', 'Dra. Rafaela Pontes Vidal', 'de3a0000-0006-0001-0000-000000000001', 'Avaliação de fluência: gagueira persistente com impacto social. Iniciada terapia com fala suave e dessensibilização.', -31, '14:00', 60),
  ('de3a0000-0006-0008-0000-000000000012', 'de3a0000-0006-0002-0000-000000000006', 'de3a0000-0006-0007-0000-000000000006', 'Dra. Rafaela Pontes Vidal', 'de3a0000-0006-0001-0000-000000000001', 'Redução das disfluências para 4% em conversa. Participou de apresentação com menos tensão.', -3, '14:00', 40),
  ('de3a0000-0006-0008-0000-000000000013', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0007-0000-000000000007', 'Dr. Leonardo Aguiar Sobreira', 'de3a0000-0006-0001-0000-000000000002', 'Avaliação clínica da deglutição: disfagia orofaríngea leve a moderada. Iniciados exercícios de fortalecimento e manobras posturais.', -25, '15:30', 60),
  ('de3a0000-0006-0008-0000-000000000014', 'de3a0000-0006-0002-0000-000000000007', 'de3a0000-0006-0007-0000-000000000007', 'Dr. Leonardo Aguiar Sobreira', 'de3a0000-0006-0001-0000-000000000002', 'Progressão para líquidos levemente engrossados sem tosse. Mantida terapia com foco em força de língua.', -4, '15:30', 40),
  ('de3a0000-0006-0008-0000-000000000015', 'de3a0000-0006-0002-0000-000000000008', 'de3a0000-0006-0007-0000-000000000008', 'Dr. Leonardo Aguiar Sobreira', 'de3a0000-0006-0001-0000-000000000002', 'Avaliação audiológica. Audiometria com perda neurossensorial bilateral em agudos; discutida indicação de aparelho auditivo.', -28, '08:00', 60)
) as v(id, pat, rec, author, prof, txt, d, t, dur)
on conflict (id) do nothing;

-- Verificação (contagens esperadas em docs/demo-seed-video123.md)
select 'professionals' as tabela, count(*) as linhas from public.professionals where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0001-%'
union all
select 'patients' as tabela, count(*) as linhas from public.patients where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0002-%'
union all
select 'procedures' as tabela, count(*) as linhas from public.procedures where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0003-%'
union all
select 'stock_items' as tabela, count(*) as linhas from public.stock_items where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0004-%'
union all
select 'stock_movements' as tabela, count(*) as linhas from public.stock_movements where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0009-%'
union all
select 'appointments' as tabela, count(*) as linhas from public.appointments where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0005-%'
union all
select 'financial_records' as tabela, count(*) as linhas from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0006-%'
union all
select 'medical_records' as tabela, count(*) as linhas from public.medical_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0007-%'
union all
select 'record_entries' as tabela, count(*) as linhas from public.record_entries where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0008-%'
order by 1;

commit;

-- =============================================================================
-- ROLLBACK (descomente tudo, de "begin" a "commit", e rode inteiro).
-- Apaga só o que este arquivo criou: clinic_id da demo + ids com o prefixo de3a0000-0006-.
-- Ordem respeita as FKs (receitas e comissões -> evoluções -> prontuários -> consultas -> estoque -> procedimentos -> pacientes -> profissionais).
-- =============================================================================
-- begin;
-- delete from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0006-%';
-- delete from public.record_entries    where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0008-%';
-- delete from public.medical_records   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0007-%';
-- delete from public.appointments      where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0005-%';
-- delete from public.stock_movements   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0009-%';
-- delete from public.stock_items       where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0004-%';
-- delete from public.procedures        where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0003-%';
-- delete from public.patients          where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0002-%';
-- delete from public.professionals     where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0006-0001-%';
-- commit;
