# Plano — Acesso por profissional em clínicas multiprofissionais

**Data:** 2026-08-12
**Status:** proposto, aguardando aprovação para iniciar Bloco A

## Contexto

Hoje, dentro de uma clínica, todo usuário logado — seja recepção, admin ou um profissional clínico — vê os mesmos dados: a agenda inteira, a lista de pacientes inteira, o financeiro inteiro. Isso foi confirmado direto no código (`useAgendaData`/`usePacientesData`/`useFinanceiroData` em [useClinicData.ts](src/hooks/useClinicData.ts) filtram só por `clinic_id`) e no banco (toda RLS relevante hoje é `clinic_id = get_my_clinic_id()`, sem nenhuma camada por usuário).

Isso funciona bem numa clínica de um profissional só. Mas numa clínica com vários profissionais — o cenário que estamos querendo atender agora — cada um vendo os agendamentos, pacientes e o caixa de todo mundo é falta de profissionalismo e um problema real de privacidade (ex: um profissional vendo o faturamento pessoal do colega, ou a agenda de pacientes que nunca atendeu).

O pedido: **cada profissional só acessa o que é dele** — com uma exceção que veio da conversa e é importante registrar, porque muda o desenho: dentro da mesma especialidade, os profissionais **compartilham a ficha do paciente**. Ou seja, numa clínica com 3 dentistas, os 3 conseguem ver a ficha de um paciente que fez tratamento com qualquer um deles — faz sentido clinicamente, já que são a mesma área tratando o mesmo caso. Já agenda e financeiro continuam estritamente individuais, mesmo entre profissionais da mesma área — a agenda e o caixa são pessoais, a ficha clínica é de time.

Também foi definido explicitamente: **isso não pode mudar nada nas 18 clínicas que já estão em produção hoje.** A restrição vale só para clínicas novas, criadas depois que isso for ao ar. Isso simplifica bastante o rollout — sem precisar reconstruir vínculos históricos de paciente↔profissional em produção, e sem risco de quebrar o dia a dia de quem já usa o sistema.

## Desenho

### Dois eixos de restrição diferentes

| Módulo | Nível de isolamento | Chave |
|---|---|---|
| **Agenda** | Individual — só o profissional dono do agendamento | `appointments.professional_id` (já existe) |
| **Financeiro** | Individual — só o profissional dono do lançamento | `financial_records.professional_id` (**novo campo**) |
| **Pacientes / Ficha** | Por área/especialidade — todo profissional da mesma área vê | `professionals.specialty_type` cruzado com quem já atendeu o paciente |
| **Admin / Recepção** | Sem restrição — continuam vendo tudo | (comportamento atual, inalterado) |

O eixo "por área" para Pacientes/Ficha reaproveita exatamente o mecanismo que a ficha clínica já usa hoje (Bloco B do plano de especialidades, já em produção): a ficha é namespaced por `specialty_type`, não por profissional individual. Estender essa mesma lógica para também decidir "esse paciente aparece na sua lista ou não" é consistente com o que já existe — não é um conceito novo, é o mesmo conceito aplicado num lugar a mais.

### Como o vínculo paciente↔profissional nasce

Automático, via agendamento — no momento em que um agendamento é criado (ou um `record_entry` é lançado) ligando paciente + profissional, esse paciente passa a estar "no radar" daquele profissional e, por extensão, de toda a área dele. Não existe uma tabela nova de vínculo explícito: a visibilidade é **derivada em tempo real** a partir do que já existe — `appointments.professional_id` e `record_entries.professional_id`, cruzados com `professionals.specialty_type`. Isso evita mais uma tabela pra manter sincronizada e mais uma fonte de verdade — a pergunta "quem já atendeu esse paciente" já é respondida pelos dados que já existem.

Recepção/admin continuam podendo agendar qualquer paciente com qualquer profissional normalmente — são eles que criam a maior parte desses vínculos no dia a dia.

### O interruptor por clínica

Como a restrição não pode afetar as 18 clínicas existentes, ela entra atrás de uma flag por clínica:

```sql
alter table clinics add column professional_scoped_access boolean not null default false;
```

- Clínicas existentes: migram com `false` — nenhuma mudança de comportamento, nunca.
- Clínicas novas (criadas depois da migration): nascem com `true`.
- Sem isso, precisaríamos de uma migration de backfill reconstruindo vínculos históricos pras 18 clínicas — o que foi explicitamente descartado.

Toda policy nova é condicionada a essa flag, então o "modo antigo" (tudo compartilhado) continua existindo e sendo o padrão de quem já está rodando.

## Blocos de implementação

### Bloco A — Chassi: flag por clínica + `professionalId` na sessão

- Migration `20260812_professional_scoped_access.sql`: coluna `clinics.professional_scoped_access` (default `false`); função `is_admin_or_recepcao()` (helper reaproveitável pelas policies dos blocos seguintes); rollback = `drop column`.
- Fluxo de criação de clínica (cadastro em [login/page.tsx](src/app/login/page.tsx)) passa a gravar `professional_scoped_access: true` pra toda clínica nova.
- `AuthUser` ([types/index.ts](src/types/index.ts)) ganha `professionalId: string | null`, resolvido no login ([login/page.tsx:583-587](src/app/login/page.tsx:583)) com a mesma query que o prontuário já usa hoje (`professionals` onde `clinic_user_id = clinicUserId`) — deixa de ser um padrão isolado dentro do prontuário e vira parte da sessão, disponível pra Agenda/Pacientes/Financeiro também.
- Verificação: `npx tsc --noEmit` limpo; criar uma clínica de teste nova e confirmar via `execute_sql` que nasce com a flag `true`; confirmar que as 18 clínicas reais continuam com `false`.

### Bloco B — Agenda (individual)

- Migration de RLS: policy adicional em `appointments` — quando `professional_scoped_access = true` na clínica, só é visível se `is_admin_or_recepcao() OR professional_id = (select id from professionals where clinic_user_id = auth.uid()-equivalente)`.
- [useClinicData.ts](src/hooks/useClinicData.ts) (`useAgendaData`) passa a filtrar explicitamente por `professional_id` quando a sessão tem `professionalId` e não é admin/recepção — não só depender da RLS, pra manter a query eficiente e a UI consistente com o que o banco realmente devolve.
- [agenda/page.tsx](src/app/(app)/agenda/page.tsx): o filtro por chips (`hiddenProfIds`) que hoje é só cosmético deixa de fazer sentido pra um profissional restrito (ele só tem os próprios agendamentos pra filtrar) — continua existindo normalmente pra admin/recepção, que ainda precisam alternar entre profissionais.
- Ponto em aberto pra decidir durante a implementação, não travado agora: o seletor de "Profissional" no modal de novo agendamento, quando quem está criando é o próprio profissional restrito — trava nele mesmo, ou deixa escolher outro (útil se ele agenda em nome de um colega)? Provável resposta: trava nele mesmo; recepção/admin continuam podendo escolher qualquer um.
- Verificação: clínica de teste nova com 2 profissionais da mesma área; cada um só vê os próprios agendamentos; recepção vê os dois.

### Bloco C — Financeiro (individual)

- Migration: `financial_records.professional_id uuid null references professionals(id) on delete set null` + policy análoga à de Agenda.
- Backfill do campo (não do vínculo — isso é só preencher a coluna nova a partir do dado que já existe) em `ensureRevenueForAppointment` (a função que já cria o lançamento financeiro a partir de um agendamento) — passa a copiar `appointments.professional_id` pro lançamento no momento da criação.
- [useClinicData.ts](src/hooks/useClinicData.ts) (`useFinanceiroData`) e [financeiro/page.tsx](src/app/(app)/financeiro/page.tsx): mesmo padrão do Bloco B — filtro explícito no client + `showTotals` (que hoje só olha permissão de módulo) passa a considerar também "sou eu vendo meus próprios números" vs "sou admin vendo o consolidado".
- Verificação: mesma clínica de teste — cada profissional vê só as próprias receitas; total consolidado só aparece pra admin.

### Bloco D — Pacientes / Ficha (por área)

- Policy em `patients`: quando `professional_scoped_access = true`, visível se `is_admin_or_recepcao() OR EXISTS (select 1 from appointments a join professionals p on p.id = a.professional_id where a.patient_id = patients.id and p.specialty_type = <minha área>) OR EXISTS (mesma coisa via record_entries)`.
- [useClinicData.ts](src/hooks/useClinicData.ts) (`usePacientesData`) e [pacientes/page.tsx](src/app/(app)/pacientes/page.tsx): hoje `filteredPatients = patients` sem filtro nenhum ([pacientes/page.tsx:51](src/app/(app)/pacientes/page.tsx:51)) — passa a refletir o que a RLS já devolve (lista naturalmente vem menor pra quem é profissional restrito).
- Nenhuma mudança dentro da ficha em si (`TabFicha.tsx`) — o namespace por área já existe do Bloco B do plano de especialidades; aqui só estamos decidindo se o paciente aparece na lista, não o que aparece dentro da ficha dele.
- Verificação: clínica de teste com 3 dentistas + 1 nutricionista; paciente atendido por um dos dentistas aparece pros outros 2 dentistas e não aparece pro nutricionista; recepção vê todos.

## Fora de escopo desta rodada

- Aplicar a restrição retroativamente às 18 clínicas existentes — fica como decisão futura, se algum cliente pedir.
- Um jeito de "transferir" um paciente entre profissionais/áreas ou desvincular manualmente — hoje o vínculo é só derivado do histórico real de atendimento, não editável.
- Recepção/admin também terem uma visão "restrita" opcional — por ora eles sempre veem tudo, sem exceção.

## Ordem e verificação geral

Bloco A é pré-requisito de B, C e D (todos dependem da flag e do `professionalId` na sessão) — B, C e D podem ser feitos em paralelo depois. Padrão de teste em todos: clínica descartável criada pelo fluxo real `/login?mode=register`, verificação via Supabase `execute_sql`, limpeza completa ao final (mesmo padrão já usado nas rodadas de QA anteriores). `npx tsc --noEmit` limpo ao fim de cada bloco. Nenhuma migration mexe em dado das 18 clínicas reais — só adiciona colunas com default seguro e policies condicionadas à flag nova.
