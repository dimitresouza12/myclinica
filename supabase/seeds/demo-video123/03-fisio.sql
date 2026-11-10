-- =============================================================================
-- Seed demo video123 | área: Fisioterapia (fisio) | arquivo 03-fisio.sql
-- =============================================================================
-- Insere SOMENTE na clínica demo (clinic_id 3916d37d-b247-485e-bd2f-b47be8d44207).
-- Convenção de IDs determinísticos: de3a0000-0003-<tabela>-0000-<seq>
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
  ('de3a0000-0003-0001-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dra. Juliana Frota Cavalcante', 'Ortopédica', 'fisio', 50, 'CREFITO-6 / 187432-F', now() - interval '208 days'),
  ('de3a0000-0003-0001-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dr. Thiago Mendes Ribeiro', 'Neurológica', 'fisio', 50, 'CREFITO-6 / 192208-F', now() - interval '206 days')
on conflict (id) do nothing;

-- 2. Pacientes (8): CPF e RG ficam nulos de propósito; is_active/registration_status usam o default
insert into public.patients (id, clinic_id, name, phone, email, birth_date, gender, address, occupation, emergency_contact, referred_by,
  notes, pet_name, pet_species, pet_breed, pet_weight, pet_age, pet_coat, pet_neutered, convenio, convenio_carteirinha, lgpd_consent, lgpd_consent_at, created_at, updated_at)
values
  ('de3a0000-0003-0002-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Roberto Carlos Menezes', '(85) 90000-3001', 'roberto.menezes@example.com', '1972-08-14', 'Masculino', 'Rua Padre Valdevino, 540 - Joaquim Távora, Fortaleza/CE', 'Motorista de aplicativo', null, 'Indicação do médico ortopedista', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 123456 7890', true, now() - interval '97 days', now() - interval '97 days', now() - interval '97 days'),
  ('de3a0000-0003-0002-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Ana Beatriz Lobo', '(85) 90000-3002', 'ana.lobo@example.com', '1995-05-27', 'Feminino', 'Rua Henriqueta Galeno, 900 - Dionísio Torres, Fortaleza/CE', 'Corredora amadora / Nutricionista', null, 'Instagram', null, null, null, null, null, null, null, null, null, null, true, now() - interval '94 days', now() - interval '94 days', now() - interval '94 days'),
  ('de3a0000-0003-0002-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Sebastião Freire Albuquerque', '(85) 90000-3003', 'sebastiao.freire@example.com', '1954-12-09', 'Masculino', 'Rua Monsenhor Bruno, 1300 - Aldeota, Fortaleza/CE', 'Aposentado', 'Esposa: Lúcia Freire', 'Encaminhamento do cirurgião', null, null, null, null, null, null, null, null, null, null, true, now() - interval '91 days', now() - interval '91 days', now() - interval '91 days'),
  ('de3a0000-0003-0002-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Cláudia Regina Fontenele', '(85) 90000-3004', 'claudia.fontenele@example.com', '1968-03-18', 'Feminino', 'Rua Carlos Vasconcelos, 250 - Aldeota, Fortaleza/CE', 'Secretária executiva', null, 'Indicação de amiga', null, null, null, null, null, null, null, null, 'Unimed Fortaleza', '0 021 654321 0098', true, now() - interval '88 days', now() - interval '88 days', now() - interval '88 days'),
  ('de3a0000-0003-0002-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Pedro Henrique Lima Barroso', '(85) 90000-3005', 'pedro.barroso@example.com', '2008-07-30', 'Masculino', 'Rua Capitão Gustavo, 330 - Aldeota, Fortaleza/CE', 'Estudante / atleta de vôlei', 'Pai: Alexandre Barroso (responsável)', 'Indicação do treinador', null, null, null, null, null, null, null, null, null, null, true, now() - interval '85 days', now() - interval '85 days', now() - interval '85 days'),
  ('de3a0000-0003-0002-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Márcia Helena Dias', '(85) 90000-3006', 'marcia.dias@example.com', '1989-02-11', 'Feminino', 'Rua Torres Câmara, 480 - Aldeota, Fortaleza/CE', 'Professora', null, 'Indicação da obstetra', null, null, null, null, null, null, null, null, null, null, true, now() - interval '82 days', now() - interval '82 days', now() - interval '82 days'),
  ('de3a0000-0003-0002-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Francisco Eudes Aragão', '(85) 90000-3007', 'francisco.aragao@example.com', '1961-10-05', 'Masculino', 'Rua Pereira Filgueiras, 650 - Centro, Fortaleza/CE', 'Aposentado', 'Esposa: Maria Aragão', 'Encaminhamento do neurologista', null, null, null, null, null, null, null, null, null, null, true, now() - interval '79 days', now() - interval '79 days', now() - interval '79 days'),
  ('de3a0000-0003-0002-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Vitória Gabrielle Costa', '(85) 90000-3008', 'vitoria.costa@example.com', '1999-06-22', 'Feminino', 'Rua José Vilar, 1020 - Meireles, Fortaleza/CE', 'Designer gráfica', null, 'Instagram', null, null, null, null, null, null, null, null, null, null, true, now() - interval '76 days', now() - interval '76 days', now() - interval '76 days')
on conflict (id) do nothing;

-- 3. Procedimentos (7): nomes/categorias de procedureSuggestions de specialtyConfig.tsx
insert into public.procedures (id, clinic_id, name, price, category, is_active, is_free, created_at)
values
  ('de3a0000-0003-0003-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Avaliação Fisioterapêutica', 150, 'Avaliação', true, false, now() - interval '150 days'),
  ('de3a0000-0003-0003-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Sessão de Fisioterapia', 110, 'Consulta', true, false, now() - interval '150 days'),
  ('de3a0000-0003-0003-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Eletroterapia', 70, 'Eletroterapia', true, false, now() - interval '150 days'),
  ('de3a0000-0003-0003-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Pilates Terapêutico', 90, 'Pilates', true, false, now() - interval '150 days'),
  ('de3a0000-0003-0003-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'RPG', 130, 'Outros', true, false, now() - interval '150 days'),
  ('de3a0000-0003-0003-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Massoterapia', 100, 'Massagem', true, false, now() - interval '150 days'),
  ('de3a0000-0003-0003-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Hidroterapia', 120, 'Hidroterapia', true, false, now() - interval '150 days')
on conflict (id) do nothing;

-- 4. Estoque (6 itens; categorias = slugs de stockCategories)
insert into public.stock_items (id, clinic_id, name, category, unit, quantity, min_quantity, cost_price, supplier, is_active, created_at, updated_at)
values
  ('de3a0000-0003-0004-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Faixa elástica (kit com 3 resistências)', 'material', 'kit', 16, 6, 34.0, 'FisioMed Brasil', true, now() - interval '120 days', now() - interval '5 days'),
  ('de3a0000-0003-0004-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Gel condutor para eletroterapia (galão 5 L)', 'material', 'un', 4, 2, 78.0, 'FisioMed Brasil', true, now() - interval '120 days', now() - interval '7 days'),
  ('de3a0000-0003-0004-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Eletrodos autoadesivos (pacote com 4)', 'descartavel', 'pct', 26, 12, 11.5, 'TerapiaCare Distribuidora', true, now() - interval '120 days', now() - interval '9 days'),
  ('de3a0000-0003-0004-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Bola suíça 65 cm', 'equipamento', 'un', 5, 2, 89.0, 'FisioMed Brasil', true, now() - interval '120 days', now() - interval '11 days'),
  ('de3a0000-0003-0004-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Fita kinesio (rolo)', 'material', 'un', 20, 8, 17.9, 'TerapiaCare Distribuidora', true, now() - interval '120 days', now() - interval '13 days'),
  ('de3a0000-0003-0004-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Lençol descartável para maca (rolo)', 'descartavel', 'un', 10, 6, 24.0, 'TerapiaCare Distribuidora', true, now() - interval '120 days', now() - interval '15 days')
on conflict (id) do nothing;

-- 5. Movimentações de estoque (12); a quantidade atual do item já considera as saídas
insert into public.stock_movements (id, clinic_id, item_id, type, quantity, reason, user_name, created_at)
values
  ('de3a0000-0003-0009-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000001', 'entrada', 28, 'Compra de reposicao', 'Dra. Juliana Frota Cavalcante', now() - interval '61 days'),
  ('de3a0000-0003-0009-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000001', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Thiago Mendes Ribeiro', now() - interval '13 days'),
  ('de3a0000-0003-0009-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000002', 'entrada', 16, 'Compra de reposicao', 'Dra. Juliana Frota Cavalcante', now() - interval '62 days'),
  ('de3a0000-0003-0009-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000002', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Thiago Mendes Ribeiro', now() - interval '14 days'),
  ('de3a0000-0003-0009-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000003', 'entrada', 38, 'Compra de reposicao', 'Dra. Juliana Frota Cavalcante', now() - interval '63 days'),
  ('de3a0000-0003-0009-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000003', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Thiago Mendes Ribeiro', now() - interval '15 days'),
  ('de3a0000-0003-0009-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000004', 'entrada', 17, 'Compra de reposicao', 'Dra. Juliana Frota Cavalcante', now() - interval '64 days'),
  ('de3a0000-0003-0009-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000004', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Thiago Mendes Ribeiro', now() - interval '16 days'),
  ('de3a0000-0003-0009-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000005', 'entrada', 32, 'Compra de reposicao', 'Dra. Juliana Frota Cavalcante', now() - interval '65 days'),
  ('de3a0000-0003-0009-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000005', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Thiago Mendes Ribeiro', now() - interval '17 days'),
  ('de3a0000-0003-0009-0000-000000000011', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000006', 'entrada', 22, 'Compra de reposicao', 'Dra. Juliana Frota Cavalcante', now() - interval '66 days'),
  ('de3a0000-0003-0009-0000-000000000012', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0003-0004-0000-000000000006', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Thiago Mendes Ribeiro', now() - interval '18 days')
on conflict (id) do nothing;

-- 6. Consultas (61): passado = concluído/faltou/cancelado; semanas 0..2 = hoje e futuro.
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
  ('de3a0000-0003-0005-0000-000000000001', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000001', 'Avaliação Fisioterapêutica', 150, 'concluido', -39, '16:30', 60, null),
  ('de3a0000-0003-0005-0000-000000000002', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -32, '16:30', 50, null),
  ('de3a0000-0003-0005-0000-000000000003', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'concluido', -25, '16:30', 30, null),
  ('de3a0000-0003-0005-0000-000000000004', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -18, '16:30', 50, null),
  ('de3a0000-0003-0005-0000-000000000005', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'concluido', -11, '16:30', 30, null),
  ('de3a0000-0003-0005-0000-000000000006', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -4, '16:30', 50, null),
  ('de3a0000-0003-0005-0000-000000000007', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'auto_c', 3, '16:30', 30, null),
  ('de3a0000-0003-0005-0000-000000000008', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'agendado', 10, '16:30', 50, 'Sessão semanal'),
  ('de3a0000-0003-0005-0000-000000000009', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'agendado', 17, '16:30', 30, null),
  ('de3a0000-0003-0005-0000-000000000010', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000001', 'Avaliação Fisioterapêutica', 150, 'concluido', -33, '15:00', 60, null),
  ('de3a0000-0003-0005-0000-000000000011', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'concluido', -26, '15:00', 30, null),
  ('de3a0000-0003-0005-0000-000000000012', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'cancelado', -19, '15:00', 50, 'Cancelado pelo paciente: imprevisto de trabalho.'),
  ('de3a0000-0003-0005-0000-000000000013', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'concluido', -12, '15:00', 30, null),
  ('de3a0000-0003-0005-0000-000000000014', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -5, '15:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000015', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'auto_a', 2, '15:00', 30, null),
  ('de3a0000-0003-0005-0000-000000000016', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'agendado', 9, '15:00', 50, 'Sessão semanal'),
  ('de3a0000-0003-0005-0000-000000000017', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'agendado', 16, '15:00', 30, null),
  ('de3a0000-0003-0005-0000-000000000018', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000001', 'Avaliação Fisioterapêutica', 150, 'concluido', -42, '08:00', 60, null),
  ('de3a0000-0003-0005-0000-000000000019', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -35, '08:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000020', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -28, '08:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000021', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -21, '08:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000022', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -14, '08:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000023', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -7, '08:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000024', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'auto_c', 0, '08:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000025', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'agendado', 7, '08:00', 50, 'Sessão semanal'),
  ('de3a0000-0003-0005-0000-000000000026', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'confirmado', 14, '08:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000027', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000001', 'Avaliação Fisioterapêutica', 150, 'concluido', -31, '13:00', 60, null),
  ('de3a0000-0003-0005-0000-000000000028', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000005', 'RPG', 130, 'concluido', -24, '13:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000029', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000005', 'RPG', 130, 'concluido', -17, '13:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000030', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000005', 'RPG', 130, 'faltou', -10, '13:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000031', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000005', 'RPG', 130, 'concluido', -3, '13:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000032', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000005', 'RPG', 130, 'auto_a', 4, '13:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000033', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000005', 'RPG', 130, 'confirmado', 11, '13:00', 50, 'Sessão semanal'),
  ('de3a0000-0003-0005-0000-000000000034', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000005', 'RPG', 130, 'agendado', 18, '13:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000035', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000001', 'Avaliação Fisioterapêutica', 150, 'concluido', -18, '11:30', 60, null),
  ('de3a0000-0003-0005-0000-000000000036', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'concluido', -11, '11:30', 30, null),
  ('de3a0000-0003-0005-0000-000000000037', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -4, '11:30', 50, null),
  ('de3a0000-0003-0005-0000-000000000038', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'auto_c', 3, '11:30', 30, null),
  ('de3a0000-0003-0005-0000-000000000039', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'confirmado', 10, '11:30', 50, 'Sessão semanal'),
  ('de3a0000-0003-0005-0000-000000000040', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000003', 'Eletroterapia', 70, 'agendado', 17, '11:30', 30, null),
  ('de3a0000-0003-0005-0000-000000000041', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000001', 'Avaliação Fisioterapêutica', 150, 'concluido', -24, '16:00', 60, null),
  ('de3a0000-0003-0005-0000-000000000042', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000004', 'Pilates Terapêutico', 90, 'concluido', -17, '16:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000043', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000004', 'Pilates Terapêutico', 90, 'concluido', -10, '16:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000044', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000004', 'Pilates Terapêutico', 90, 'concluido', -3, '16:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000045', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000004', 'Pilates Terapêutico', 90, 'auto_c', 4, '16:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000046', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000004', 'Pilates Terapêutico', 90, 'agendado', 11, '16:00', 50, 'Sessão semanal'),
  ('de3a0000-0003-0005-0000-000000000047', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000004', 'Pilates Terapêutico', 90, 'confirmado', 18, '16:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000048', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0001-0000-000000000002', 'de3a0000-0003-0003-0000-000000000001', 'Avaliação Fisioterapêutica', 150, 'concluido', -42, '15:30', 60, null),
  ('de3a0000-0003-0005-0000-000000000049', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0001-0000-000000000002', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -35, '15:30', 50, null),
  ('de3a0000-0003-0005-0000-000000000050', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0001-0000-000000000002', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -28, '15:30', 50, null),
  ('de3a0000-0003-0005-0000-000000000051', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0001-0000-000000000002', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -21, '15:30', 50, null),
  ('de3a0000-0003-0005-0000-000000000052', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0001-0000-000000000002', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'cancelado', -14, '15:30', 50, 'Cancelado pelo paciente com antecedência.'),
  ('de3a0000-0003-0005-0000-000000000053', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0001-0000-000000000002', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'concluido', -7, '15:30', 50, null),
  ('de3a0000-0003-0005-0000-000000000054', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0001-0000-000000000002', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'auto_c', 0, '15:30', 50, null),
  ('de3a0000-0003-0005-0000-000000000055', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0001-0000-000000000002', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'agendado', 7, '15:30', 50, 'Sessão semanal'),
  ('de3a0000-0003-0005-0000-000000000056', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0001-0000-000000000002', 'de3a0000-0003-0003-0000-000000000002', 'Sessão de Fisioterapia', 110, 'agendado', 14, '15:30', 50, null),
  ('de3a0000-0003-0005-0000-000000000057', 'de3a0000-0003-0002-0000-000000000008', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000001', 'Avaliação Fisioterapêutica', 150, 'concluido', -13, '13:00', 60, null),
  ('de3a0000-0003-0005-0000-000000000058', 'de3a0000-0003-0002-0000-000000000008', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000006', 'Massoterapia', 100, 'concluido', -6, '13:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000059', 'de3a0000-0003-0002-0000-000000000008', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000005', 'RPG', 130, 'auto_a', 1, '13:00', 50, null),
  ('de3a0000-0003-0005-0000-000000000060', 'de3a0000-0003-0002-0000-000000000008', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000006', 'Massoterapia', 100, 'confirmado', 8, '13:00', 50, 'Sessão semanal'),
  ('de3a0000-0003-0005-0000-000000000061', 'de3a0000-0003-0002-0000-000000000008', 'de3a0000-0003-0001-0000-000000000001', 'de3a0000-0003-0003-0000-000000000005', 'RPG', 130, 'confirmado', 15, '13:00', 50, null)
) as v(id, pat, prof, proc, pname, price, st, d, t, dur, notes)
cross join lateral (select ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') as ts) x
on conflict (id) do nothing;

-- 7. Receitas (34): uma por consulta concluída (semanas passadas), no valor do procedimento.
-- O gatilho de comissão só gera linhas para beneficiários ativos (hoje o único está inativo).
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.financial_records (id, clinic_id, patient_id, appointment_id, procedure_id, professional_id,
  total_amount, discount_percent, payment_method, convenio, type, category, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.appt::uuid, v.proc::uuid, v.prof::uuid,
       v.total::numeric, v.disc::numeric, v.pm, v.conv, 'receita', v.cat, '[]'::jsonb,
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0003-0006-0000-000000000001', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0005-0000-000000000001', 'de3a0000-0003-0003-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 150.0, 0, 'convenio', 'Unimed Fortaleza', 'Avaliação', -39, '16:30', 60),
  ('de3a0000-0003-0006-0000-000000000002', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0005-0000-000000000002', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 110.0, 0, 'cartao_debito', null, 'Sessão', -32, '16:30', 50),
  ('de3a0000-0003-0006-0000-000000000003', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0005-0000-000000000003', 'de3a0000-0003-0003-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 70.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -25, '16:30', 30),
  ('de3a0000-0003-0006-0000-000000000004', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0005-0000-000000000004', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 110.0, 0, 'pix', null, 'Sessão', -18, '16:30', 50),
  ('de3a0000-0003-0006-0000-000000000005', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0005-0000-000000000005', 'de3a0000-0003-0003-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 70.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -11, '16:30', 30),
  ('de3a0000-0003-0006-0000-000000000006', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0005-0000-000000000006', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 110.0, 0, 'pix', null, 'Sessão', -4, '16:30', 50),
  ('de3a0000-0003-0006-0000-000000000010', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0005-0000-000000000010', 'de3a0000-0003-0003-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 150.0, 0, 'pix', null, 'Avaliação', -33, '15:00', 60),
  ('de3a0000-0003-0006-0000-000000000011', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0005-0000-000000000011', 'de3a0000-0003-0003-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 70.0, 0, 'pix', null, 'Sessão', -26, '15:00', 30),
  ('de3a0000-0003-0006-0000-000000000013', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0005-0000-000000000013', 'de3a0000-0003-0003-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 70.0, 0, 'pix', null, 'Sessão', -12, '15:00', 30),
  ('de3a0000-0003-0006-0000-000000000014', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0005-0000-000000000014', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 110.0, 0, 'dinheiro', null, 'Sessão', -5, '15:00', 50),
  ('de3a0000-0003-0006-0000-000000000018', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0005-0000-000000000018', 'de3a0000-0003-0003-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 150.0, 0, 'cartao_credito', null, 'Avaliação', -42, '08:00', 60),
  ('de3a0000-0003-0006-0000-000000000019', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0005-0000-000000000019', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 110.0, 0, 'cartao_credito', null, 'Sessão', -35, '08:00', 50),
  ('de3a0000-0003-0006-0000-000000000020', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0005-0000-000000000020', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 110.0, 0, 'pix', null, 'Sessão', -28, '08:00', 50),
  ('de3a0000-0003-0006-0000-000000000021', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0005-0000-000000000021', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 110.0, 0, 'pix', null, 'Sessão', -21, '08:00', 50),
  ('de3a0000-0003-0006-0000-000000000022', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0005-0000-000000000022', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 110.0, 0, 'dinheiro', null, 'Sessão', -14, '08:00', 50),
  ('de3a0000-0003-0006-0000-000000000023', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0005-0000-000000000023', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 110.0, 0, 'dinheiro', null, 'Sessão', -7, '08:00', 50),
  ('de3a0000-0003-0006-0000-000000000027', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0005-0000-000000000027', 'de3a0000-0003-0003-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 150.0, 0, 'cartao_debito', null, 'Avaliação', -31, '13:00', 60),
  ('de3a0000-0003-0006-0000-000000000028', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0005-0000-000000000028', 'de3a0000-0003-0003-0000-000000000005', 'de3a0000-0003-0001-0000-000000000001', 130.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -24, '13:00', 50),
  ('de3a0000-0003-0006-0000-000000000029', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0005-0000-000000000029', 'de3a0000-0003-0003-0000-000000000005', 'de3a0000-0003-0001-0000-000000000001', 130.0, 0, 'pix', null, 'Sessão', -17, '13:00', 50),
  ('de3a0000-0003-0006-0000-000000000031', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0005-0000-000000000031', 'de3a0000-0003-0003-0000-000000000005', 'de3a0000-0003-0001-0000-000000000001', 130.0, 0, 'convenio', 'Unimed Fortaleza', 'Sessão', -3, '13:00', 50),
  ('de3a0000-0003-0006-0000-000000000035', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0005-0000-000000000035', 'de3a0000-0003-0003-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 150.0, 0, 'cartao_debito', null, 'Avaliação', -18, '11:30', 60),
  ('de3a0000-0003-0006-0000-000000000036', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0005-0000-000000000036', 'de3a0000-0003-0003-0000-000000000003', 'de3a0000-0003-0001-0000-000000000001', 70.0, 0, 'pix', null, 'Sessão', -11, '11:30', 30),
  ('de3a0000-0003-0006-0000-000000000037', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0005-0000-000000000037', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000001', 110.0, 0, 'cartao_debito', null, 'Sessão', -4, '11:30', 50),
  ('de3a0000-0003-0006-0000-000000000041', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0005-0000-000000000041', 'de3a0000-0003-0003-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 150.0, 0, 'cartao_credito', null, 'Avaliação', -24, '16:00', 60),
  ('de3a0000-0003-0006-0000-000000000042', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0005-0000-000000000042', 'de3a0000-0003-0003-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 90.0, 0, 'cartao_debito', null, 'Sessão', -17, '16:00', 50),
  ('de3a0000-0003-0006-0000-000000000043', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0005-0000-000000000043', 'de3a0000-0003-0003-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 90.0, 0, 'cartao_debito', null, 'Sessão', -10, '16:00', 50),
  ('de3a0000-0003-0006-0000-000000000044', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0005-0000-000000000044', 'de3a0000-0003-0003-0000-000000000004', 'de3a0000-0003-0001-0000-000000000001', 90.0, 0, 'pix', null, 'Sessão', -3, '16:00', 50),
  ('de3a0000-0003-0006-0000-000000000048', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0005-0000-000000000048', 'de3a0000-0003-0003-0000-000000000001', 'de3a0000-0003-0001-0000-000000000002', 150.0, 0, 'pix', null, 'Avaliação', -42, '15:30', 60),
  ('de3a0000-0003-0006-0000-000000000049', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0005-0000-000000000049', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000002', 110.0, 0, 'cartao_debito', null, 'Sessão', -35, '15:30', 50),
  ('de3a0000-0003-0006-0000-000000000050', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0005-0000-000000000050', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000002', 110.0, 0, 'pix', null, 'Sessão', -28, '15:30', 50),
  ('de3a0000-0003-0006-0000-000000000051', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0005-0000-000000000051', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000002', 110.0, 0, 'cartao_credito', null, 'Sessão', -21, '15:30', 50),
  ('de3a0000-0003-0006-0000-000000000053', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0005-0000-000000000053', 'de3a0000-0003-0003-0000-000000000002', 'de3a0000-0003-0001-0000-000000000002', 110.0, 0, 'cartao_credito', null, 'Sessão', -7, '15:30', 50),
  ('de3a0000-0003-0006-0000-000000000057', 'de3a0000-0003-0002-0000-000000000008', 'de3a0000-0003-0005-0000-000000000057', 'de3a0000-0003-0003-0000-000000000001', 'de3a0000-0003-0001-0000-000000000001', 150.0, 0, 'cartao_debito', null, 'Avaliação', -13, '13:00', 60),
  ('de3a0000-0003-0006-0000-000000000058', 'de3a0000-0003-0002-0000-000000000008', 'de3a0000-0003-0005-0000-000000000058', 'de3a0000-0003-0003-0000-000000000006', 'de3a0000-0003-0001-0000-000000000001', 100.0, 0, 'cartao_credito', null, 'Sessão', -6, '13:00', 50)
) as v(id, pat, appt, proc, prof, total, disc, pm, conv, cat, d, t, dur)
on conflict (id) do nothing;

-- 8. Despesas da área (3); aluguel e folha já existem na clínica, não são repetidos
insert into public.financial_records (id, clinic_id, total_amount, discount_percent, payment_method, type, category, notes, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.amt::numeric, 0, v.pm, 'despesa', v.cat, v.note, '[]'::jsonb, v.at::timestamptz
from (values
  ('de3a0000-0003-0006-0000-000000000901', 540.0, 'pix', 'Material', 'Eletrodos, gel e faixas elásticas', now() - interval '20 days'),
  ('de3a0000-0003-0006-0000-000000000902', 890.0, 'cartao_credito', 'Equipamento', 'Bolas suíças e colchonetes novos', now() - interval '41 days'),
  ('de3a0000-0003-0006-0000-000000000903', 350.0, 'pix', 'Marketing', 'Impulsionamento de posts sobre dor lombar', now() - interval '58 days')
) as v(id, amt, pm, cat, note, at)
on conflict (id) do nothing;

-- 9. Prontuários (8): anamnese e exame clínico namespaced por área ("fisio"), chaves reais de specialtyConfig.tsx
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.medical_records (id, clinic_id, patient_id, anamnesis, clinical_exam, treatment_plan, odontogram, treatment_plan_items, created_at, updated_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.anam, v.exam, v.tp, v.odo, v.items,
       ((m.monday + v.d1::int + v.t1::time) at time zone 'America/Sao_Paulo'),
       ((m.monday + v.d2::int + v.t2::time) at time zone 'America/Sao_Paulo')
from m
cross join (values
  ('de3a0000-0003-0007-0000-000000000001', 'de3a0000-0003-0002-0000-000000000001', $j${"fisio":{"a-alergia":"Nega alergias","a-queixa":"Dor lombar há 4 meses que irradia para a perna direita","a-diagnostico":"Lombalgia crônica com protrusão discal L4-L5 (RM)","a-regiao":"Coluna lombar","a-inicio":"Início gradual, piora com longos períodos sentado ao volante","a-dor":"7/10 ao final do dia; tipo pontada com queimação","a-fatores":"Piora sentado e ao acordar; melhora com caminhada","a-cirurgias":"Nenhuma","a-comorbidades":"Hipertensão controlada","a-medicamentos":"Losartana; analgésico quando necessário","a-exames":"Ressonância magnética de coluna lombar","a-sessoes":"20 sessões, 2 vezes por semana"}}$j$::jsonb, $j${"fisio":{"e-sensibilidade":"Preservada, sem parestesias","e-postura":"Retificação da lordose lombar, anteriorização de cabeça","e-adm":"Flexão de tronco 50 graus (limitada por dor)","e-forca":"Extensores de quadril grau 4","e-testes":"Lasègue positivo à direita a 50 graus","e-palpacao":"Pontos-gatilho em quadrado lombar e glúteo médio","e-edema":"Ausente","e-marcha":"Marcha antálgica leve","e-hipotese":"Lombociatalgia por protrusão discal L4-L5","e-obs":"Meta: reduzir dor para 3/10 em 6 semanas."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -39, '16:30', -4, '16:30'),
  ('de3a0000-0003-0007-0000-000000000002', 'de3a0000-0003-0002-0000-000000000002', $j${"fisio":{"a-alergia":"Nega alergias","a-queixa":"Dor no joelho direito ao correr e subir escadas","a-diagnostico":"Tendinopatia patelar (USG)","a-regiao":"Joelho direito","a-inicio":"Após aumento do volume de treino para meia maratona","a-dor":"6/10 durante a corrida; pontada abaixo da patela","a-fatores":"Piora com agachamento e corrida em descida","a-cirurgias":"Nenhuma","a-comorbidades":"Nenhuma","a-medicamentos":"Nenhum","a-exames":"Ultrassonografia de joelho","a-sessoes":"16 sessões, 2 vezes por semana"}}$j$::jsonb, $j${"fisio":{"e-sensibilidade":"Preservada, sem parestesias","e-postura":"Valgo dinâmico de joelho no agachamento unipodal","e-adm":"Joelho: 0 a 135 graus, indolor","e-forca":"Quadríceps 4+, glúteo médio 4","e-testes":"Teste de Clarke negativo; dor ao salto unipodal","e-palpacao":"Dor à palpação do polo inferior da patela","e-edema":"Ausente","e-marcha":"Sem alterações","e-hipotese":"Tendinopatia patelar direita relacionada à carga","e-obs":"Manter corrida reduzida e progressão de cargas isométricas."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -33, '15:00', -5, '15:00'),
  ('de3a0000-0003-0007-0000-000000000003', 'de3a0000-0003-0002-0000-000000000003', $j${"fisio":{"a-alergia":"Nega alergias","a-queixa":"Reabilitação após artroplastia total de joelho esquerdo","a-diagnostico":"Gonartrose grau IV tratada com prótese total de joelho","a-regiao":"Joelho esquerdo","a-inicio":"Cirurgia há 3 semanas","a-dor":"4/10 ao movimentar; edema vespertino","a-fatores":"Melhora com crioterapia e elevação do membro","a-cirurgias":"Artroplastia total de joelho esquerdo","a-comorbidades":"Hipertensão e diabetes tipo 2","a-medicamentos":"Anticoagulante profilático, losartana, metformina","a-exames":"Radiografia pós-operatória","a-sessoes":"24 sessões, 3 vezes por semana"}}$j$::jsonb, $j${"fisio":{"e-sensibilidade":"Preservada, sem parestesias","e-postura":"Marcha com andador","e-adm":"Joelho esquerdo: 0 a 80 graus de flexão","e-forca":"Quadríceps esquerdo grau 3","e-edema":"Edema moderado em joelho e panturrilha","e-marcha":"Com andador, apoio parcial","e-hipotese":"Pós-operatório de ATJ esquerda, déficit de flexão e força","e-obs":"Meta: flexão de 110 graus em 8 semanas."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -42, '08:00', -7, '08:00'),
  ('de3a0000-0003-0007-0000-000000000004', 'de3a0000-0003-0002-0000-000000000004', $j${"fisio":{"a-alergia":"Nega alergias","a-queixa":"Dor cervical e cefaleia tensional há 6 meses","a-diagnostico":"Cervicalgia postural","a-regiao":"Coluna cervical e ombros","a-inicio":"Piora após mudança para trabalho remoto","a-dor":"5/10; tipo tensão e peso","a-fatores":"Piora ao final do dia, melhora com calor","a-cirurgias":"Nenhuma","a-comorbidades":"Nenhuma","a-medicamentos":"Relaxante muscular eventual","a-exames":"Raio X de coluna cervical","a-sessoes":"12 sessões de RPG, 1 vez por semana"}}$j$::jsonb, $j${"fisio":{"e-sensibilidade":"Preservada, sem parestesias","e-postura":"Anteriorização de cabeça e ombros protusos","e-adm":"Rotação cervical 60 graus bilateral","e-forca":"Flexores profundos do pescoço fracos","e-testes":"Spurling negativo","e-palpacao":"Pontos-gatilho em trapézio superior e suboccipitais","e-hipotese":"Cervicalgia postural com tensão miofascial","e-obs":"Orientada ergonomia da estação de trabalho."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -31, '13:00', -3, '13:00'),
  ('de3a0000-0003-0007-0000-000000000005', 'de3a0000-0003-0002-0000-000000000005', $j${"fisio":{"a-alergia":"Nega alergias","a-queixa":"Entorse de tornozelo direito durante jogo há 10 dias","a-diagnostico":"Entorse grau II do ligamento talofibular anterior","a-regiao":"Tornozelo direito","a-inicio":"Trauma em inversão ao aterrissar de bloqueio","a-dor":"5/10 à carga; edema lateral","a-fatores":"Piora ao caminhar em terreno irregular","a-cirurgias":"Nenhuma","a-comorbidades":"Nenhuma","a-medicamentos":"Anti-inflamatório por 5 dias","a-exames":"Raio X sem fratura","a-sessoes":"12 sessões, 2 vezes por semana"}}$j$::jsonb, $j${"fisio":{"e-sensibilidade":"Preservada, sem parestesias","e-adm":"Dorsiflexão 10 graus (limitada)","e-forca":"Fibulares grau 3","e-testes":"Gaveta anterior positiva leve","e-edema":"Edema maleolar lateral com leve equimose","e-marcha":"Claudicante","e-hipotese":"Entorse de tornozelo grau II","e-obs":"Liberação para o esporte após testes funcionais."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -18, '11:30', -4, '11:30'),
  ('de3a0000-0003-0007-0000-000000000006', 'de3a0000-0003-0002-0000-000000000006', $j${"fisio":{"a-alergia":"Nega alergias","a-queixa":"Dor lombar e pélvica na gestação de 24 semanas","a-diagnostico":"Gestação sem intercorrências; liberada pela obstetra","a-regiao":"Lombar e cintura pélvica","a-inicio":"Início no segundo trimestre","a-dor":"5/10 ao final do dia","a-fatores":"Piora em pé por longos períodos; melhora deitada de lado","a-cirurgias":"Nenhuma","a-comorbidades":"Nenhuma","a-medicamentos":"Polivitamínico gestacional","a-sessoes":"Pilates 2 vezes por semana até o fim da gestação"}}$j$::jsonb, $j${"fisio":{"e-sensibilidade":"Preservada, sem parestesias","e-postura":"Hiperlordose lombar, aumento da base de sustentação","e-adm":"Preservada","e-forca":"Assoalho pélvico e abdominais profundos reduzidos","e-testes":"Teste de dor pélvica posterior positivo","e-edema":"Edema discreto em tornozelos","e-hipotese":"Dor lombopélvica gestacional","e-obs":"Evitar decúbito dorsal prolongado."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -24, '16:00', -3, '16:00'),
  ('de3a0000-0003-0007-0000-000000000007', 'de3a0000-0003-0002-0000-000000000007', $j${"fisio":{"a-alergia":"Nega alergias","a-queixa":"Fraqueza e dificuldade de marcha após AVC isquêmico há 5 meses","a-diagnostico":"AVC isquêmico em território de ACM esquerda com hemiparesia direita","a-regiao":"Hemicorpo direito","a-inicio":"AVC há 5 meses; internação de 12 dias","a-dor":"2/10 em ombro direito","a-fatores":"Cansaço piora a marcha; melhora com apoio","a-cirurgias":"Nenhuma","a-comorbidades":"Hipertensão e dislipidemia","a-medicamentos":"AAS, atorvastatina, losartana","a-exames":"Tomografia de crânio","a-sessoes":"3 vezes por semana, tempo indeterminado"}}$j$::jsonb, $j${"fisio":{"e-sensibilidade":"Hipoestesia leve em mão direita","e-postura":"Assimetria de tronco, tendência à inclinação à direita","e-adm":"Ombro direito com limitação a 100 graus","e-forca":"Membro superior D grau 3, inferior D grau 4","e-edema":"Ausente","e-marcha":"Ceifante leve, usa bengala","e-hipotese":"Hemiparesia direita pós-AVC, em fase crônica inicial","e-obs":"Treino de marcha, equilíbrio e uso funcional do membro superior."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -42, '15:30', -7, '15:30'),
  ('de3a0000-0003-0007-0000-000000000008', 'de3a0000-0003-0002-0000-000000000008', $j${"fisio":{"a-alergia":"Nega alergias","a-queixa":"Dor cervical e formigamento no braço esquerdo ao usar o computador","a-diagnostico":"Hérnia de disco cervical C5-C6 (RM)","a-regiao":"Coluna cervical, braço esquerdo","a-inicio":"Há 2 meses, progressiva","a-dor":"6/10; pontada com formigamento","a-fatores":"Piora com tela e travesseiro alto; melhora com repouso","a-cirurgias":"Nenhuma","a-comorbidades":"Nenhuma","a-medicamentos":"Anti-inflamatório eventual","a-exames":"Ressonância magnética cervical","a-sessoes":"12 sessões, 2 vezes por semana"}}$j$::jsonb, $j${"fisio":{"e-sensibilidade":"Parestesia em dermátomo C6 esquerdo","e-postura":"Anteriorização de cabeça, escápulas aladas","e-adm":"Rotação esquerda 55 graus com dor","e-forca":"Tríceps esquerdo grau 4+","e-testes":"Spurling positivo à esquerda","e-palpacao":"Contratura de trapézio e elevador da escápula","e-hipotese":"Radiculopatia cervical C6 por hérnia C5-C6","e-obs":"Evitar manobras de alta velocidade."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -13, '13:00', -6, '13:00')
) as v(id, pat, anam, exam, tp, odo, items, d1, t1, d2, t2)
on conflict (id) do nothing;

-- 10. Evoluções no prontuário (16); author_name = profissional que atendeu, professional_id preenchido
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.record_entries (id, clinic_id, patient_id, record_id, author_name, professional_id, entry_text, entry_type, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.rec::uuid, v.author, v.prof::uuid, v.txt, 'evolucao',
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0003-0008-0000-000000000001', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0007-0000-000000000001', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Avaliação: lombociatalgia à direita. Iniciado protocolo com TENS, mobilização neural e fortalecimento de core.', -39, '16:30', 60),
  ('de3a0000-0003-0008-0000-000000000002', 'de3a0000-0003-0002-0000-000000000001', 'de3a0000-0003-0007-0000-000000000001', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Dor 4/10, Lasègue negativo. Evoluído para exercícios de estabilização lombopélvica; orientações de pausas ao dirigir.', -4, '16:30', 50),
  ('de3a0000-0003-0008-0000-000000000003', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0007-0000-000000000002', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Avaliação: tendinopatia patelar. Iniciados isométricos de quadríceps e controle de carga de treino.', -33, '15:00', 60),
  ('de3a0000-0003-0008-0000-000000000004', 'de3a0000-0003-0002-0000-000000000002', 'de3a0000-0003-0007-0000-000000000002', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Dor 2/10. Progressão para fortalecimento excêntrico e retorno gradual à corrida.', -5, '15:00', 50),
  ('de3a0000-0003-0008-0000-000000000005', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0007-0000-000000000003', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Início da reabilitação pós-ATJ: drenagem, ganho de amplitude e ativação de quadríceps.', -42, '08:00', 60),
  ('de3a0000-0003-0008-0000-000000000006', 'de3a0000-0003-0002-0000-000000000003', 'de3a0000-0003-0007-0000-000000000003', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Flexão em 100 graus, marcha com bengala. Iniciado treino de equilíbrio e escadas.', -7, '08:00', 50),
  ('de3a0000-0003-0008-0000-000000000007', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0007-0000-000000000004', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Avaliação postural global. Iniciado RPG com alongamento de cadeias posteriores e reeducação respiratória.', -31, '13:00', 60),
  ('de3a0000-0003-0008-0000-000000000008', 'de3a0000-0003-0002-0000-000000000004', 'de3a0000-0003-0007-0000-000000000004', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Dor 2/10, cefaleia menos frequente. Mantido RPG e exercícios domiciliares.', -3, '13:00', 50),
  ('de3a0000-0003-0008-0000-000000000009', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0007-0000-000000000005', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Fase inicial: controle de edema, mobilização e ativação de fibulares. Uso de tornozeleira.', -18, '11:30', 60),
  ('de3a0000-0003-0008-0000-000000000010', 'de3a0000-0003-0002-0000-000000000005', 'de3a0000-0003-0007-0000-000000000005', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Sem edema, dorsiflexão completa. Treino proprioceptivo e pliometria leve; retorno ao vôlei em 3 semanas.', -4, '11:30', 50),
  ('de3a0000-0003-0008-0000-000000000011', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0007-0000-000000000006', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Avaliação gestacional. Pilates adaptado com foco em estabilização e respiração; liberação obstétrica conferida.', -24, '16:00', 60),
  ('de3a0000-0003-0008-0000-000000000012', 'de3a0000-0003-0002-0000-000000000006', 'de3a0000-0003-0007-0000-000000000006', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Dor 2/10. Mantidos exercícios de assoalho pélvico e mobilidade pélvica.', -3, '16:00', 50),
  ('de3a0000-0003-0008-0000-000000000013', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0007-0000-000000000007', 'Dr. Thiago Mendes Ribeiro', 'de3a0000-0003-0001-0000-000000000002', 'Avaliação neurofuncional. Iniciado treino de transferências, equilíbrio sentado e em pé e estimulação sensorial.', -42, '15:30', 60),
  ('de3a0000-0003-0008-0000-000000000014', 'de3a0000-0003-0002-0000-000000000007', 'de3a0000-0003-0007-0000-000000000007', 'Dr. Thiago Mendes Ribeiro', 'de3a0000-0003-0001-0000-000000000002', 'Marcha com bengala sem pausas por 100 metros. Evoluindo para treino de dupla tarefa e escada.', -7, '15:30', 50),
  ('de3a0000-0003-0008-0000-000000000015', 'de3a0000-0003-0002-0000-000000000008', 'de3a0000-0003-0007-0000-000000000008', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Avaliação. Iniciada terapia manual suave, tração cervical leve e orientação postural.', -13, '13:00', 60),
  ('de3a0000-0003-0008-0000-000000000016', 'de3a0000-0003-0002-0000-000000000008', 'de3a0000-0003-0007-0000-000000000008', 'Dra. Juliana Frota Cavalcante', 'de3a0000-0003-0001-0000-000000000001', 'Parestesia menos frequente, dor 3/10. Mantida terapia manual com RPG nas sessões alternadas.', -6, '13:00', 50)
) as v(id, pat, rec, author, prof, txt, d, t, dur)
on conflict (id) do nothing;

-- Verificação (contagens esperadas em docs/demo-seed-video123.md)
select 'professionals' as tabela, count(*) as linhas from public.professionals where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0001-%'
union all
select 'patients' as tabela, count(*) as linhas from public.patients where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0002-%'
union all
select 'procedures' as tabela, count(*) as linhas from public.procedures where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0003-%'
union all
select 'stock_items' as tabela, count(*) as linhas from public.stock_items where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0004-%'
union all
select 'stock_movements' as tabela, count(*) as linhas from public.stock_movements where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0009-%'
union all
select 'appointments' as tabela, count(*) as linhas from public.appointments where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0005-%'
union all
select 'financial_records' as tabela, count(*) as linhas from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0006-%'
union all
select 'medical_records' as tabela, count(*) as linhas from public.medical_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0007-%'
union all
select 'record_entries' as tabela, count(*) as linhas from public.record_entries where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0008-%'
order by 1;

commit;

-- =============================================================================
-- ROLLBACK (descomente tudo, de "begin" a "commit", e rode inteiro).
-- Apaga só o que este arquivo criou: clinic_id da demo + ids com o prefixo de3a0000-0003-.
-- Ordem respeita as FKs (receitas e comissões -> evoluções -> prontuários -> consultas -> estoque -> procedimentos -> pacientes -> profissionais).
-- =============================================================================
-- begin;
-- delete from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0006-%';
-- delete from public.record_entries    where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0008-%';
-- delete from public.medical_records   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0007-%';
-- delete from public.appointments      where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0005-%';
-- delete from public.stock_movements   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0009-%';
-- delete from public.stock_items       where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0004-%';
-- delete from public.procedures        where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0003-%';
-- delete from public.patients          where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0002-%';
-- delete from public.professionals     where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0003-0001-%';
-- commit;
