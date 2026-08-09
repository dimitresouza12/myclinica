# Plano — reclamações da clínica Naiara Harmonização (08/08/2026)

## O que a cliente relatou

Três áudios e duas fotos, transcritos:

1. **"Fica assim, carregando dados, mas não entra."** — print do login em `myclinica.online`, com `ivnafreitass1@gmail.com` preenchido e a tela travada em "Carregando dados...".
2. **"Vamos supor, eu passei a gente para atender agora. Aqui no dente 15 eu tenho que extrair e colocar outro dente, mas ele não me dá a opção de digitar."** — odontograma.
3. **"Na parte da descrição do plano de tratamento... deveria ter uma opção de colocar o valor."** — junto com a foto do orçamento em papel dela (itens por dente + R$, total R$ 2.100,00).

---

## O que eu verifiquei no banco e no código

Clínica `Naiara Harmonização` (`94f4c718…`, odonto, plano avançado). **18 pacientes, 11 prontuários, 0 agendamentos** — ela usa o sistema como prontuário/odontograma, não como agenda. Isso explica por que as duas reclamações de funcionalidade são justamente sobre prontuário.

**Sobre o login travado:**

| Verificação | Resultado |
|---|---|
| Autenticação da Ivna no Supabase | ✅ **3 logins com status 200** (13:59:30, 14:24:59, 15:23:52 UTC) — senha e usuário estão corretos |
| A query que roda logo depois (`clinic_users` + `clinics`), executada com o JWT dela | ✅ retorna exatamente 1 linha, com a clínica — RLS e dados estão certos |
| Timeout / retry / cancelamento em qualquer query do app | ❌ **`grep` por `AbortController`/`abortSignal` no `src/` inteiro: zero ocorrências** |

Ou seja: **não é senha, não é permissão, não é RLS.** A autenticação passa, e aí o app fica preso na chamada seguinte. Como não existe timeout nenhum em lugar nenhum, qualquer travada — rede móvel instável, aba em segundo plano estrangulada pelo Android, disputa do lock de sessão do Supabase entre as abas (o print mostra **6 abas abertas** no Chrome dela) — vira um spinner eterno, sem mensagem, sem botão, sem saída. Isso sozinho já explica o sintoma e é um defeito real independente de qual das causas disparou.

Detalhe que reforça a leitura: às 15:23 houve um *refresh de token* dela — comportamento típico de uma aba parada na tela de login renovando a sessão em segundo plano enquanto a tela nunca sai do lugar.

**Sobre a criação do usuário (bug que ela não relatou, mas está lá):**

A RPC `create_clinic_member` cria `auth.users`, `auth.identities` e `clinic_users` — e **só**. Ela não cria nem vincula a linha de `professionals`. Resultado no banco hoje:

- a linha de `professionals` da Ivna existe, mas com **`clinic_user_id = NULL`**;
- o `clinic_users.specialty_type` dela está **NULL**.

Isso significa que, mesmo depois de resolver o login, o sistema **não vai reconhecer a Ivna como profissional**: a ficha por área não resolve a área dela, a evolução não sai assinada com o profissional certo, e ela não aparece como profissional na agenda. O caminho Equipe → "criar login junto" faz o vínculo; o caminho Configurações → "criar usuário" não faz. Os dois caminhos divergiram.

De quebra, a mesma função tem o whitelist de especialidade travado nas 7 áreas antigas (`odonto, medico, estetica, vet, fisio, psico, nutri`) — **falta `fono` e `to`**, que é o P0 já documentado e ainda pendente de aprovação.

**Sobre o odontograma:**

`TabOdontograma.tsx` tem 9 status fixos (Hígido, Cariado, Restaurado, Ausente, Implante, Coroa, Em Tratamento, Fraturado, Selante) e o tipo é `{ status, surfaces }` — **não existe campo de texto por dente**. Ela está certa: não há onde digitar. E o caso concreto dela ("extrair o 15 e colocar outro dente") nem status tem — "extração indicada" não existe na lista.

**Sobre o plano de tratamento:**

`TabFicha.tsx:472-481` — é um `<textarea>` único, texto corrido. Sem linhas, sem valores, sem total. O papel dela tem exatamente o que falta: uma linha por serviço, com o dente, e o valor ao lado.

---

## Bloco 1 — P0: o login nunca mais pode travar sem saída

Objetivo: **nenhuma tela do sistema pode ficar em "carregando" para sempre.** Mesmo que a causa raiz seja rede ou navegador, o app tem que falhar em voz alta e dar caminho de volta.

- **Timeout explícito** (12s) na query pós-login em [login/page.tsx:471](src/app/login/page.tsx:471), via `.abortSignal(AbortSignal.timeout(12000))`. Estourou → erro visível: *"Não conseguimos carregar os dados da clínica. Toque em Tentar novamente."*
- **1 retry automático** antes de mostrar o erro — cobre a oscilação de rede móvel, que é o caso mais comum.
- **Botão "Tentar novamente" + "Sair e limpar sessão"** na tela de erro. O segundo faz `signOut()` + limpa o store, para o próximo login começar do zero.
- **Tirar a query crítica do caminho do lock de sessão.** O `signInWithPassword` já devolve o `access_token` na resposta; hoje a chamada seguinte joga esse token fora e pede a sessão de novo (que passa pelo `navigator.locks`, disputado entre as abas). Fazer essa única chamada com `fetch` direto no PostgREST, mandando o token que já está em mãos, elimina a classe inteira do problema — não depende de diagnóstico.
- **Registrar a falha no audit** (`auth.login_stalled`) quando o timeout estourar. Nesse ponto já existe sessão autenticada, então o registro grava. Assim, se acontecer de novo, a gente vê no servidor em vez de depender de print.
- **Mesmo tratamento no [(app)/layout.tsx:26](src/app/(app)/layout.tsx:26)** — o `getSession()` de montagem tem o mesmo risco: se travar, `authChecked` nunca vira `true` e o app fica em branco.

**Alívio imediato, antes de qualquer deploy:** pedir para ela fechar as 6 abas, abrir **uma** aba nova em `myclinica.online` e tentar de novo. Na leitura mais provável do que aconteceu, isso já resolve hoje.

## Bloco 2 — P0: usuário criado pelas Configurações nasce sem profissional

Alinhar os dois caminhos de criação de usuário. **Precisa da sua aprovação — mexe em função no banco de produção.**

- `create_clinic_member` passa a criar/vincular a linha de `professionals` quando o cargo for clínico (`dentista`, `medico`, `profissional`), preenchendo `clinic_user_id`, e a gravar `specialty_type` no `clinic_users`.
- No mesmo deploy, adicionar `'fono'` e `'to'` ao whitelist de `specialty_type` — em `create_clinic_member` **e** em `update_clinic_member` (o P0 já documentado, que hoje impede criar login para fono/TO).
- **Correção de dado da Ivna** (2 UPDATEs, na clínica dela): ligar a `professionals` existente ao `clinic_user_id` dela e setar `specialty_type = 'odonto'` no `clinic_users`. Sem isso ela loga mas não é reconhecida como profissional.
- Backfill de segurança: procurar outras clínicas com `professionals.clinic_user_id IS NULL` que tenham um `clinic_users` de mesmo nome, e listar (não corrigir automaticamente) para revisão.

## Bloco 3 — Odontograma: anotação livre por dente

- `ToothData` ganha `note?: string`. Como o carregamento já trata tanto `string` quanto objeto ([TabOdontograma.tsx:368](src/components/prontuario/TabOdontograma.tsx:368)), os prontuários antigos continuam abrindo sem migration.
- No painel do dente selecionado, abaixo do grid de status: **textarea "Observação do dente"** — é onde ela escreveria *"extrair e colocar outro dente"*.
- Dois status novos que o caso dela pede e não existem: **"Extração indicada"** e **"Prótese"**.
- Marcador visual (um ponto) no dente que tem observação, para não ficar escondido.
- Sem migration: tudo cabe no `odontogram` jsonb que já existe.

## Bloco 4 — Orçamento com valores (a foto do papel dela)

O papel dela é a especificação: uma linha por serviço, com dente e valor, e um total. Hoje é um textarea só.

- **`medical_records.treatment_plan_items jsonb`** (coluna nova) — array de `{ id, description, value }`. O `treatment_plan` texto continua existindo, vira o campo de observação geral. *Precisa de migration — sua aprovação.*
- Na aba Ficha, "Plano de Tratamento" vira uma **lista de linhas**: descrição livre (ela escreve *"Exo 15 + dente"*, *"Faceta 11"*) + valor, com **+ Adicionar item**, remover por linha e **TOTAL** calculado embaixo.
- Atalho opcional: preencher a linha a partir dos **Procedimentos** já cadastrados dela, puxando nome e preço — sem obrigar, porque ela escreve à mão hoje.
- **`printOrcamento()`** em [print.ts](src/lib/print.ts) (ao lado de `printContrato`/`printRecibo`, que já existem), no formato do papel: cabeçalho da clínica, nome do paciente, tabela serviço/valor, total, e o rodapé de condição de pagamento.
- Fora deste bloco, anotado para depois: transformar orçamento aceito em receita no Financeiro. É o passo natural seguinte, mas é escopo próprio.

---

## Precisa da sua aprovação antes de eu rodar

Nada disso eu aplico sozinho — são mudanças em produção:

1. `CREATE OR REPLACE` em `create_clinic_member` e `update_clinic_member` (Bloco 2).
2. Dois `UPDATE`s de correção nos dados da Ivna (Bloco 2).
3. `ALTER TABLE medical_records ADD COLUMN treatment_plan_items jsonb` (Bloco 4).

Os Blocos 1 e 3 são só código — esses eu toco quando você mandar, sem tocar no banco.

## Ordem sugerida

**1 → 2 → 3 → 4.** O Bloco 1 é o que a cliente está sentindo agora e é o que impede o diagnóstico de qualquer recorrência. O Bloco 2 é o que faz o login dela realmente servir para alguma coisa depois que entrar. Os Blocos 3 e 4 são as funcionalidades que ela pediu — o 4 é o maior, e é o que mais aproxima o sistema do que ela já faz no papel.

## Verificação

- **Bloco 1**: matar a rede no meio do login (DevTools offline) e confirmar que aparece erro + botão em até 12s, nunca spinner eterno. Repetir com 6 abas abertas. Confirmar `auth.login_stalled` no audit.
- **Bloco 2**: criar um usuário `dentista` por Configurações numa clínica descartável e conferir no banco que `professionals.clinic_user_id` veio preenchido e `clinic_users.specialty_type` também. Repetir com uma clínica de fono (valida o whitelist novo). Conferir os dados da Ivna corrigidos.
- **Bloco 3**: no dente 15, marcar "Extração indicada", escrever a observação, salvar, fechar e reabrir o prontuário — texto tem que voltar. Abrir um prontuário antigo (dos 11 dela) e confirmar que não quebrou.
- **Bloco 4**: reproduzir o orçamento da foto (6 linhas, total R$ 2.100,00) e imprimir. Conferir que o total bate e que o prontuário antigo, sem `treatment_plan_items`, abre normal.

`npx tsc --noEmit` limpo ao fim de cada bloco.
