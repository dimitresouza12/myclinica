# Plano: aba Mensagens e IA que sugere agendamento

Data: 2026-11-05. Base: leitura do código e captura ao vivo de `/mensagens` em 1440 e 390 px, nos temas claro e escuro, feitas pelo Antigravity (`scratchpad/agy-qa/saida-recon-mensagens.md` e `saida-captura-mensagens.md`). Nada foi alterado no código.

## Onde estamos

**Mensagens (todos os planos).** A base é sólida: tempo real pelo Supabase Realtime com polling de segurança a cada 30 s, respostas rápidas, áudio com onda, mídia, tiques, reações, editar e apagar, vínculo com paciente e chip de contexto. Não há rolagem lateral nem erro de JavaScript. Os problemas são de acabamento e de erro silencioso.

**Detecção de "quer agendar".** Não existe no fluxo nativo. O único texto interpretado é o SIM/NÃO da confirmação (`src/lib/whatsapp/reply.ts`). Isso é uma regra escrita de propósito em `src/lib/crm/automation.ts:4-5`: "na dúvida, não decide".

**Bot de IA antigo (n8n, plano `completo_plus`).** Quando o bot marca um chat como `agendado`, o `syncLeadAppointments` (`src/lib/sync-leads.ts`) cria paciente e consulta direto na Agenda, sem ninguém aprovar. Isso roda no navegador sempre que alguém abre Dashboard ou Pacientes, e tem estes riscos:

1. A consulta entra sem profissional, sempre com 60 min, sem checar conflito nem bloqueio.
2. A consulta remarcada ou excluída na Agenda **volta** na data antiga, porque o n8n continua dizendo `agendado`.
3. A checagem de "já existe no dia" usa a data em UTC, então uma consulta depois das 21h cai no dia errado.
4. Duas abas abertas ao mesmo tempo podem duplicar o paciente e a consulta.
5. O casamento de telefone usa `cleanPhone` e não `phoneKeys`, e lê no máximo 1000 pacientes, o que gera pacientes duplicados.

## Fase 0: acabamento da aba Mensagens (não depende da IA)

| # | Problema | Onde | Correção |
|---|---|---|---|
| 1 | Falha ao carregar aparece como "Nenhuma conversa ainda" | `mensagens/page.tsx:28,48`, `ConversationList.tsx:91-108` | Ler `isError` e mostrar `ErrorNotice` com "Tentar de novo" na lista e no chat |
| 2 | Falha na próxima consulta aparece como "Sem consulta marcada" | `useContactContext.ts:12,38`, `ContactPanel.tsx:25-28` | Tratar o erro; o chip mostra "Não foi possível carregar" |
| 3 | Aba "Leads" cortada na lista do desktop (4 pílulas não cabem em 292 px) | `ConversationList.tsx`, `Inbox.module.css` | Pílulas compactas na lista ou rolagem horizontal da faixa de abas |
| 4 | Telefone repetido como título e subtítulo quando o contato não tem nome | `ChatPane.tsx` (`.who span`), `ContactPanel.tsx` (`.idText span`) | Não mostrar o subtítulo quando ele é igual ao título |
| 5 | "Baixar de novo" deslocado 58 px dentro da bolha de mídia expirada | `Inbox.module.css` (`.fileRetry`) | Alinhar à margem do texto da bolha |
| 6 | No tema escuro, chat, lista e ficha têm a mesma cor (sem profundidade) | `Inbox.module.css` (`--chat-bg`) | `--chat-bg` um degrau acima de `--bg-primary` no escuro |
| 7 | Alvos de toque abaixo de 44 px | `.msgMenuBtn` 32 px, `.mediaBtn` 36 px, `.ctxWide` 32 px entre 761 e 980 px, `.vpBars` 28 px; `TopBar` menu 38 px e sino 40 px | Área de toque de 44 px (com `::after` onde o visual deve ficar menor) |
| 8 | Dezenas de cores literais | `Inbox.module.css:8-46` e regras soltas (`#06312B`, `#000`, `rgba`) | Trocar pelos tokens do `design-system.css` |
| 9 | Áudio que falha ao tocar não avisa | `VoicePlayer.tsx:60` | Estado de erro no player ("Áudio indisponível. Baixar de novo") |
| 10 | Link "Agenda" do chip e da ficha não leva o paciente | `ContextChip.tsx:27`, `ContactPanel.tsx:109` | Abrir a Agenda já com o paciente escolhido |
| 11 | Foto do contato com URL expirada dá 403 e fica quebrada | `avatar.ts` / `ContactAvatar` | Em erro de imagem, cair nas iniciais e pedir renovação |
| 12 | CRM legado: 8 classes CSS que não existem (gate, badges, botão atualizar) | `LegacyAiLeads.tsx:242,256-274,300,303` | Criar as classes ou trocar por `Badge`, `Button` e `EmptyState` |

Critério de pronto: os 12 itens acima conferidos ao vivo nas 4 combinações, `tsc` limpo e testes passando.

## Fase 1: tirar o risco do bot antigo

O bot antigo deixa de criar consulta sozinho. O "agendado" do n8n passa a gerar uma **sugestão**, igual à da Fase 2, que a recepção aprova com um toque.

1. Levar a sincronização para o servidor: uma rota protegida ou a rotina já existente, com trava por clínica. Ela deixa de rodar no `useEffect` de Dashboard e Pacientes. Remover o import morto em `agenda/page.tsx:12`.
2. Casar o telefone com `phoneKeys` e com a busca de `matchPatientId` (sem o corte em 1000).
3. Marcar cada chat do n8n já transformado em sugestão (pela chave do chat e pela data), para que uma consulta remarcada ou excluída não volte.
4. Usar o fuso da clínica para a data.

As consultas que o bot já criou continuam na Agenda como estão.

## Fase 2: detector de intenção (servidor)

O detector roda no webhook, depois de gravar a mensagem, dentro de `after()`, para não atrasar a resposta à Evolution.

1. **Filtro barato antes da IA** (`src/lib/whatsapp/booking-intent.ts`, puro e testável). Só passa mensagem recebida, de texto, de contato que não seja grupo, com sinal de agendamento: palavras como marcar, agendar, consulta, horário, vaga, disponível, avaliação, retorno, remarcar, data, dia da semana, "amanhã" ou hora. Fica de fora a resposta de confirmação já tratada por `handleIncoming`. A meta é que só uma pequena parte das mensagens chegue à IA.
2. **Agrupamento.** Esperar alguns segundos e ler as últimas 6 a 10 mensagens da conversa juntas, porque a pessoa costuma mandar a ideia em várias mensagens curtas.
3. **Chamada à IA**, com saída em JSON fixo:
   - `intent`: `agendar`, `remarcar`, `cancelar` ou `nenhuma`
   - `confidence`: de 0 a 1
   - `procedure_hint`: o procedimento citado, casado com a lista da clínica
   - `when`: dia(s) e período(s) pedidos ("quinta à tarde", "depois das 18h")
   - `professional_hint`: o profissional citado
   - `summary`: uma frase para a recepção

   Só entra o texto das mensagens e a lista de procedimentos e profissionais. Não entra CPF, prontuário nem dado clínico.
4. **Horários livres calculados pelo app, não pela IA.** O app usa `nextFreeSlots` e `freeSlotsOfDay` (`src/lib/agenda/`), respeitando a escala, os bloqueios e a duração do procedimento. Ele guarda até 3 horários.
5. **Gravação** numa tabela nova, `whatsapp_booking_suggestions`, com: `clinic_id`, `conversation_id`, `message_id`, `intent`, `confidence`, `procedure_id`, `professional_id`, `when_text`, `slots` (jsonb), `summary`, `status` (`pendente`, `agendada`, `ignorada`, `expirada`), `source` (`ia` ou `bot_legado`), `appointment_id`, `decided_by` e `decided_at`. A RLS é por clínica e o Realtime já está ligado. Fica no máximo uma sugestão pendente por conversa: uma nova substitui a anterior, e a pendente expira em 48 h.
6. **Limites.** Só abaixo de um teto de chamadas por clínica por dia. Quando a IA falha, nada aparece (falha silenciosa para a recepção, com log). Abaixo de um nível mínimo de confiança, não sugere.

## Fase 3: a sugestão dentro do app

A IA **sugere e a pessoa decide**. Nada é agendado nem enviado ao paciente sem um clique.

- **No chat:** um cartão fixo acima do campo de mensagem, por exemplo: "Quer agendar limpeza, quinta à tarde". Ele mostra três horários livres como botões e tem três ações:
  - **Agendar:** abre o modal de nova consulta já preenchido com paciente, procedimento, profissional, horário e duração. Se o contato ainda é lead, cadastra o paciente no caminho, como o "Agendar" do CRM já faz. Ao salvar, a sugestão vira `agendada`.
  - **Responder com horários:** escreve no campo de mensagem um texto com os três horários, para a pessoa revisar e enviar. Nunca envia sozinho.
  - **Ignorar:** a sugestão vira `ignorada`, e esse dado alimenta a medição.
- **Na lista:** um selo "Quer agendar" na conversa e um filtro com esse nome.
- **No Dashboard e no sino de "Ações necessárias":** "3 pacientes querem agendar".
- **Remarcar e cancelar** aparecem com o mesmo cartão, apontando para a consulta existente. Não mudam nada sozinhos.
- Sem emoji. Usa `Badge`, `Button` e os tokens.

## Fase 4: medir antes de confiar

1. Montar um conjunto de cerca de 150 mensagens realistas em português: pedido claro, pedido vago, dúvida de preço, "obrigado", áudio transcrito, remarcação e cancelamento. Elas podem vir das conversas reais da conta de teste, anonimizadas.
2. Medir a precisão do detector com um script. A meta é que, de cada 10 sugestões mostradas, pelo menos 9 sejam pedidos reais. É melhor perder um pedido vago do que incomodar a recepção.
3. No ar: contar sugestões mostradas, agendadas e ignoradas por clínica, para ajustar o filtro e o limite de confiança.

## Dependências e cuidados

- **As migrations da escala (`20261104_agenda_escala.sql`) e de bloqueio (`20260805_agenda_block.sql`) não estão aplicadas na produção** (são os 404 em toda tela). Sem elas, os horários livres sugeridos ignoram a escala do profissional. Elas precisam entrar antes da Fase 3 ir ao ar.
- A tabela nova da Fase 2 é uma migration e só é aplicada com o seu ok.
- Nenhum teste envia WhatsApp real. O webhook é testado com o JSON da Evolution postado localmente, e a conta de teste está com o WhatsApp desconectado.
- O workflow do bot antigo no n8n não é alterado nem publicado.
- Sem commit, push ou deploy sem pedido.

## Quem faz o quê

| Etapa | Quem |
|---|---|
| Fase 0 (UI) | Claude `mc-frontend` |
| Fase 1 e Fase 2 (servidor, detector, rotas) | Claude `mc-backend` |
| Migration da tabela de sugestões | Claude `mc-db`, com a sua aprovação |
| Fase 3 (cartão, selo, filtro, modal) | Claude `mc-frontend` |
| Conjunto de 150 mensagens de teste | Antigravity, Gemini 3.8 Flash high |
| `tsc`, `vitest` e script de precisão | Antigravity, Flash low |
| Captura e QA ao vivo (1440 e 390 px, claro e escuro) | Antigravity, Gemini 4 Argon medium |
| Revisão cruzada do diff | Antigravity, Argon high |
| Registro no vault | Antigravity, Flash high |

Ordem: Fase 0 e Fase 1 em paralelo (arquivos diferentes), depois a Fase 2, depois a Fase 3, e a Fase 4 roda junto com a Fase 3.
