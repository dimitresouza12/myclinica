-- =============================================================================
-- Seed demo video123 | área: Nutrição (nutri) | arquivo 05-nutri.sql
-- =============================================================================
-- Insere SOMENTE na clínica demo (clinic_id 3916d37d-b247-485e-bd2f-b47be8d44207).
-- Convenção de IDs determinísticos: de3a0000-0005-<tabela>-0000-<seq>
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
  ('de3a0000-0005-0001-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dra. Camila Rangel Teles', 'Clínica', 'nutri', 40, 'CRN-6 12874', now() - interval '208 days'),
  ('de3a0000-0005-0001-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dr. Vinícius Paiva Gondim', 'Esportiva', 'nutri', 40, 'CRN-6 14033', now() - interval '206 days')
on conflict (id) do nothing;

-- 2. Pacientes (8): CPF e RG ficam nulos de propósito; is_active/registration_status usam o default
insert into public.patients (id, clinic_id, name, phone, email, birth_date, gender, address, occupation, emergency_contact, referred_by,
  notes, pet_name, pet_species, pet_breed, pet_weight, pet_age, pet_coat, pet_neutered, convenio, convenio_carteirinha, lgpd_consent, lgpd_consent_at, created_at, updated_at)
values
  ('de3a0000-0005-0002-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Larissa Gadelha Monteiro', '(85) 90000-5001', 'larissa.gadelha@example.com', '1990-04-07', 'Feminino', 'Rua Pinto Madeira, 430 - Aldeota, Fortaleza/CE', 'Gerente de marketing', null, 'Instagram', null, null, null, null, null, null, null, null, null, null, true, now() - interval '97 days', now() - interval '97 days', now() - interval '97 days'),
  ('de3a0000-0005-0002-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Marcelo Tavares Brito', '(85) 90000-5002', 'marcelo.brito@example.com', '1976-09-23', 'Masculino', 'Av. Rui Barbosa, 1100 - Aldeota, Fortaleza/CE', 'Corretor de imóveis', null, 'Encaminhamento do endocrinologista', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 332211 4455', true, now() - interval '94 days', now() - interval '94 days', now() - interval '94 days'),
  ('de3a0000-0005-0002-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Ingrid Souza Lopes', '(85) 90000-5003', 'ingrid.lopes@example.com', '1999-02-14', 'Feminino', 'Rua Padre Mororó, 150 - Cocó, Fortaleza/CE', 'Educadora física', null, 'Indicação do treinador', null, null, null, null, null, null, null, null, null, null, true, now() - interval '91 days', now() - interval '91 days', now() - interval '91 days'),
  ('de3a0000-0005-0002-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Paulo Ricardo Falcão', '(85) 90000-5004', 'paulo.falcao@example.com', '1968-06-30', 'Masculino', 'Rua Ildefonso Albano, 1900 - Aldeota, Fortaleza/CE', 'Empresário', null, 'Encaminhamento do cardiologista', null, null, null, null, null, null, null, null, 'Bradesco Saúde', '8800 1122 3344', true, now() - interval '88 days', now() - interval '88 days', now() - interval '88 days'),
  ('de3a0000-0005-0002-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Natália Vieira Cunha', '(85) 90000-5005', 'natalia.cunha@example.com', '1991-01-29', 'Feminino', 'Rua João Cordeiro, 720 - Aldeota, Fortaleza/CE', 'Fisioterapeuta', null, 'Indicação da obstetra', null, null, null, null, null, null, null, null, null, null, true, now() - interval '85 days', now() - interval '85 days', now() - interval '85 days'),
  ('de3a0000-0005-0002-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Heitor Bernardo Aragão', '(85) 90000-5006', 'heitor.aragao@example.com', '2016-05-12', 'Masculino', 'Rua Marcos Macedo, 1300 - Aldeota, Fortaleza/CE', 'Estudante', 'Mãe: Daniele Aragão (responsável)', 'Indicação do pediatra', null, null, null, null, null, null, null, null, null, null, true, now() - interval '82 days', now() - interval '82 days', now() - interval '82 days'),
  ('de3a0000-0005-0002-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Carolina Mendonça Teixeira', '(85) 90000-5007', 'carolina.teixeira@example.com', '1994-10-03', 'Feminino', 'Rua Lauro Maia, 330 - Dionísio Torres, Fortaleza/CE', 'Jornalista', null, 'Instagram', null, null, null, null, null, null, null, null, null, null, true, now() - interval '79 days', now() - interval '79 days', now() - interval '79 days'),
  ('de3a0000-0005-0002-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Walter Gomes Benevides', '(85) 90000-5008', 'walter.benevides@example.com', '1957-03-21', 'Masculino', 'Rua Padre Valdevino, 900 - Centro, Fortaleza/CE', 'Aposentado', 'Filha: Cláudia Benevides', 'Encaminhamento do geriatra', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 998877 6655', true, now() - interval '76 days', now() - interval '76 days', now() - interval '76 days')
on conflict (id) do nothing;

-- 3. Procedimentos (5): nomes/categorias de procedureSuggestions de specialtyConfig.tsx
insert into public.procedures (id, clinic_id, name, price, category, is_active, is_free, created_at)
values
  ('de3a0000-0005-0003-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Consulta Nutricional', 200, 'Consulta', true, false, now() - interval '150 days'),
  ('de3a0000-0005-0003-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Avaliação Antropométrica', 120, 'Avaliação Nutricional', true, false, now() - interval '150 days'),
  ('de3a0000-0005-0003-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Plano Alimentar', 180, 'Plano Alimentar', true, false, now() - interval '150 days'),
  ('de3a0000-0005-0003-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Retorno Nutricional', 130, 'Consulta', true, false, now() - interval '150 days'),
  ('de3a0000-0005-0003-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Bioimpedância', 90, 'Avaliação Nutricional', true, false, now() - interval '150 days')
on conflict (id) do nothing;

-- 4. Estoque (6 itens; categorias = slugs de stockCategories)
insert into public.stock_items (id, clinic_id, name, category, unit, quantity, min_quantity, cost_price, supplier, is_active, created_at, updated_at)
values
  ('de3a0000-0005-0004-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Fita métrica antropométrica inelástica', 'material', 'un', 6, 2, 24.0, 'NutriMed Equipamentos', true, now() - interval '120 days', now() - interval '5 days'),
  ('de3a0000-0005-0004-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Eletrodos para bioimpedância (pacote)', 'material', 'pct', 12, 5, 18.0, 'NutriMed Equipamentos', true, now() - interval '120 days', now() - interval '7 days'),
  ('de3a0000-0005-0004-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Papel para impressão de planos alimentares (resma)', 'material', 'un', 7, 3, 28.0, 'Papelaria Central', true, now() - interval '120 days', now() - interval '9 days'),
  ('de3a0000-0005-0004-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Folders educativos (pacote com 100)', 'material', 'pct', 4, 2, 65.0, 'Gráfica Expresso', true, now() - interval '120 days', now() - interval '11 days'),
  ('de3a0000-0005-0004-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Álcool 70% (frasco 1 L)', 'material', 'un', 9, 4, 9.5, 'Atacado Higiene', true, now() - interval '120 days', now() - interval '13 days'),
  ('de3a0000-0005-0004-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Balança digital de apoio (pilhas e manutenção)', 'outro', 'un', 2, 1, 35.0, 'NutriMed Equipamentos', true, now() - interval '120 days', now() - interval '15 days')
on conflict (id) do nothing;

-- 5. Movimentações de estoque (12); a quantidade atual do item já considera as saídas
insert into public.stock_movements (id, clinic_id, item_id, type, quantity, reason, user_name, created_at)
values
  ('de3a0000-0005-0009-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000001', 'entrada', 18, 'Compra de reposicao', 'Dra. Camila Rangel Teles', now() - interval '61 days'),
  ('de3a0000-0005-0009-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000001', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Vinícius Paiva Gondim', now() - interval '13 days'),
  ('de3a0000-0005-0009-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000002', 'entrada', 24, 'Compra de reposicao', 'Dra. Camila Rangel Teles', now() - interval '62 days'),
  ('de3a0000-0005-0009-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000002', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Vinícius Paiva Gondim', now() - interval '14 days'),
  ('de3a0000-0005-0009-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000003', 'entrada', 19, 'Compra de reposicao', 'Dra. Camila Rangel Teles', now() - interval '63 days'),
  ('de3a0000-0005-0009-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000003', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Vinícius Paiva Gondim', now() - interval '15 days'),
  ('de3a0000-0005-0009-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000004', 'entrada', 16, 'Compra de reposicao', 'Dra. Camila Rangel Teles', now() - interval '64 days'),
  ('de3a0000-0005-0009-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000004', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Vinícius Paiva Gondim', now() - interval '16 days'),
  ('de3a0000-0005-0009-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000005', 'entrada', 21, 'Compra de reposicao', 'Dra. Camila Rangel Teles', now() - interval '65 days'),
  ('de3a0000-0005-0009-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000005', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Vinícius Paiva Gondim', now() - interval '17 days'),
  ('de3a0000-0005-0009-0000-000000000011', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000006', 'entrada', 14, 'Compra de reposicao', 'Dra. Camila Rangel Teles', now() - interval '66 days'),
  ('de3a0000-0005-0009-0000-000000000012', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0005-0004-0000-000000000006', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Vinícius Paiva Gondim', now() - interval '18 days')
on conflict (id) do nothing;

-- 6. Consultas (32): passado = concluído/faltou/cancelado; semanas 0..2 = hoje e futuro.
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
  ('de3a0000-0005-0005-0000-000000000001', 'de3a0000-0005-0002-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000001', 'Consulta Nutricional', 200, 'concluido', -52, '15:30', 40, null),
  ('de3a0000-0005-0005-0000-000000000002', 'de3a0000-0005-0002-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000002', 'Avaliação Antropométrica', 120, 'concluido', -48, '08:30', 30, null),
  ('de3a0000-0005-0005-0000-000000000003', 'de3a0000-0005-0002-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000003', 'Plano Alimentar', 180, 'concluido', -40, '08:00', 40, null),
  ('de3a0000-0005-0005-0000-000000000004', 'de3a0000-0005-0002-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'faltou', -4, '17:00', 30, null),
  ('de3a0000-0005-0005-0000-000000000005', 'de3a0000-0005-0002-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'agendado', 11, '11:30', 30, 'Reavaliação de medidas e ajuste do plano'),
  ('de3a0000-0005-0005-0000-000000000006', 'de3a0000-0005-0002-0000-000000000002', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000001', 'Consulta Nutricional', 200, 'concluido', -38, '10:30', 40, null),
  ('de3a0000-0005-0005-0000-000000000007', 'de3a0000-0005-0002-0000-000000000002', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000003', 'Plano Alimentar', 180, 'concluido', -33, '13:00', 40, null),
  ('de3a0000-0005-0005-0000-000000000008', 'de3a0000-0005-0002-0000-000000000002', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'concluido', -10, '14:00', 30, null),
  ('de3a0000-0005-0005-0000-000000000009', 'de3a0000-0005-0002-0000-000000000002', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'confirmado', 14, '09:00', 30, null),
  ('de3a0000-0005-0005-0000-000000000010', 'de3a0000-0005-0002-0000-000000000003', 'de3a0000-0005-0001-0000-000000000002', 'de3a0000-0005-0003-0000-000000000001', 'Consulta Nutricional', 200, 'concluido', -49, '16:30', 40, null),
  ('de3a0000-0005-0005-0000-000000000011', 'de3a0000-0005-0002-0000-000000000003', 'de3a0000-0005-0001-0000-000000000002', 'de3a0000-0005-0003-0000-000000000005', 'Bioimpedância', 90, 'cancelado', -18, '10:00', 20, 'Cancelado pelo paciente: imprevisto de trabalho.'),
  ('de3a0000-0005-0005-0000-000000000012', 'de3a0000-0005-0002-0000-000000000003', 'de3a0000-0005-0001-0000-000000000002', 'de3a0000-0005-0003-0000-000000000003', 'Plano Alimentar', 180, 'cancelado', -5, '08:30', 40, 'Cancelado: paciente viajou.'),
  ('de3a0000-0005-0005-0000-000000000013', 'de3a0000-0005-0002-0000-000000000003', 'de3a0000-0005-0001-0000-000000000002', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'confirmado', 9, '16:00', 30, null),
  ('de3a0000-0005-0005-0000-000000000014', 'de3a0000-0005-0002-0000-000000000004', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000001', 'Consulta Nutricional', 200, 'concluido', -46, '09:30', 40, null),
  ('de3a0000-0005-0005-0000-000000000015', 'de3a0000-0005-0002-0000-000000000004', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000003', 'Plano Alimentar', 180, 'concluido', -33, '15:30', 40, null),
  ('de3a0000-0005-0005-0000-000000000016', 'de3a0000-0005-0002-0000-000000000004', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'concluido', -6, '16:30', 30, null),
  ('de3a0000-0005-0005-0000-000000000017', 'de3a0000-0005-0002-0000-000000000005', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000001', 'Consulta Nutricional', 200, 'concluido', -54, '17:30', 40, null),
  ('de3a0000-0005-0005-0000-000000000018', 'de3a0000-0005-0002-0000-000000000005', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000003', 'Plano Alimentar', 180, 'concluido', -35, '16:30', 40, null),
  ('de3a0000-0005-0005-0000-000000000019', 'de3a0000-0005-0002-0000-000000000005', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'concluido', -26, '16:00', 30, null),
  ('de3a0000-0005-0005-0000-000000000020', 'de3a0000-0005-0002-0000-000000000005', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'agendado', 17, '08:00', 30, null),
  ('de3a0000-0005-0005-0000-000000000021', 'de3a0000-0005-0002-0000-000000000006', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000001', 'Consulta Nutricional', 200, 'concluido', -46, '17:00', 40, null),
  ('de3a0000-0005-0005-0000-000000000022', 'de3a0000-0005-0002-0000-000000000006', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000002', 'Avaliação Antropométrica', 120, 'cancelado', -31, '14:00', 30, 'Cancelado pelo paciente com antecedência.'),
  ('de3a0000-0005-0005-0000-000000000023', 'de3a0000-0005-0002-0000-000000000006', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'concluido', -21, '08:30', 30, null),
  ('de3a0000-0005-0005-0000-000000000024', 'de3a0000-0005-0002-0000-000000000006', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'confirmado', 15, '09:00', 30, null),
  ('de3a0000-0005-0005-0000-000000000025', 'de3a0000-0005-0002-0000-000000000007', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000001', 'Consulta Nutricional', 200, 'concluido', -48, '13:30', 40, null),
  ('de3a0000-0005-0005-0000-000000000026', 'de3a0000-0005-0002-0000-000000000007', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000003', 'Plano Alimentar', 180, 'concluido', -41, '15:30', 40, null),
  ('de3a0000-0005-0005-0000-000000000027', 'de3a0000-0005-0002-0000-000000000007', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'concluido', -31, '14:30', 30, null),
  ('de3a0000-0005-0005-0000-000000000028', 'de3a0000-0005-0002-0000-000000000007', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'confirmado', 9, '11:00', 30, null),
  ('de3a0000-0005-0005-0000-000000000029', 'de3a0000-0005-0002-0000-000000000008', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000001', 'Consulta Nutricional', 200, 'concluido', -49, '09:00', 40, null),
  ('de3a0000-0005-0005-0000-000000000030', 'de3a0000-0005-0002-0000-000000000008', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000005', 'Bioimpedância', 90, 'faltou', -34, '14:30', 20, 'Não compareceu; a recepção tentou contato.'),
  ('de3a0000-0005-0005-0000-000000000031', 'de3a0000-0005-0002-0000-000000000008', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000003', 'Plano Alimentar', 180, 'concluido', -21, '17:30', 40, null),
  ('de3a0000-0005-0005-0000-000000000032', 'de3a0000-0005-0002-0000-000000000008', 'de3a0000-0005-0001-0000-000000000001', 'de3a0000-0005-0003-0000-000000000004', 'Retorno Nutricional', 130, 'confirmado', 15, '16:30', 30, null)
) as v(id, pat, prof, proc, pname, price, st, d, t, dur, notes)
cross join lateral (select ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') as ts) x
on conflict (id) do nothing;

-- 7. Receitas (20): uma por consulta concluída (semanas passadas), no valor do procedimento.
-- O gatilho de comissão só gera linhas para beneficiários ativos (hoje o único está inativo).
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.financial_records (id, clinic_id, patient_id, appointment_id, procedure_id, professional_id,
  total_amount, discount_percent, payment_method, convenio, type, category, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.appt::uuid, v.proc::uuid, v.prof::uuid,
       v.total::numeric, v.disc::numeric, v.pm, v.conv, 'receita', v.cat, '[]'::jsonb,
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0005-0006-0000-000000000001', 'de3a0000-0005-0002-0000-000000000001', 'de3a0000-0005-0005-0000-000000000001', 'de3a0000-0005-0003-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 200.0, 0, 'dinheiro', null, 'Consulta', -52, '15:30', 40),
  ('de3a0000-0005-0006-0000-000000000002', 'de3a0000-0005-0002-0000-000000000001', 'de3a0000-0005-0005-0000-000000000002', 'de3a0000-0005-0003-0000-000000000002', 'de3a0000-0005-0001-0000-000000000001', 120.0, 0, 'cartao_credito', null, 'Avaliação Nutricional', -48, '08:30', 30),
  ('de3a0000-0005-0006-0000-000000000003', 'de3a0000-0005-0002-0000-000000000001', 'de3a0000-0005-0005-0000-000000000003', 'de3a0000-0005-0003-0000-000000000003', 'de3a0000-0005-0001-0000-000000000001', 180.0, 0, 'pix', null, 'Plano Alimentar', -40, '08:00', 40),
  ('de3a0000-0005-0006-0000-000000000006', 'de3a0000-0005-0002-0000-000000000002', 'de3a0000-0005-0005-0000-000000000006', 'de3a0000-0005-0003-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 200.0, 0, 'convenio', 'Unimed Fortaleza', 'Consulta', -38, '10:30', 40),
  ('de3a0000-0005-0006-0000-000000000007', 'de3a0000-0005-0002-0000-000000000002', 'de3a0000-0005-0005-0000-000000000007', 'de3a0000-0005-0003-0000-000000000003', 'de3a0000-0005-0001-0000-000000000001', 180.0, 0, 'convenio', 'Unimed Fortaleza', 'Plano Alimentar', -33, '13:00', 40),
  ('de3a0000-0005-0006-0000-000000000008', 'de3a0000-0005-0002-0000-000000000002', 'de3a0000-0005-0005-0000-000000000008', 'de3a0000-0005-0003-0000-000000000004', 'de3a0000-0005-0001-0000-000000000001', 130.0, 0, 'convenio', 'Unimed Fortaleza', 'Retorno', -10, '14:00', 30),
  ('de3a0000-0005-0006-0000-000000000010', 'de3a0000-0005-0002-0000-000000000003', 'de3a0000-0005-0005-0000-000000000010', 'de3a0000-0005-0003-0000-000000000001', 'de3a0000-0005-0001-0000-000000000002', 200.0, 0, 'cartao_debito', null, 'Consulta', -49, '16:30', 40),
  ('de3a0000-0005-0006-0000-000000000014', 'de3a0000-0005-0002-0000-000000000004', 'de3a0000-0005-0005-0000-000000000014', 'de3a0000-0005-0003-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 200.0, 0, 'convenio', 'Bradesco Saúde', 'Consulta', -46, '09:30', 40),
  ('de3a0000-0005-0006-0000-000000000015', 'de3a0000-0005-0002-0000-000000000004', 'de3a0000-0005-0005-0000-000000000015', 'de3a0000-0005-0003-0000-000000000003', 'de3a0000-0005-0001-0000-000000000001', 180.0, 0, 'dinheiro', null, 'Plano Alimentar', -33, '15:30', 40),
  ('de3a0000-0005-0006-0000-000000000016', 'de3a0000-0005-0002-0000-000000000004', 'de3a0000-0005-0005-0000-000000000016', 'de3a0000-0005-0003-0000-000000000004', 'de3a0000-0005-0001-0000-000000000001', 130.0, 0, 'cartao_debito', null, 'Retorno', -6, '16:30', 30),
  ('de3a0000-0005-0006-0000-000000000017', 'de3a0000-0005-0002-0000-000000000005', 'de3a0000-0005-0005-0000-000000000017', 'de3a0000-0005-0003-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 200.0, 0, 'cartao_credito', null, 'Consulta', -54, '17:30', 40),
  ('de3a0000-0005-0006-0000-000000000018', 'de3a0000-0005-0002-0000-000000000005', 'de3a0000-0005-0005-0000-000000000018', 'de3a0000-0005-0003-0000-000000000003', 'de3a0000-0005-0001-0000-000000000001', 180.0, 0, 'cartao_credito', null, 'Plano Alimentar', -35, '16:30', 40),
  ('de3a0000-0005-0006-0000-000000000019', 'de3a0000-0005-0002-0000-000000000005', 'de3a0000-0005-0005-0000-000000000019', 'de3a0000-0005-0003-0000-000000000004', 'de3a0000-0005-0001-0000-000000000001', 130.0, 0, 'cartao_debito', null, 'Retorno', -26, '16:00', 30),
  ('de3a0000-0005-0006-0000-000000000021', 'de3a0000-0005-0002-0000-000000000006', 'de3a0000-0005-0005-0000-000000000021', 'de3a0000-0005-0003-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 200.0, 0, 'pix', null, 'Consulta', -46, '17:00', 40),
  ('de3a0000-0005-0006-0000-000000000023', 'de3a0000-0005-0002-0000-000000000006', 'de3a0000-0005-0005-0000-000000000023', 'de3a0000-0005-0003-0000-000000000004', 'de3a0000-0005-0001-0000-000000000001', 130.0, 0, 'pix', null, 'Retorno', -21, '08:30', 30),
  ('de3a0000-0005-0006-0000-000000000025', 'de3a0000-0005-0002-0000-000000000007', 'de3a0000-0005-0005-0000-000000000025', 'de3a0000-0005-0003-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 180.0, 10, 'cartao_credito', null, 'Consulta', -48, '13:30', 40),
  ('de3a0000-0005-0006-0000-000000000026', 'de3a0000-0005-0002-0000-000000000007', 'de3a0000-0005-0005-0000-000000000026', 'de3a0000-0005-0003-0000-000000000003', 'de3a0000-0005-0001-0000-000000000001', 162.0, 10, 'dinheiro', null, 'Plano Alimentar', -41, '15:30', 40),
  ('de3a0000-0005-0006-0000-000000000027', 'de3a0000-0005-0002-0000-000000000007', 'de3a0000-0005-0005-0000-000000000027', 'de3a0000-0005-0003-0000-000000000004', 'de3a0000-0005-0001-0000-000000000001', 130.0, 0, 'cartao_credito', null, 'Retorno', -31, '14:30', 30),
  ('de3a0000-0005-0006-0000-000000000029', 'de3a0000-0005-0002-0000-000000000008', 'de3a0000-0005-0005-0000-000000000029', 'de3a0000-0005-0003-0000-000000000001', 'de3a0000-0005-0001-0000-000000000001', 200.0, 0, 'cartao_credito', null, 'Consulta', -49, '09:00', 40),
  ('de3a0000-0005-0006-0000-000000000031', 'de3a0000-0005-0002-0000-000000000008', 'de3a0000-0005-0005-0000-000000000031', 'de3a0000-0005-0003-0000-000000000003', 'de3a0000-0005-0001-0000-000000000001', 180.0, 0, 'cartao_credito', null, 'Plano Alimentar', -21, '17:30', 40)
) as v(id, pat, appt, proc, prof, total, disc, pm, conv, cat, d, t, dur)
on conflict (id) do nothing;

-- 8. Despesas da área (3); aluguel e folha já existem na clínica, não são repetidos
insert into public.financial_records (id, clinic_id, total_amount, discount_percent, payment_method, type, category, notes, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.amt::numeric, 0, v.pm, 'despesa', v.cat, v.note, '[]'::jsonb, v.at::timestamptz
from (values
  ('de3a0000-0005-0006-0000-000000000901', 330.0, 'pix', 'Material', 'Fitas métricas e eletrodos de bioimpedância', now() - interval '19 days'),
  ('de3a0000-0005-0006-0000-000000000902', 450.0, 'pix', 'Marketing', 'Conteúdo para redes sociais', now() - interval '36 days'),
  ('de3a0000-0005-0006-0000-000000000903', 520.0, 'cartao_credito', 'Equipamento', 'Balança de bioimpedância (parcela)', now() - interval '57 days')
) as v(id, amt, pm, cat, note, at)
on conflict (id) do nothing;

-- 9. Prontuários (8): anamnese e exame clínico namespaced por área ("nutri"), chaves reais de specialtyConfig.tsx
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.medical_records (id, clinic_id, patient_id, anamnesis, clinical_exam, treatment_plan, odontogram, treatment_plan_items, created_at, updated_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.anam, v.exam, v.tp, v.odo, v.items,
       ((m.monday + v.d1::int + v.t1::time) at time zone 'America/Sao_Paulo'),
       ((m.monday + v.d2::int + v.t2::time) at time zone 'America/Sao_Paulo')
from m
cross join (values
  ('de3a0000-0005-0007-0000-000000000001', 'de3a0000-0005-0002-0000-000000000001', $j${"nutri":{"a-alergia":"Sem alergias ou intolerâncias conhecidas","a-queixa":"Emagrecimento de 10 kg e melhora da disposição","a-hist_clinico":"Sem diabetes ou hipertensão; resistência à insulina leve","a-cirurgias":"Nenhuma","a-medicamentos":"Anticoncepcional","a-habitos":"3 refeições por dia, pula o café da manhã; come fora com frequência","a-recordatorio":"Café com leite; arroz, frango e salada no almoço; pizza no jantar","a-restricoes":"Não gosta de peixe","a-hidratacao":"Cerca de 1,2 litro por dia","a-atividade":"Musculação 3 vezes por semana, 1 hora","a-intestino":"Regular, 1 vez ao dia","a-hist_peso":"Peso máximo de 82 kg; oscilações em dietas restritivas"}}$j$::jsonb, $j${"nutri":{"e-pressao":"120/80 mmHg","e-peso":"78,4","e-altura":"165","e-imc":"28,8 (sobrepeso)","e-cc":"88","e-cq":"0,84","e-gordura":"33","e-massa_magra":"52,5","e-exames_lab":"Glicose 96 mg/dL, HbA1c 5,6%, colesterol total 192, TSH 2,1","e-meta_calorica":"1.650 kcal/dia","e-plano":"Plano com déficit moderado, 5 refeições, proteína em todas as refeições","e-obs":"Meta: perder 8 kg em 16 semanas sem restrições radicais."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -52, '15:30', -40, '08:00'),
  ('de3a0000-0005-0007-0000-000000000002', 'de3a0000-0005-0002-0000-000000000002', $j${"nutri":{"a-alergia":"Sem alergias ou intolerâncias conhecidas","a-queixa":"Controle de diabetes tipo 2 e hipertensão","a-hist_clinico":"Diabetes tipo 2 há 5 anos, hipertensão arterial e esteatose hepática leve","a-cirurgias":"Apendicectomia aos 20 anos","a-medicamentos":"Metformina 850 mg, losartana 50 mg","a-habitos":"Refeições irregulares; lanches por conta do trabalho externo","a-recordatorio":"Pão com ovo no café; marmita de arroz, feijão e carne; lanche de salgado","a-restricoes":"Sem restrições","a-hidratacao":"1 litro por dia","a-atividade":"Sedentário","a-intestino":"Regular","a-hist_peso":"Ganhou 12 kg nos últimos 3 anos"}}$j$::jsonb, $j${"nutri":{"e-pressao":"136/86 mmHg","e-peso":"96","e-altura":"178","e-imc":"30,3 (obesidade grau I)","e-cc":"108","e-cq":"1,02","e-gordura":"31","e-massa_magra":"66,2","e-exames_lab":"Glicose 138 mg/dL, HbA1c 7,4%, triglicerídeos 210","e-meta_calorica":"1.900 kcal/dia","e-plano":"Plano de baixo índice glicêmico, fracionado, com controle de carboidratos","e-obs":"Orientada atividade física leve com liberação do médico."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -38, '10:30', -10, '14:00'),
  ('de3a0000-0005-0007-0000-000000000003', 'de3a0000-0005-0002-0000-000000000003', $j${"nutri":{"a-alergia":"Sem alergias ou intolerâncias conhecidas","a-queixa":"Ganho de massa magra e melhora de desempenho","a-hist_clinico":"Sem doenças","a-cirurgias":"Nenhuma","a-medicamentos":"Whey protein e creatina","a-habitos":"4 refeições, treina em jejum","a-recordatorio":"Ovos e pão no café; arroz, frango e legumes; shake pós-treino","a-restricoes":"Sem restrições","a-hidratacao":"2,5 litros por dia","a-atividade":"Musculação 5 vezes por semana e corrida 2 vezes","a-intestino":"Regular","a-hist_peso":"Peso estável há 2 anos"}}$j$::jsonb, $j${"nutri":{"e-pressao":"120/80 mmHg","e-peso":"58","e-altura":"163","e-imc":"21,8 (eutrofia)","e-cc":"68","e-cq":"0,74","e-gordura":"22","e-massa_magra":"45,2","e-meta_calorica":"2.350 kcal/dia (superávit leve)","e-plano":"Superávit calórico controlado, 2 g de proteína por kg e carboidrato ao redor do treino","e-obs":"Meta: +2 kg de massa magra em 12 semanas."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -49, '16:30', -49, '16:30'),
  ('de3a0000-0005-0007-0000-000000000004', 'de3a0000-0005-0002-0000-000000000004', $j${"nutri":{"a-alergia":"Sem alergias ou intolerâncias conhecidas","a-queixa":"Colesterol e triglicerídeos elevados","a-hist_clinico":"Dislipidemia; pai com infarto aos 58 anos","a-cirurgias":"Nenhuma","a-medicamentos":"Atorvastatina 20 mg","a-habitos":"Almoços longos em restaurantes; consome álcool nos fins de semana","a-recordatorio":"Café com pão e queijo; prato executivo; jantar leve","a-restricoes":"Não gosta de peixe","a-hidratacao":"1,5 litro por dia","a-atividade":"Caminhada 2 vezes por semana","a-intestino":"Regular","a-hist_peso":"Peso estável"}}$j$::jsonb, $j${"nutri":{"e-pressao":"130/84 mmHg","e-peso":"88","e-altura":"176","e-imc":"28,4 (sobrepeso)","e-cc":"102","e-cq":"0,98","e-gordura":"27","e-exames_lab":"Colesterol total 248, LDL 164, HDL 38, triglicerídeos 260","e-meta_calorica":"2.000 kcal/dia","e-plano":"Padrão mediterrâneo com redução de gorduras saturadas e álcool","e-obs":"Repetir perfil lipídico em 3 meses."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -46, '09:30', -6, '16:30'),
  ('de3a0000-0005-0007-0000-000000000005', 'de3a0000-0005-0002-0000-000000000005', $j${"nutri":{"a-alergia":"Sem alergias ou intolerâncias conhecidas","a-queixa":"Acompanhamento nutricional na gestação de 20 semanas","a-hist_clinico":"Gestação de baixo risco, sem diabetes gestacional","a-cirurgias":"Nenhuma","a-medicamentos":"Ácido fólico, ferro e polivitamínico","a-habitos":"5 refeições; enjoos leves pela manhã","a-recordatorio":"Biscoito de água e sal ao acordar; arroz, feijão, frango e legumes; frutas e iogurte nos lanches","a-restricoes":"Evita carnes cruas e peixes crus","a-hidratacao":"2 litros por dia","a-atividade":"Caminhadas leves","a-intestino":"Constipação leve","a-hist_peso":"Peso pré-gestacional 62 kg"}}$j$::jsonb, $j${"nutri":{"e-pressao":"120/80 mmHg","e-peso":"65,5","e-altura":"168","e-imc":"23,2 (pré-gestacional 22,0)","e-cc":"Não aferida (gestação)","e-exames_lab":"Hemoglobina 11,8 g/dL; glicemia de jejum 82 mg/dL","e-meta_calorica":"2.300 kcal/dia","e-plano":"Ganho de peso gestacional adequado (meta total de 11 a 16 kg), fibras e ferro","e-obs":"Reforçada hidratação e ingestão de fibras para constipação."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -54, '17:30', -26, '16:00'),
  ('de3a0000-0005-0007-0000-000000000006', 'de3a0000-0005-0002-0000-000000000006', $j${"nutri":{"a-alergia":"Sem alergias ou intolerâncias conhecidas","a-queixa":"Seletividade alimentar: recusa legumes, verduras e carnes","a-hist_clinico":"Sem doenças; crescimento adequado segundo o pediatra","a-cirurgias":"Nenhuma","a-medicamentos":"Polivitamínico","a-habitos":"Prefere massas, biscoitos e iogurtes; come em frente à televisão","a-recordatorio":"Leite com achocolatado e pão; macarrão com queijo; biscoito recheado","a-restricoes":"Recusa texturas mistas","a-hidratacao":"Pouca água; bebe sucos","a-atividade":"Futebol 2 vezes por semana","a-intestino":"Constipação ocasional","a-hist_peso":"Peso estável"}}$j$::jsonb, $j${"nutri":{"e-pressao":"Não aferida","e-peso":"23,4","e-altura":"121","e-imc":"16,0 (percentil 40, eutrofia)","e-cc":"55","e-meta_calorica":"1.700 kcal/dia","e-plano":"Introdução gradual de novos alimentos com brincadeiras, sem pressão; refeições sem telas","e-obs":"Responsável orientada a oferecer o mesmo alimento até 10 vezes."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -46, '17:00', -21, '08:30'),
  ('de3a0000-0005-0007-0000-000000000007', 'de3a0000-0005-0002-0000-000000000007', $j${"nutri":{"a-alergia":"Intolerância à lactose","a-queixa":"Distensão abdominal e gases após refeições","a-hist_clinico":"Síndrome do intestino irritável; intolerância à lactose confirmada em teste","a-cirurgias":"Nenhuma","a-medicamentos":"Probiótico","a-habitos":"Come rápido e em horários variados","a-recordatorio":"Café com leite; salada e frango; iogurte à tarde","a-restricoes":"Evita lactose; sensível a leguminosas","a-hidratacao":"1,8 litro por dia","a-atividade":"Yoga 3 vezes por semana","a-intestino":"Alternância entre constipação e diarreia","a-hist_peso":"Peso estável"}}$j$::jsonb, $j${"nutri":{"e-pressao":"120/80 mmHg","e-peso":"60,2","e-altura":"167","e-imc":"21,6 (eutrofia)","e-cc":"71","e-cq":"0,75","e-meta_calorica":"1.950 kcal/dia","e-plano":"Dieta com baixo teor de FODMAPs em fase de eliminação por 4 semanas e reintrodução","e-obs":"Manter diário alimentar e de sintomas."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -48, '13:30', -31, '14:30'),
  ('de3a0000-0005-0007-0000-000000000008', 'de3a0000-0005-0002-0000-000000000008', $j${"nutri":{"a-alergia":"Sem alergias ou intolerâncias conhecidas","a-queixa":"Perda de massa muscular e fraqueza","a-hist_clinico":"Hipertensão, sarcopenia em investigação","a-cirurgias":"Prostatectomia há 5 anos","a-medicamentos":"Anlodipino e vitamina D","a-habitos":"Pouco apetite, 3 refeições pequenas","a-recordatorio":"Café com pão; sopa no almoço; chá com bolacha à noite","a-restricoes":"Pouco sal por hipertensão","a-hidratacao":"1 litro por dia","a-atividade":"Caminhadas curtas","a-intestino":"Constipação leve","a-hist_peso":"Perdeu 5 kg em 6 meses"}}$j$::jsonb, $j${"nutri":{"e-pressao":"128/78 mmHg","e-peso":"64","e-altura":"170","e-imc":"22,1 (adequado para idoso)","e-cc":"90","e-gordura":"24","e-massa_magra":"48,6","e-exames_lab":"Albumina 3,6 g/dL, vitamina D 24 ng/mL","e-meta_calorica":"2.100 kcal/dia, proteína 1,2 g por kg","e-plano":"Refeições fracionadas ricas em proteína, suplemento oral e exercícios de força com liberação médica","e-obs":"Encaminhado à fisioterapia para ganho de força."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -49, '09:00', -21, '17:30')
) as v(id, pat, anam, exam, tp, odo, items, d1, t1, d2, t2)
on conflict (id) do nothing;

-- 10. Evoluções no prontuário (15); author_name = profissional que atendeu, professional_id preenchido
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.record_entries (id, clinic_id, patient_id, record_id, author_name, professional_id, entry_text, entry_type, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.rec::uuid, v.author, v.prof::uuid, v.txt, 'evolucao',
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0005-0008-0000-000000000001', 'de3a0000-0005-0002-0000-000000000001', 'de3a0000-0005-0007-0000-000000000001', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Consulta inicial e avaliação antropométrica. Definidos meta de peso e plano com 5 refeições.', -52, '15:30', 40),
  ('de3a0000-0005-0008-0000-000000000002', 'de3a0000-0005-0002-0000-000000000001', 'de3a0000-0005-0007-0000-000000000001', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Perda de 3,2 kg em 6 semanas e redução de 4 cm na cintura. Ajustado plano para jantares em restaurante.', -40, '08:00', 40),
  ('de3a0000-0005-0008-0000-000000000003', 'de3a0000-0005-0002-0000-000000000002', 'de3a0000-0005-0007-0000-000000000002', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Consulta inicial: controle glicêmico e de peso. Entregue plano de baixo índice glicêmico e lista de substituições.', -38, '10:30', 40),
  ('de3a0000-0005-0008-0000-000000000004', 'de3a0000-0005-0002-0000-000000000002', 'de3a0000-0005-0007-0000-000000000002', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'HbA1c em 6,8% e perda de 4 kg. Mantido plano e reforçada caminhada diária.', -10, '14:00', 30),
  ('de3a0000-0005-0008-0000-000000000005', 'de3a0000-0005-0002-0000-000000000003', 'de3a0000-0005-0007-0000-000000000003', 'Dr. Vinícius Paiva Gondim', 'de3a0000-0005-0001-0000-000000000002', 'Avaliação de bioimpedância e hábitos de treino. Plano com superávit leve e distribuição de macros por treino.', -49, '16:30', 40),
  ('de3a0000-0005-0008-0000-000000000006', 'de3a0000-0005-0002-0000-000000000004', 'de3a0000-0005-0007-0000-000000000004', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Consulta para dislipidemia. Orientado padrão mediterrâneo, inclusão de peixes e fibras e redução de álcool.', -46, '09:30', 40),
  ('de3a0000-0005-0008-0000-000000000007', 'de3a0000-0005-0002-0000-000000000004', 'de3a0000-0005-0007-0000-000000000004', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Adesão boa ao plano. Perda de 2,8 kg; repetição do lipidograma agendada.', -6, '16:30', 30),
  ('de3a0000-0005-0008-0000-000000000008', 'de3a0000-0005-0002-0000-000000000005', 'de3a0000-0005-0007-0000-000000000005', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Avaliação nutricional gestacional. Plano com aumento calórico gradual, ferro e fibras.', -54, '17:30', 40),
  ('de3a0000-0005-0008-0000-000000000009', 'de3a0000-0005-0002-0000-000000000005', 'de3a0000-0005-0007-0000-000000000005', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Ganho de peso dentro da curva. Enjoos melhores; constipação controlada com fibras e água.', -26, '16:00', 30),
  ('de3a0000-0005-0008-0000-000000000010', 'de3a0000-0005-0002-0000-000000000006', 'de3a0000-0005-0007-0000-000000000006', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Avaliação com mãe e criança. Definida estratégia de exposição gradual e participação da criança no preparo.', -46, '17:00', 40),
  ('de3a0000-0005-0008-0000-000000000011', 'de3a0000-0005-0002-0000-000000000006', 'de3a0000-0005-0007-0000-000000000006', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Aceitou cenoura e brócolis cozidos em 2 refeições. Mantida estratégia sem pressão.', -21, '08:30', 30),
  ('de3a0000-0005-0008-0000-000000000012', 'de3a0000-0005-0002-0000-000000000007', 'de3a0000-0005-0007-0000-000000000007', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Consulta inicial. Explicada a dieta de baixo FODMAP com lista de trocas; diário de sintomas.', -48, '13:30', 40),
  ('de3a0000-0005-0008-0000-000000000013', 'de3a0000-0005-0002-0000-000000000007', 'de3a0000-0005-0007-0000-000000000007', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Redução de 60% dos gases e do inchaço. Iniciada reintrodução gradual de grupos alimentares.', -31, '14:30', 30),
  ('de3a0000-0005-0008-0000-000000000014', 'de3a0000-0005-0002-0000-000000000008', 'de3a0000-0005-0007-0000-000000000008', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Avaliação com bioimpedância: massa magra reduzida. Plano hiperproteico com suplemento oral e 6 refeições.', -49, '09:00', 40),
  ('de3a0000-0005-0008-0000-000000000015', 'de3a0000-0005-0002-0000-000000000008', 'de3a0000-0005-0007-0000-000000000008', 'Dra. Camila Rangel Teles', 'de3a0000-0005-0001-0000-000000000001', 'Peso estável e mais apetite. Iniciada atividade de força com a fisioterapia.', -21, '17:30', 40)
) as v(id, pat, rec, author, prof, txt, d, t, dur)
on conflict (id) do nothing;

-- Verificação (contagens esperadas em docs/demo-seed-video123.md)
select 'professionals' as tabela, count(*) as linhas from public.professionals where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0001-%'
union all
select 'patients' as tabela, count(*) as linhas from public.patients where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0002-%'
union all
select 'procedures' as tabela, count(*) as linhas from public.procedures where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0003-%'
union all
select 'stock_items' as tabela, count(*) as linhas from public.stock_items where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0004-%'
union all
select 'stock_movements' as tabela, count(*) as linhas from public.stock_movements where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0009-%'
union all
select 'appointments' as tabela, count(*) as linhas from public.appointments where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0005-%'
union all
select 'financial_records' as tabela, count(*) as linhas from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0006-%'
union all
select 'medical_records' as tabela, count(*) as linhas from public.medical_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0007-%'
union all
select 'record_entries' as tabela, count(*) as linhas from public.record_entries where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0008-%'
order by 1;

commit;

-- =============================================================================
-- ROLLBACK (descomente tudo, de "begin" a "commit", e rode inteiro).
-- Apaga só o que este arquivo criou: clinic_id da demo + ids com o prefixo de3a0000-0005-.
-- Ordem respeita as FKs (receitas e comissões -> evoluções -> prontuários -> consultas -> estoque -> procedimentos -> pacientes -> profissionais).
-- =============================================================================
-- begin;
-- delete from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0006-%';
-- delete from public.record_entries    where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0008-%';
-- delete from public.medical_records   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0007-%';
-- delete from public.appointments      where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0005-%';
-- delete from public.stock_movements   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0009-%';
-- delete from public.stock_items       where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0004-%';
-- delete from public.procedures        where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0003-%';
-- delete from public.patients          where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0002-%';
-- delete from public.professionals     where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0005-0001-%';
-- commit;
