# Visual premium nas abas do app (desenho)

Data: 2026-10-26. Status: direção aprovada pelo Dimitre a partir das maquetes do Dashboard, Pacientes, Agenda, Financeiro e Relatórios. Sem código escrito.

Maquetes de referência (fora do repo, na área temporária da sessão): `mock/dashboard-cards.html` e `mock/telas.html` (`?p=pacientes|agenda|financeiro|relatorios`, `&t=dark`).

## Objetivo

Tirar a cara genérica do app inteiro e chegar a um visual premium, mantendo a fonte (Plus Jakarta Sans) e as cores (teal da marca; modo escuro preto) do MyClinica. A aba Mensagens já passou por isso (ver `2026-10-26-mensagens-visual-premium-design.md`) e serve de referência de tom.

## Decisões do Dimitre

| Pergunta | Resposta |
|---|---|
| Referência visual | Painel "CityCare" que ele trouxe: cartões, mini gráficos e o gráfico de área. |
| Fonte e cores | As do MyClinica: Plus Jakarta Sans e teal; escuro em preto, sem verde nas superfícies. |
| Imagem de fundo do bloco grande do Dashboard | Fica para depois. O espaço fica pronto, sem imagem. |
| Abas | Todas, começando pelo Dashboard. |

## Diagnóstico (o que deixa genérico hoje)

1. Peso pesado em tudo: 186 usos de 700 e 49 de 800.
2. Rótulos em caixa alta espaçada (indicadores e cabeçalhos de tabela).
3. Cartões com faixa colorida à esquerda e barra de destaque ao lado de títulos.
4. Fundo da página e cartões da mesma cor, com borda e sombra: só caixas empilhadas.
5. Botões sólidos competindo ("− Despesa" vermelho ao lado de "+ Receita" verde) e "+" digitado no texto.
6. Três botões coloridos repetidos em cada linha de tabela; linhas de 69 px.
7. Valores alinhados à esquerda, coloridos, sem algarismos tabulares.
8. Gráficos no padrão do Recharts (degradê e despesa em vermelho).
9. Raios de borda espalhados (6, 8, 9, 10, 12, 14, 16, 999 px).
10. Seletores nativos e estados vazios sem acabamento.
11. Nenhum componente compartilhado de cartão, indicador, lista ou gráfico: cada aba repete o próprio CSS.

## Desenho

### Base (vale para todas as abas)

- **Fundo e superfícies:** fundo da página levemente tingido (claro `#F3F5F5`; escuro `#000000`). Cartões brancos (escuro `#111111`) com raio de 22 px, sem borda no claro, sombra quase invisível; no escuro, borda de 1 px muito escura e sem sombra.
- **Tipografia:** Plus Jakarta Sans. Números grandes em peso 300 com algarismos tabulares e espaçamento negativo. Títulos de página 28 px peso 600. Títulos de cartão 13,5 px peso 500. Texto 14 px. Pesos permitidos: 300, 400, 500, 600 (700 só no logo). Carregar o peso 300 da fonte.
- **Rótulos:** em frase normal. Nada de caixa alta espaçada.
- **Escala de raios:** 999 (pílulas), 22 (cartões), 14 (linhas em destaque, blocos internos), 10 (campos, botões quadrados), 6 (detalhes).
- **Botões:** pílula de 40 px. Um primário por tela, no teal. Secundários brancos com borda fina. Vermelho só em confirmação de exclusão. Ícone no lugar do "+" digitado.
- **Seletor de período e filtros:** pílulas; a opção ativa em fundo escuro (`--ink`), com contador ao lado quando houver.
- **Status:** ponto colorido com texto. Substitui as pílulas preenchidas e a classe global `status-badge` (que tem borda lateral colorida).
- **Variação:** pílula escura pequena ao lado do número ("+12%"); variação ruim em pílula vermelha suave.
- **Menu "⋯"** no canto dos cartões que têm ações.

### Componentes compartilhados (novos, em `src/components/ui/`)

| Componente | O que é |
|---|---|
| `Card` | Superfície padrão com título opcional, ação à direita e menu "⋯". |
| `StatCard` | Indicador: título, número grande, pílula de variação, linha de apoio e `Sparkline` opcional. |
| `Sparkline` | Curva suave em SVG puro com ponto vazado no início e ponto teal no fim. Sem Recharts. |
| `Gauge` | Medidor em meia-lua com degradê teal e ponto no fim. SVG puro. |
| `PillTabs` | Seletor em pílula (período, filtros, abas de relatório), com contador opcional. Acessível como grupo de botões com `aria-pressed`. |
| `StatusDot` | Ponto com texto; tons `ok`, `wait`, `now`, `warn`, `bad`. |
| `PageHeader` | Título, linha de contexto e área de ações. |
| `AreaTrendChart` | Recharts: área em degradê teal, série de comparação tracejada, ponto destacado com etiqueta escura e faixa hachurada. Mesma API para Dashboard, Financeiro e Relatórios. |
| `table.module.css` | Estilo único de lista: linhas de 60 px, cabeçalho em frase normal, números à direita, linha em destaque ao passar o mouse com atalhos e "⋯". Continua usando `resp-table` no celular. |

### Por aba

- **Dashboard:** bloco grande à esquerda (saudação; medidores de meta do mês e de confirmação da semana; próximo atendimento com "Abrir"; comparecimento dos últimos 7 dias com as barras finas). À direita, quatro `StatCard` (pacientes ativos, consultas hoje, receita do mês, ticket médio) e o gráfico "Receita por dia" com a semana passada tracejada. Embaixo, agenda de hoje e caixa de hoje.
- **Agenda:** cabeçalho com `PillTabs` (Dia, Semana, Mês) e botão primário. Coluna esquerda com mini calendário (pontos nos dias com consulta), profissionais com caixa de seleção e o resumo de hoje. Grade com blocos arredondados por status e linha da hora atual. Seletor nativo de status trocado pelo `SelectMenu` do projeto.
- **Pacientes (lista):** quatro `StatCard` (ativos, com consulta marcada, sem retorno há 90 dias, saldo a receber), filtros em pílula, lista com avatar de cor por pessoa, procedimento principal, próxima e última consulta, saldo à direita e ações no "⋯" e ao passar o mouse.
- **Financeiro:** `StatCard` de receitas, despesas, lucro e a receber; `AreaTrendChart` de 12 meses (despesa tracejada em cinza); receitas por categoria em barras finas; lista com seta de receita ou despesa e despesa em vermelho só no valor. "Despesa" vira botão secundário.
- **Relatórios:** abas em `PillTabs`, `StatCard` no topo, `AreaTrendChart` de receita e lucro, ranking de procedimentos em barras finas, tabela mensal com a margem em barra.
- **Procedimentos, Estoque, Equipe, Comissões, Metas, Configurações:** mesmos padrões (cabeçalho, indicadores quando fizer sentido, lista em cartão, status em ponto).

### Fora de escopo

- Imagem de fundo do bloco grande do Dashboard (decisão adiada).
- Prontuário do paciente, telas de login, cadastro e administração (podem vir depois).
- Mensagens e CRM, que já foram redesenhadas; só conferir que convivem com a nova base.
- Novas funções de negócio além dos números listados abaixo.

## Dados novos

| Número | De onde vem | Situação |
|---|---|---|
| Comparecimento (7 dias) | `appointments`: concluídas contra faltas no período | Calculável hoje |
| Confirmação da semana | `appointments` da semana: confirmadas contra agendadas | Calculável hoje |
| Próximo atendimento | `appointments` de hoje, o primeiro ainda não iniciado | Calculável hoje |
| Sem retorno há 90 dias | Já existe no alerta `sem_retorno` de `useClinicData` | Reaproveitar |
| Receita por dia e semana anterior | `financial_records` por dia | Nova consulta |
| Séries dos mini gráficos | Contagens diárias dos últimos 7 dias | Novas consultas leves |
| Ranking de procedimentos | `financial_records` agrupado por `procedure_id` | Calculável hoje |
| Ocupação da agenda | Precisa de horário de atendimento, que o sistema não guarda | **Trocado** por "Confirmação da semana" |

## Riscos

- A Agenda tem 1.741 linhas e 1.225 de CSS: mudar a grade pode quebrar arrastar, bloqueios e o celular. Fazer em passos pequenos, com verificação a cada um.
- Trocar o fundo global e a classe `status-badge` mexe em todas as telas de uma vez: verificar todas, inclusive as que não estão no escopo (CRM, Mensagens, prontuário, admin).
- Peso 300 em fundo claro precisa de contraste: usar `--text` cheio nos números, nunca cinza.
- Regras do projeto: sem emoji na interface; nunca `touch-action: pan-x/pan-y` amplo; `data-hscroll` só onde há rolagem real.
- Consultas novas no Dashboard: agrupar para não multiplicar as idas ao banco.

## Critérios de aceite

1. Nenhum rótulo em caixa alta espaçada, nenhuma faixa colorida lateral em cartão, nenhum peso 800 nas abas do escopo.
2. Componentes compartilhados usados em todas as abas do escopo; CSS repetido removido das páginas.
3. Um botão primário por tela; nenhum botão vermelho sólido fora de confirmação de exclusão.
4. Status sempre em ponto com texto; números de valor alinhados à direita com algarismos tabulares.
5. Claro e escuro conferidos em 1440, 1024 e 390 px; sem rolagem horizontal; alvos de toque de 44 px no celular.
6. `tsc`, `eslint` (sem erro novo) e `vitest` limpos; testes para as funções puras novas (séries, comparecimento, confirmação, curva suave).
7. Telas fora do escopo sem regressão visual grave.
