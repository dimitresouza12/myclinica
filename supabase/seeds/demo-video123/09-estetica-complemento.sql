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
