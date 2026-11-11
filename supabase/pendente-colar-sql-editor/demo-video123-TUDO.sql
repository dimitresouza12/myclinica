-- =============================================================================
-- Seed demo video123 | área: Veterinária (vet) | arquivo 01-vet.sql
-- =============================================================================
-- Insere SOMENTE na clínica demo (clinic_id 3916d37d-b247-485e-bd2f-b47be8d44207).
-- Convenção de IDs determinísticos: de3a0000-0001-<tabela>-0000-<seq>
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
  ('de3a0000-0001-0001-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dra. Larissa Montenegro', 'Clínico Geral', 'vet', 30, 'CRMV-CE 08412', now() - interval '208 days'),
  ('de3a0000-0001-0001-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dr. Caio Bezerra', 'Cirurgia', 'vet', 30, 'CRMV-CE 07965', now() - interval '206 days')
on conflict (id) do nothing;

-- 2. Pacientes (8): CPF e RG ficam nulos de propósito; is_active/registration_status usam o default
insert into public.patients (id, clinic_id, name, phone, email, birth_date, gender, address, occupation, emergency_contact, referred_by,
  notes, pet_name, pet_species, pet_breed, pet_weight, pet_age, pet_coat, pet_neutered, convenio, convenio_carteirinha, lgpd_consent, lgpd_consent_at, created_at, updated_at)
values
  ('de3a0000-0001-0002-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Marina Albuquerque Lima', '(85) 90000-1001', 'marina.albuquerque@example.com', '1989-03-14', 'Feminino', 'Rua Tibúrcio Cavalcante, 1240 - Aldeota, Fortaleza/CE', 'Analista financeira', null, 'Indicação de amiga', 'Tutora do Thor. Prefere contato por mensagem.', 'Thor', 'Canino', 'Labrador Retriever', 32.5, '5 anos', 'Preta, curta', true, null, null, true, now() - interval '97 days', now() - interval '97 days', now() - interval '97 days'),
  ('de3a0000-0001-0002-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Rodrigo Pinheiro Castro', '(85) 90000-1002', 'rodrigo.pinheiro@example.com', '1984-11-02', 'Masculino', 'Av. Santos Dumont, 3050 - Meireles, Fortaleza/CE', 'Professor', null, 'Instagram da clínica', null, 'Mel', 'Felino', 'SRD (Vira-lata)', 4.2, '3 anos', 'Tricolor', true, null, null, true, now() - interval '94 days', now() - interval '94 days', now() - interval '94 days'),
  ('de3a0000-0001-0002-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Camila Nogueira Ximenes', '(85) 90000-1003', 'camila.ximenes@example.com', '1993-07-21', 'Feminino', 'Rua Desembargador Moreira, 2100 - Dionísio Torres, Fortaleza/CE', 'Designer', null, 'Já era cliente', null, 'Bob', 'Canino', 'Shih Tzu', 7.8, '8 anos', 'Branco e caramelo', false, null, null, true, now() - interval '91 days', now() - interval '91 days', now() - interval '91 days'),
  ('de3a0000-0001-0002-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Eduardo Sampaio Rocha', '(85) 90000-1004', 'eduardo.sampaio@example.com', '1978-01-30', 'Masculino', 'Rua Osvaldo Cruz, 410 - Meireles, Fortaleza/CE', 'Engenheiro civil', null, 'Indicação do veterinário anterior', null, 'Luna', 'Canino', 'Border Collie', 19.0, '2 anos', 'Preta e branca', true, null, null, true, now() - interval '88 days', now() - interval '88 days', now() - interval '88 days'),
  ('de3a0000-0001-0002-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Patrícia Gomes Ferreira', '(85) 90000-1005', 'patricia.gomes@example.com', '1990-09-09', 'Feminino', 'Rua Padre Mororó, 780 - Cocó, Fortaleza/CE', 'Enfermeira', null, 'Indicação de amigo', null, 'Pipoca', 'Ave', 'Calopsita', 0.09, '1 ano', 'Cinza com bochecha laranja', null, null, null, true, now() - interval '85 days', now() - interval '85 days', now() - interval '85 days'),
  ('de3a0000-0001-0002-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Leandro Alves Medeiros', '(85) 90000-1006', 'leandro.medeiros@example.com', '1996-05-17', 'Masculino', 'Rua Ana Bilhar, 1560 - Meireles, Fortaleza/CE', 'Desenvolvedor', null, 'Google', null, 'Mingau', 'Coelho', 'Mini Lop', 1.6, '2 anos', 'Branco e cinza', false, null, null, true, now() - interval '82 days', now() - interval '82 days', now() - interval '82 days'),
  ('de3a0000-0001-0002-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Juliana Teixeira Brandão', '(85) 90000-1007', 'juliana.brandao@example.com', '1987-12-04', 'Feminino', 'Av. Washington Soares, 909 - Edson Queiroz, Fortaleza/CE', 'Advogada', null, 'Indicação de amiga', null, 'Simba', 'Felino', 'Persa', 5.1, '11 anos', 'Laranja, pelo longo', true, null, null, true, now() - interval '79 days', now() - interval '79 days', now() - interval '79 days'),
  ('de3a0000-0001-0002-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Fábio Cavalcante Neto', '(85) 90000-1008', 'fabio.cavalcante@example.com', '1981-08-26', 'Masculino', 'Rua Marcos Macedo, 700 - Aldeota, Fortaleza/CE', 'Empresário', null, 'Já era cliente', null, 'Duque', 'Canino', 'Bulldog Francês', 12.4, '4 anos', 'Tigrada', false, null, null, true, now() - interval '76 days', now() - interval '76 days', now() - interval '76 days')
on conflict (id) do nothing;

-- 3. Procedimentos (8): nomes/categorias de procedureSuggestions de specialtyConfig.tsx
insert into public.procedures (id, clinic_id, name, price, category, is_active, is_free, created_at)
values
  ('de3a0000-0001-0003-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Consulta Veterinária', 120, 'Consulta', true, false, now() - interval '150 days'),
  ('de3a0000-0001-0003-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Vacinação', 95, 'Vacinação', true, false, now() - interval '150 days'),
  ('de3a0000-0001-0003-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Castração', 480, 'Cirurgia', true, false, now() - interval '150 days'),
  ('de3a0000-0001-0003-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Banho e Tosa', 75, 'Banho & Tosa', true, false, now() - interval '150 days'),
  ('de3a0000-0001-0003-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Exame de Sangue', 140, 'Exame', true, false, now() - interval '150 days'),
  ('de3a0000-0001-0003-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Vermifugação', 45, 'Consulta', true, false, now() - interval '150 days'),
  ('de3a0000-0001-0003-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Radiografia Veterinária', 160, 'Radiologia', true, false, now() - interval '150 days'),
  ('de3a0000-0001-0003-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Aplicação de Microchip', 110, 'Outros', true, false, now() - interval '150 days')
on conflict (id) do nothing;

-- 4. Estoque (6 itens; categorias = slugs de stockCategories)
insert into public.stock_items (id, clinic_id, name, category, unit, quantity, min_quantity, cost_price, supplier, is_active, created_at, updated_at)
values
  ('de3a0000-0001-0004-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Vacina V10 (dose)', 'vacina', 'un', 24, 10, 38.0, 'DistriVet Nordeste', true, now() - interval '120 days', now() - interval '5 days'),
  ('de3a0000-0001-0004-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Vacina antirrábica (dose)', 'vacina', 'un', 30, 10, 14.5, 'DistriVet Nordeste', true, now() - interval '120 days', now() - interval '7 days'),
  ('de3a0000-0001-0004-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Vermífugo em comprimido (caixa)', 'medicamento', 'cx', 14, 6, 52.0, 'Farmapet Distribuidora', true, now() - interval '120 days', now() - interval '9 days'),
  ('de3a0000-0001-0004-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Ração terapêutica renal (saco 2 kg)', 'racao', 'un', 6, 4, 89.9, 'Pet Nutri Atacado', true, now() - interval '120 days', now() - interval '11 days'),
  ('de3a0000-0001-0004-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Seringa descartável 3 ml (caixa 100)', 'descartavel', 'cx', 9, 5, 41.0, 'MedVet Descartáveis', true, now() - interval '120 days', now() - interval '13 days'),
  ('de3a0000-0001-0004-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Microchip com aplicador', 'outro', 'un', 18, 8, 22.0, 'IdPet Brasil', true, now() - interval '120 days', now() - interval '15 days')
on conflict (id) do nothing;

-- 5. Movimentações de estoque (12); a quantidade atual do item já considera as saídas
insert into public.stock_movements (id, clinic_id, item_id, type, quantity, reason, user_name, created_at)
values
  ('de3a0000-0001-0009-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000001', 'entrada', 36, 'Compra de reposicao', 'Dra. Larissa Montenegro', now() - interval '61 days'),
  ('de3a0000-0001-0009-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000001', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Caio Bezerra', now() - interval '13 days'),
  ('de3a0000-0001-0009-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000002', 'entrada', 42, 'Compra de reposicao', 'Dra. Larissa Montenegro', now() - interval '62 days'),
  ('de3a0000-0001-0009-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000002', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Caio Bezerra', now() - interval '14 days'),
  ('de3a0000-0001-0009-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000003', 'entrada', 26, 'Compra de reposicao', 'Dra. Larissa Montenegro', now() - interval '63 days'),
  ('de3a0000-0001-0009-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000003', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Caio Bezerra', now() - interval '15 days'),
  ('de3a0000-0001-0009-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000004', 'entrada', 18, 'Compra de reposicao', 'Dra. Larissa Montenegro', now() - interval '64 days'),
  ('de3a0000-0001-0009-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000004', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Caio Bezerra', now() - interval '16 days'),
  ('de3a0000-0001-0009-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000005', 'entrada', 21, 'Compra de reposicao', 'Dra. Larissa Montenegro', now() - interval '65 days'),
  ('de3a0000-0001-0009-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000005', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Caio Bezerra', now() - interval '17 days'),
  ('de3a0000-0001-0009-0000-000000000011', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000006', 'entrada', 30, 'Compra de reposicao', 'Dra. Larissa Montenegro', now() - interval '66 days'),
  ('de3a0000-0001-0009-0000-000000000012', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0001-0004-0000-000000000006', 'saida', 12, 'Uso nos atendimentos do mes', 'Dr. Caio Bezerra', now() - interval '18 days')
on conflict (id) do nothing;

-- 6. Consultas (27): passado = concluído/faltou/cancelado; semanas 0..2 = hoje e futuro.
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
  ('de3a0000-0001-0005-0000-000000000001', 'de3a0000-0001-0002-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'concluido', -55, '16:00', 30, null),
  ('de3a0000-0001-0005-0000-000000000002', 'de3a0000-0001-0002-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000005', 'Exame de Sangue', 140, 'concluido', -31, '08:30', 20, null),
  ('de3a0000-0001-0005-0000-000000000003', 'de3a0000-0001-0002-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000002', 'Vacinação', 95, 'concluido', -3, '10:30', 20, null),
  ('de3a0000-0001-0005-0000-000000000004', 'de3a0000-0001-0002-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'agendado', 7, '17:00', 30, 'Retorno para reavaliação do quadro gástrico'),
  ('de3a0000-0001-0005-0000-000000000005', 'de3a0000-0001-0002-0000-000000000002', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'concluido', -47, '14:30', 30, null),
  ('de3a0000-0001-0005-0000-000000000006', 'de3a0000-0001-0002-0000-000000000002', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000002', 'Vacinação', 95, 'faltou', -6, '15:00', 20, null),
  ('de3a0000-0001-0005-0000-000000000007', 'de3a0000-0001-0002-0000-000000000002', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000006', 'Vermifugação', 45, 'agendado', 14, '13:00', 15, null),
  ('de3a0000-0001-0005-0000-000000000008', 'de3a0000-0001-0002-0000-000000000003', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'concluido', -52, '08:30', 30, null),
  ('de3a0000-0001-0005-0000-000000000009', 'de3a0000-0001-0002-0000-000000000003', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000005', 'Exame de Sangue', 140, 'faltou', -26, '16:30', 20, 'Não compareceu; a recepção tentou contato.'),
  ('de3a0000-0001-0005-0000-000000000010', 'de3a0000-0001-0002-0000-000000000003', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000007', 'Radiografia Veterinária', 160, 'cancelado', -19, '11:00', 30, 'Cancelado: paciente viajou.'),
  ('de3a0000-0001-0005-0000-000000000011', 'de3a0000-0001-0002-0000-000000000003', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'confirmado', 11, '11:30', 30, 'Retorno com resultado dos exames'),
  ('de3a0000-0001-0005-0000-000000000012', 'de3a0000-0001-0002-0000-000000000004', 'de3a0000-0001-0001-0000-000000000002', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'concluido', -49, '14:30', 30, null),
  ('de3a0000-0001-0005-0000-000000000013', 'de3a0000-0001-0002-0000-000000000004', 'de3a0000-0001-0001-0000-000000000002', 'de3a0000-0001-0003-0000-000000000003', 'Castração', 480, 'cancelado', -17, '16:30', 90, 'Cancelado: paciente viajou.'),
  ('de3a0000-0001-0005-0000-000000000014', 'de3a0000-0001-0002-0000-000000000004', 'de3a0000-0001-0001-0000-000000000002', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'agendado', 14, '10:30', 30, 'Retirada de pontos e revisão pós-operatória'),
  ('de3a0000-0001-0005-0000-000000000015', 'de3a0000-0001-0002-0000-000000000005', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'concluido', -33, '08:30', 30, null),
  ('de3a0000-0001-0005-0000-000000000016', 'de3a0000-0001-0002-0000-000000000005', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000005', 'Exame de Sangue', 140, 'concluido', -25, '15:00', 20, null),
  ('de3a0000-0001-0005-0000-000000000017', 'de3a0000-0001-0002-0000-000000000006', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'concluido', -53, '17:00', 30, null),
  ('de3a0000-0001-0005-0000-000000000018', 'de3a0000-0001-0002-0000-000000000006', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000006', 'Vermifugação', 45, 'faltou', -27, '08:00', 15, 'Não compareceu e não avisou.'),
  ('de3a0000-0001-0005-0000-000000000019', 'de3a0000-0001-0002-0000-000000000006', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'agendado', 14, '09:00', 30, null),
  ('de3a0000-0001-0005-0000-000000000020', 'de3a0000-0001-0002-0000-000000000007', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'concluido', -41, '10:00', 30, null),
  ('de3a0000-0001-0005-0000-000000000021', 'de3a0000-0001-0002-0000-000000000007', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000005', 'Exame de Sangue', 140, 'faltou', -34, '11:30', 20, 'Não compareceu e não avisou.'),
  ('de3a0000-0001-0005-0000-000000000022', 'de3a0000-0001-0002-0000-000000000007', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'concluido', -14, '11:00', 30, null),
  ('de3a0000-0001-0005-0000-000000000023', 'de3a0000-0001-0002-0000-000000000007', 'de3a0000-0001-0001-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'agendado', 7, '11:30', 30, 'Revisão trimestral renal'),
  ('de3a0000-0001-0005-0000-000000000024', 'de3a0000-0001-0002-0000-000000000008', 'de3a0000-0001-0001-0000-000000000002', 'de3a0000-0001-0003-0000-000000000001', 'Consulta Veterinária', 120, 'concluido', -46, '15:30', 30, null),
  ('de3a0000-0001-0005-0000-000000000025', 'de3a0000-0001-0002-0000-000000000008', 'de3a0000-0001-0001-0000-000000000002', 'de3a0000-0001-0003-0000-000000000007', 'Radiografia Veterinária', 160, 'concluido', -34, '13:30', 30, null),
  ('de3a0000-0001-0005-0000-000000000026', 'de3a0000-0001-0002-0000-000000000008', 'de3a0000-0001-0001-0000-000000000002', 'de3a0000-0001-0003-0000-000000000008', 'Aplicação de Microchip', 110, 'faltou', -2, '10:30', 15, 'Não compareceu e não avisou.'),
  ('de3a0000-0001-0005-0000-000000000027', 'de3a0000-0001-0002-0000-000000000008', 'de3a0000-0001-0001-0000-000000000002', 'de3a0000-0001-0003-0000-000000000004', 'Banho e Tosa', 75, 'auto_a', 0, '08:30', 60, null)
) as v(id, pat, prof, proc, pname, price, st, d, t, dur, notes)
cross join lateral (select ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') as ts) x
on conflict (id) do nothing;

-- 7. Receitas (13): uma por consulta concluída (semanas passadas), no valor do procedimento.
-- O gatilho de comissão só gera linhas para beneficiários ativos (hoje o único está inativo).
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.financial_records (id, clinic_id, patient_id, appointment_id, procedure_id, professional_id,
  total_amount, discount_percent, payment_method, convenio, type, category, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.appt::uuid, v.proc::uuid, v.prof::uuid,
       v.total::numeric, v.disc::numeric, v.pm, v.conv, 'receita', v.cat, '[]'::jsonb,
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0001-0006-0000-000000000001', 'de3a0000-0001-0002-0000-000000000001', 'de3a0000-0001-0005-0000-000000000001', 'de3a0000-0001-0003-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 120.0, 0, 'cartao_credito', null, 'Consulta', -55, '16:00', 30),
  ('de3a0000-0001-0006-0000-000000000002', 'de3a0000-0001-0002-0000-000000000001', 'de3a0000-0001-0005-0000-000000000002', 'de3a0000-0001-0003-0000-000000000005', 'de3a0000-0001-0001-0000-000000000001', 140.0, 0, 'cartao_debito', null, 'Exame', -31, '08:30', 20),
  ('de3a0000-0001-0006-0000-000000000003', 'de3a0000-0001-0002-0000-000000000001', 'de3a0000-0001-0005-0000-000000000003', 'de3a0000-0001-0003-0000-000000000002', 'de3a0000-0001-0001-0000-000000000001', 95.0, 0, 'pix', null, 'Vacinação', -3, '10:30', 20),
  ('de3a0000-0001-0006-0000-000000000005', 'de3a0000-0001-0002-0000-000000000002', 'de3a0000-0001-0005-0000-000000000005', 'de3a0000-0001-0003-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Consulta', -47, '14:30', 30),
  ('de3a0000-0001-0006-0000-000000000008', 'de3a0000-0001-0002-0000-000000000003', 'de3a0000-0001-0005-0000-000000000008', 'de3a0000-0001-0003-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 120.0, 0, 'dinheiro', null, 'Consulta', -52, '08:30', 30),
  ('de3a0000-0001-0006-0000-000000000012', 'de3a0000-0001-0002-0000-000000000004', 'de3a0000-0001-0005-0000-000000000012', 'de3a0000-0001-0003-0000-000000000001', 'de3a0000-0001-0001-0000-000000000002', 120.0, 0, 'cartao_credito', null, 'Consulta', -49, '14:30', 30),
  ('de3a0000-0001-0006-0000-000000000015', 'de3a0000-0001-0002-0000-000000000005', 'de3a0000-0001-0005-0000-000000000015', 'de3a0000-0001-0003-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 108.0, 10, 'cartao_credito', null, 'Consulta', -33, '08:30', 30),
  ('de3a0000-0001-0006-0000-000000000016', 'de3a0000-0001-0002-0000-000000000005', 'de3a0000-0001-0005-0000-000000000016', 'de3a0000-0001-0003-0000-000000000005', 'de3a0000-0001-0001-0000-000000000001', 140.0, 0, 'cartao_credito', null, 'Exame', -25, '15:00', 20),
  ('de3a0000-0001-0006-0000-000000000017', 'de3a0000-0001-0002-0000-000000000006', 'de3a0000-0001-0005-0000-000000000017', 'de3a0000-0001-0003-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 108.0, 10, 'cartao_credito', null, 'Consulta', -53, '17:00', 30),
  ('de3a0000-0001-0006-0000-000000000020', 'de3a0000-0001-0002-0000-000000000007', 'de3a0000-0001-0005-0000-000000000020', 'de3a0000-0001-0003-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Consulta', -41, '10:00', 30),
  ('de3a0000-0001-0006-0000-000000000022', 'de3a0000-0001-0002-0000-000000000007', 'de3a0000-0001-0005-0000-000000000022', 'de3a0000-0001-0003-0000-000000000001', 'de3a0000-0001-0001-0000-000000000001', 120.0, 0, 'pix', null, 'Consulta', -14, '11:00', 30),
  ('de3a0000-0001-0006-0000-000000000024', 'de3a0000-0001-0002-0000-000000000008', 'de3a0000-0001-0005-0000-000000000024', 'de3a0000-0001-0003-0000-000000000001', 'de3a0000-0001-0001-0000-000000000002', 120.0, 0, 'pix', null, 'Consulta', -46, '15:30', 30),
  ('de3a0000-0001-0006-0000-000000000025', 'de3a0000-0001-0002-0000-000000000008', 'de3a0000-0001-0005-0000-000000000025', 'de3a0000-0001-0003-0000-000000000007', 'de3a0000-0001-0001-0000-000000000002', 160.0, 0, 'pix', null, 'Exame', -34, '13:30', 30)
) as v(id, pat, appt, proc, prof, total, disc, pm, conv, cat, d, t, dur)
on conflict (id) do nothing;

-- 8. Despesas da área (3); aluguel e folha já existem na clínica, não são repetidos
insert into public.financial_records (id, clinic_id, total_amount, discount_percent, payment_method, type, category, notes, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.amt::numeric, 0, v.pm, 'despesa', v.cat, v.note, '[]'::jsonb, v.at::timestamptz
from (values
  ('de3a0000-0001-0006-0000-000000000901', 1240.0, 'pix', 'Ração/Insumos', 'Reposição de ração terapêutica e petiscos', now() - interval '18 days'),
  ('de3a0000-0001-0006-0000-000000000902', 1980.0, 'cartao_credito', 'Material', 'Compra de vacinas e vermífugos', now() - interval '33 days'),
  ('de3a0000-0001-0006-0000-000000000903', 380.0, 'pix', 'Equipamento', 'Manutenção do autoclave', now() - interval '52 days')
) as v(id, amt, pm, cat, note, at)
on conflict (id) do nothing;

-- 9. Prontuários (8): anamnese e exame clínico namespaced por área ("vet"), chaves reais de specialtyConfig.tsx
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.medical_records (id, clinic_id, patient_id, anamnesis, clinical_exam, treatment_plan, odontogram, treatment_plan_items, created_at, updated_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.anam, v.exam, v.tp, v.odo, v.items,
       ((m.monday + v.d1::int + v.t1::time) at time zone 'America/Sao_Paulo'),
       ((m.monday + v.d2::int + v.t2::time) at time zone 'America/Sao_Paulo')
from m
cross join (values
  ('de3a0000-0001-0007-0000-000000000001', 'de3a0000-0001-0002-0000-000000000001', $j${"vet":{"a-contato":"Convive com um gato da família","a-queixa":"Vômito e falta de apetite há 2 dias","a-alimentacao":"Ração premium adulto raça grande, 2 vezes ao dia","a-ambiente":"Casa com quintal; dorme dentro de casa","a-hist_doencas":"Gastroenterite aos 3 anos. Sem cirurgias.","a-vacinas":"V10 e antirrábica em dia; vermífugo há 2 meses","a-reproducao":"Macho castrado","a-medicamentos":"Nenhum","a-alergia":"Nenhuma conhecida"}}$j$::jsonb, $j${"vet":{"e-ausculta":"Sem alterações na ausculta cardíaca e pulmonar","e-linfonodos":"Linfonodos palpáveis, sem aumento","e-mucosas":"Normocoradas, TPC menor que 2 s","e-hidratacao":"Desidratação leve (5%)","e-temperatura":"39,1","e-fc":"98","e-fr":"28","e-peso":"32,5 kg / escore corporal 6 de 9","e-abd":"Dor leve à palpação em região epigástrica","e-hipotese":"Gastrite aguda. Solicitado hemograma e bioquímico.","e-obs":"Orientada dieta pastosa por 3 dias e retorno se piorar."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -55, '16:00', -3, '10:30'),
  ('de3a0000-0001-0007-0000-000000000002', 'de3a0000-0001-0002-0000-000000000002', $j${"vet":{"a-contato":"Sem contato com outros animais fora de casa","a-queixa":"Espirros frequentes e secreção ocular há uma semana","a-alimentacao":"Ração super premium para gatos castrados, à vontade","a-ambiente":"Apartamento telado; sem acesso à rua","a-hist_doencas":"Sem doenças prévias","a-vacinas":"Quíntupla em dia; antirrábica vencendo no mês","a-reproducao":"Fêmea castrada","a-medicamentos":"Nenhum","a-alergia":"Nenhuma conhecida"}}$j$::jsonb, $j${"vet":{"e-ausculta":"Sem alterações na ausculta cardíaca e pulmonar","e-linfonodos":"Linfonodos palpáveis, sem aumento","e-mucosas":"Normocoradas, TPC menor que 2 s","e-hidratacao":"Hidratado","e-temperatura":"38,7","e-fc":"170","e-fr":"32","e-peso":"4,2 kg / escore 5 de 9","e-abd":"Indolor, sem massas","e-hipotese":"Complexo respiratório felino leve. Prescrito colírio e suporte.","e-obs":"Reforçar umidificação do ambiente."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -47, '14:30', -47, '14:30'),
  ('de3a0000-0001-0007-0000-000000000003', 'de3a0000-0001-0002-0000-000000000003', $j${"vet":{"a-contato":"Sem contato com outros animais fora de casa","a-queixa":"Cansaço ao passeio e tosse noturna","a-alimentacao":"Ração sênior pequeno porte, 2 vezes ao dia","a-ambiente":"Apartamento; passeios diários curtos","a-hist_doencas":"Sopro cardíaco leve diagnosticado há 1 ano","a-vacinas":"V10 e antirrábica em dia","a-reproducao":"Macho inteiro","a-medicamentos":"Suplemento articular","a-alergia":"Nenhuma conhecida"}}$j$::jsonb, $j${"vet":{"e-ausculta":"Sopro sistólico grau II em foco mitral","e-linfonodos":"Linfonodos palpáveis, sem aumento","e-mucosas":"Normocoradas, TPC menor que 2 s","e-hidratacao":"Hidratado","e-temperatura":"38,5","e-fc":"140","e-fr":"36","e-peso":"7,8 kg / escore 6 de 9","e-hipotese":"Valvulopatia mitral degenerativa. Solicitados ecocardiograma e radiografia de tórax.","e-obs":"Tutora orientada sobre sinais de piora (tosse, cansaço, desmaios)."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -52, '08:30', -52, '08:30'),
  ('de3a0000-0001-0007-0000-000000000004', 'de3a0000-0001-0002-0000-000000000004', $j${"vet":{"a-contato":"Sem contato com outros animais fora de casa","a-queixa":"Avaliação pré-operatória para castração","a-alimentacao":"Ração premium, 2 vezes ao dia","a-ambiente":"Casa com quintal grande","a-hist_doencas":"Sem doenças prévias","a-vacinas":"V10, antirrábica e gripe canina em dia","a-reproducao":"Fêmea; primeiro cio aos 8 meses","a-medicamentos":"Nenhum","a-alergia":"Nenhuma conhecida"}}$j$::jsonb, $j${"vet":{"e-ausculta":"Sem alterações na ausculta cardíaca e pulmonar","e-linfonodos":"Linfonodos palpáveis, sem aumento","e-mucosas":"Normocoradas, TPC menor que 2 s","e-hidratacao":"Hidratado","e-temperatura":"38,4","e-fc":"100","e-fr":"24","e-peso":"19 kg / escore 5 de 9","e-abd":"Sem alterações","e-hipotese":"Apta para procedimento cirúrgico eletivo (ASA I).","e-obs":"Jejum alimentar de 12 h e hídrico de 4 h orientado."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -49, '14:30', -49, '14:30'),
  ('de3a0000-0001-0007-0000-000000000005', 'de3a0000-0001-0002-0000-000000000005', $j${"vet":{"a-contato":"Sem contato com outros animais fora de casa","a-queixa":"Penas arrepiadas e diminuição de vocalização","a-alimentacao":"Mix de sementes e ração extrusada; frutas 2 vezes por semana","a-ambiente":"Gaiola ampla na sala, perto de janela","a-hist_doencas":"Sem doenças prévias","a-vacinas":"Não se aplica","a-reproducao":"Sem postura","a-medicamentos":"Nenhum","a-alergia":"Nenhuma conhecida","a-gaiola":"Gaiola de 60 cm, poleiros de madeira e brinquedos","a-luz_solar":"Sol da manhã por 30 minutos, 3 vezes por semana"}}$j$::jsonb, $j${"vet":{"e-ausculta":"Sem alterações na ausculta cardíaca e pulmonar","e-linfonodos":"Linfonodos palpáveis, sem aumento","e-mucosas":"Normocoradas, TPC menor que 2 s","e-hidratacao":"Hidratado","e-temperatura":"Não aferida (ave)","e-peso":"90 g","e-hipotese":"Deficiência nutricional leve; ajuste de dieta.","e-plumagem":"Penas opacas, sem áreas de falha","e-postura_voc":"Alerta, vocalização reduzida","e-cloaca":"Sem alterações","e-obs":"Orientada a reduzir sementes e oferecer ração extrusada."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -33, '08:30', -25, '15:00'),
  ('de3a0000-0001-0007-0000-000000000006', 'de3a0000-0001-0002-0000-000000000006', $j${"vet":{"a-contato":"Sem contato com outros animais fora de casa","a-queixa":"Diminuição do apetite e fezes pequenas há 1 dia","a-alimentacao":"Feno à vontade, ração própria para coelhos e verduras","a-ambiente":"Cercadinho interno com solta diária","a-hist_doencas":"Sem doenças prévias","a-vacinas":"Não se aplica","a-reproducao":"Macho inteiro","a-medicamentos":"Nenhum","a-alergia":"Nenhuma conhecida","a-gaiola_ambiente":"Cercadinho com piso emborrachado e substrato de feno"}}$j$::jsonb, $j${"vet":{"e-ausculta":"Sem alterações na ausculta cardíaca e pulmonar","e-linfonodos":"Linfonodos palpáveis, sem aumento","e-mucosas":"Normocoradas, TPC menor que 2 s","e-hidratacao":"Hidratado","e-temperatura":"38,9","e-fc":"200","e-fr":"52","e-peso":"1,6 kg / escore 5 de 9","e-abd":"Estômago levemente distendido, motilidade reduzida","e-hipotese":"Estase gastrointestinal leve.","e-denticao":"Incisivos e molares sem má oclusão","e-pelagem":"Pelagem íntegra","e-obs":"Reforçado aumento de feno e hidratação."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -53, '17:00', -53, '17:00'),
  ('de3a0000-0001-0007-0000-000000000007', 'de3a0000-0001-0002-0000-000000000007', $j${"vet":{"a-contato":"Sem contato com outros animais fora de casa","a-queixa":"Bebe muita água e urina mais que o normal","a-alimentacao":"Ração renal terapêutica (prescrita), úmida 1 vez ao dia","a-ambiente":"Apartamento telado","a-hist_doencas":"Doença renal crônica estágio 2 (IRIS)","a-vacinas":"Em dia","a-reproducao":"Macho castrado","a-medicamentos":"Benazepril 2,5 mg, 1 vez ao dia","a-alergia":"Nenhuma conhecida"}}$j$::jsonb, $j${"vet":{"e-ausculta":"Sem alterações na ausculta cardíaca e pulmonar","e-linfonodos":"Linfonodos palpáveis, sem aumento","e-mucosas":"Normocoradas, TPC menor que 2 s","e-hidratacao":"Desidratação leve (5%)","e-temperatura":"38,3","e-fc":"180","e-fr":"30","e-peso":"5,1 kg / escore 4 de 9","e-abd":"Rins palpáveis, discretamente pequenos","e-hipotese":"Doença renal crônica estável. Repetir ureia, creatinina e SDMA.","e-obs":"Manter dieta renal e estimular ingestão de água."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -41, '10:00', -14, '11:00'),
  ('de3a0000-0001-0007-0000-000000000008', 'de3a0000-0001-0002-0000-000000000008', $j${"vet":{"a-contato":"Sem contato com outros animais fora de casa","a-queixa":"Coceira intensa nas patas e dobras da pele","a-alimentacao":"Ração hipoalergênica há 3 meses","a-ambiente":"Apartamento com ar-condicionado","a-hist_doencas":"Dermatite alérgica recorrente","a-vacinas":"V10 e antirrábica em dia","a-reproducao":"Macho inteiro","a-medicamentos":"Shampoo terapêutico semanal","a-alergia":"Suspeita de alergia alimentar (frango)"}}$j$::jsonb, $j${"vet":{"e-ausculta":"Sem alterações na ausculta cardíaca e pulmonar","e-linfonodos":"Linfonodos palpáveis, sem aumento","e-mucosas":"Normocoradas, TPC menor que 2 s","e-hidratacao":"Hidratado","e-temperatura":"38,6","e-fc":"110","e-fr":"40","e-peso":"12,4 kg / escore 6 de 9","e-hipotese":"Dermatite atópica; descartar piodermite secundária.","e-obs":"Raspado de pele coletado. Banho terapêutico quinzenal."}}$j$::jsonb, null, $j${}$j$::jsonb, $j$[]$j$::jsonb, -46, '15:30', -34, '13:30')
) as v(id, pat, anam, exam, tp, odo, items, d1, t1, d2, t2)
on conflict (id) do nothing;

-- 10. Evoluções no prontuário (12); author_name = profissional que atendeu, professional_id preenchido
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.record_entries (id, clinic_id, patient_id, record_id, author_name, professional_id, entry_text, entry_type, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.rec::uuid, v.author, v.prof::uuid, v.txt, 'evolucao',
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0001-0008-0000-000000000001', 'de3a0000-0001-0002-0000-000000000001', 'de3a0000-0001-0007-0000-000000000001', 'Dra. Larissa Montenegro', 'de3a0000-0001-0001-0000-000000000001', 'Consulta inicial: vômitos há 2 dias, sem diarreia. Iniciado protetor gástrico e antiemético; dieta pastosa por 3 dias. Retorno se houver piora.', -55, '16:00', 30),
  ('de3a0000-0001-0008-0000-000000000002', 'de3a0000-0001-0002-0000-000000000001', 'de3a0000-0001-0007-0000-000000000001', 'Dra. Larissa Montenegro', 'de3a0000-0001-0001-0000-000000000001', 'Evolução favorável: apetite normalizado, sem novos vômitos. Resultados de exames dentro da normalidade. Vacinação anual atualizada.', -3, '10:30', 20),
  ('de3a0000-0001-0008-0000-000000000003', 'de3a0000-0001-0002-0000-000000000002', 'de3a0000-0001-0007-0000-000000000002', 'Dra. Larissa Montenegro', 'de3a0000-0001-0001-0000-000000000001', 'Quadro compatível com rinotraqueíte leve. Colírio lubrificante e suplementação de lisina por 10 dias.', -47, '14:30', 30),
  ('de3a0000-0001-0008-0000-000000000004', 'de3a0000-0001-0002-0000-000000000003', 'de3a0000-0001-0007-0000-000000000003', 'Dra. Larissa Montenegro', 'de3a0000-0001-0001-0000-000000000001', 'Avaliação cardiológica inicial. Sopro mitral grau II; iniciada medicação de suporte e solicitados exames de imagem.', -52, '08:30', 30),
  ('de3a0000-0001-0008-0000-000000000005', 'de3a0000-0001-0002-0000-000000000004', 'de3a0000-0001-0007-0000-000000000004', 'Dr. Caio Bezerra', 'de3a0000-0001-0001-0000-000000000002', 'Avaliação pré-operatória sem alterações. Exames pré-cirúrgicos liberados.', -49, '14:30', 30),
  ('de3a0000-0001-0008-0000-000000000006', 'de3a0000-0001-0002-0000-000000000005', 'de3a0000-0001-0007-0000-000000000005', 'Dra. Larissa Montenegro', 'de3a0000-0001-0001-0000-000000000001', 'Ave alerta, com plumagem opaca. Dieta ajustada (ração extrusada e vegetais) e suplementação vitamínica por 15 dias.', -33, '08:30', 30),
  ('de3a0000-0001-0008-0000-000000000007', 'de3a0000-0001-0002-0000-000000000005', 'de3a0000-0001-0007-0000-000000000005', 'Dra. Larissa Montenegro', 'de3a0000-0001-0001-0000-000000000001', 'Retorno com melhora da plumagem e vocalização normalizada.', -25, '15:00', 20),
  ('de3a0000-0001-0008-0000-000000000008', 'de3a0000-0001-0002-0000-000000000006', 'de3a0000-0001-0007-0000-000000000006', 'Dra. Larissa Montenegro', 'de3a0000-0001-0001-0000-000000000001', 'Estase gastrointestinal leve: procinético, fluidoterapia subcutânea e manejo alimentar. Orientação sobre feno à vontade.', -53, '17:00', 30),
  ('de3a0000-0001-0008-0000-000000000009', 'de3a0000-0001-0002-0000-000000000007', 'de3a0000-0001-0007-0000-000000000007', 'Dra. Larissa Montenegro', 'de3a0000-0001-0001-0000-000000000001', 'Paciente idoso com DRC em acompanhamento. Exames de controle solicitados; mantida dieta renal e medicação.', -41, '10:00', 30),
  ('de3a0000-0001-0008-0000-000000000010', 'de3a0000-0001-0002-0000-000000000007', 'de3a0000-0001-0007-0000-000000000007', 'Dra. Larissa Montenegro', 'de3a0000-0001-0001-0000-000000000001', 'Creatinina estável em relação ao último exame. Mantido tratamento; novo controle em 3 meses.', -14, '11:00', 30),
  ('de3a0000-0001-0008-0000-000000000011', 'de3a0000-0001-0002-0000-000000000008', 'de3a0000-0001-0007-0000-000000000008', 'Dr. Caio Bezerra', 'de3a0000-0001-0001-0000-000000000002', 'Dermatite em dobras e interdígitos. Iniciado tratamento tópico e banhos terapêuticos; mantida dieta hipoalergênica.', -46, '15:30', 30),
  ('de3a0000-0001-0008-0000-000000000012', 'de3a0000-0001-0002-0000-000000000008', 'de3a0000-0001-0007-0000-000000000008', 'Dr. Caio Bezerra', 'de3a0000-0001-0001-0000-000000000002', 'Melhora de 70% do prurido. Microchip aplicado; manter banhos quinzenais.', -34, '13:30', 30)
) as v(id, pat, rec, author, prof, txt, d, t, dur)
on conflict (id) do nothing;

-- Verificação (contagens esperadas em docs/demo-seed-video123.md)
select 'professionals' as tabela, count(*) as linhas from public.professionals where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0001-%'
union all
select 'patients' as tabela, count(*) as linhas from public.patients where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0002-%'
union all
select 'procedures' as tabela, count(*) as linhas from public.procedures where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0003-%'
union all
select 'stock_items' as tabela, count(*) as linhas from public.stock_items where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0004-%'
union all
select 'stock_movements' as tabela, count(*) as linhas from public.stock_movements where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0009-%'
union all
select 'appointments' as tabela, count(*) as linhas from public.appointments where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0005-%'
union all
select 'financial_records' as tabela, count(*) as linhas from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0006-%'
union all
select 'medical_records' as tabela, count(*) as linhas from public.medical_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0007-%'
union all
select 'record_entries' as tabela, count(*) as linhas from public.record_entries where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0008-%'
order by 1;

commit;

-- =============================================================================
-- ROLLBACK (descomente tudo, de "begin" a "commit", e rode inteiro).
-- Apaga só o que este arquivo criou: clinic_id da demo + ids com o prefixo de3a0000-0001-.
-- Ordem respeita as FKs (receitas e comissões -> evoluções -> prontuários -> consultas -> estoque -> procedimentos -> pacientes -> profissionais).
-- =============================================================================
-- begin;
-- delete from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0006-%';
-- delete from public.record_entries    where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0008-%';
-- delete from public.medical_records   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0007-%';
-- delete from public.appointments      where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0005-%';
-- delete from public.stock_movements   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0009-%';
-- delete from public.stock_items       where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0004-%';
-- delete from public.procedures        where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0003-%';
-- delete from public.patients          where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0002-%';
-- delete from public.professionals     where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0001-0001-%';
-- commit;
-- =============================================================================
-- Seed demo video123 | área: Odontologia (odonto) | arquivo 02-odonto.sql
-- =============================================================================
-- Insere SOMENTE na clínica demo (clinic_id 3916d37d-b247-485e-bd2f-b47be8d44207).
-- Convenção de IDs determinísticos: de3a0000-0002-<tabela>-0000-<seq>
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
  ('de3a0000-0002-0001-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dr. Rodrigo Esteves Lima', 'Clínico Geral', 'odonto', 40, 'CRO-CE 11874', now() - interval '208 days'),
  ('de3a0000-0002-0001-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Dra. Aline Gurgel Maia', 'Ortodontia', 'odonto', 40, 'CRO-CE 13209', now() - interval '206 days')
on conflict (id) do nothing;

-- 2. Pacientes (8): CPF e RG ficam nulos de propósito; is_active/registration_status usam o default
insert into public.patients (id, clinic_id, name, phone, email, birth_date, gender, address, occupation, emergency_contact, referred_by,
  notes, pet_name, pet_species, pet_breed, pet_weight, pet_age, pet_coat, pet_neutered, convenio, convenio_carteirinha, lgpd_consent, lgpd_consent_at, created_at, updated_at)
values
  ('de3a0000-0002-0002-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Helena Barros Cordeiro', '(85) 90000-2001', 'helena.cordeiro@example.com', '1991-04-12', 'Feminino', 'Rua Silva Jatahy, 480 - Meireles, Fortaleza/CE', 'Arquiteta', null, 'Indicação de paciente', null, null, null, null, null, null, null, null, 'OdontoPlus', '0034 5521 8890', true, now() - interval '97 days', now() - interval '97 days', now() - interval '97 days'),
  ('de3a0000-0002-0002-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Gustavo Henrique Pires', '(85) 90000-2002', 'gustavo.pires@example.com', '1985-09-30', 'Masculino', 'Av. Dom Luís, 1200 - Aldeota, Fortaleza/CE', 'Gerente comercial', null, 'Google', null, null, null, null, null, null, null, null, 'OdontoPlus', '0034 7710 2245', true, now() - interval '94 days', now() - interval '94 days', now() - interval '94 days'),
  ('de3a0000-0002-0002-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Isabela Furtado Neri', '(85) 90000-2003', 'isabela.neri@example.com', '1998-02-19', 'Feminino', 'Rua Ildefonso Albano, 905 - Aldeota, Fortaleza/CE', 'Estudante de Direito', null, 'Indicação de amiga', null, null, null, null, null, null, null, null, null, null, true, now() - interval '91 days', now() - interval '91 days', now() - interval '91 days'),
  ('de3a0000-0002-0002-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Antônio Carlos Veras', '(85) 90000-2004', 'antonio.veras@example.com', '1960-06-08', 'Masculino', 'Rua Pereira Filgueiras, 220 - Centro, Fortaleza/CE', 'Aposentado', 'Filha: Sandra Veras', 'Indicação de familiar', null, null, null, null, null, null, null, null, null, null, true, now() - interval '88 days', now() - interval '88 days', now() - interval '88 days'),
  ('de3a0000-0002-0002-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Larissa Moura Pontes', '(85) 90000-2005', 'larissa.pontes@example.com', '2001-11-25', 'Feminino', 'Rua Vicente Leite, 330 - Varjota, Fortaleza/CE', 'Publicitária', null, 'Instagram', null, null, null, null, null, null, null, null, null, null, true, now() - interval '85 days', now() - interval '85 days', now() - interval '85 days'),
  ('de3a0000-0002-0002-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Davi Lucas Sales', '(85) 90000-2006', 'davi.sales@example.com', '2014-03-03', 'Masculino', 'Rua Dr. Gilberto Studart, 870 - Cocó, Fortaleza/CE', 'Estudante', 'Mãe: Priscila Sales (responsável)', 'Indicação da escola', null, null, null, null, null, null, null, null, null, null, true, now() - interval '82 days', now() - interval '82 days', now() - interval '82 days'),
  ('de3a0000-0002-0002-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Renata Cavalcante Dantas', '(85) 90000-2007', 'renata.dantas@example.com', '1979-10-17', 'Feminino', 'Rua Barbosa de Freitas, 1100 - Aldeota, Fortaleza/CE', 'Contadora', null, 'Indicação de paciente', null, null, null, null, null, null, null, null, 'Bradesco Dental', '7702 3318 9904', true, now() - interval '79 days', now() - interval '79 days', now() - interval '79 days'),
  ('de3a0000-0002-0002-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Marcos Vinícius Aguiar', '(85) 90000-2008', 'marcos.aguiar@example.com', '1993-01-22', 'Masculino', 'Rua Joaquim Nabuco, 640 - Joaquim Távora, Fortaleza/CE', 'Personal trainer', null, 'Indicação de paciente', null, null, null, null, null, null, null, null, null, null, true, now() - interval '76 days', now() - interval '76 days', now() - interval '76 days')
on conflict (id) do nothing;

-- 3. Procedimentos (16): nomes/categorias de procedureSuggestions de specialtyConfig.tsx
insert into public.procedures (id, clinic_id, name, price, category, is_active, is_free, created_at)
values
  ('de3a0000-0002-0003-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Consulta', 150, 'Consulta', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Avaliação', 0, 'Consulta', true, true, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Limpeza (Profilaxia)', 180, 'Consulta', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Restauração', 280, 'Outros', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Extração Simples', 220, 'Cirurgia', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Extração de Siso', 420, 'Cirurgia', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Clareamento Dental', 850, 'Estética', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Canal (Endodontia)', 780, 'Endodontia', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Aparelho Ortodôntico', 1800, 'Ortodontia', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Manutenção de Aparelho', 150, 'Ortodontia', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000011', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Prótese Dentária', 1900, 'Prótese', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000012', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Raspagem (Periodontia)', 320, 'Periodontia', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000013', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Radiografia', 60, 'Radiologia', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000014', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Facetas', 1400, 'Estética', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000015', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Bichectomia', 1600, 'Cirurgia', true, false, now() - interval '150 days'),
  ('de3a0000-0002-0003-0000-000000000016', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Gengivoplastia e Gengivectomia', 900, 'Periodontia', true, false, now() - interval '150 days')
on conflict (id) do nothing;

-- 4. Estoque (6 itens; categorias = slugs de stockCategories)
insert into public.stock_items (id, clinic_id, name, category, unit, quantity, min_quantity, cost_price, supplier, is_active, created_at, updated_at)
values
  ('de3a0000-0002-0004-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Resina composta (seringa 4 g)', 'material', 'un', 14, 6, 46.0, 'OdontoSul Materiais', true, now() - interval '120 days', now() - interval '5 days'),
  ('de3a0000-0002-0004-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Anestésico lidocaína 2% com epinefrina (caixa 50 tubetes)', 'medicamento', 'cx', 5, 3, 118.0, 'OdontoSul Materiais', true, now() - interval '120 days', now() - interval '7 days'),
  ('de3a0000-0002-0004-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Agulha gengival curta (caixa 100)', 'descartavel', 'cx', 6, 3, 54.0, 'DentalPrime Distribuidora', true, now() - interval '120 days', now() - interval '9 days'),
  ('de3a0000-0002-0004-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Sugadores descartáveis (pacote 40)', 'descartavel', 'pct', 22, 10, 9.9, 'DentalPrime Distribuidora', true, now() - interval '120 days', now() - interval '11 days'),
  ('de3a0000-0002-0004-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Luvas de látex para procedimento (caixa 100)', 'descartavel', 'cx', 11, 8, 32.0, 'DentalPrime Distribuidora', true, now() - interval '120 days', now() - interval '13 days'),
  ('de3a0000-0002-0004-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'Fotopolimerizador LED sem fio', 'equipamento', 'un', 2, 1, 420.0, 'OdontoSul Materiais', true, now() - interval '120 days', now() - interval '15 days')
on conflict (id) do nothing;

-- 5. Movimentações de estoque (12); a quantidade atual do item já considera as saídas
insert into public.stock_movements (id, clinic_id, item_id, type, quantity, reason, user_name, created_at)
values
  ('de3a0000-0002-0009-0000-000000000001', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000001', 'entrada', 26, 'Compra de reposicao', 'Dr. Rodrigo Esteves Lima', now() - interval '61 days'),
  ('de3a0000-0002-0009-0000-000000000002', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000001', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Aline Gurgel Maia', now() - interval '13 days'),
  ('de3a0000-0002-0009-0000-000000000003', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000002', 'entrada', 17, 'Compra de reposicao', 'Dr. Rodrigo Esteves Lima', now() - interval '62 days'),
  ('de3a0000-0002-0009-0000-000000000004', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000002', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Aline Gurgel Maia', now() - interval '14 days'),
  ('de3a0000-0002-0009-0000-000000000005', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000003', 'entrada', 18, 'Compra de reposicao', 'Dr. Rodrigo Esteves Lima', now() - interval '63 days'),
  ('de3a0000-0002-0009-0000-000000000006', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000003', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Aline Gurgel Maia', now() - interval '15 days'),
  ('de3a0000-0002-0009-0000-000000000007', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000004', 'entrada', 34, 'Compra de reposicao', 'Dr. Rodrigo Esteves Lima', now() - interval '64 days'),
  ('de3a0000-0002-0009-0000-000000000008', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000004', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Aline Gurgel Maia', now() - interval '16 days'),
  ('de3a0000-0002-0009-0000-000000000009', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000005', 'entrada', 23, 'Compra de reposicao', 'Dr. Rodrigo Esteves Lima', now() - interval '65 days'),
  ('de3a0000-0002-0009-0000-000000000010', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000005', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Aline Gurgel Maia', now() - interval '17 days'),
  ('de3a0000-0002-0009-0000-000000000011', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000006', 'entrada', 14, 'Compra de reposicao', 'Dr. Rodrigo Esteves Lima', now() - interval '66 days'),
  ('de3a0000-0002-0009-0000-000000000012', '3916d37d-b247-485e-bd2f-b47be8d44207', 'de3a0000-0002-0004-0000-000000000006', 'saida', 12, 'Uso nos atendimentos do mes', 'Dra. Aline Gurgel Maia', now() - interval '18 days')
on conflict (id) do nothing;

-- 6. Consultas (31): passado = concluído/faltou/cancelado; semanas 0..2 = hoje e futuro.
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
  ('de3a0000-0002-0005-0000-000000000001', 'de3a0000-0002-0002-0000-000000000001', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000002', 'Avaliação', 0, 'concluido', -54, '11:00', 30, null),
  ('de3a0000-0002-0005-0000-000000000002', 'de3a0000-0002-0002-0000-000000000001', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000013', 'Radiografia', 60, 'concluido', -42, '17:00', 15, null),
  ('de3a0000-0002-0005-0000-000000000003', 'de3a0000-0002-0002-0000-000000000001', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000004', 'Restauração', 280, 'concluido', -11, '14:30', 40, null),
  ('de3a0000-0002-0005-0000-000000000004', 'de3a0000-0002-0002-0000-000000000001', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000003', 'Limpeza (Profilaxia)', 180, 'confirmado', 18, '16:30', 40, null),
  ('de3a0000-0002-0005-0000-000000000005', 'de3a0000-0002-0002-0000-000000000002', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000001', 'Consulta', 150, 'concluido', -39, '09:00', 40, null),
  ('de3a0000-0002-0005-0000-000000000006', 'de3a0000-0002-0002-0000-000000000002', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000013', 'Radiografia', 60, 'concluido', -27, '08:00', 15, null),
  ('de3a0000-0002-0005-0000-000000000007', 'de3a0000-0002-0002-0000-000000000002', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000011', 'Prótese Dentária', 1900, 'faltou', -10, '08:00', 40, 'Não compareceu e não avisou.'),
  ('de3a0000-0002-0005-0000-000000000008', 'de3a0000-0002-0002-0000-000000000002', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000001', 'Consulta', 150, 'agendado', 10, '16:30', 40, 'Retorno para moldagem da coroa'),
  ('de3a0000-0002-0005-0000-000000000009', 'de3a0000-0002-0002-0000-000000000003', 'de3a0000-0002-0001-0000-000000000002', 'de3a0000-0002-0003-0000-000000000009', 'Aparelho Ortodôntico', 1800, 'concluido', -56, '08:00', 60, null),
  ('de3a0000-0002-0005-0000-000000000010', 'de3a0000-0002-0002-0000-000000000003', 'de3a0000-0002-0001-0000-000000000002', 'de3a0000-0002-0003-0000-000000000010', 'Manutenção de Aparelho', 150, 'concluido', -39, '10:30', 30, null),
  ('de3a0000-0002-0005-0000-000000000011', 'de3a0000-0002-0002-0000-000000000003', 'de3a0000-0002-0001-0000-000000000002', 'de3a0000-0002-0003-0000-000000000010', 'Manutenção de Aparelho', 150, 'faltou', -35, '15:30', 30, 'Não compareceu; a recepção tentou contato.'),
  ('de3a0000-0002-0005-0000-000000000012', 'de3a0000-0002-0002-0000-000000000003', 'de3a0000-0002-0001-0000-000000000002', 'de3a0000-0002-0003-0000-000000000006', 'Extração de Siso', 420, 'concluido', -27, '15:00', 60, null),
  ('de3a0000-0002-0005-0000-000000000013', 'de3a0000-0002-0002-0000-000000000003', 'de3a0000-0002-0001-0000-000000000002', 'de3a0000-0002-0003-0000-000000000010', 'Manutenção de Aparelho', 150, 'confirmado', 8, '09:30', 30, null),
  ('de3a0000-0002-0005-0000-000000000014', 'de3a0000-0002-0002-0000-000000000004', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000001', 'Consulta', 150, 'concluido', -34, '17:00', 40, null),
  ('de3a0000-0002-0005-0000-000000000015', 'de3a0000-0002-0002-0000-000000000004', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000012', 'Raspagem (Periodontia)', 320, 'concluido', -17, '16:00', 50, null),
  ('de3a0000-0002-0005-0000-000000000016', 'de3a0000-0002-0002-0000-000000000004', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000011', 'Prótese Dentária', 1900, 'concluido', -4, '08:30', 40, null),
  ('de3a0000-0002-0005-0000-000000000017', 'de3a0000-0002-0002-0000-000000000004', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000001', 'Consulta', 150, 'agendado', 15, '08:30', 40, 'Ajuste da prótese'),
  ('de3a0000-0002-0005-0000-000000000018', 'de3a0000-0002-0002-0000-000000000005', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000002', 'Avaliação', 0, 'concluido', -38, '14:00', 30, null),
  ('de3a0000-0002-0005-0000-000000000019', 'de3a0000-0002-0002-0000-000000000005', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000003', 'Limpeza (Profilaxia)', 180, 'concluido', -32, '16:00', 40, null),
  ('de3a0000-0002-0005-0000-000000000020', 'de3a0000-0002-0002-0000-000000000005', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000007', 'Clareamento Dental', 850, 'concluido', -27, '10:30', 60, null),
  ('de3a0000-0002-0005-0000-000000000021', 'de3a0000-0002-0002-0000-000000000005', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000001', 'Consulta', 150, 'agendado', 18, '10:00', 40, 'Revisão do clareamento'),
  ('de3a0000-0002-0005-0000-000000000022', 'de3a0000-0002-0002-0000-000000000006', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000001', 'Consulta', 150, 'concluido', -26, '09:00', 40, null),
  ('de3a0000-0002-0005-0000-000000000023', 'de3a0000-0002-0002-0000-000000000006', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000003', 'Limpeza (Profilaxia)', 180, 'concluido', -14, '09:30', 40, null),
  ('de3a0000-0002-0005-0000-000000000024', 'de3a0000-0002-0002-0000-000000000006', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000001', 'Consulta', 150, 'confirmado', 10, '13:30', 40, 'Aplicação de selantes e revisão'),
  ('de3a0000-0002-0005-0000-000000000025', 'de3a0000-0002-0002-0000-000000000007', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000001', 'Consulta', 150, 'concluido', -52, '11:00', 40, null),
  ('de3a0000-0002-0005-0000-000000000026', 'de3a0000-0002-0002-0000-000000000007', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000013', 'Radiografia', 60, 'concluido', -42, '08:30', 15, null),
  ('de3a0000-0002-0005-0000-000000000027', 'de3a0000-0002-0002-0000-000000000007', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000008', 'Canal (Endodontia)', 780, 'concluido', -28, '13:00', 60, null),
  ('de3a0000-0002-0005-0000-000000000028', 'de3a0000-0002-0002-0000-000000000007', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000004', 'Restauração', 280, 'confirmado', 8, '17:00', 40, 'Restauração definitiva do 25 após o canal'),
  ('de3a0000-0002-0005-0000-000000000029', 'de3a0000-0002-0002-0000-000000000008', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000001', 'Consulta', 150, 'concluido', -14, '16:30', 40, null),
  ('de3a0000-0002-0005-0000-000000000030', 'de3a0000-0002-0002-0000-000000000008', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000014', 'Facetas', 1400, 'concluido', -7, '08:30', 60, null),
  ('de3a0000-0002-0005-0000-000000000031', 'de3a0000-0002-0002-0000-000000000008', 'de3a0000-0002-0001-0000-000000000001', 'de3a0000-0002-0003-0000-000000000001', 'Consulta', 150, 'confirmado', 8, '10:00', 40, 'Prova das facetas')
) as v(id, pat, prof, proc, pname, price, st, d, t, dur, notes)
cross join lateral (select ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') as ts) x
on conflict (id) do nothing;

-- 7. Receitas (19): uma por consulta concluída (semanas passadas), no valor do procedimento.
-- O gatilho de comissão só gera linhas para beneficiários ativos (hoje o único está inativo).
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.financial_records (id, clinic_id, patient_id, appointment_id, procedure_id, professional_id,
  total_amount, discount_percent, payment_method, convenio, type, category, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.appt::uuid, v.proc::uuid, v.prof::uuid,
       v.total::numeric, v.disc::numeric, v.pm, v.conv, 'receita', v.cat, '[]'::jsonb,
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0002-0006-0000-000000000002', 'de3a0000-0002-0002-0000-000000000001', 'de3a0000-0002-0005-0000-000000000002', 'de3a0000-0002-0003-0000-000000000013', 'de3a0000-0002-0001-0000-000000000001', 60.0, 0, 'pix', null, 'Exame', -42, '17:00', 15),
  ('de3a0000-0002-0006-0000-000000000003', 'de3a0000-0002-0002-0000-000000000001', 'de3a0000-0002-0005-0000-000000000003', 'de3a0000-0002-0003-0000-000000000004', 'de3a0000-0002-0001-0000-000000000001', 280.0, 0, 'pix', null, 'Procedimento', -11, '14:30', 40),
  ('de3a0000-0002-0006-0000-000000000005', 'de3a0000-0002-0002-0000-000000000002', 'de3a0000-0002-0005-0000-000000000005', 'de3a0000-0002-0003-0000-000000000001', 'de3a0000-0002-0001-0000-000000000001', 150.0, 0, 'cartao_debito', null, 'Consulta', -39, '09:00', 40),
  ('de3a0000-0002-0006-0000-000000000006', 'de3a0000-0002-0002-0000-000000000002', 'de3a0000-0002-0005-0000-000000000006', 'de3a0000-0002-0003-0000-000000000013', 'de3a0000-0002-0001-0000-000000000001', 60.0, 0, 'cartao_credito', null, 'Exame', -27, '08:00', 15),
  ('de3a0000-0002-0006-0000-000000000009', 'de3a0000-0002-0002-0000-000000000003', 'de3a0000-0002-0005-0000-000000000009', 'de3a0000-0002-0003-0000-000000000009', 'de3a0000-0002-0001-0000-000000000002', 1800.0, 0, 'cartao_credito', null, 'Procedimento', -56, '08:00', 60),
  ('de3a0000-0002-0006-0000-000000000010', 'de3a0000-0002-0002-0000-000000000003', 'de3a0000-0002-0005-0000-000000000010', 'de3a0000-0002-0003-0000-000000000010', 'de3a0000-0002-0001-0000-000000000002', 150.0, 0, 'cartao_credito', null, 'Procedimento', -39, '10:30', 30),
  ('de3a0000-0002-0006-0000-000000000012', 'de3a0000-0002-0002-0000-000000000003', 'de3a0000-0002-0005-0000-000000000012', 'de3a0000-0002-0003-0000-000000000006', 'de3a0000-0002-0001-0000-000000000002', 420.0, 0, 'pix', null, 'Procedimento', -27, '15:00', 60),
  ('de3a0000-0002-0006-0000-000000000014', 'de3a0000-0002-0002-0000-000000000004', 'de3a0000-0002-0005-0000-000000000014', 'de3a0000-0002-0003-0000-000000000001', 'de3a0000-0002-0001-0000-000000000001', 150.0, 0, 'cartao_debito', null, 'Consulta', -34, '17:00', 40),
  ('de3a0000-0002-0006-0000-000000000015', 'de3a0000-0002-0002-0000-000000000004', 'de3a0000-0002-0005-0000-000000000015', 'de3a0000-0002-0003-0000-000000000012', 'de3a0000-0002-0001-0000-000000000001', 320.0, 0, 'cartao_debito', null, 'Procedimento', -17, '16:00', 50),
  ('de3a0000-0002-0006-0000-000000000016', 'de3a0000-0002-0002-0000-000000000004', 'de3a0000-0002-0005-0000-000000000016', 'de3a0000-0002-0003-0000-000000000011', 'de3a0000-0002-0001-0000-000000000001', 1710.0, 10, 'cartao_credito', null, 'Procedimento', -4, '08:30', 40),
  ('de3a0000-0002-0006-0000-000000000019', 'de3a0000-0002-0002-0000-000000000005', 'de3a0000-0002-0005-0000-000000000019', 'de3a0000-0002-0003-0000-000000000003', 'de3a0000-0002-0001-0000-000000000001', 180.0, 0, 'cartao_debito', null, 'Procedimento', -32, '16:00', 40),
  ('de3a0000-0002-0006-0000-000000000020', 'de3a0000-0002-0002-0000-000000000005', 'de3a0000-0002-0005-0000-000000000020', 'de3a0000-0002-0003-0000-000000000007', 'de3a0000-0002-0001-0000-000000000001', 765.0, 10, 'pix', null, 'Procedimento', -27, '10:30', 60),
  ('de3a0000-0002-0006-0000-000000000022', 'de3a0000-0002-0002-0000-000000000006', 'de3a0000-0002-0005-0000-000000000022', 'de3a0000-0002-0003-0000-000000000001', 'de3a0000-0002-0001-0000-000000000001', 150.0, 0, 'pix', null, 'Consulta', -26, '09:00', 40),
  ('de3a0000-0002-0006-0000-000000000023', 'de3a0000-0002-0002-0000-000000000006', 'de3a0000-0002-0005-0000-000000000023', 'de3a0000-0002-0003-0000-000000000003', 'de3a0000-0002-0001-0000-000000000001', 180.0, 0, 'cartao_debito', null, 'Procedimento', -14, '09:30', 40),
  ('de3a0000-0002-0006-0000-000000000025', 'de3a0000-0002-0002-0000-000000000007', 'de3a0000-0002-0005-0000-000000000025', 'de3a0000-0002-0003-0000-000000000001', 'de3a0000-0002-0001-0000-000000000001', 150.0, 0, 'dinheiro', null, 'Consulta', -52, '11:00', 40),
  ('de3a0000-0002-0006-0000-000000000026', 'de3a0000-0002-0002-0000-000000000007', 'de3a0000-0002-0005-0000-000000000026', 'de3a0000-0002-0003-0000-000000000013', 'de3a0000-0002-0001-0000-000000000001', 60.0, 0, 'convenio', 'Bradesco Dental', 'Exame', -42, '08:30', 15),
  ('de3a0000-0002-0006-0000-000000000027', 'de3a0000-0002-0002-0000-000000000007', 'de3a0000-0002-0005-0000-000000000027', 'de3a0000-0002-0003-0000-000000000008', 'de3a0000-0002-0001-0000-000000000001', 780.0, 0, 'convenio', 'Bradesco Dental', 'Procedimento', -28, '13:00', 60),
  ('de3a0000-0002-0006-0000-000000000029', 'de3a0000-0002-0002-0000-000000000008', 'de3a0000-0002-0005-0000-000000000029', 'de3a0000-0002-0003-0000-000000000001', 'de3a0000-0002-0001-0000-000000000001', 150.0, 0, 'dinheiro', null, 'Consulta', -14, '16:30', 40),
  ('de3a0000-0002-0006-0000-000000000030', 'de3a0000-0002-0002-0000-000000000008', 'de3a0000-0002-0005-0000-000000000030', 'de3a0000-0002-0003-0000-000000000014', 'de3a0000-0002-0001-0000-000000000001', 1400.0, 0, 'cartao_credito', null, 'Procedimento', -7, '08:30', 60)
) as v(id, pat, appt, proc, prof, total, disc, pm, conv, cat, d, t, dur)
on conflict (id) do nothing;

-- 8. Despesas da área (3); aluguel e folha já existem na clínica, não são repetidos
insert into public.financial_records (id, clinic_id, total_amount, discount_percent, payment_method, type, category, notes, installments, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.amt::numeric, 0, v.pm, 'despesa', v.cat, v.note, '[]'::jsonb, v.at::timestamptz
from (values
  ('de3a0000-0002-0006-0000-000000000901', 2150.0, 'cartao_credito', 'Material', 'Resinas, anestésicos e descartáveis do mês', now() - interval '14 days'),
  ('de3a0000-0002-0006-0000-000000000902', 460.0, 'pix', 'Equipamento', 'Manutenção do compressor odontológico', now() - interval '38 days'),
  ('de3a0000-0002-0006-0000-000000000903', 600.0, 'pix', 'Marketing', 'Campanha de clareamento no Instagram', now() - interval '61 days')
) as v(id, amt, pm, cat, note, at)
on conflict (id) do nothing;

-- 9. Prontuários (8): anamnese e exame clínico namespaced por área ("odonto"), chaves reais de specialtyConfig.tsx
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.medical_records (id, clinic_id, patient_id, anamnesis, clinical_exam, treatment_plan, odontogram, treatment_plan_items, created_at, updated_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.anam, v.exam, v.tp, v.odo, v.items,
       ((m.monday + v.d1::int + v.t1::time) at time zone 'America/Sao_Paulo'),
       ((m.monday + v.d2::int + v.t2::time) at time zone 'America/Sao_Paulo')
from m
cross join (values
  ('de3a0000-0002-0007-0000-000000000001', 'de3a0000-0002-0002-0000-000000000001', $j${"odonto":{"a-pressao":"Sem alteração de pressão ou cardiopatia referida","a-fumante":"Não fuma; consumo social de álcool","a-habitos":"Sem hábitos bucais deletérios","a-queixa":"Sensibilidade ao frio no dente superior direito","a-saude":"Boa","a-tratamento":"Não","a-medicamentos":"Anticoncepcional","a-alergia":"Nega alergias","a-gengiva":"Sangramento leve ao escovar","a-hist_odonto":"Última consulta há 1 ano; sem próteses","a-bruxismo":"Refere ranger de dentes à noite"}}$j$::jsonb, $j${"odonto":{"e-halitose":"Ausente","e-mucosa":"Mucosa oral de aspecto normal, sem lesões","e-palato":"Palato, língua e assoalho bucal sem alterações","e-oclusao":"Oclusão estável; ATM sem estalos ou dor","e-higiene":"Placa bacteriana leve em região posterior","e-mobilidade":"Ausente","e-sondagem":"Sondagem até 3 mm; sangramento leve em molares","e-dor":"Sensibilidade ao frio no 16","e-hipotese":"Cárie oclusal no 16. Solicitada radiografia periapical.","e-obs":"Orientada sobre uso de placa miorrelaxante."}}$j$::jsonb, 'Restaurar o 16 e manter o controle de placa. Avaliar placa miorrelaxante.', $j${"16":{"status":"higido","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"cariado"},"note":"Cárie oclusal, sensível ao frio"},"26":{"status":"higido","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"restaurado"},"note":"Resina composta antiga em bom estado"},"_history":[{"at":"2026-10-08T14:30:00.000Z","tooth":16,"face":"o","status":"cariado","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-09-22T14:30:00.000Z","tooth":26,"face":"o","status":"restaurado","by":"Dr. Rodrigo Esteves Lima"}]}$j$::jsonb, $j$[{"id":"de3a0000-0002-000a-0000-000000000101","description":"Restauração em resina - dente 16 (oclusal)","value":280},{"id":"de3a0000-0002-000a-0000-000000000102","description":"Placa miorrelaxante","value":450}]$j$::jsonb, -54, '11:00', -11, '14:30'),
  ('de3a0000-0002-0007-0000-000000000002', 'de3a0000-0002-0002-0000-000000000002', $j${"odonto":{"a-pressao":"Sem alteração de pressão ou cardiopatia referida","a-fumante":"Não fuma; consumo social de álcool","a-habitos":"Sem hábitos bucais deletérios","a-queixa":"Falta do dente 36 há 2 anos; deseja repor","a-saude":"Boa","a-tratamento":"Não","a-medicamentos":"Nenhum","a-alergia":"Alergia a dipirona","a-gengiva":"Sem sangramento","a-hist_odonto":"Extração do 36 por fratura radicular","a-bruxismo":"Nega"}}$j$::jsonb, $j${"odonto":{"e-halitose":"Ausente","e-mucosa":"Mucosa oral de aspecto normal, sem lesões","e-palato":"Palato, língua e assoalho bucal sem alterações","e-oclusao":"Oclusão estável; ATM sem estalos ou dor","e-higiene":"Boa","e-mobilidade":"Ausente","e-sondagem":"Sem bolsas periodontais","e-dor":"Sem queixas","e-hipotese":"Edentulismo unitário no 36; osso remanescente adequado.","e-obs":"Planejado implante e coroa sobre implante."}}$j$::jsonb, 'Reposição do 36 com implante e coroa. Controle de higiene a cada 6 meses.', $j${"36":{"status":"implante","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Implante a instalar","planned":{"all":true}},"46":{"status":"coroa","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Coroa metalocerâmica, 2019"},"17":{"status":"higido","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"restaurado"},"note":"Resina composta"},"_history":[{"at":"2026-10-08T14:30:00.000Z","tooth":36,"status":"implante","by":"Dr. Rodrigo Esteves Lima","planned":true},{"at":"2026-08-30T14:30:00.000Z","tooth":46,"status":"coroa","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-08-30T14:30:00.000Z","tooth":17,"face":"o","status":"restaurado","by":"Dr. Rodrigo Esteves Lima"}]}$j$::jsonb, $j$[{"id":"de3a0000-0002-000a-0000-000000000201","description":"Implante dentário - dente 36","value":3200},{"id":"de3a0000-0002-000a-0000-000000000202","description":"Coroa sobre implante - dente 36","value":1800}]$j$::jsonb, -39, '09:00', -27, '08:00'),
  ('de3a0000-0002-0007-0000-000000000003', 'de3a0000-0002-0002-0000-000000000003', $j${"odonto":{"a-pressao":"Sem alteração de pressão ou cardiopatia referida","a-fumante":"Não fuma; consumo social de álcool","a-habitos":"Roía unhas na adolescência","a-queixa":"Dentes apinhados na arcada inferior","a-saude":"Boa","a-tratamento":"Não","a-medicamentos":"Nenhum","a-alergia":"Nega alergias","a-gengiva":"Sem queixas","a-hist_odonto":"Nunca usou aparelho","a-bruxismo":"Nega"}}$j$::jsonb, $j${"odonto":{"e-halitose":"Ausente","e-mucosa":"Mucosa oral de aspecto normal, sem lesões","e-palato":"Palato, língua e assoalho bucal sem alterações","e-oclusao":"Classe I, apinhamento anteroinferior de 4 mm","e-higiene":"Boa, com leve acúmulo de placa por apinhamento","e-mobilidade":"Ausente","e-hipotese":"Má oclusão Classe I com apinhamento. Indicado aparelho fixo.","e-obs":"Terceiros molares inferiores incluídos; extração indicada."}}$j$::jsonb, 'Ortodontia corretiva com aparelho fixo (18 a 24 meses). Extração dos sisos inferiores.', $j${"38":{"status":"extracao","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Siso incluso mesioangulado","planned":{"all":true}},"48":{"status":"extracao","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Siso incluso","planned":{"all":true}},"11":{"status":"tratamento","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Bráquete instalado"},"21":{"status":"tratamento","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Bráquete instalado"},"_history":[{"at":"2026-10-08T14:30:00.000Z","tooth":38,"status":"extracao","by":"Dra. Aline Gurgel Maia","planned":true},{"at":"2026-10-08T14:30:00.000Z","tooth":48,"status":"extracao","by":"Dra. Aline Gurgel Maia","planned":true},{"at":"2026-10-08T14:30:00.000Z","tooth":11,"status":"tratamento","by":"Dra. Aline Gurgel Maia"},{"at":"2026-10-08T14:30:00.000Z","tooth":21,"status":"tratamento","by":"Dra. Aline Gurgel Maia"}]}$j$::jsonb, $j$[{"id":"de3a0000-0002-000a-0000-000000000301","description":"Aparelho ortodôntico fixo - instalação","value":1800},{"id":"de3a0000-0002-000a-0000-000000000302","description":"Extração de siso - dente 38","value":420},{"id":"de3a0000-0002-000a-0000-000000000303","description":"Extração de siso - dente 48","value":420}]$j$::jsonb, -56, '08:00', -27, '15:00'),
  ('de3a0000-0002-0007-0000-000000000004', 'de3a0000-0002-0002-0000-000000000004', $j${"odonto":{"a-pressao":"Hipertenso controlado","a-fumante":"Ex-fumante há 10 anos","a-habitos":"Sem hábitos bucais deletérios","a-queixa":"Mastigação difícil por falta de dentes e gengiva inflamada","a-saude":"Regular","a-tratamento":"Sim, hipertensão e diabetes tipo 2","a-medicamentos":"Losartana e metformina","a-alergia":"Nega","a-gengiva":"Sangramento frequente","a-hist_odonto":"Várias extrações; prótese parcial antiga","a-bruxismo":"Nega"}}$j$::jsonb, $j${"odonto":{"e-halitose":"Moderada","e-mucosa":"Mucosa oral de aspecto normal, sem lesões","e-palato":"Palato, língua e assoalho bucal sem alterações","e-oclusao":"Oclusão estável; ATM sem estalos ou dor","e-higiene":"Regular, com cálculo supragengival","e-mobilidade":"Grau I nos incisivos inferiores","e-sondagem":"Bolsas de 4 a 5 mm; sangramento difuso","e-hipotese":"Periodontite moderada generalizada; edentulismo parcial.","e-obs":"Controle glicêmico informado: HbA1c 6,9%."}}$j$::jsonb, 'Terapia periodontal básica e reabilitação com prótese removível inferior.', $j${"14":{"status":"ausente","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":""},"15":{"status":"ausente","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":""},"16":{"status":"ausente","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":""},"26":{"status":"ausente","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":""},"36":{"status":"ausente","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":""},"11":{"status":"protese","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Prótese parcial removível superior"},"12":{"status":"protese","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Prótese parcial removível superior"},"41":{"status":"higido","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Mobilidade grau I"},"_history":[{"at":"2026-10-08T14:30:00.000Z","tooth":14,"status":"ausente","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-10-08T14:30:00.000Z","tooth":15,"status":"ausente","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-10-08T14:30:00.000Z","tooth":16,"status":"ausente","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-10-08T14:30:00.000Z","tooth":26,"status":"ausente","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-10-08T14:30:00.000Z","tooth":36,"status":"ausente","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-10-08T14:30:00.000Z","tooth":11,"status":"protese","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-10-08T14:30:00.000Z","tooth":12,"status":"protese","by":"Dr. Rodrigo Esteves Lima"}]}$j$::jsonb, $j$[{"id":"de3a0000-0002-000a-0000-000000000401","description":"Raspagem periodontal por quadrante (4 sessões)","value":1280},{"id":"de3a0000-0002-000a-0000-000000000402","description":"Prótese parcial removível inferior","value":1900}]$j$::jsonb, -34, '17:00', -4, '08:30'),
  ('de3a0000-0002-0007-0000-000000000005', 'de3a0000-0002-0002-0000-000000000005', $j${"odonto":{"a-pressao":"Sem alteração de pressão ou cardiopatia referida","a-fumante":"Não fuma; consumo social de álcool","a-habitos":"Consome café e vinho com frequência","a-queixa":"Deseja clarear os dentes para um evento em dezembro","a-saude":"Ótima","a-tratamento":"Não","a-medicamentos":"Nenhum","a-alergia":"Nega alergias","a-gengiva":"Nega","a-hist_odonto":"Restauração no 47 aos 15 anos","a-bruxismo":"Nega"}}$j$::jsonb, $j${"odonto":{"e-halitose":"Ausente","e-mucosa":"Mucosa oral de aspecto normal, sem lesões","e-palato":"Palato, língua e assoalho bucal sem alterações","e-oclusao":"Oclusão estável; ATM sem estalos ou dor","e-higiene":"Excelente","e-mobilidade":"Ausente","e-sondagem":"Sem bolsas, sem sangramento","e-dor":"Ausente","e-hipotese":"Dentes hígidos com pigmentação extrínseca (cor A3).","e-obs":"Indicado clareamento de consultório associado ao caseiro."}}$j$::jsonb, 'Profilaxia e clareamento de consultório com moldeira para manutenção caseira.', $j${"47":{"status":"higido","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"restaurado"},"note":"Resina composta antiga"},"_history":[{"at":"2026-09-15T14:30:00.000Z","tooth":47,"face":"o","status":"restaurado","by":"Dr. Rodrigo Esteves Lima"}]}$j$::jsonb, $j$[{"id":"de3a0000-0002-000a-0000-000000000501","description":"Clareamento dental de consultório (2 sessões)","value":850}]$j$::jsonb, -38, '14:00', -27, '10:30'),
  ('de3a0000-0002-0007-0000-000000000006', 'de3a0000-0002-0002-0000-000000000006', $j${"odonto":{"a-pressao":"Sem alteração de pressão ou cardiopatia referida","a-fumante":"Não fuma; consumo social de álcool","a-habitos":"Chupou dedo até os 4 anos","a-queixa":"Consulta de rotina; mãe relata consumo alto de açúcar","a-saude":"Boa","a-tratamento":"Não","a-medicamentos":"Nenhum","a-alergia":"Nega","a-gengiva":"Nega","a-hist_odonto":"Primeira consulta no consultório","a-bruxismo":"Nega"}}$j$::jsonb, $j${"odonto":{"e-halitose":"Ausente","e-mucosa":"Mucosa oral de aspecto normal, sem lesões","e-palato":"Palato, língua e assoalho bucal sem alterações","e-oclusao":"Oclusão estável; ATM sem estalos ou dor","e-higiene":"Regular; placa visível em molares","e-mobilidade":"Fisiológica nos decíduos remanescentes","e-hipotese":"Risco moderado de cárie; indicado selamento dos primeiros molares permanentes.","e-obs":"Responsável orientada sobre escovação supervisionada."}}$j$::jsonb, 'Selamento dos primeiros molares, controle de dieta e fluorterapia.', $j${"46":{"status":"higido","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"cariado"},"note":"Mancha branca ativa em sulco"},"16":{"status":"selante","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Selante a realizar","planned":{"all":true}},"26":{"status":"selante","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Selante a realizar","planned":{"all":true}},"36":{"status":"selante","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Selante a realizar","planned":{"all":true}},"_history":[{"at":"2026-10-08T14:30:00.000Z","tooth":46,"face":"o","status":"cariado","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-10-08T14:30:00.000Z","tooth":16,"status":"selante","by":"Dr. Rodrigo Esteves Lima","planned":true},{"at":"2026-10-08T14:30:00.000Z","tooth":26,"status":"selante","by":"Dr. Rodrigo Esteves Lima","planned":true},{"at":"2026-10-08T14:30:00.000Z","tooth":36,"status":"selante","by":"Dr. Rodrigo Esteves Lima","planned":true}]}$j$::jsonb, $j$[{"id":"de3a0000-0002-000a-0000-000000000601","description":"Selante de fóssulas e fissuras (4 dentes)","value":320},{"id":"de3a0000-0002-000a-0000-000000000602","description":"Aplicação tópica de flúor","value":90}]$j$::jsonb, -26, '09:00', -14, '09:30'),
  ('de3a0000-0002-0007-0000-000000000007', 'de3a0000-0002-0002-0000-000000000007', $j${"odonto":{"a-pressao":"Sem alteração de pressão ou cardiopatia referida","a-fumante":"Não fuma; consumo social de álcool","a-habitos":"Sem hábitos bucais deletérios","a-queixa":"Dor intensa e espontânea no dente 25 há 3 dias","a-saude":"Boa","a-tratamento":"Não","a-medicamentos":"Ibuprofeno por conta própria","a-alergia":"Alergia a penicilina","a-gengiva":"Nega","a-hist_odonto":"Restaurações profundas no 25","a-bruxismo":"Sim, usa placa"}}$j$::jsonb, $j${"odonto":{"e-halitose":"Ausente","e-mucosa":"Mucosa oral de aspecto normal, sem lesões","e-palato":"Palato, língua e assoalho bucal sem alterações","e-oclusao":"Oclusão estável; ATM sem estalos ou dor","e-higiene":"Boa","e-mobilidade":"Ausente","e-sondagem":"Normal","e-dor":"Dor à percussão vertical e ao frio prolongada no 25","e-hipotese":"Pulpite irreversível sintomática no 25. Indicado tratamento endodôntico.","e-obs":"Prescrito analgésico alternativo (alergia a penicilina anotada)."}}$j$::jsonb, 'Tratamento endodôntico do 25, restauração definitiva e coroa.', $j${"25":{"status":"tratamento","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Tratamento endodôntico em andamento"},"35":{"status":"higido","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"restaurado"},"note":"Resina composta"},"14":{"status":"coroa","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Planejar coroa após o canal","planned":{"all":true}},"_history":[{"at":"2026-10-14T14:30:00.000Z","tooth":25,"status":"tratamento","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-10-08T14:30:00.000Z","tooth":35,"face":"o","status":"restaurado","by":"Dr. Rodrigo Esteves Lima"},{"at":"2026-10-14T14:30:00.000Z","tooth":14,"status":"coroa","by":"Dr. Rodrigo Esteves Lima","planned":true}]}$j$::jsonb, $j$[{"id":"de3a0000-0002-000a-0000-000000000701","description":"Tratamento de canal - dente 25","value":780},{"id":"de3a0000-0002-000a-0000-000000000702","description":"Restauração definitiva - dente 25","value":280},{"id":"de3a0000-0002-000a-0000-000000000703","description":"Coroa - dente 25","value":1500}]$j$::jsonb, -52, '11:00', -28, '13:00'),
  ('de3a0000-0002-0007-0000-000000000008', 'de3a0000-0002-0002-0000-000000000008', $j${"odonto":{"a-pressao":"Sem alteração de pressão ou cardiopatia referida","a-fumante":"Não fuma; consumo social de álcool","a-habitos":"Sem hábitos bucais deletérios","a-queixa":"Fratura no canto do incisivo central superior esquerdo após queda","a-saude":"Ótima","a-tratamento":"Não","a-medicamentos":"Suplementos esportivos","a-alergia":"Nega","a-gengiva":"Nega","a-hist_odonto":"Sem tratamentos prévios importantes","a-bruxismo":"Nega"}}$j$::jsonb, $j${"odonto":{"e-halitose":"Ausente","e-mucosa":"Mucosa oral de aspecto normal, sem lesões","e-palato":"Palato, língua e assoalho bucal sem alterações","e-oclusao":"Oclusão estável; ATM sem estalos ou dor","e-higiene":"Boa","e-mobilidade":"Ausente","e-sondagem":"Normal","e-dor":"Sensibilidade leve ao frio no 21","e-hipotese":"Fratura de esmalte e dentina no ângulo incisal do 21, sem exposição pulpar.","e-obs":"Opção estética: faceta cerâmica ou restauração direta."}}$j$::jsonb, 'Reabilitação estética do 21 com faceta cerâmica.', $j${"21":{"status":"fraturado","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":"Fratura incisal sem exposição pulpar"},"11":{"status":"higido","surfaces":{"v":"higido","l":"higido","m":"higido","d":"higido","o":"higido"},"note":""},"_history":[{"at":"2026-10-05T14:30:00.000Z","tooth":21,"status":"fraturado","by":"Dr. Rodrigo Esteves Lima"}]}$j$::jsonb, $j$[{"id":"de3a0000-0002-000a-0000-000000000801","description":"Faceta cerâmica - dente 21","value":1400}]$j$::jsonb, -14, '16:30', -7, '08:30')
) as v(id, pat, anam, exam, tp, odo, items, d1, t1, d2, t2)
on conflict (id) do nothing;

-- 10. Evoluções no prontuário (16); author_name = profissional que atendeu, professional_id preenchido
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday)
insert into public.record_entries (id, clinic_id, patient_id, record_id, author_name, professional_id, entry_text, entry_type, created_at)
select v.id::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, v.pat::uuid, v.rec::uuid, v.author, v.prof::uuid, v.txt, 'evolucao',
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo') + (v.dur::int || ' minutes')::interval
from m
cross join (values
  ('de3a0000-0002-0008-0000-000000000001', 'de3a0000-0002-0002-0000-000000000001', 'de3a0000-0002-0007-0000-000000000001', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Avaliação inicial. Cárie oclusal no 16; radiografia periapical solicitada. Orientação de higiene e uso de fio dental.', -54, '11:00', 30),
  ('de3a0000-0002-0008-0000-000000000002', 'de3a0000-0002-0002-0000-000000000001', 'de3a0000-0002-0007-0000-000000000001', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Restauração do 16 em resina composta concluída, ajuste oclusal sem intercorrências.', -11, '14:30', 40),
  ('de3a0000-0002-0008-0000-000000000003', 'de3a0000-0002-0002-0000-000000000002', 'de3a0000-0002-0007-0000-000000000002', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Paciente deseja repor o 36. Radiografia e tomografia indicam boa quantidade óssea. Apresentado plano de implante.', -39, '09:00', 40),
  ('de3a0000-0002-0008-0000-000000000004', 'de3a0000-0002-0002-0000-000000000002', 'de3a0000-0002-0007-0000-000000000002', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Moldagem realizada para a coroa provisória; paciente orientado quanto aos cuidados pós-cirúrgicos.', -27, '08:00', 15),
  ('de3a0000-0002-0008-0000-000000000005', 'de3a0000-0002-0002-0000-000000000003', 'de3a0000-0002-0007-0000-000000000003', 'Dra. Aline Gurgel Maia', 'de3a0000-0002-0001-0000-000000000002', 'Instalação do aparelho fixo superior e inferior concluída. Orientações de higiene com escova interdental.', -56, '08:00', 60),
  ('de3a0000-0002-0008-0000-000000000006', 'de3a0000-0002-0002-0000-000000000003', 'de3a0000-0002-0007-0000-000000000003', 'Dra. Aline Gurgel Maia', 'de3a0000-0002-0001-0000-000000000002', 'Manutenção mensal: troca de arco e elásticos. Boa colaboração e higiene.', -27, '15:00', 60),
  ('de3a0000-0002-0008-0000-000000000007', 'de3a0000-0002-0002-0000-000000000004', 'de3a0000-0002-0007-0000-000000000004', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Periodontite moderada. Iniciada raspagem e alisamento radicular por quadrantes; orientado controle glicêmico.', -34, '17:00', 40),
  ('de3a0000-0002-0008-0000-000000000008', 'de3a0000-0002-0002-0000-000000000004', 'de3a0000-0002-0007-0000-000000000004', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Boa resposta periodontal. Moldagem funcional para a prótese removível.', -4, '08:30', 40),
  ('de3a0000-0002-0008-0000-000000000009', 'de3a0000-0002-0002-0000-000000000005', 'de3a0000-0002-0007-0000-000000000005', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Avaliação e profilaxia. Cor inicial A3; indicado clareamento de consultório. Sem sensibilidade prévia.', -38, '14:00', 30),
  ('de3a0000-0002-0008-0000-000000000010', 'de3a0000-0002-0002-0000-000000000005', 'de3a0000-0002-0007-0000-000000000005', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Clareamento de consultório realizado: cor final A1. Orientações de dieta com restrição a corantes por 48 horas.', -27, '10:30', 60),
  ('de3a0000-0002-0008-0000-000000000011', 'de3a0000-0002-0002-0000-000000000006', 'de3a0000-0002-0007-0000-000000000006', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Primeira consulta infantil. Cooperativo; orientações de higiene para criança e responsável.', -26, '09:00', 40),
  ('de3a0000-0002-0008-0000-000000000012', 'de3a0000-0002-0002-0000-000000000006', 'de3a0000-0002-0007-0000-000000000006', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Profilaxia e flúor realizados. Mancha branca no 46 em acompanhamento.', -14, '09:30', 40),
  ('de3a0000-0002-0008-0000-000000000013', 'de3a0000-0002-0002-0000-000000000007', 'de3a0000-0002-0007-0000-000000000007', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Quadro de pulpite irreversível no 25. Aberta a câmara pulpar e feita medicação de alívio; analgesia prescrita.', -52, '11:00', 40),
  ('de3a0000-0002-0008-0000-000000000014', 'de3a0000-0002-0002-0000-000000000007', 'de3a0000-0002-0007-0000-000000000007', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Canal concluído em duas sessões, sem dor residual. Restauração provisória; agendada a definitiva.', -28, '13:00', 60),
  ('de3a0000-0002-0008-0000-000000000015', 'de3a0000-0002-0002-0000-000000000008', 'de3a0000-0002-0007-0000-000000000008', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Fratura incisal do 21 por trauma. Sem exposição pulpar; teste de vitalidade positivo. Plano de faceta cerâmica apresentado.', -14, '16:30', 40),
  ('de3a0000-0002-0008-0000-000000000016', 'de3a0000-0002-0002-0000-000000000008', 'de3a0000-0002-0007-0000-000000000008', 'Dr. Rodrigo Esteves Lima', 'de3a0000-0002-0001-0000-000000000001', 'Preparo e moldagem realizados; provisório em resina. Faceta em confecção no laboratório.', -7, '08:30', 60)
) as v(id, pat, rec, author, prof, txt, d, t, dur)
on conflict (id) do nothing;

-- Verificação (contagens esperadas em docs/demo-seed-video123.md)
select 'professionals' as tabela, count(*) as linhas from public.professionals where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0001-%'
union all
select 'patients' as tabela, count(*) as linhas from public.patients where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0002-%'
union all
select 'procedures' as tabela, count(*) as linhas from public.procedures where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0003-%'
union all
select 'stock_items' as tabela, count(*) as linhas from public.stock_items where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0004-%'
union all
select 'stock_movements' as tabela, count(*) as linhas from public.stock_movements where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0009-%'
union all
select 'appointments' as tabela, count(*) as linhas from public.appointments where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0005-%'
union all
select 'financial_records' as tabela, count(*) as linhas from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0006-%'
union all
select 'medical_records' as tabela, count(*) as linhas from public.medical_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0007-%'
union all
select 'record_entries' as tabela, count(*) as linhas from public.record_entries where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0008-%'
order by 1;

commit;

-- =============================================================================
-- ROLLBACK (descomente tudo, de "begin" a "commit", e rode inteiro).
-- Apaga só o que este arquivo criou: clinic_id da demo + ids com o prefixo de3a0000-0002-.
-- Ordem respeita as FKs (receitas e comissões -> evoluções -> prontuários -> consultas -> estoque -> procedimentos -> pacientes -> profissionais).
-- =============================================================================
-- begin;
-- delete from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0006-%';
-- delete from public.record_entries    where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0008-%';
-- delete from public.medical_records   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0007-%';
-- delete from public.appointments      where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0005-%';
-- delete from public.stock_movements   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0009-%';
-- delete from public.stock_items       where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0004-%';
-- delete from public.procedures        where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0003-%';
-- delete from public.patients          where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0002-%';
-- delete from public.professionals     where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0002-0001-%';
-- commit;
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
-- =============================================================================
-- Seed demo video123 | complemento da Estética (clínica base: estetica) | arquivo 09-estetica-complemento.sql
-- =============================================================================
-- A demo já tem 59 pacientes, 635 consultas, 488 lançamentos financeiros e 3 profissionais de Estética
-- (NADA disso é alterado). Faltavam: prontuários/evoluções, consultas da semana atual e futuras.
--   - Prontuários (até 10) para pacientes existentes que ainda não têm prontuário: anamnese e exame
--     namespaced em "estetica" com as chaves reais de specialtyConfig.tsx, + faceograma/corpograma em alguns.
--   - 12 consultas concluídas na semana passada (terça a sexta) e a receita de cada uma, para a
--     semana/mês corrente não ficarem vazios no dashboard (os dados antigos terminam em 02/11).
--   - 8 consultas futuras (semanas 0 a 2) SOMENTE para pacientes SEM telefone: não há envio de
--     WhatsApp possível para elas, mesmo que alguém conecte o WhatsApp da demo.
-- Pacientes escolhidos por regra (ordem de id), não por nome; nenhum dado de paciente é lido para o arquivo.
-- IDs deterministicos: de3a0000-0009-<tabela>-0000-<seq> (0005 consulta, 0006 financeiro, 0007 prontuário, 0008 evolução).
-- Reexecutável (on conflict do nothing). Desfazer: bloco ROLLBACK no fim.
-- =============================================================================
begin;

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

-- 1. Prontuários (até 10): só para pacientes com telefone que ainda não têm prontuário; a escolha é por quantidade
-- de consultas concluídas (desc) e id. Se houver menos de 10 elegíveis, entram só os que existem.
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday),
elig as (
  select p.id as patient_id, row_number() over (order by coalesce(c.n, 0) desc, p.id) as rk
  from public.patients p
  left join (select patient_id, count(*) as n from public.appointments
              where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and status = 'concluido' group by patient_id) c on c.patient_id = p.id
  where p.clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and p.phone is not null
    and p.id::text not like 'de3a0000-%'
    and not exists (select 1 from public.medical_records r where r.patient_id = p.id)
  limit 10
)
insert into public.medical_records (id, clinic_id, patient_id, anamnesis, clinical_exam, aesthetic_protocols, body_protocols, created_at, updated_at)
select ('de3a0000-0009-0007-0000-' || lpad(e.rk::text, 12, '0'))::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, e.patient_id,
       v.anam, v.exam, v.face, v.body,
       ((m.monday - 35 + e.rk::int + time '10:00') at time zone 'America/Sao_Paulo'),
       ((m.monday - 9 + time '16:00') at time zone 'America/Sao_Paulo')
from m
join elig e on true
join (values
  (1, $j${"estetica":{"a-queixa":"Linhas de expressão na testa e entre as sobrancelhas","a-expectativa":"Aparência descansada, sem perder a expressão natural","a-trat_anteriores":"Toxina botulínica há 8 meses","a-cosmeticos":"Vitamina C pela manhã e protetor solar","a-isotretinoina":"Não","a-anticoagulantes":"Não","a-exposicao_solar":"Moderada; usa protetor FPS 50","a-alergia":"Nega alergias","a-queloides":"Não","a-gestante":"Não","a-doencas":"Nenhuma","a-cirurgia_plastica":"Nenhuma","a-atividade_fisica":"Musculação 3 vezes por semana","a-retencao_liquido":"Não"}}$j$::jsonb, $j${"estetica":{"e-tipo_pele":"Mista","e-fototipo":"III","e-hidratacao":"Bom","e-regiao":"Terço superior da face","e-manchas":"Ausentes","e-flacidez":"Leve","e-lesoes":"Sem lesões ativas","e-procedimento":"Toxina botulínica em glabela, frontal e região periorbital","e-contraindicacoes":"Nenhuma identificada","e-obs":"Reavaliar em 15 dias."}}$j$::jsonb, $j$[{"id":"de3a0000-0009-000a-0000-000000000150","date":"2026-10-15","notes":"Sessão registrada no mapa facial","annotations":[{"id":"de3a0000-0009-000a-0000-000000000101","x":130,"y":58,"type":"toxina","qty":"4 U","note":"Frontal esquerda"},{"id":"de3a0000-0009-000a-0000-000000000102","x":170,"y":58,"type":"toxina","qty":"4 U","note":"Frontal direita"},{"id":"de3a0000-0009-000a-0000-000000000103","x":150,"y":78,"type":"toxina","qty":"6 U","note":"Glabela"}]}]$j$::jsonb, $j$[]$j$::jsonb),
  (2, $j${"estetica":{"a-queixa":"Lábios finos e desejo de mais volume e contorno","a-expectativa":"Volume discreto e natural","a-trat_anteriores":"Nunca realizou preenchimento","a-cosmeticos":"Hidratante labial","a-isotretinoina":"Não","a-anticoagulantes":"Não","a-exposicao_solar":"Baixa","a-alergia":"Nega alergias","a-queloides":"Não","a-gestante":"Não","a-doencas":"Herpes labial recorrente (1 vez por ano)","a-cirurgia_plastica":"Nenhuma","a-atividade_fisica":"Caminhada","a-retencao_liquido":"Não"}}$j$::jsonb, $j${"estetica":{"e-tipo_pele":"Normal","e-fototipo":"II","e-hidratacao":"Bom","e-regiao":"Lábios e contorno labial","e-manchas":"Ausentes","e-flacidez":"Ausente","e-lesoes":"Sem lesões","e-procedimento":"Preenchimento labial com ácido hialurônico, 1 seringa","e-contraindicacoes":"Orientada profilaxia antiviral por histórico de herpes","e-obs":"Aplicar gelo no pós imediato."}}$j$::jsonb, $j$[{"id":"de3a0000-0009-000a-0000-000000000250","date":"2026-10-15","notes":"Sessão registrada no mapa facial","annotations":[{"id":"de3a0000-0009-000a-0000-000000000201","x":138,"y":168,"type":"preenchimento","qty":"0,5 ml","note":"Lábio superior"},{"id":"de3a0000-0009-000a-0000-000000000202","x":150,"y":178,"type":"preenchimento","qty":"0,5 ml","note":"Lábio inferior"}]}]$j$::jsonb, $j$[]$j$::jsonb),
  (3, $j${"estetica":{"a-queixa":"Acne ativa e poros dilatados","a-expectativa":"Reduzir lesões e oleosidade","a-trat_anteriores":"Limpezas de pele esporádicas","a-cosmeticos":"Sabonete de ácido salicílico","a-isotretinoina":"Não nos últimos 6 meses","a-anticoagulantes":"Não","a-exposicao_solar":"Alta, trabalha ao ar livre","a-alergia":"Nega alergias","a-queloides":"Não","a-gestante":"Não","a-doencas":"Acne grau II","a-cirurgia_plastica":"Nenhuma","a-atividade_fisica":"Futebol 2 vezes por semana","a-retencao_liquido":"Não"}}$j$::jsonb, $j${"estetica":{"e-tipo_pele":"Oleosa","e-fototipo":"IV","e-hidratacao":"Regular","e-regiao":"Face","e-manchas":"Hiperpigmentação pós-inflamatória leve","e-flacidez":"Ausente","e-lesoes":"Pápulas e comedões em região frontal e malar","e-procedimento":"Limpeza de pele profunda seguida de peeling químico superficial","e-contraindicacoes":"Evitar exposição solar sem proteção após peeling","e-obs":"Reforçar uso de protetor solar."}}$j$::jsonb, $j$[]$j$::jsonb, $j$[]$j$::jsonb),
  (4, $j${"estetica":{"a-queixa":"Manchas escuras nas bochechas e testa","a-expectativa":"Uniformizar o tom da pele","a-trat_anteriores":"Cremes clareadores sem acompanhamento","a-cosmeticos":"Ácido tranexâmico tópico","a-isotretinoina":"Não","a-anticoagulantes":"Não","a-exposicao_solar":"Moderada","a-alergia":"Alergia a perfumes fortes","a-queloides":"Não","a-gestante":"Não","a-doencas":"Melasma","a-cirurgia_plastica":"Nenhuma","a-atividade_fisica":"Corrida","a-retencao_liquido":"Não"}}$j$::jsonb, $j${"estetica":{"e-tipo_pele":"Mista","e-fototipo":"IV","e-hidratacao":"Bom","e-regiao":"Face","e-manchas":"Melasma malar e frontal, padrão misto","e-flacidez":"Ausente","e-lesoes":"Sem lesões","e-procedimento":"Peeling químico seriado e fotoproteção rigorosa","e-contraindicacoes":"Evitar procedimentos com calor","e-obs":"Controle a cada 4 semanas."}}$j$::jsonb, $j$[]$j$::jsonb, $j$[]$j$::jsonb),
  (5, $j${"estetica":{"a-queixa":"Gordura localizada no abdômen e culotes","a-expectativa":"Reduzir medidas sem cirurgia","a-trat_anteriores":"Massagens modeladoras","a-cosmeticos":"Creme redutor","a-isotretinoina":"Não","a-anticoagulantes":"Não","a-exposicao_solar":"Moderada","a-alergia":"Nega alergias","a-queloides":"Não","a-gestante":"Não","a-doencas":"Nenhuma","a-cirurgia_plastica":"Nenhuma","a-atividade_fisica":"Pilates 2 vezes por semana","a-retencao_liquido":"Leve, no fim do dia"}}$j$::jsonb, $j${"estetica":{"e-tipo_pele":"Normal","e-fototipo":"III","e-regiao":"Abdômen e flancos","e-flacidez":"Leve em abdômen","e-medidas_corporais":"Cintura 82 cm, abdômen 94 cm, quadril 102 cm","e-grau_celulite":"Grau 2","e-gordura_localizada":"Abdômen inferior e flancos","e-procedimento":"Criolipólise em abdômen e flancos, 2 sessões com intervalo de 45 dias","e-contraindicacoes":"Sem contraindicações (sem hérnias ou crioglobulinemia)","e-obs":"Associar drenagem linfática e atividade física."}}$j$::jsonb, $j$[]$j$::jsonb, $j$[{"id":"de3a0000-0009-000a-0000-000000000560","date":"2026-10-08","notes":"Sessão registrada no mapa corporal","annotations":[{"id":"de3a0000-0009-000a-0000-000000000501","x":105,"y":150,"view":"frente","type":"criolipolise","qty":"1 sessão","note":"Abdômen inferior"},{"id":"de3a0000-0009-000a-0000-000000000502","x":80,"y":160,"view":"frente","type":"criolipolise","qty":"1 sessão","note":"Flanco direito"}]}]$j$::jsonb),
  (6, $j${"estetica":{"a-queixa":"Pele com flacidez e linhas finas ao redor dos olhos","a-expectativa":"Firmar a pele e melhorar a textura","a-trat_anteriores":"Radiofrequência facial","a-cosmeticos":"Retinol à noite","a-isotretinoina":"Não","a-anticoagulantes":"Não","a-exposicao_solar":"Baixa","a-alergia":"Nega alergias","a-queloides":"Não","a-gestante":"Não","a-doencas":"Nenhuma","a-cirurgia_plastica":"Nenhuma","a-atividade_fisica":"Caminhada","a-retencao_liquido":"Não"}}$j$::jsonb, $j${"estetica":{"e-tipo_pele":"Seca","e-fototipo":"III","e-hidratacao":"Reduzido","e-regiao":"Face e pescoço","e-manchas":"Poucas","e-flacidez":"Moderada em terço médio","e-lesoes":"Sem lesões","e-procedimento":"Microagulhamento com ativos de reparo, 3 sessões","e-contraindicacoes":"Suspender retinol 5 dias antes","e-obs":"Intervalo de 30 dias entre sessões."}}$j$::jsonb, $j$[]$j$::jsonb, $j$[]$j$::jsonb),
  (7, $j${"estetica":{"a-queixa":"Inchaço em pernas e sensação de peso no fim do dia","a-expectativa":"Reduzir o inchaço e melhorar o bem-estar","a-trat_anteriores":"Nenhum","a-cosmeticos":"Gel para pernas cansadas","a-isotretinoina":"Não","a-anticoagulantes":"Não","a-exposicao_solar":"Baixa","a-alergia":"Nega alergias","a-queloides":"Não","a-gestante":"Não","a-doencas":"Insuficiência venosa leve","a-cirurgia_plastica":"Nenhuma","a-atividade_fisica":"Sedentário","a-retencao_liquido":"Sim, em pernas e tornozelos"}}$j$::jsonb, $j${"estetica":{"e-tipo_pele":"Normal","e-fototipo":"III","e-regiao":"Membros inferiores","e-flacidez":"Ausente","e-medidas_corporais":"Coxa 58 cm, panturrilha 38 cm","e-grau_celulite":"Grau 1","e-gordura_localizada":"Ausente","e-procedimento":"Drenagem linfática manual, 10 sessões","e-contraindicacoes":"Descartar trombose antes do início","e-obs":"Orientada elevação das pernas e hidratação."}}$j$::jsonb, $j$[]$j$::jsonb, $j$[{"id":"de3a0000-0009-000a-0000-000000000760","date":"2026-10-08","notes":"Sessão registrada no mapa corporal","annotations":[{"id":"de3a0000-0009-000a-0000-000000000701","x":90,"y":215,"view":"frente","type":"drenagem","qty":"10 sessões","note":"Coxa direita"},{"id":"de3a0000-0009-000a-0000-000000000702","x":120,"y":215,"view":"frente","type":"drenagem","qty":"10 sessões","note":"Coxa esquerda"}]}]$j$::jsonb),
  (8, $j${"estetica":{"a-queixa":"Cicatrizes de acne em bochechas","a-expectativa":"Suavizar as marcas","a-trat_anteriores":"Microagulhamento há 1 ano","a-cosmeticos":"Protetor solar e ácido azelaico","a-isotretinoina":"Usou há 2 anos","a-anticoagulantes":"Não","a-exposicao_solar":"Moderada","a-alergia":"Nega alergias","a-queloides":"Não","a-gestante":"Não","a-doencas":"Acne controlada","a-cirurgia_plastica":"Nenhuma","a-atividade_fisica":"Ciclismo","a-retencao_liquido":"Não"}}$j$::jsonb, $j${"estetica":{"e-tipo_pele":"Mista","e-fototipo":"III","e-hidratacao":"Bom","e-regiao":"Bochechas","e-manchas":"Eritema pós-inflamatório residual","e-flacidez":"Leve","e-lesoes":"Cicatrizes atróficas em caixa e rolling","e-procedimento":"Laser CO2 fracionado, 3 sessões a cada 6 semanas","e-contraindicacoes":"Evitar sol intenso por 30 dias após cada sessão","e-obs":"Fotos padronizadas antes da primeira sessão."}}$j$::jsonb, $j$[]$j$::jsonb, $j$[]$j$::jsonb),
  (9, $j${"estetica":{"a-queixa":"Rejuvenescimento geral da face","a-expectativa":"Resultado natural e sutil","a-trat_anteriores":"Toxina e bioestimulador há 1 ano","a-cosmeticos":"Rotina completa de skincare","a-isotretinoina":"Não","a-anticoagulantes":"Não","a-exposicao_solar":"Moderada","a-alergia":"Nega alergias","a-queloides":"Não","a-gestante":"Não","a-doencas":"Nenhuma","a-cirurgia_plastica":"Blefaroplastia há 3 anos","a-atividade_fisica":"Yoga","a-retencao_liquido":"Não"}}$j$::jsonb, $j${"estetica":{"e-tipo_pele":"Normal","e-fototipo":"III","e-hidratacao":"Bom","e-regiao":"Face completa","e-manchas":"Lentigos solares leves","e-flacidez":"Moderada em terço médio e inferior","e-lesoes":"Sem lesões","e-procedimento":"Toxina em terço superior e bioestimulador em terço médio","e-contraindicacoes":"Nenhuma identificada","e-obs":"Plano de manutenção a cada 4 a 6 meses."}}$j$::jsonb, $j$[{"id":"de3a0000-0009-000a-0000-000000000950","date":"2026-10-15","notes":"Sessão registrada no mapa facial","annotations":[{"id":"de3a0000-0009-000a-0000-000000000901","x":108,"y":118,"type":"bioestimulador","qty":"1 ml","note":"Malar direita"},{"id":"de3a0000-0009-000a-0000-000000000902","x":192,"y":118,"type":"bioestimulador","qty":"1 ml","note":"Malar esquerda"}]}]$j$::jsonb, $j$[]$j$::jsonb),
  (10, $j${"estetica":{"a-queixa":"Manutenção de toxina botulínica","a-expectativa":"Manter o resultado dos últimos meses","a-trat_anteriores":"Toxina a cada 5 meses","a-cosmeticos":"Protetor solar e hidratante","a-isotretinoina":"Não","a-anticoagulantes":"Não","a-exposicao_solar":"Moderada","a-alergia":"Nega alergias","a-queloides":"Não","a-gestante":"Não","a-doencas":"Nenhuma","a-cirurgia_plastica":"Nenhuma","a-atividade_fisica":"Corrida","a-retencao_liquido":"Não"}}$j$::jsonb, $j${"estetica":{"e-tipo_pele":"Normal","e-fototipo":"III","e-hidratacao":"Bom","e-regiao":"Terço superior da face","e-manchas":"Ausentes","e-flacidez":"Ausente","e-lesoes":"Sem lesões","e-procedimento":"Toxina botulínica, 40 U em terço superior","e-contraindicacoes":"Nenhuma","e-obs":"Retorno de manutenção em 5 meses."}}$j$::jsonb, $j$[{"id":"de3a0000-0009-000a-0000-000000001050","date":"2026-10-15","notes":"Sessão registrada no mapa facial","annotations":[{"id":"de3a0000-0009-000a-0000-000000001001","x":130,"y":58,"type":"toxina","qty":"4 U","note":"Frontal esquerda"},{"id":"de3a0000-0009-000a-0000-000000001002","x":170,"y":58,"type":"toxina","qty":"4 U","note":"Frontal direita"},{"id":"de3a0000-0009-000a-0000-000000001003","x":150,"y":78,"type":"toxina","qty":"6 U","note":"Glabela"}]}]$j$::jsonb, $j$[]$j$::jsonb)
) as v(rk, anam, exam, face, body) on v.rk = e.rk
on conflict (id) do nothing;

-- 2. Evoluções (20): 2 por prontuário; autor = profissional de estética (rodízio por ordem de cadastro)
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday),
profs as (
  select id, name, row_number() over (order by created_at, id) as rn
  from public.professionals
  where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and specialty_type = 'estetica' and id::text not like 'de3a0000-%'
)
insert into public.record_entries (id, clinic_id, patient_id, record_id, author_name, professional_id, entry_text, entry_type, created_at)
select ('de3a0000-0009-0008-0000-' || lpad(v.n::text, 12, '0'))::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, r.patient_id, r.id, pr.name, pr.id, v.txt, 'evolucao',
       ((m.monday + v.d::int + v.t::time) at time zone 'America/Sao_Paulo')
from m
cross join (values
  (1, 1, 1, 'Aplicação de toxina botulínica em glabela e frontal conforme mapa do faceograma. Sem intercorrências.', -29, '10:00'),
  (2, 1, 1, 'Retorno de 15 dias: resultado simétrico, sem necessidade de retoque.', -9, '15:30'),
  (3, 2, 2, 'Preenchimento labial com 1 ml de ácido hialurônico, técnica de cânula. Edema esperado orientado.', -28, '10:00'),
  (4, 2, 2, 'Retorno de 20 dias: bom resultado e boa acomodação do produto. Sem queixas.', -8, '15:30'),
  (5, 3, 3, 'Limpeza de pele profunda com extração e máscara calmante. Orientados cuidados domiciliares e protetor solar.', -27, '10:00'),
  (6, 3, 3, 'Peeling químico superficial aplicado sem intercorrências; pele com descamação leve esperada.', -7, '15:30'),
  (7, 4, 1, 'Primeiro peeling químico para melasma. Orientada proteção solar reforçada e uso de ácido tranexâmico tópico.', -26, '10:00'),
  (8, 4, 1, 'Segundo peeling: clareamento perceptível em região malar. Mantido protocolo mensal.', -6, '15:30'),
  (9, 5, 2, 'Primeira sessão de criolipólise em abdômen inferior com aplicador adequado. Eritema local esperado.', -25, '10:00'),
  (10, 5, 2, 'Retorno de 30 dias: redução de 2 cm em abdômen. Programada segunda sessão.', -5, '15:30'),
  (11, 6, 3, 'Primeira sessão de microagulhamento com ativos de reparo. Eritema esperado por 24 horas.', -24, '10:00'),
  (12, 6, 3, 'Segunda sessão: pele com mais viço e textura melhor. Mantido intervalo mensal.', -4, '15:30'),
  (13, 7, 1, 'Primeira sessão de drenagem linfática manual em membros inferiores; boa tolerância.', -23, '10:00'),
  (14, 7, 1, 'Quinta sessão: redução do edema ao fim do dia e melhora da sensação de peso.', -3, '15:30'),
  (15, 8, 2, 'Primeira sessão de laser CO2 fracionado em bochechas com anestésico tópico. Cuidados pós orientados.', -22, '10:00'),
  (16, 8, 2, 'Segunda sessão: cicatrizes mais rasas, boa cicatrização. Mantido intervalo de 6 semanas.', -2, '15:30'),
  (17, 9, 3, 'Aplicação de bioestimulador de colágeno em terço médio e toxina no terço superior conforme planejamento.', -21, '10:00'),
  (18, 9, 3, 'Retorno de 30 dias: resultado natural e sem intercorrências. Programado reforço em 3 meses.', -1, '15:30'),
  (19, 10, 1, 'Reaplicação de toxina botulínica em terço superior com a mesma dose da última sessão.', -20, '10:00'),
  (20, 10, 1, 'Retorno de 15 dias: resultado satisfatório e simétrico.', 0, '15:30')
) as v(n, rk, rn, txt, d, t)
join public.medical_records r on r.id = ('de3a0000-0009-0007-0000-' || lpad(v.rk::text, 12, '0'))::uuid and r.clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207'
join profs pr on pr.rn = v.rn
on conflict (id) do nothing;

-- 3. Consultas: 12 concluídas na semana -1 (terça a sexta; pacientes com telefone, passado, sem risco de envio)
--    e 8 futuras nas semanas 0 a 2 (pacientes SEM telefone). Procedimentos existentes da demo, achados pelo nome.
with m as (select date_trunc('week', now() at time zone 'America/Sao_Paulo')::date as monday),
com_tel as (
  select id, row_number() over (order by id) as rk from public.patients
  where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and phone is not null and id::text not like 'de3a0000-%'
),
sem_tel as (
  select id, row_number() over (order by id) as rk from public.patients
  where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and phone is null and id::text not like 'de3a0000-%'
),
profs as (
  select id, row_number() over (order by created_at, id) as rn
  from public.professionals
  where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and specialty_type = 'estetica' and id::text not like 'de3a0000-%'
)
insert into public.appointments (id, clinic_id, patient_id, professional_id, procedure_id, procedure_name, procedure_price,
  status, scheduled_at, duration_minutes, notes, created_at)
select ('de3a0000-0009-0005-0000-' || lpad(v.n::text, 12, '0'))::uuid, '3916d37d-b247-485e-bd2f-b47be8d44207'::uuid, pat.id, pr.id, pc.id, pc.name, pc.price,
       case v.st
         when 'auto_c' then case when x.ts < now() then 'concluido' else 'confirmado' end
         when 'auto_a' then case when x.ts < now() then 'concluido' else 'agendado' end
         else v.st end,
       x.ts, 60, null,
       least(x.ts - interval '6 days', now() - interval '1 day')
from m
cross join (values
  (1, 'p', 1, 1, 'Botox', 'concluido', -1, 1, '09:00'),
  (2, 'p', 2, 1, 'Preenchimento labial', 'concluido', -1, 1, '10:30'),
  (3, 'p', 3, 2, 'Limpeza de pele profunda', 'concluido', -1, 1, '09:00'),
  (4, 'p', 4, 2, 'Peeling químico', 'concluido', -1, 1, '10:30'),
  (5, 'p', 5, 3, 'Criolipólise', 'concluido', -1, 2, '14:00'),
  (6, 'p', 6, 2, 'Microagulhamento', 'concluido', -1, 2, '09:30'),
  (7, 'p', 7, 3, 'Drenagem linfática', 'concluido', -1, 3, '15:00'),
  (8, 'p', 8, 1, 'Laser CO2 fracionado', 'concluido', -1, 3, '09:00'),
  (9, 'p', 9, 2, 'Limpeza de pele profunda', 'concluido', -1, 4, '11:00'),
  (10, 'p', 10, 1, 'Botox', 'concluido', -1, 4, '14:30'),
  (11, 'p', 11, 3, 'Drenagem linfática', 'concluido', -1, 4, '16:00'),
  (12, 'p', 12, 2, 'Peeling químico', 'concluido', -1, 3, '10:30'),
  (101, 'f', 1, 1, 'Botox', 'auto_c', 0, 3, '15:00'),
  (102, 'f', 2, 2, 'Limpeza de pele profunda', 'auto_a', 0, 4, '10:00'),
  (103, 'f', 3, 3, 'Drenagem linfática', 'agendado', 1, 0, '09:00'),
  (104, 'f', 4, 1, 'Preenchimento labial', 'confirmado', 1, 1, '14:00'),
  (105, 'f', 5, 2, 'Peeling químico', 'agendado', 1, 2, '10:30'),
  (106, 'f', 6, 3, 'Criolipólise', 'confirmado', 2, 0, '15:30'),
  (107, 'f', 7, 2, 'Microagulhamento', 'agendado', 2, 2, '09:00'),
  (108, 'f', 8, 1, 'Laser CO2 fracionado', 'confirmado', 2, 3, '11:00')
) as v(n, kind, rk, rn, proc, st, wk, d, t)
join lateral (select case when v.kind = 'p' then (select id from com_tel where rk = v.rk) else (select id from sem_tel where rk = v.rk) end as id) pat on pat.id is not null
join profs pr on pr.rn = v.rn
join public.procedures pc on pc.clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and pc.name = v.proc and pc.id::text not like 'de3a0000-%'
cross join lateral (select ((m.monday + v.wk * 7 + v.d + v.t::time) at time zone 'America/Sao_Paulo') as ts) x
on conflict (id) do nothing;

-- 4. Receitas das consultas concluídas acima (valor = preço do procedimento; forma de pagamento fixa por hash do id)
insert into public.financial_records (id, clinic_id, patient_id, appointment_id, procedure_id, professional_id, total_amount, discount_percent,
  payment_method, type, category, installments, created_at)
select ('de3a0000-0009-0006-0000-' || right(a.id::text, 12))::uuid, a.clinic_id, a.patient_id, a.id, a.procedure_id, a.professional_id,
       a.procedure_price, 0,
       (array['pix', 'cartao_credito', 'cartao_debito', 'dinheiro'])[1 + (abs(hashtext(a.id::text)) % 4)],
       'receita', 'Procedimento Estético', '[]'::jsonb, a.scheduled_at + (a.duration_minutes || ' minutes')::interval
from public.appointments a
where a.clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and a.id::text like 'de3a0000-0009-0005-%' and a.status = 'concluido' and a.procedure_price > 0
on conflict (id) do nothing;

-- Verificação (contagens esperadas: 10 / 20 / 20 / 12, desde que existam 10 pacientes elegíveis; hoje existem)
select 'medical_records' as tabela, count(*) as linhas from public.medical_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0009-0007-%'
union all
select 'record_entries' as tabela, count(*) as linhas from public.record_entries where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0009-0008-%'
union all
select 'appointments' as tabela, count(*) as linhas from public.appointments where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0009-0005-%'
union all
select 'financial_records' as tabela, count(*) as linhas from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0009-0006-%'
order by 1;

commit;

-- =============================================================================
-- OPCIONAL A (descomente para usar): padronizar as categorias de estoque da estética para os slugs do app.
-- Hoje os 6 itens têm "Injetáveis", "Descartáveis" e "Skincare", que o filtro da tela de Estoque não reconhece
-- (o app grava e filtra por injetavel / descartavel / cosmetico). Altera 6 linhas existentes; o desfazer está abaixo.
-- =============================================================================
-- begin;
-- update public.stock_items
--    set category = case category when 'Injetáveis' then 'injetavel' when 'Descartáveis' then 'descartavel' when 'Skincare' then 'cosmetico' end
--  where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and category in ('Injetáveis', 'Descartáveis', 'Skincare');
-- commit;
-- desfazer A (as categorias originais dos 6 itens, por nome):
-- begin;
-- update public.stock_items set category = 'Injetáveis'   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and category = 'injetavel'   and name in ('Toxina botulínica (ampola)', 'Ácido hialurônico (seringa 1ml)', 'Agulhas microagulhamento (kit)');
-- update public.stock_items set category = 'Descartáveis' where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and category = 'descartavel' and name in ('Luvas descartáveis (caixa)', 'Álcool 70% (frasco 1L)');
-- update public.stock_items set category = 'Skincare'     where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and category = 'cosmetico'    and name = 'Máscara facial hidratante';
-- commit;

-- =============================================================================
-- ROLLBACK deste arquivo (descomente tudo, de "begin" a "commit", e rode inteiro).
-- Apaga só o que ele criou: clinic_id da demo + ids com o prefixo de3a0000-0009-.
-- =============================================================================
-- begin;
-- delete from public.financial_records where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0009-0006-%';
-- delete from public.record_entries    where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0009-0008-%';
-- delete from public.medical_records   where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0009-0007-%';
-- delete from public.appointments      where clinic_id = '3916d37d-b247-485e-bd2f-b47be8d44207' and id::text like 'de3a0000-0009-0005-%';
-- commit;
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
