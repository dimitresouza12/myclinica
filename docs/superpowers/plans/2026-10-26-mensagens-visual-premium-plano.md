# Aba Mensagens: refino visual premium (plano de implementação)

Desenho aprovado: `docs/superpowers/specs/2026-10-26-mensagens-visual-premium-design.md`. Leia primeiro.

Regras do projeto que valem aqui: sem emoji na interface; nunca `touch-action: pan-x/pan-y` amplo; commit e push só com pedido explícito do Dimitre; login de teste video123/video123 e nenhuma clínica nova; CSS Modules; `tsc`, `eslint` e `vitest` limpos antes de dar por pronto.

## Etapa 0: pré-requisito (antes de qualquer linha)

O repositório tem trabalho de outra frente, sem commit, nos mesmos arquivos: vídeo em tela cheia (`ChatPane.tsx`, `MediaBubble.tsx`, `Inbox.module.css`), `mensagens/page.tsx`, `webhook/route.ts`, `connection.ts`, `AppSidebar.tsx`, e `vitest.config.ts`. Hoje o `tsc` acusa `Cannot find name 'WaMessage'` em `mensagens/page.tsx:132`.

1. O Dimitre decide se essa frente é commitada antes (recomendado) ou se vai junto.
2. Corrigir o erro do `tsc` (provável import de tipo faltando em `page.tsx`) ou confirmar com quem mexeu.
3. Só então começar. Ponto de partida: `tsc`, `eslint` e `vitest` limpos.

## Etapa 1: base visual, bolhas e arquivo

### 1.1 Funções puras e testes (sem tela)

Arquivo novo: `src/lib/whatsapp/bubble.ts`. Teste: `src/lib/whatsapp/bubble.test.ts` (escrever primeiro, ver falhar, implementar).

- `fileBadge(name, mime)` devolve `{ label, tone }`. pdf: `PDF`/`pdf`. doc e docx: `DOC`/`doc`. xls, xlsx, csv: `XLS`/`xls`. ppt e pptx: `PPT`/`ppt`. txt: `TXT`/`other`. Outro: extensão em caixa alta com até 4 letras / `other`. Sem extensão: `ARQ`/`other`. Se o mime for PDF e o nome não tiver extensão, usar o mime.
- `truncateMiddle(name, max)`: nome curto não muda; nome longo corta o meio e mantém a extensão (`Exame_Hemogr…Silva.pdf`). Extensão maior que `max` não explode.
- `startsAuthorRun(prev, curr)`: verdadeiro quando não há mensagem anterior, a direção muda, o autor muda (mesmo critério de `originLabel`), o dia muda, ou passam 10 minutos ou mais. Receber os campos mínimos, não a mensagem inteira, para testar fácil.
- `avatarTone(name)`: índice de 0 a 5, determinístico (mesmo nome, mesmo índice). Usado na Etapa 2, mas já testado aqui.

Casos de teste: nome com acento, nome com vários pontos (`laudo.final.v2.pdf`), maiúsculas, arquivo sem extensão, mensagens no limite exato de 10 minutos, troca de dia no fuso da clínica (reaproveitar `dayKey` de `inbox.ts`).

### 1.2 Tokens e escala tipográfica

Arquivo: `src/components/mensagens/Inbox.module.css`.

1. Em `.root`, declarar variáveis: `--msg-in-bg`, `--msg-in-fg`, `--msg-out-bg`, `--msg-out-fg`, `--msg-meta`, `--chat-bg`, `--bubble-shadow`, e os tons de selo (`--tone-pdf`, `--tone-doc`, `--tone-xls`, `--tone-ppt`, `--tone-other`). Valores iniciais do desenho. Redefinir sob `:global([data-theme="dark"]) .root`.
2. Trocar as cores fixas de `.in`, `.out`, `.time`, `.by`, `.vpOut` e do chão `.chat` por essas variáveis. No escuro, bolha recebida mais clara que o fundo; nada verde.
3. Escala: `.b` 15 px, `.nm` 14 px, `.time` 12 px, peso 600 máximo (remover 700 e 800 da aba, incluindo `.listTitle`, `.avatar`, `.badge`, `.btnPrimary`).
4. Raio 16 px com o canto do remetente em 6 px; `.in` sem borda, com `--bubble-shadow`.
5. Medir o contraste de cada par texto/fundo nos dois temas e ajustar os valores até 4,5:1. Anotar os valores finais no desenho.

### 1.3 Ícone de tique

`src/components/ui/Icon.tsx`: adicionar `checkDouble` (dois tiques sobrepostos, mesmo traço dos demais ícones). Só adicionar, não mexer nos existentes.

Componente novo `src/components/mensagens/DeliveryTicks.tsx`: recebe `status` (`sent`, `delivered`, `read`). `sent` mostra um `check` cinza; `delivered`, `checkDouble` cinza; `read`, `checkDouble` teal. Texto de `STATUS_LABEL` em `aria-label` e `title`. Cor também diferente por forma (um ou dois tiques), nunca só por cor.

### 1.4 Cartão de arquivo

Componente novo `src/components/mensagens/FileCard.tsx` (apresentação pura). Props: `name`, `size`, `mime`, `state` (`ready`, `loading`, `expired`, `failed`, `unavailable`), `href` (PDF), `onActivate`, `busy`, `error`, `onRetry`, `hint`.

- Layout: selo 40 px (de `fileBadge`), bloco de texto (nome com `truncateMiddle`, até duas linhas; metadados `PDF · 284 KB`) e ícone `download` à direita.
- O cartão inteiro é a área clicável (`<a>` para PDF, `<button>` para o resto), altura mínima 56 px, foco visível. O ícone de download é só visual dentro da mesma área, exceto no PDF, onde há um segundo botão de 44 px para baixar.
- `loading`: brilho suave no selo (animação desligada com `prefers-reduced-motion`). `expired`, `failed` e `unavailable`: cartão esmaecido, frase curta sem itálico ("Removido. Veja no WhatsApp do celular", "Não foi possível carregar o arquivo"), "Baixar de novo" como link discreto quando `onRetry` existe.
- Sem emoji. Selo escrito com a extensão, não ícone de clipe.

`MediaBubble.tsx`: o ramo de documento e o de estados pendentes passam a usar `FileCard`. Preservar a lógica que existe hoje: `canRetry`, `tooBig`, mensagens por `media_status`, `run(onRetry)` e `run(onDownload)`, `MAX_STORED_BYTES`. Imagem, figurinha e vídeo: raio 12 px, sem moldura, mantendo o botão de abrir.

`ChatPane.tsx`, `OutboxBubble`: o documento em envio usa o mesmo `FileCard` (estado `loading`).

### 1.5 Bolhas

`ChatPane.tsx`, `Bubble`:

1. Receber `showAuthor` (calculado em `ChatPane` com `startsAuthorRun`, a partir da mensagem anterior, ignorando separadores de dia que já forçam nova sequência). Mostrar `by` só quando `showAuthor`.
2. Aplicar classe `runStart` ou `runCont` para o espaço (10 px entre sequências, 2 px dentro). Substituir o `gap: 6px` fixo de `.msgs`.
3. Trocar `<span className={styles.statusTxt}>` por `DeliveryTicks`. Manter `editada ·` e a hora.
4. Menu da mensagem (`msgMenuBtn`) continua igual; só conferir que o canto da bolha com 6 px não cobre o botão.

### 1.6 Verificação da Etapa 1

- Rodar `npx tsc --noEmit`, `npx eslint` nos arquivos tocados e `npx vitest run`. Tudo limpo.
- Visual com Playwright (modelo: scripts de captura já usados nesta sessão; guardar fora do repo): conversa com texto, áudio, vídeo removido e cartão de PDF montado com as classes reais, em 1440 px e 390 px, claro e escuro. Conferir os 12 achados 1 a 5 e 9 a 12.
- Alvos de toque: medir com script (largura e altura de cada `button` e `a` na conversa, mínimo 44 px, descontando o que a regra do projeto já exclui). Sem rolagem horizontal em 390 px.
- Se o chip estiver conectado, testar com um PDF real recebido e um enviado. Se não, dizer que o teste real ficou pendente.

Entrega da Etapa 1: o Dimitre vê as capturas e aprova antes da Etapa 2.

## Etapa 2: lista, cabeçalho, painel, aviso e campo

### 2.1 Avatar (compartilhado, só aditivo)

`src/components/ui/Avatar.tsx`: nova prop opcional `empty?: ReactNode`, usada quando `initialsOf(name)` for `#` e não houver foto. Sem a prop, comportamento idêntico ao de hoje (CRM e outras telas não mudam). Conferir no CRM que nada se alterou.

Na aba: classes `.tone0` a `.tone5` e `.avatarLead` (contorno) em `Inbox.module.css`; `ConversationList` e o cabeçalho passam `className` combinando tom e variante. Contato sem nome recebe ícone de pessoa (`patients`).

### 2.2 Lista de conversas

`ConversationList.tsx` e CSS:

1. Remover a pílula `kind` da linha. Paciente: avatar cheio; lead: `.avatarLead`.
2. Filtros: trocar `.tab` por texto com sublinhado teal no ativo (`aria-pressed` mantido). "Não lidas" com contador, calculado de `p.conversations`.
3. Linha de 72 px; selecionada com fundo suave, sem `inset` lateral; contador de não lidas teal pequeno.
4. Estados vazios em duas linhas curtas, mesma voz do resto.

### 2.3 Contexto no cabeçalho

1. Extrair `useNextAppointment` e `useLeadFor` de `ContactPanel.tsx` para `src/hooks/useContactContext.ts`, exportando-os; `ContactPanel` passa a importar de lá. Mesmas chaves de cache, então a consulta não duplica.
2. `ContextChip.tsx`: paciente com consulta, "Próxima consulta: qui, 28/10, 14h" (e "com Dra. Ana" se houver profissional na consulta; se a consulta não trouxer o profissional, não mostrar), link para `/agenda`; paciente sem consulta, "Sem consulta marcada"; lead, etapa do funil (`STAGES`), link para `/crm`; sem dado, não renderiza nada.
3. `ChatPane.tsx`, cabeçalho: avatar 40, nome 16/600, telefone abaixo, `ContextChip` à direita. Em larguras estreitas o chip vai para baixo do telefone ou some (decidir na verificação a 390 px).

Se a consulta não trouxer o nome do profissional, ajustar o `select` de `useNextAppointment` para incluir `professionals(name)` e tipar. Conferir antes de prometer.

### 2.4 Painel da direita

`ContactPanel.tsx` e CSS: cabeçalho à esquerda (avatar 48, nome, telefone), sem pílula de tipo. Seções com título de 12 px peso 600 sem caixa alta; `kv` com divisores finos. Ações: uma primária sólida; as demais como linhas com ícone. Texto explicativo do lead encurtado. Toda a lógica de cadastro (`startRegister`, `PatientFormModal`, `link-patient`) fica intacta.

### 2.5 Aviso de desconexão e campo desabilitado

1. `mensagens/page.tsx`: o banner vira faixa fina âmbar com ícone, texto curto e "Reconectar" discreto (continua `role="alert"`, link para `/configuracoes?tab=whatsapp`).
2. Encurtar `sendBlockedReason` para "Reconecte o WhatsApp para responder" e "Você não tem permissão para responder".
3. `ChatPane.tsx`: usar esse texto como `placeholder` do campo desabilitado e remover a barra `.notice` duplicada.

### 2.6 Campo de mensagem

`ChatPane.tsx` e CSS: um contêiner único `.composerBox` (raio 24 px, borda fina, foco com anel teal) contendo anexo e respostas rápidas à esquerda, textarea no meio, enviar e microfone à direita. Enviar teal só com texto ou arquivo; microfone neutro. Texto 15 px (continua com pelo menos 16 px em telas pequenas para o iOS não dar zoom). Gravação de voz mantém seu estado, adaptado ao contêiner.

### 2.7 Tela vazia e movimento

1. `ChatPane` recebe `waitingCount` (conversas com `unread_count > 0`, calculado em `page.tsx`). Tela vazia: ícone esmaecido, "Selecione uma conversa" e "N conversas aguardando resposta" (singular e plural; sem a linha se N for 0).
2. Transições de 150 ms em hover e seleção nos elementos novos. Bloco `@media (prefers-reduced-motion: reduce)` zera animações e transições da aba. Nenhuma animação nova além do brilho do `loading`.

### 2.8 Verificação da Etapa 2

- `tsc`, `eslint`, `vitest` limpos. Teste novo para `avatarTone` já coberto na 1.1; testes de qualquer outra função pura criada.
- Visual em 1440, 1024 (container query de 980 px) e 390 px, claro e escuro, com lista cheia, conversa de paciente, conversa de lead, lista vazia e WhatsApp desconectado.
- Regressão: o painel como gaveta em largura média, o botão de voltar no celular, filtros, busca, respostas rápidas, anexar, gravar áudio (sem enviar de verdade), editar e apagar (menu abre e fecha).
- Verificar o CRM e a Agenda (usam `Avatar` e `Icon`) para garantir que nada mudou.
- Conferir os critérios de aceite 1 a 7 do desenho, um a um, com evidência (captura ou medição).

## Ordem, dependências e esforço

1. Etapa 0, depois 1.1, 1.2 e 1.3 (podem ir juntas), depois 1.4, 1.5, 1.6.
2. Pausa para aprovação do Dimitre com capturas.
3. Etapa 2: 2.1, depois 2.2 e 2.3, depois 2.4, 2.5 e 2.6 (2.5 e 2.6 tocam `ChatPane.tsx`: fazer em sequência, não em paralelo), depois 2.7 e 2.8.
4. Esforço estimado: Etapa 1 cerca de 1 dia; Etapa 2 cerca de 1 dia. Estimativa minha, sem medir.

## Fora do plano

- Commit e push (só com pedido do Dimitre).
- Deploy no EasyPanel (feito pelo Dimitre).
- Teste real com chip (feito pelo Dimitre).
- Registro no vault (Log de Sessões) no fim, se algo relevante mudar.
