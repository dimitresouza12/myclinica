# Visual premium nas abas do app (plano de implementação)

Desenho aprovado: `docs/superpowers/specs/2026-10-26-visual-premium-abas-design.md`. Leia primeiro.

Regras do projeto: sem emoji na interface; nunca `touch-action: pan-x/pan-y` amplo; `data-hscroll` só onde há rolagem real; CSS Modules; login de teste video123/video123 e nenhuma clínica nova; nada de migration sem pedido; commit, push e deploy só com pedido explícito do Dimitre; `tsc`, `eslint` e `vitest` limpos ao fim de cada etapa.

Verificação visual padrão (vale para toda etapa): capturas em 1440, 1024 e 390 px, claro e escuro, com o script de Playwright usado nas Mensagens (login video123, sem dado novo). Medir alvos de toque e rolagem horizontal no celular. Conferir também as telas fora do escopo que usam o que foi mexido.

## Etapa 0: pré-requisitos

1. O refino da aba Mensagens ainda está sem commit. O Dimitre decide se entra num commit antes de começar (recomendado, para separar as mudanças).
2. Ponto de partida limpo: `tsc` e `vitest` passando; anotar os erros de `eslint` que já existem (hoje: `DatePicker`, `MonthPicker`, `Portal`, `FinancialDashboard`) para não confundir com erro novo.

## Etapa 1: base visual e componentes (todas as telas mudam um pouco)

### 1.1 Tokens

`src/styles/design-system.css`:
- Novos tokens: `--bg-page`, `--surface`, `--surface-2`, `--ink`, `--on-ink`, `--track`, `--shadow-card`, `--radius-card` (22), `--radius-inner` (14), `--radius-field` (10), e os tons de status (`--st-ok`, `--st-wait`, `--st-now`, `--st-warn`, `--st-bad`). Versões clara e escura (escuro: página preta, superfície `#111111`, sem verde).
- Importar o peso 300 da Plus Jakarta Sans.
- `h1, h2` globais: peso 800 para 600.

`src/app/(app)/app.module.css`: `.shell` e `.main` passam a usar `--bg-page`. Conferir que Mensagens (tela cheia) e CRM continuam corretos.

### 1.2 Status global

`src/app/globals.css`: a classe `status-badge` vira ponto com texto (sem borda lateral, sem caixa alta), mantendo os mesmos nomes de classe `status-*` para não mexer em quem usa. Conferir Agenda, Dashboard e prontuário.

### 1.3 Funções puras com testes

Arquivo novo `src/lib/ui/charts.ts` e `charts.test.ts` (testes primeiro):
- `smoothPath(points)`: curva suave (Catmull-Rom para Bézier), usada por `Sparkline`.
- `scalePoints(values, width, height, padding)`: valores para coordenadas, inclusive série constante e série vazia.
- `gaugeArc(fraction)`: ponto final e caminho do medidor, com o valor limitado entre 0 e 1.
- ~~`formatCompactMoney(value)`~~: não criado; já existe `formatCurrencyCompact` em `src/lib/utils.ts` ("R$ 34,2 mil", "R$ 1,2 mi").

Feito em 2026-10-27: Etapa 1 completa. Além do plano: `button.module.css` (primário, secundário, fantasma, ícone, exclusão) e a barra de cima no fundo da página, sem a linha de baixo. Vitrine temporária em `src/app/(app)/vitrine-ui/` só para conferência; apagar antes do commit.

### 1.4 Componentes

Em `src/components/ui/`, cada um com seu `.module.css`: `Card`, `StatCard`, `Sparkline`, `Gauge`, `PillTabs`, `StatusDot`, `PageHeader`, `AreaTrendChart` (Recharts, que o projeto já usa) e `table.module.css`.
- Acessibilidade: `PillTabs` como grupo de botões com `aria-pressed`; `Sparkline` e `Gauge` com `role="img"` e texto alternativo; `StatusDot` com o texto sempre visível (cor nunca sozinha).
- Celular: `table.module.css` convive com a classe global `resp-table` (lista de cartões abaixo de 768 px).

### 1.5 Verificação da Etapa 1

Todas as abas abrem sem erro, claro e escuro; o fundo novo e o status em ponto aparecem em todas; nenhuma tela fora do escopo quebrou (CRM, Mensagens, prontuário, admin, login). **Ponto de parada: o Dimitre vê as capturas antes da Etapa 2.**

## Etapa 2: Dashboard

Arquivos: `src/app/(app)/dashboard/page.tsx`, `dashboard.module.css`, `DashboardChart.tsx`, `RevenueByCategoryChart.tsx`, `src/hooks/useClinicData.ts`.

1. Dados novos em `useDashboardData` (juntar as consultas no `Promise.all` que já existe): comparecimento dos últimos 7 dias, confirmação da semana, próximo atendimento, receita por dia desta semana e da anterior, séries de 7 dias para os mini gráficos. Funções de cálculo puras em `src/lib/dashboard/metrics.ts` com testes.
2. Layout: bloco grande à esquerda (saudação, `Gauge` de meta e de confirmação, próximo atendimento, comparecimento com barras finas), quatro `StatCard`, `AreaTrendChart` com `PillTabs` (Dia, Semana, Mês), agenda de hoje e caixa de hoje.
3. Manter o que já existe e funciona: esconder valores (ícone de olho), editar meta, ações da agenda de hoje.
4. Remover do `dashboard.module.css` o que deixar de ser usado.
5. Verificação padrão e comparação com a maquete. **Ponto de parada: o Dimitre aprova o Dashboard real antes das outras abas.**

Feito em 2026-10-27. Diferenças do desenho: o gráfico tem Semana, Mês e 6 meses (no lugar de "Dia", que por hora não diz muito; "6 meses" mantém receitas contra despesas, que já existia); "Receita por categoria" e "Conclusões e dicas" continuam, no fim da página; `DashboardChart.tsx` e `RevenueByCategoryChart.tsx` saíram. Consultas novas: só duas leves (consultas dos últimos 7 dias até o fim da semana e cadastros de pacientes dos últimos 7 dias); a receita por dia sai dos lançamentos que o Dashboard já buscava.

## Etapa 3: Agenda

Arquivos: `src/app/(app)/agenda/page.tsx` (1.741 linhas) e `agenda.module.css` (1.225 linhas). Fazer em passos pequenos, verificando a cada um:
1. Cabeçalho com `PageHeader` e `PillTabs`; o seletor nativo de status vira `SelectMenu`.
2. Coluna esquerda: mini calendário com pontos nos dias com consulta, profissionais com caixa de seleção (substitui os avatares redondos), resumo de hoje.
3. Blocos de consulta: raio de 12 px, fundo suave e borda lateral pela cor do status, nome e horário com reticências; linha da hora atual.
4. Conferir arrastar, bloqueios de horário, abrir consulta, criar consulta, visões Dia e Mês, e o celular (faixa de dias, que já teve problema de layout).

Feito em 2026-10-27. Diferenças do plano: a Agenda não tem arrastar (o FullCalendar não está em modo editável), então não havia o que conferir; o título e as pílulas Dia/Semana/Mês foram para o `PageHeader`, e o cartão da grade ficou só com a navegação (anterior, próximo, "Hoje" novo, bloqueio, Google Calendar); o filtro de profissionais virou lista com caixa de seleção e contagem na barra lateral (a faixa de avatares continua em telas abaixo de 1100 px); as consultas deixaram de passar `color` ao FullCalendar e usam a classe `ev-<status>` com os tokens `--st-*`; o cabeçalho da semana usa `html` e não JSX, porque o conteúdo em React do FullCalendar chamava `flushSync` e enchia o console de erro. Também saíram os três emojis do bloqueio de horário. Novos: `src/lib/agenda/view.ts` (9 testes), `MiniCalendar`, `AgendaSidebar`.

## Etapa 4: Pacientes (lista)

Arquivos: `src/app/(app)/pacientes/page.tsx`, `pacientes.module.css`.
1. `PageHeader` com "Exportar" (secundário) e "Novo paciente" (primário).
2. Quatro `StatCard`. "Sem retorno" reaproveita a lógica do alerta `sem_retorno`; "saldo a receber" usa o saldo que a lista já mostra.
3. Filtros em `PillTabs` com contador.
4. Lista em `table.module.css`: avatar com cor por pessoa (reaproveitar `avatarTone` de `src/lib/whatsapp/bubble.ts`, movendo-o para `src/lib/ui/` se fizer sentido), procedimento principal, próxima e última consulta, saldo à direita; "Prontuário" e "Editar" saem da linha e vão para o "⋯" e para os atalhos ao passar o mouse; clicar na linha abre o prontuário.

Feito em 2026-10-27. Diferenças do plano: "saldo a receber" não existe na lista; o saldo que ela já mostrava é o de pacotes pré-pagos, então o quarto cartão é "Saldo de pacotes". "Sem retorno" usa o mesmo prazo do alerta do Dashboard (45 dias, constante `NO_RETURN_DAYS`), mas olha a última consulta concluída do paciente. Filtros: Todos, Com consulta marcada, Sem retorno, Com saldo, cada um com contador. "Exportar" gera um CSV da lista filtrada (separador `;`, abre direto no Excel). `avatarTone` foi para `src/lib/ui/avatarTone.ts` (a Mensagens continua importando de `bubble.ts`, que reexporta) e os 6 tons viraram tokens `--av0..5` em `design-system.css`. Novos: `src/lib/pacientes/summary.ts` (9 testes), `MoreMenu` (botão "⋯" com menu em Portal, reaproveitado nas outras abas). No celular o cartão de `resp-table` ganhou o visual novo (`globals.css`) e o "⋯" vai para o canto do cartão.

## Etapa 5: Financeiro

Arquivos: `src/app/(app)/financeiro/page.tsx` (828 linhas), `financeiro.module.css`, `FinanceiroCharts.tsx`, e conferir `src/components/ui/FinancialDashboard.tsx`.
1. `PageHeader` com `PillTabs` de período, "Exportar", "Despesa" (secundário) e "Receita" (primário).
2. `StatCard` de receitas, despesas, lucro e a receber.
3. `AreaTrendChart` de 12 meses com a despesa tracejada; receitas por categoria em barras finas.
4. Lista: seta de receita ou despesa, situação em `StatusDot`, valor à direita (despesa em vermelho só no valor), ações no "⋯".

Feito em 2026-10-27. Diferenças do plano: não existe "a receber" nem situação do lançamento no banco (não há coluna de pagamento pendente), então o quarto cartão é "Ticket médio" e a lista mostra a seta de entrada ou saída no lugar do `StatusDot`. O gráfico passou de 6 para 12 meses (receita cheia, despesa tracejada) e as barras de categoria e convênio viraram `BarList` (novo, compartilhado com Relatórios, Comissões, Metas). `FinanceiroCharts.tsx` saiu. Recibo, editar e excluir foram para o "⋯". Os modais de lançamento e exportação mantêm os campos nativos (Etapa 7 não os cobre) e só trocaram os botões pelo padrão. No celular o "Exportar" fica só com o ícone abaixo de 480 px.

## Etapa 6: Relatórios

Arquivos: `src/app/(app)/relatorios/page.tsx` (707 linhas), `relatorios.module.css`, `RelatoriosCharts.tsx`.
Abas em `PillTabs`; `StatCard` no topo; `AreaTrendChart` de receita e lucro; ranking de procedimentos em barras finas; tabela mensal com a margem em barra. Conferir as cinco abas (Financeiro, Clínico, Pacientes, Equipe, Comissões) e a exportação de planilha.

Feito em 2026-10-27. O período (3, 6, 12 meses) virou `PillTabs` no cabeçalho e as cinco abas também. Financeiro: 4 `StatCard`, gráfico de receita e lucro, faturamento por procedimento em `BarList`, tabela mensal com a margem em barra. Clínico: ranking em `BarList`. Pacientes: gráfico de novos cadastros por mês. Equipe e Comissões: tabelas no padrão novo, cancelamento em `StatusDot`. O cálculo e a exportação de planilha não mudaram. `RelatoriosCharts.tsx` saiu.

## Etapa 7: demais abas

Procedimentos, Estoque, Equipe, Comissões, Metas e Configurações: aplicar `PageHeader`, `StatCard` onde houver indicadores, listas em `table.module.css`, `StatusDot`, botões no padrão. Uma aba por vez, com a verificação padrão. Ao fim, varrer o CSS das páginas para remover o que ficou sem uso.

Feito em 2026-10-27. Procedimentos, Estoque e Equipe: `PageHeader`, `StatCard`, lista em `table.module.css` com `StatusDot` e ações no "⋯" (Estoque também tem atalhos de Entrada e Saída ao passar o mouse; o gráfico de movimentação virou `AreaTrendChart` e `EstoqueChart.tsx` saiu). Comissões: cartões de beneficiário com avatar e % grande, ganhos por beneficiário em `BarList`. Metas: medidor, três cartões, evolução da receita com a meta tracejada e histórico em barras (`MetasHistoryChart.tsx` saiu). Configurações: tem navegação lateral própria e muito estilo inline, então só trocou o cabeçalho e o CSS (tokens, pílulas, cartões); a estrutura do arquivo (1.630 linhas) não mudou. Os modais e formulários de todas as abas mantêm os campos nativos e só trocaram os botões; trocar os selects nativos por `SelectMenu` fica como pendência.

## Etapa 8: barra lateral

Feito em 2026-10-27. `AppSidebar.tsx` e `AppSidebar.module.css`: a barra usa o fundo da página, sem borda e sem o brilho do topo; o item ativo é um cartão branco com sombra leve e o ícone num círculo escuro (igual à navegação de Configurações); os 14 itens ficam em grupos (Dia a dia, Gestão, Clínica, Captação, com Dashboard solto no topo); Configurações e o botão "Recolher menu" (linha de 40 px, com `aria-label`) ficam no pé; o topo mostra a clínica com inicial ou logo, nome e plano; o texto usa `--text-secondary`. Permissão e plano seguem a mesma regra (`canSee`). Ficaram de fora: aviso de período de teste no rodapé e dica de nome própria no modo recolhido.

## Etapa 9: modais (migração concluída, com uma exceção)

Feito em 2026-10-27, só o piloto: `Modal` (`src/components/ui/Modal.tsx`, `modal.module.css`, `modalForm.module.css`) aplicado em Procedimentos; `ConfirmDialog` redesenhado, o que vale para todas as confirmações; o botão primário desabilitado ficou cinza legível em `button.module.css`. O `Modal` fecha com Esc e clique no véu, prende o foco, trava a rolagem do fundo e no celular sobe como folha (o tamanho `lg` ocupa a tela toda). O `Portal` monta os filhos um render depois: o foco inicial entra por ref de callback, não por efeito.

Atualização de 2026-10-27 (tarde): os modais de Estoque (2), Equipe (2), Comissões (1) e Financeiro (1) já estavam migrados na árvore quando a sessão voltou; conferi que usam o `Modal` e que o `tsc` passa, mas não os revi na tela. Nesta sessão migrei Configurações (confirmar desativar, reativar e excluir; criar e editar usuário, com os interruptores no padrão de `modalForm`), `CredentialsConfirmModal` e o modal bloqueante de `PaymentLateBanner`. Para esse último o `Modal` ganhou a opção `dismissible={false}` (sem botão de fechar, sem Esc e sem clique no véu), e o emoji do título saiu. Verificados no navegador em 1280 e 390 px, no escuro: Esc, véu, rodapé de três botões sem transbordar e botões de 44 px. Não verificado: o tema claro desses modais e o fluxo de salvar de ponta a ponta (não criei nem excluí usuário).

Atualização de 2026-10-27 (noite): **todos os modais passaram para o `Modal`**, menos o `LeadDrawer` do CRM, que é um painel lateral de formulário (já tem Esc, `role=dialog` e trava; falta prender o foco, e pede um `Drawer` à parte). Migrados nesta rodada: `PatientFormModal` (seções Dados pessoais, Contato e Mais informações recolhida), os dois formulários da Agenda e seus dois painéis de detalhe (modo `bare`), `ProntuarioModal` (`size="xl"`, abas em `PillTabs`, aviso de anotação não salva pelo `ConfirmDialog`), `LostReasonDialog`, `WelcomeModal` e `OnboardingModal` (sem os emojis), o QR do WhatsApp (`dismissible={false}`), `DocumentFieldCalibrator` (`size="wide"`), `AdminClinicas`, `ClinicEditModal` (exclusão pelo `ConfirmDialog`, sem `⏳`) e o painel do `LegacyAiLeads`. O `Modal` ganhou `size` `xl` e `wide`, `leading`, `actions`, `toolbar`, `bare` e `dismissible`, e ignora Esc e Tab quando há `[role=alertdialog]` aberto. `useScrollLock` passou a ter contador (modais empilhados fecham em qualquer ordem). No celular, `lg`, `xl` e `wide` usam `height: 100%` do véu, não `100dvh`.

Verificação (feita pelo Antigravity, `agy -p`, com Playwright; eu conferi por amostragem): em 1280 e 390 px, claro e escuro, Esc, fundo, trava, sem rolagem lateral, botões de 44 px, contraste, zero erro de console. Achados corrigidos: texto secundário sobre `--surface-2` (4,32:1) com o token novo `--text-secondary-strong`; asterisco obrigatório no escuro; "Excluir" com 40 px no celular; abas de Odontograma, Faceograma e Corpograma com `--text-tertiary` e aba de sessão ativa branca sobre teal; detalhe da Agenda sem `aria-label` no X e com botões de 36 px; título da Ficha Clínica em `--brand-primary` (1,75:1), agora `--brand-text`. Rodada 3 de reverificação: tudo passou. Fora do alcance do login `video123`, sem verificação visual: admin, boas-vindas, onboarding, QR do WhatsApp, evento do Google Calendar e leads legados.

Pendências que esta etapa deixou: 54 usos de `color: var(--brand-primary)` como texto no app, vários provavelmente com contraste baixo sobre branco (varredura à parte, caso a caso: sobre fundo escuro o teal funciona); `<select>` nativos e data nativa nos formulários; foco preso e devolvido no `LeadDrawer`.

## Etapa 10: controles, contraste e login (2026-10-27, noite)

Feito: `<select>` nativos trocados por `SelectMenu` (agora com padrão combobox: teclado completo, `listbox`, grupos, desabilitado, placeholder, rótulo e variante `field`) e datas por `DatePicker` (com `min`, `max`, foco no calendário, setas entre dias e Esc que fecha só o calendário) ou `DateInput` mascarado na data de nascimento (calendário de mês em mês é ruim para quem nasceu há 40 anos). Ficam nativos de propósito só o tamanho da fonte do editor de documentos. `LeadDrawer` ganhou foco preso e devolvido (`useDialogFocus`). Contraste: tokens `--text-secondary` (`#52716F` no claro), `--text-secondary-strong` e `--brand-text`; texto terciário legível trocado nas telas; varredura de teal usado como texto. `moneyShort`, `axisMoney` e `statMoney` extraídos para `src/lib/ui/money.ts`, com teste. CSS sem uso removido por script conservador (79 regras, mais um arquivo morto). Barra lateral: sem a linha do plano, ícones novos `messages` e `wallet`, dica de nome no modo recolhido e aviso de período de teste.

**Login e "Teste grátis"** (desenho em `docs/superpowers/specs/2026-10-27-login-vidro-teal-design.md`): `/login` agora é branco com manchas de teal desfocadas, cartão de vidro e botão no teal da marca; o quiz e o cadastro saíram dela. Novo `/experimentar` (rota pública, `src/middleware.ts`): demonstração do dashboard com dados fictícios fixos (`src/components/demo/DemoApp.tsx`), desfocada, com o quiz e o cadastro num cartão de vidro por cima (`role=dialog`, não fecha por Esc, com "Já tenho conta"). A lógica toda continua em `src/app/login/AuthFlow.tsx` (`variant="login"` ou `"demo"`); links antigos `/login?quiz=true`, `?plan=` e `?mode=register` redirecionam para `/experimentar`. Concluído o cadastro, `doLogin` entra direto no sistema.

Verificação: o Antigravity fez 4 rodadas (todas as falhas achadas foram corrigidas); a cota dele acabou e a do login e da demonstração foi feita por mim no painel do navegador, em 1280 e 390 px (cartão com 16 px de gutter, sem rolagem lateral, botões de 44 px, foco dentro do diálogo, tema claro forçado). **Não testado de ponta a ponta:** o cadastro real e a entrada automática depois dele (criariam uma clínica de verdade; só foram verificados por leitura do código e `tsc`).

## Ordem, pontos de parada e esforço

1. Etapa 0, depois Etapa 1 (parada para aprovação).
2. Etapa 2, o Dashboard (parada para aprovação).
3. Etapas 3 a 7, em sequência, sem paradas obrigatórias, a não ser que algo fuja do desenho.
4. Esforço estimado, sem medir: Etapa 1 cerca de 1 dia; Dashboard cerca de 1 dia; Agenda 1 a 2 dias; Pacientes, Financeiro e Relatórios cerca de 1 dia cada; demais abas 1 a 2 dias.

## Fora do plano

- Imagem do bloco grande do Dashboard.
- Prontuário, login, cadastro e administração.
- Commit, push e deploy (só com pedido do Dimitre); teste no celular de verdade (Dimitre).
- Registro no vault ao fim de cada sessão que mudar algo relevante.
