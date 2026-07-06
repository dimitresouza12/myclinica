# Auditoria UX/UI + QA — Mobile e Desktop
**Data:** 2026-07-06 · **Escopo:** app MyClinica (painel logado) · **Nada foi alterado — este é o plano.**

## Metodologia
- **Auditoria de código** dos arquivos de layout e todos os `*.module.css` (shell, sidebar, topbar, páginas, modais).
- **Teste ao vivo (Playwright)** na única superfície acessível sem login — a página `/login` — em 390×844 (mobile) e 1440×900 (desktop). As telas internas exigem autenticação de superadmin, então foram auditadas por código, não renderizadas.
- Critérios: WCAG (contraste, foco, alvos de toque), Apple HIG / Material (44px, safe-area) e as prioridades do guia interno de UX.

---

## 1. Pontos Fortes (o que já está muito bom)

O app já tem uma base mobile **acima da média**. Concretamente:

1. **Viewport correto e acessível** — `layout.tsx` define `width=device-width, initial-scale=1` e **não** trava o zoom (`maximumScale` omitido de propósito). Pinch-zoom preservado.
2. **Sem zoom automático no iOS** — `globals.css` força `input, select, textarea { font-size: 16px }` em telas ≤768px. Evita o zoom irritante do Safari ao focar campo.
3. **Modais viram tela cheia no mobile** — em ≤600px os modais passam a `100dvh`, `border-radius:0` e respeitam `env(safe-area-inset-*)` (notch / barra de gestos). Padrão nativo correto.
4. **Sidebar off-canvas com backdrop** — no mobile vira gaveta (`transform:translateX(-100%)` → `0`), largura `min(280px, 80vw)`, backdrop com blur, e os itens de nav sobem para `min-height:44px`. Fecha ao navegar (`onMobileClose`).
5. **Zero overflow horizontal** — confirmado ao vivo (`scrollWidth == innerWidth`, 0px) em mobile e desktop. Garantido por `html,body{max-width:100vw}`, `.main{overflow-x:hidden}` e `overscroll-behavior-x:contain`.
6. **Modais ancorados na viewport** — o fix `<Portal>` (tarefa anterior) já resolveu o bug do modal fora da tela.
7. **Cards do dashboard reflowam** — de `auto-fill/minmax(230px)` no desktop para `repeat(2,1fr)` no mobile, com valores abreviados (`valueMobile`).
8. **Formulários corretos** — labels visíveis (não placeholder-only), inputs de modal com `min-height:44px` e `:focus` com anel teal, `env(safe-area)` nos rodapés.
9. **Números tabulares** — `font-variant-numeric:tabular-nums` em rankings/estatísticas evita "pulo" de layout.
10. **Estado ativo de navegação** — item atual destacado com barra teal + peso da fonte.

---

## 2. Problemas Identificados (por gravidade)

> Nota sobre a escala: nenhum bug **impede totalmente** o uso — o app funciona. Classifiquei como **Alta** o que gera **erro do usuário / perda de dado** (o critério "risco de cliques errados" do seu brief), mesmo que contornável.

### 🔴 ALTA

**A1 — Alvos de toque das ações de tabela pequenos e colados (risco de toque errado, inclusive em excluir).**
As ações mais usadas (✎ editar / 🗑 excluir uma linha) são pequenas e ficam grudadas:
- `pacientes.module.css` → `.btnAction { padding:.3rem .7rem }` (~28px de altura) e `.actions { gap:.375rem }` (**6px** entre botões).
- `financeiro.module.css` → `.btnEdit/.btnDelete { padding:.3rem .55rem }` e `.rowActions { gap:.4rem }`.
- Mesmo padrão em estoque, procedimentos e admin.
No celular, dois alvos de ~28px separados por 6px, um deles **destrutivo (excluir)**, é o cenário clássico de exclusão acidental. Mínimos recomendados: **44×44px** e **≥8px** de espaçamento.

**A2 — Tabelas não reflowam no mobile: viram scroll horizontal apertado, sem pista visual.**
Todas as tabelas (`pacientes`, `financeiro`, `estoque`, `relatorios`, `admin`) usam só `.tableWrap { overflow-x:auto }`. Numa tela de 390px, uma tabela de 5–8 colunas fica num trilho lateral: o usuário nunca vê a linha inteira, precisa arrastar, e **não há indicação de que há mais colunas à direita** (sem sombra/fade de borda). Como consultar paciente/financeiro no celular é caso de uso central, isso é fricção alta.

### 🟠 MÉDIA

**M1 — Nenhum `:focus-visible` no app inteiro (0 ocorrências).**
Inputs têm `:focus`, mas **botões, links e itens de nav não têm indicador de foco**. Quem navega por teclado (acessibilidade + power users no desktop) não vê onde está. É item CRÍTICO de WCAG.

**M2 — Botões de fechar e mini-inputs abaixo de 44px.**
`.btnClose` dos modais é **30×30px** no desktop (financeiro, agenda); só `pacientes` corrige para 44 no mobile. Na agenda, `.phoneInput`/`.btnPhoneSave` ficam em `38px`. Abaixo do mínimo de toque.

**M3 — TopBar mobile sem contexto de página.**
No mobile a TopBar mostra só o hambúrguer + logo da clínica. Com a sidebar escondida, **não há título indicando em que tela o usuário está**, e toda navegação exige abrir a gaveta (não há bottom-nav). O usuário perde orientação numa leitura vertical rápida.

**M4 — Ícones em emoji (📲 ✕ ⚠ …) em ~24 arquivos.**
O projeto já tem um componente `<Icon>` SVG consistente, mas vários lugares usam emoji como ícone. Isso quebra a consistência visual (renderização varia por SO) e é lido de forma estranha por leitores de tela (`✕` → "sinal de multiplicação").

**M5 — Botões icon-only dependem de `title` em vez de `aria-label`.**
`logoutBtn`, `btnClose` e as ações de linha se apoiam em `title=`. O `<TopBar>` (menu) já usa `aria-label` corretamente — o resto deveria seguir o mesmo padrão para nome acessível confiável.

### 🟡 BAIXA

**B1 — Sem `max-width` no conteúdo (`.main`).** Em monitores largos (≥1440/2560px) tabelas e formulários esticam por toda a largura → linhas longas demais e sensação "esparsa". (É o inverso de "espaços vazios": aqui o conteúdo estica demais.)

**B2 — Login com alvos de 40–42px.** Ao vivo: botão "Entrar" e inputs medem 40–42px (2–4px abaixo de 44); "Esqueci minha senha" tem 15px de altura; créditos do rodapé são minúsculos. Baixa frequência, impacto pequeno.

**B3 — `max-width:100vw` pode gerar leve barra horizontal no desktop** (100vw inclui a largura do scrollbar). Cosmético.

**B4 — Causa-raiz do containing-block ainda viva (contexto).** As animações `fadeUp/slideUp` (que animam `transform`) nos 10+ wrappers de página seguem criando containing-block. Hoje está mitigado nos modais via `<Portal>`; qualquer novo `position:fixed` dentro de página animada repetiria o bug do modal. Ver `docs/plano-admin-modal-contato-2026-07-06.md`.

---

## 3. Plano de Implementação (faseado)

Estimativas são de esforço relativo. Cada fase é independente e commitável sozinha.

### Fase 1 — Toque e segurança (resolve A1, M2) · ~pequeno
1. **Ações de tabela como área de toque de 44px.** Nas `*.module.css` de pacientes/financeiro/estoque/procedimentos/admin: `.btnAction / .btnEdit / .btnDelete` com `min-width:44px; min-height:44px; display:inline-flex; align-items:center; justify-content:center;` e `.actions / .rowActions { gap:.5rem }` (≥8px). Manter o visual compacto no desktop via `@media (max-width:768px)` só quando necessário (ou aplicar 44px em ambos, que é o mais seguro).
2. **Separar visualmente o "excluir".** Dar ao botão de exclusão cor semântica de perigo já no repouso (não só no hover) e mais respiro do "editar", reduzindo toque acidental. (Confirmação de exclusão já existe — manter.)
3. **`.btnClose` 44×44 no mobile** em todos os modais (financeiro, agenda), replicando o override que `pacientes` já tem. Subir `.phoneInput/.btnPhoneSave` da agenda para 44px.

### Fase 2 — Tabelas no mobile (resolve A2) · ~médio
Escolher **uma** abordagem por tabela:
- **(Recomendado) Reflow para cartões em ≤600px** nas tabelas centrais (pacientes, financeiro): esconder `thead` e transformar cada `tr` em cartão empilhado com `label: valor` (padrão "responsive table" com `data-label` nos `td`). Zero scroll lateral, leitura vertical natural.
- **(Mínimo) Affordance de scroll:** onde manter a tabela rolável, adicionar sombra/fade na borda direita indicando "há mais colunas" e reduzir padding das células no mobile. Barato, mas mantém o trilho lateral.

### Fase 3 — Acessibilidade (resolve M1, M5) · ~pequeno
1. **`:focus-visible` global** em `globals.css`: um único bloco para `a, button, [role="button"], input, select, textarea` com anel teal (`box-shadow: 0 0 0 3px rgba(77,217,192,.4)`) — resolve o app inteiro de uma vez.
2. **`aria-label` nos botões icon-only** (`logoutBtn`, `btnClose`, ações de linha), mantendo `title` para tooltip.

### Fase 4 — Orientação no mobile (resolve M3) · ~médio
- Mostrar o **título da página atual** na TopBar do mobile (derivar do `pathname` ou receber via prop). Melhora barata de orientação.
- **Opcional (maior):** bottom-nav com os 4–5 destinos mais usados (Dashboard, Pacientes, Agenda, Financeiro) para navegação de um toque, mantendo a gaveta para o resto. Avaliar se vale — a gaveta já funciona.

### Fase 5 — Polimento desktop + consistência (resolve B1, M4) · ~médio
1. **`max-width` no conteúdo** (ex.: `.main > *` ou um wrapper com `max-width: ~1440px; margin-inline:auto`) para segurar o comprimento de linha em telas largas. Validar que não "descentraliza" telas específicas (agenda calendário).
2. **Migrar emoji → `<Icon>` SVG** gradualmente, começando pelos ícones funcionais (fechar, avisos, ações). Emojis podem ficar só onde são decorativos/de marketing (cards de promoção).

### Fase 6 — Hardening opcional (B3, B4) · ~pequeno
- Trocar `max-width:100vw` por `overflow-x:clip` no `html,body` (evita a barra fantasma).
- Converter as animações de página `fadeUp/slideUp` para **só `opacity`** (sem `transform`), eliminando o containing-block na origem. Muda levemente a entrada visual (perde o slide) — decisão de produto.

---

## 4. Verificação (quando for implementar)
Como as telas internas exigem login, a verificação ao vivo depende de uma sessão autenticada no navegador do usuário. Sugestão de roteiro por fase:
1. **Playwright autenticado** (ou verificação manual guiada) em 390px: medir que `.btnAction/.btnEdit/.btnDelete` ≥ 44px e `gap` ≥ 8px.
2. Tabela de pacientes/financeiro em 390px: confirmar reflow em cartões (ou affordance de scroll) sem overflow horizontal.
3. Navegação por teclado (Tab) em desktop: anel de foco visível em nav, botões e links.
4. `tsc --noEmit` limpo a cada fase.

---

## Resumo executivo
A base mobile é sólida (viewport, 16px, modais full-screen, gaveta, sem overflow). Os ganhos de maior impacto, em ordem: **(1)** aumentar e afastar os botões de editar/excluir das tabelas para evitar toque errado em ação destrutiva; **(2)** fazer as tabelas centrais reflowarem em cartões no celular; **(3)** um bloco global de `:focus-visible` para teclado. Tudo o resto é polimento incremental.
