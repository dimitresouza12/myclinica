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
