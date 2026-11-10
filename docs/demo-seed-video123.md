# Seed da conta de demonstração video123

Clínica demo: `video123`, `clinic_id` `3916d37d-b247-485e-bd2f-b47be8d44207`, projeto Supabase `siohvtgbomvcprbzfamr`.
Hoje é uma clínica de estética (59 pacientes, 635 consultas, 3 profissionais sem login). Os arquivos abaixo
mantêm tudo isso intacto e acrescentam as outras 8 áreas (vet, odonto, fisio, psico, nutri, fono, to, medico),
ligam o plano `completo_plus` e criam o flag `clinics.demo_mode`.

Estado: os arquivos foram PREPARADOS e validados numa réplica local descartável. Nada foi executado em produção.

## Arquivos e ordem de execução

Rodar nesta ordem, cada um no SQL Editor do Supabase (ou `apply_migration` para o primeiro). Cada seed é uma transação
própria (`begin`/`commit`) e pode ser rodado de novo sem duplicar (ids determinísticos + `on conflict do nothing`).

| Ordem | Arquivo | O que faz |
|---|---|---|
| 1 | `supabase/migrations/20261109_clinics_demo_mode.sql` | Coluna `clinics.demo_mode boolean not null default false` + gatilho `trg_clinics_guard_demo_mode` |
| 2 a 9 | `supabase/seeds/demo-video123/01-vet.sql` até `08-medico.sql` | Uma área por arquivo (ordem: vet, odonto, fisio, psico, nutri, fono, to, medico) |
| 10 | `supabase/seeds/demo-video123/09-estetica-complemento.sql` | Prontuários, evoluções, semana atual e futuro da estética |
| 11 (último) | `supabase/seeds/demo-video123/00-config-final.sql` | Liga `demo_mode`, plano `completo_plus` e as 9 áreas |

Por que o 00 fica por último: os seeds por área só precisam da clínica existir. Ligar as 9 áreas por último evita que
a demo apareça meio montada para quem estiver logado durante a carga.

Cada seed abre com uma trava (bloco `do $$`): aborta se a clínica `video123` não existir ou se o WhatsApp dela estiver
`conectado` ou com `confirm_enabled` ligado. O 00 também aborta se a coluna `demo_mode` ainda não existir.

## O que cada arquivo cria

Convenção de ids: `de3a0000-<area>-<tabela>-0000-<seq>`. Códigos de área: 0001 vet, 0002 odonto, 0003 fisio, 0004 psico,
0005 nutri, 0006 fono, 0007 to, 0008 medico, 0009 estética. Códigos de tabela: 0001 professionals, 0002 patients,
0003 procedures, 0004 stock_items, 0005 appointments, 0006 financial_records, 0007 medical_records, 0008 record_entries,
0009 stock_movements. É esse prefixo que o rollback usa.

### Contagens por área (linhas novas)

| Área | Profissionais | Pacientes | Procedimentos | Estoque | Mov. estoque | Consultas (passado + futuro) | Receitas | Despesas | Prontuários | Evoluções |
|---|---|---|---|---|---|---|---|---|---|---|
| vet (01) | 2 | 8 | 8 | 6 | 12 | 27 (20 + 7) | 13 | 3 | 8 | 12 |
| odonto (02) | 2 | 8 | 16 | 6 | 12 | 31 (23 + 8) | 19 | 3 | 8 | 16 |
| fisio (03) | 2 | 8 | 7 | 6 | 12 | 61 (37 + 24) | 34 | 3 | 8 | 16 |
| psico (04) | 2 | 8 | 4 | 6 | 12 | 57 (33 + 24) | 27 | 3 | 8 | 15 |
| nutri (05) | 2 | 8 | 5 | 6 | 12 | 32 (25 + 7) | 20 | 3 | 8 | 15 |
| fono (06) | 2 | 8 | 7 | 6 | 12 | 55 (35 + 20) | 33 | 3 | 8 | 15 |
| to (07) | 2 | 8 | 4 | 6 | 12 | 57 (35 + 22) | 31 | 3 | 8 | 16 |
| medico (08) | 4 | 10 | 14 | 7 | 14 | 37 (28 + 9) | 25 | 3 | 10 | 20 |
| estética (09) | 0 | 0 | 0 | 0 | 0 | 20 (12 + 8) | 12 | 0 | 10 | 20 |
| Total novo | 18 | 66 | 65 | 49 | 98 | 377 | 214 | 24 | 76 | 145 |

Contagens batem com a execução local nos arquivos 01 a 09. Receitas e despesas somam 238 linhas em `financial_records`
(214 receitas + 24 despesas). Depois da carga a demo fica com 21 profissionais (limite `max_users` 50), 125 pacientes
(limite `max_patients` 200), 1.012 consultas.

Pontos de cada arquivo de área:

- Profissionais: sem login (`clinic_user_id` nulo), com registro profissional fictício do conselho da área. O frontend
  em modo demo escolhe o primeiro profissional da área por `created_at`. A medicina tem 4 (clínico geral, cardiologia,
  pediatria, ginecologia) para exercitar as subáreas; o 08 usa as chaves extras de `medicoSpecialties.ts`.
- Pacientes: nomes e e-mails fictícios (`@example.com`), CPF e RG nulos, telefones `(85) 90000-XXXX`, LGPD consentido.
  A veterinária usa os campos `pet_*`; a odonto preenche convênio e carteirinha em alguns.
- Procedimentos: nomes e categorias de `procedureSuggestions` (specialtyConfig.tsx), com preço e duração coerentes.
- Estoque e movimentações: categorias nos slugs do app (`stockCategories`); a quantidade já considera as saídas.
- Consultas: passado (concluído, faltou, cancelado), semana atual e semanas +1 e +2. Datas relativas à segunda-feira da
  semana de execução (America/Sao_Paulo), então a demo continua "viva" ao ser carregada em qualquer dia. Nunca há
  consulta concluída no futuro nem sobreposição de horário por profissional.
- Receitas: uma por consulta concluída, no valor do procedimento, forma de pagamento variada. Despesas: 3 por área
  (aluguel e folha já existem na clínica e não são repetidos).
- Prontuários: anamnese e exame clínico namespaced por área (`{"<area>": {...}}`) com as chaves reais de
  `anamnesisFields` e `clinicalExamFields`. Odonto traz odontograma por FDI com histórico, plano de tratamento e itens.
- Evoluções: texto clínico curto, `author_name` do profissional que atendeu.

### Estética (09-estetica-complemento.sql)

Não altera nada do que já existe. Escolhe pacientes por regra (ordem de id), sem ler nem copiar dado de paciente:

1. Até 10 prontuários para pacientes COM telefone que ainda não têm prontuário (hoje há 42 elegíveis), anamnese e exame
   namespaced em `estetica`, mais faceograma/corpograma em alguns.
2. 20 evoluções (2 por prontuário), autoria dos 3 profissionais de estética em rodízio.
3. 12 consultas concluídas na semana passada (terça a sexta) para pacientes com telefone, com a receita de cada uma.
   Servem para a semana e o mês corrente não ficarem vazios no dashboard (os dados antigos terminam em 02/11).
4. 8 consultas futuras (semanas 0 a 2), SOMENTE para pacientes SEM telefone (hoje há 15): nenhum envio de WhatsApp
   é possível para elas.

Opcional A (comentado no fim do arquivo): normalizar as categorias dos 6 itens de estoque da estética (`Injetáveis`,
`Descartáveis`, `Skincare`) para os slugs que o filtro da tela de Estoque reconhece (`injetavel`, `descartavel`,
`cosmetico`). Não é aplicado por padrão porque altera linhas existentes; o desfazer está junto.

### Configuração final (00-config-final.sql)

Um único UPDATE em `public.clinics` (id da demo + slug `video123`): `demo_mode = true`, `plan = 'completo_plus'`,
`specialties` com as 9 áreas, `is_multi_specialty = true`. `clinic_type` continua `estetica`. Estado atual lido em
produção: plan `completo`, specialties `{estetica}`, `trial_ends_at` nulo, `billing_paid` true, `max_users` 50.

`computeClinicStatus` (src/lib/clinicStatus.ts) continua devolvendo `active` (sem atraso, sem `trial_ends_at`).
As colunas legadas `clinics.status = 'trial'` e `is_active = false` não são usadas pelo app para bloquear; há um
bloco opcional comentado para deixá-las coerentes (`active` / `true`).

## Como desfazer

Cada arquivo tem um bloco `ROLLBACK` comentado no fim. Descomente de `begin;` a `commit;` e rode inteiro.
Apaga só linhas da clínica demo cujo id começa com o prefixo do arquivo, na ordem das FKs. Ordem recomendada:

1. `00-config-final.sql` (volta plan `completo`, só estética, `demo_mode` false)
2. `09-estetica-complemento.sql`
3. `08` até `01`, em qualquer ordem entre áreas (são independentes)
4. Migração (só se o código já não usar `demo_mode`): `drop trigger`, `drop function`, `drop column`, no fim do arquivo.

Validado localmente: depois de rodar os 9 arquivos e todos os rollbacks, o banco voltou exatamente ao estado base
(59 pacientes, 3 profissionais, 0 consultas, 0 financeiro, 0 prontuários).

## Como foi validado sem tocar em produção

- Em produção só `SELECT` (information_schema, pg_constraint, pg_trigger, contagens), pelo MCP do projeto. Nenhum
  INSERT, UPDATE, DELETE, DDL ou `apply_migration`. Nada em `auth.*`.
- Réplica local descartável de Postgres (porta 54329, fora do repo) com o schema das tabelas usadas e os gatilhos de
  limite de profissionais e de comissão. Rodado:
  - os 9 arquivos de seed, duas vezes seguidas: contagens idênticas (idempotente);
  - zero consultas concluídas no futuro, zero sobreposição de horário por profissional, zero linhas fora da clínica demo;
  - consultas futuras só em pacientes com telefone na faixa `90000-XXXX` (áreas) ou sem telefone (estética);
  - a migração duas vezes (idempotente) e o gatilho: admin comum não liga nem desliga `demo_mode` (erro 42501),
    admin comum altera outra coluna normalmente, superadmin consegue, `auth.uid()` nulo (SQL editor) consegue;
  - `00-config-final.sql` e todos os rollbacks.
- A réplica NÃO valida RLS real nem o frontend: a conferência visual das 9 áreas depende de rodar na demo e abrir o app.

## Análise de segurança do WhatsApp

Os seeds inserem consultas futuras com status `agendado` e `confirmado`. Verificado no código e no banco:

- `clinic_whatsapp` da demo, lido por `SELECT`: status `desconectado`, `confirm_enabled` false.
- `src/lib/whatsapp/run.ts` (`runConfirmations`): só processa clínicas com `confirm_enabled = true` E status `conectado`.
  Com a demo desconectada, o cron e as rotas `/api/whatsapp/run-confirmations` e `/api/whatsapp/send-now` não enviam.
- Cada seed de área tem a trava no início que aborta se o WhatsApp da demo estiver conectado ou com confirmação ativa.
- Telefones dos 66 pacientes novos usam `(85) 90000-XXXX` (faixa não atribuída); as consultas futuras da estética são
  só de pacientes sem telefone. Mesmo que alguém conecte o WhatsApp da demo depois, nenhuma consulta futura aponta para
  um número real.

Risco que os seeds NÃO eliminam (precisa de ajuste de código, para o `mc-backend`):

1. `src/app/(app)/campanhas/page.tsx` dispara o webhook n8n `campanha-whatsapp` por conta própria, sem depender de
   `clinic_whatsapp.status`. Com a demo mostrando as 44 pacientes antigos de estética com telefone em formato válido,
   uma campanha disparada na demo poderia sair para números reais, se o n8n estiver ativo.
2. Recomendação: com `demo_mode = true`, bloquear no servidor `runConfirmations`, `/api/whatsapp/send-now`,
   `/api/whatsapp/test`, `/api/whatsapp/conversations/send` e `send-media`, e o disparo de campanhas (desabilitar o botão
   e responder 403 na rota). O flag é lido de `clinics.demo_mode`, gravado só por superadmin graças ao gatilho.
3. `crm/automate` não envia mensagem (confirmado), sem ação.

## Riscos e observações

- A política de UPDATE de `clinics` deixa qualquer admin de clínica alterar qualquer coluna (plano, `billing_paid`).
  O gatilho da migração cobre só `demo_mode`; plano e cobrança seguem abertos como já estavam. Fora do escopo.
- 142 consultas antigas da estética estão presas em `agendado` ou `confirmado` no passado. Não são alteradas aqui
  (podem aparecer como pendentes na agenda e no dashboard). Decisão do Dimitre: limpar com um UPDATE separado ou deixar.
- Existem 44 pacientes antigos de estética com telefone em formato válido: base do risco de campanha acima.
- A medicina tem 4 profissionais (outras áreas, 2). Se o frontend em modo demo escolher sempre o primeiro por
  `created_at`, a subárea inicial da medicina é a do primeiro cadastrado (clínico geral); as outras três ficam visíveis pela agenda.
- `clinics.status` legado `trial` e `is_active` false ficam como estão (opcional comentado no 00).
- Antes de rodar em produção: confirmar que `max_patients` (200) e `max_users` (50) seguem suficientes (125 e 21 após a carga).

## O que o `mc-backend` precisa ajustar no código (esta tarefa não editou código)

1. Tipo `Clinic` e mapeamento de `clinics` (`demoMode` a partir de `demo_mode`) em `src/types/index.ts` e no carregamento da clínica.
2. Modo demo no frontend: seletor de área na sessão, usando `clinic.demoMode` e `clinic.specialties`; o profissional
   ativo é o primeiro da área por `created_at` (só nesse modo).
3. Bloqueio de envio com `demoMode` (item 2 da análise de WhatsApp acima).
4. Opcional: no Estoque, o filtro por categoria deve aceitar também os rótulos antigos da estética, caso o opcional A não seja aplicado.
