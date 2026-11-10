# Fase 0 - Inventario de harmonia visual (somente leitura)

Data: 2026-11-04. Repo: `/Users/dimitre/Desktop/myclinica`. Nenhum codigo foi alterado.
Metodo: scripts de contagem sobre todos os `*.css` (comentarios removidos) e `*.tsx`, agrupados por aba. "Unidade" = CSS da pagina + CSS dos componentes que so aquela aba usa. Numeros sao de ocorrencias de declaracao, nao de elementos renderizados. Nada foi renderizado no navegador.

Caminhos abaixo relativos a `src/`.

---

## 1. Tokens existentes

Fonte: `styles/design-system.css` (176 linhas, importado por `app/globals.css:1`). `globals.css` (195 linhas) nao define tokens, so reset, `[data-hscroll]`, `.status-badge`, scrollbar e `.resp-table*`.

| Familia | Tokens | Observacao |
|---|---|---|
| Superficie (legado) | `--bg-primary/secondary/tertiary` (#FFF/#FFF/#FAFAFA), `--border-color`, `--border-subtle`, `--glass-bg`, `--glass-border` | `design-system.css:5-7,30-31,43-44` |
| Superficie (premium, 2026-10) | `--bg-page #F3F5F5`, `--surface`, `--surface-2`, `--surface-line`, `--surface-edge`, `--ink`, `--on-ink`, `--track` | `:76-84`. Dois vocabularios coexistem |
| Texto | `--text-primary/secondary/tertiary`, `--text-secondary-strong`, `--brand-text` | `:10-17` |
| Marca | `--brand-primary #4DD9C0`, `--brand-secondary #3CCCB4`, `--brand-accent #0B9B85`, `--brand-light`, `--brand-glow` | `:20-24` |
| Status | `--st-ok/wait/now/warn/bad/idle` | `:98-103`. So existe cor de ponto; nao ha par fundo/texto de badge |
| Avatar | `--av0..5-bg/fg` | `:93-98` |
| Sombras | `--shadow-sm/md/lg/xl`, `--card-shadow`, `--shadow-card` | sem token de foco/anel (`0 0 0 3px rgba(77,217,192,.15)` e literal em 8+4 lugares) |
| Raios | `--radius-xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 22`, `full`; premium: `--radius-card 22`, `--radius-inner 14`, `--radius-field 10` | dois vocabularios (sm/md/lg vs card/inner/field) |
| Sidebar | `--sidebar-*` (7) | so o layout usa |
| Tipografia | familia Plus Jakarta Sans no `body` (`:131-139`), `h1,h2` peso 600 com `letter-spacing -0.4px` | **NAO ha token de font-size, peso, line-height** |
| Espaco | **nenhum** | paddings/gaps sao literais (`18px`, `1.5rem`, `14px`...) |
| z-index | **nenhum** | 19 valores distintos: -2,-1,1,2,3,5,20,50,99,100,200,220,300,1000,1300,1400,9999,10000 |
| Animacao | `fadeUp`, `shimmer` globais (`design-system.css:~166-176`) | `fadeUp` e redefinido localmente em 14 modulos; `shimmer` global nao e usado por nenhuma aba (so `ui/FinancialDashboard.tsx:157`, rota demo) |
| Dark | `[data-theme="dark"]` redefine quase tudo (`:107-170`) | literais hex nao acompanham o tema |

### Totais do repo (todos os `*.css` de `src/`)

| Metrica | Valor |
|---|---|
| font-size distintos | 75 (56 em rem, 17 em px), 925 declaracoes |
| Mais usados | 0.78rem x118, 0.875rem x103, 0.8rem x67, 0.82rem x63, 0.72rem x56, 0.85rem x45, 0.9rem x40, 0.75rem x37, 0.8125rem x35, 0.7rem x32, 0.84rem x29 |
| border-radius distintos | 36; 610 declaracoes, so 110 (18%) usam `var(--radius-*)` |
| Mais usados | 50% x99, 10px x96, 999px x92, 12px x57, 8px x49, `var(--radius-md)` x49, 14px x22, `var(--radius-inner)` x22 |
| Cores literais (hex/rgb/hsl fora de var) | 334 distintas, 988 ocorrencias. Mais usadas: #fff x75, #4dd9c0 x61, #06312b x55, #077a69 x31, #0d2421 x26, #0b9b85 x23, #ef4444 x23, #dc2626 x23 |
| box-shadow literal | 70 ocorrencias, 54 distintas |
| keyframes `fadeUp` | 15 arquivos CSS |

Nota: `#ef4444` (23x) e `#dc2626` (23x) sao dois vermelhos de perigo diferentes; `button.module.css:35` usa `#DC2626`, `--st-bad` e `#DC2626`, `admin.module.css` e `configuracoes.module.css` usam `#EF4444/#FECACA/#FEF2F2` literais.

---

## 2. Metricas por aba

Colunas: fs = font-size distintos / declaracoes; raio = border-radius distintos; cor lit = cores hex/rgb literais fora de var (declaracoes); sombra lit = box-shadow literal; var = usos de `var(--)`; leg/prem = usos de token legado (`--bg-*`, `--border-color`, `--radius-sm/md/lg`, `--shadow-*`) vs premium (`--surface*`, `--radius-card/inner/field`, `--st-*`).

| Aba / unidade | CSS (linhas) | fs | raio | cor lit | sombra lit | var | leg/prem |
|---|---|---|---|---|---|---|---|
| dashboard | `app/(app)/dashboard/dashboard.module.css` (369) | 15/40 | 9 | 22 | 0 | 82 | 7/25 |
| agenda | `agenda.module.css` (1842) + 6 css de `components/agenda/` | 48/144 | 15 | 99 | 12 | 396 | 101/76 |
| pacientes | `pacientes.module.css` (189) + `PatientFormModal.module.css` | 6/10 | 4 | 3 | 0 | 51 | 1/31 |
| financeiro | `financeiro.module.css` (77) | 8/11 | 5 | 8 | 1 | 35 | 5/11 |
| mensagens | `components/mensagens/Inbox.module.css` (360) | 20/61 | 12 | 95 | 3 | 192 | 55/14 |
| crm | `components/crm/Crm.module.css` (523) + `LegacyAiLeads.module.css` | 26/67 | 7 | 41 | 0 | 173 | 62/9 |
| procedimentos | `procedimentos.module.css` (36) | 1/2 | 1 | 0 | 0 | 7 | 5/0 |
| estoque | `estoque.module.css` (41) | 3/6 | 1 | 0 | 0 | 13 | 0/3 |
| equipe | `equipe.module.css` (58) | 7/9 | 2 | 5 | 1 | 31 | 10/12 |
| configuracoes | `configuracoes.module.css` (419) + 5 css de `components/configuracoes/` | 21/107 | 13 | 110 | 4 | 202 | 60/37 |
| relatorios | `relatorios.module.css` (45) | 3/4 | 1 | 1 | 0 | 8 | 0/2 |
| comissoes | `comissoes.module.css` (73) | 9/16 | 5 | 7 | 1 | 36 | 5/14 |
| metas | `metas.module.css` (32) | 7/10 | 1 | 1 | 1 | 15 | 1/4 |
| campanhas | `campanhas.module.css` (156) | 12/27 | 7 | 24 | 4 | 42 | 22/0 |
| admin (superadmin) | `components/admin/admin.module.css` (265) | 13/56 | 9 | 46 | 1 | 113 | 63/1 |
| login (+experimentar) | `login.module.css` (849) + 4 css de `components/login/` | 32/88 | 15 | 238 | 12 | 45 | 0/6 |
| trial-expirado | `trial-expirado.module.css` (130) | 10/13 | 3 | 28 | 2 | 0 | 0/0 |
| prontuario (modal de pacientes) | 10 css em `components/prontuario/` (1894) | 23/132 | 18 | 72 | 11 | 390 | 173/32 |
| ui compartilhado | `components/ui/*.css` (842) | 28/50 | 13 | 41 | 11 | 217 | 34/66 |
| layout (sidebar/topbar) | `components/layout/*.css` (807) | 26/60 | 13 | 32 | 5 | 153 | 48/22 |

Leitura: o grupo "migrado para o padrao premium" e financeiro, pacientes, procedimentos, estoque, relatorios, comissoes, metas, equipe (CSS enxuto, 32-189 linhas, quase tudo vindo de `Card/StatCard/PageHeader/table/button`). O grupo "nao migrado" e agenda, mensagens, crm, configuracoes, campanhas, admin, prontuario, login, trial-expirado (CSS grande, muita cor literal, tokens legados). `procedimentos` e `estoque` tem 0 cores literais mas usam 0-5 tokens; `campanhas` tem 22 legados e 0 premium.

### 2a. font-size por aba (top valores, quantidade de ocorrencias)

| Aba | font-size (valor x vezes) |
|---|---|
| dashboard | 0.78rem x11, 0.8125rem x7, 0.875rem x4, 0.844rem x3, 1.625rem x2 (h1 `.hello`), 1.375rem x2, 2.5/2.75/2rem x1 (hero/valores), 0.68 e 0.83rem x1 |
| agenda | 48 valores distintos. 0.78rem x11, .875rem x8, 0.72rem x8, .82rem x7, .9rem x7, 0.84rem x6, 14px x5, 0.68rem x5 ... cauda: 9px, 12.5px, 0.58rem, 0.6rem, 0.62rem, 0.64rem, 0.65rem, .71rem, .855rem |
| pacientes | 0.78rem x3, 0.875rem x3, 0.82/0.88/0.76/0.84rem x1 |
| financeiro | 0.78rem x2, 0.875rem x2, 0.8125rem x2, 0.8/.78/.875/.72/.82rem |
| mensagens | **mistura px e rem**: 13px x11, 14px x6, 12px x6, 16px x4, 11px x2, 15px x2 + 0.78rem x6, 0.8rem x5, 1rem x3 ... |
| crm | 26 valores: 0.8rem x12, 0.78rem x5, 0.9rem x4, 0.72/0.7/0.75rem x4, 3rem x1, 1.75/1.6/1.55/1.35rem |
| procedimentos | .875rem x2 |
| estoque | .875rem x3, .78rem x2, .8125rem x1 |
| equipe | .78rem x3 (duas grafias), 0.875rem x3, 0.72/0.8/0.85rem |
| configuracoes | 0.82rem x17, 0.78rem x16, 0.85rem x14, 0.875rem x10, 1rem x7, 0.8rem x7 ... 21 valores |
| relatorios | 0.875rem x2, 0.78rem, 0.82rem |
| comissoes | .78rem x4, .875rem x4, .83rem x2, 2.25rem, .8125rem ... |
| metas | .78rem x3, .875rem x2, 3rem x1 |
| campanhas | .875rem x9, .82rem x4, .78rem x4, 1.6rem, 2.2rem, .775rem, .855rem ... |
| admin | 0.875rem x13, 0.72rem x12, 0.8rem x6, 0.78rem x6, 1.75rem, 1.6rem ... |
| login | 32 valores, inclui `clamp(2.1rem,4.2vw,3.25rem)`, 34px, 30px, 26px, 19px, 10.5px, 11.5px, 12.5px, 13.5px |
| trial-expirado | 0.9rem x2, 1.1rem x2, 0.8rem x2, 3rem, 1.4rem, 2.8rem ... |
| prontuario | 23 valores: 0.7rem x17, 0.78rem x15, 0.875rem x13, 0.85rem x9, 0.82rem x9, 0.58-0.68rem (8 valores) |

Escala observada de "texto pequeno" em uso simultaneo: 0.58, 0.6, 0.62, 0.64, 0.65, 0.66, 0.67, 0.68, 0.7, 0.71, 0.72, 0.74, 0.75, 0.76, 0.775, 0.78, 0.8, 0.8125, 0.82, 0.83, 0.84, 0.844, 0.85, 0.855, 0.86, 0.88 rem. Sao 26 passos entre 9px e 14px, sem regra.

### 2b. border-radius por aba

| Aba | raios (valor x vezes) |
|---|---|
| dashboard | 999px x5, 2px x3, 8px x3, card x2, 50% x2, 18px x2, 16/12/14px |
| agenda | 50% x19, 999px x18, 12px x18, 10px x17, 8px x9, 9px, 18px, 26px, 14px, 6px, 4px + tokens x3 |
| pacientes | `--radius-inner` x5, 50% x3, 4px, 999px |
| financeiro | 50% x2, inner x2, 10px x2, 999px, 8px |
| mensagens | 50% x12, 10px x9, 12px x8, 8px x6, 999px x5, 2px x3, 6/16/26/14/4px |
| crm | 999px x10, 10px x8, 12px x7, 50% x6, 16px x5, 14px x2, 6px |
| procedimentos | 10px x1 |
| estoque | 999px x2 |
| equipe | 10px x4, 50% |
| configuracoes | **10px x25**, 999px x13, 12px x7, 50% x6, inner x5, 8px, 16px x3 ... 13 valores |
| relatorios | 2px x2 |
| comissoes | 50% x2, 10px x2, inner, 999px, 6px |
| metas | `--radius-field` x1 |
| campanhas | 10px x7, 16px x2, 999px x2, 8px, 14px, 50% |
| admin | `--radius-md` x13, 999px x8, `--radius-lg` x5, `--radius-sm` x4, 4px x3, **99px x3** (999px com typo), 8px x2 |
| login | 14px x9, 50% x8, 12px x6, 9px x4, 999px x4, 8px x3, 24px x2 ... 15 valores |
| trial-expirado | 20px, 10px, 50% |
| prontuario | `--radius-md` x33, 50% x24, 999px x13, `--radius-lg` x10, 8px x9, 10px x8 ... 18 valores |

### 2c. Cores literais (fora de var)

| Aba | Distintas | Principais |
|---|---|---|
| login | 79 | #06312b x43, #077a69 x30, #fff x17, #3f5f5c x11, #d5e3e1 x8, #0f172a, #e2e8f0 (paleta propria, 2 verdes diferentes do `--brand-*`) |
| configuracoes | 44 | #fef2f2 x9, #4dd9c0 x8, #fecaca x7, #ef4444 x6, #065f46 x6, #059669 x5 |
| agenda | 40 | #4dd9c0 x18, #fff x11, #0b9b85 x10, #0d2421 x8, #3cccb4 x6, #065f46, #ef4444, #fef2f2 |
| mensagens | 75 | #06312b x7, #fff x4, #b91c1c x3, #fca5a5 x3, #0b6e60 e #3a5a91 (copias dos `--av*-fg`), #f2f2f2, #9db8e8 |
| crm | 39 | tokens locais declarados em `Crm.module.css:8-10` (`--st-novo #64748B`, `--st-conversa #3B82F6`, `--st-agendado #0EA5A0`, `--st-compareceu #22A06B`, `--st-perdido #E5484D`, `--good/--warn/--bad/--info` + bg) duplicando `--st-*` globais com outros valores |
| admin | 25 | #fff x7, #ef4444 x4, #d1fae5, #fee2e2, #0d9488 x3, #065f46, #ede9fe, #5eead4 (gradiente `#0D9488 -> #5EEAD4` no botao primario, `admin.module.css:143`) |
| dashboard | 17 | #78350f x3, #0b9b85, #4dd9c0, #fbbf24 x2 |
| campanhas | 14 | #4dd9c0 x5, #fff, #25d366 x2, #1a1a1a x2 |
| trial-expirado | 24 | gradiente escuro azul-petroleo (#02101a, #051826, #06202f, rgba(14,52,72,.7)); **zero** `var(--)` |
| prontuario | 42 | #fff x12, #059669, #fee2e2, #ef4444, #d97706, #dc2626 |
| financeiro/equipe/comissoes | 4-8 | #dc2626, #ef4444, #4dd9c0, rgba(220,38,38,.08), rgba(77,217,192,.15) |
| pacientes, relatorios, metas | 1-3 | #dc2626 / #0b9b85 / #fca5a5 |
| procedimentos, estoque | 0 | |

Literais em TSX (style inline): `components/ui/FinancialDashboard.tsx` 73 `style={{` e 68 hex (rota `/financial-demo`, fora do app logado), `app/(app)/configuracoes/page.tsx` 38 `style={{` + 9 hex + 24 `fontSize`, `components/admin/ClinicEditModal.tsx` 15, `components/prontuario/TabDocumentos.tsx` 34 hex, `TabOdontograma.tsx` 17 hex, `app/(app)/dashboard/page.tsx` 10 hex, `app/(app)/agenda/page.tsx` 9 hex / 11 inline, `app/(app)/campanhas/page.tsx` 3 inline (caixa de sucesso `#ECFDF5/#6EE7B7/#065F46` em `page.tsx:~213`, nao responde ao tema escuro).

### 2d. Sombras literais

| Onde | Exemplo |
|---|---|
| agenda (12) | `0 10px 26px -8px rgba(77,217,192,.65)`, `0 14px 30px -8px rgba(77,217,192,.7)`, anel `0 0 0 3.5px` |
| login (12) | `0 0 0 1px rgba(6,74,66,.07), 0 24px 60px rgba(6,74,66,.16)`, `0 10px 24px -10px rgba(7,122,105,.6)` |
| prontuario (11), ui (11), layout (5) | modais/popovers com sombra propria em vez de `--shadow-lg/xl` |
| configuracoes (4), campanhas (4) | anel de foco `0 0 0 3px rgba(77,217,192,.15)` copiado |
| anel de foco | `0 0 0 3px rgba(77,217,192,0.15)` x8 + `.15` x4 + `var(--brand-light)` x5 em 3 grafias; `modalForm.module.css` usa `var(--brand-light)` |

### 2e. Espacamento de pagina e cabecalho

Moldura comum: `app/(app)/app.module.css:25-26` `.main { padding: 0.5rem 2.25rem 2rem }` (mobile `0.5rem 1rem 1.5rem`, `:55`).

| Aba | Classe raiz | gap | max-width | animacao | Cabecalho |
|---|---|---|---|---|---|
| dashboard | `.page` `dashboard.module.css:1` | 18px + `padding-top:14px` | **1320px** | fadeUp local | sem PageHeader; `<h1 .hello>` dentro do cartao "hero" (`page.tsx:336`) |
| agenda | `.shell` `agenda.module.css:2` / `.page:28` | n/a (calendario) | **nenhum** (100%) | fadeUp x2 | PageHeader (`page.tsx:1561`) + barra propria `.tbLeft` |
| pacientes | `.page` `:1` | 18px | 1260px | fadeUp | PageHeader (`:136`) |
| financeiro | `.page` `:5` | 18px | 1260px | fadeUp (10px) | PageHeader (`:387`) |
| procedimentos | `.page` `:3` | 18px | 1260px | fadeUp (**8px, .3s ease**) | PageHeader (`:146`) |
| estoque | `.page` `:2` | 18px | 1260px | fadeUp | PageHeader (`:238`) |
| equipe | `.page` `:2` | 18px | 1260px | fadeUp | PageHeader (`:332`) |
| configuracoes | `.page` `:3` | 18px | **1080px** | fadeUp | PageHeader (`:768`) sem actions |
| relatorios | `.page` `:2` | 18px | 1260px | fadeUp | PageHeader (`:259`) |
| comissoes | `.page` `:2` | 18px | 1260px | fadeUp | PageHeader (`:248`) |
| metas | `.page` `:2` | 18px | 1260px | fadeUp | PageHeader (`:65`) |
| campanhas | `.page` `:3` | **1.5rem (24px)** | **nenhum** | fadeUp (8px, .3s ease) | **`PageTitle` solto + `.header` proprio** (`page.tsx:207-215`) |
| crm | `.root` `Crm.module.css:3` | **1rem (16px)** | **nenhum** | nenhuma | **`PageTitle` solto**, sem actions no cabecalho (`page.tsx:334`) |
| mensagens | `.root` `Inbox.module.css:3` | n/a | **tela cheia** (margem negativa `-0.5rem -2.25rem -2rem` anula a moldura) | nenhuma | `<PageTitle mobileOnly>` (`page.tsx:223`): so mobile |
| admin | `.adminPage` `admin.module.css:4` | **1.5rem** | **nenhum** | fadeUp | **`PageTitle` solto** + `.adminHeader` (`admin/page.tsx:77`) |
| login | card 400px (`calc(400px + 2.5rem)`) | n/a | n/a | n/a | layout proprio 2 colunas |
| trial-expirado | card 460px | n/a | n/a | n/a | layout proprio |

`PageHeader` (`components/ui/pageHeader.module.css:1`) soma `padding: 14px 0 22px` mais o `gap:18px` da pagina = ~40px entre titulo e primeiro bloco no desktop. Abas que usam `PageTitle` sem `PageHeader` (campanhas, crm, admin) ficam com 0 de padding-top/bottom do cabecalho: o titulo cola 0.5rem do topo da moldura e o conteudo comeca 16-24px abaixo, contra 14px+titulo+22px+18px nas demais. Isso e a divergencia de ritmo mais visivel entre abas.

### 2f. Larguras max-width de container (resumo)

1320px (dashboard) | 1260px (pacientes, financeiro, procedimentos, estoque, equipe, relatorios, comissoes, metas) | 1080px (configuracoes) | sem limite (agenda, crm, campanhas, admin) | full-bleed (mensagens) | 400/460px (login/trial). Modais: 440/520/680/960/1120px e `min(1560px,100%)` dentro de `components/ui/*.css` (varios).

---

## 3. Mapa aba x componente comum

X = importa diretamente (na pagina ou nos componentes exclusivos da aba). Fonte: leitura dos `import` em `page.tsx` e das pastas de componentes da aba.

| Aba | PageHeader | PageTitle solto | Modal | SelectMenu | PillTabs | StatCard | Card | table.module | button.module | Toast | ConfirmDialog | StatusDot | MoreMenu | modalForm | EmptyState |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dashboard | . | . | X | . | X | X | X | . | . | X | X | X | . | . | n/e |
| agenda | X | . | X | X | X | . | X | . | X | X | X | X | . | X | n/e |
| pacientes | X | . | X | X | X | X | X | X | X | . | . | X | X | X | n/e |
| financeiro | X | . | X | X | X | X | X | X | X | . | X | . | X | X | n/e |
| mensagens | . | X (mobileOnly) | . | . | . | . | . | . | . | X | X | . | . | . | n/e |
| crm | . | X | X | X | . | . | . | . | X (LegacyAiLeads) | X | X | . | . | . | n/e |
| procedimentos | X | . | X | . | . | X | X | X | X | . | X | X | X | X | n/e |
| estoque | X | . | X | X | X | X | X | X | X | . | X | X | X | X | n/e |
| equipe | X | . | X | X | . | X | X | X | X | X | X | X | X | X | n/e |
| configuracoes | X | . | X | X | . | . | . | . | X (parcial) | X | X | . | . | X | n/e |
| relatorios | X | . | . | . | X | X | X | X | X | . | . | X | . | . | n/e |
| comissoes | X | . | X | X | X | X | X | . | X | . | X | X | X | X | n/e |
| metas | X | . | . | . | . | X | X | . | X | . | . | . | . | . | n/e |
| campanhas | . | X | . | X | . | . | . | . | . | . | . | . | . | . | n/e |
| admin | . | X | X | X | . | . | . | . | X (parcial) | X | X | . | . | . | n/e |
| login | . | . | . | . | . | . | . | . | . | . | . | . | . | . | n/e |
| trial-expirado | . | . | . | . | . | . | . | . | . | . | . | . | . | . | n/e |

n/e = nao existe. Nao ha componente `EmptyState`, `Badge`, `Skeleton`, `Spinner`, `Input`/`Field` ou `FilterBar` em `components/ui/`. Os componentes que existem la: AreaTrendChart, Avatar, BarList, Card, ConfirmDialog, CredentialsConfirmModal, DatePicker, FinancialDashboard, Gauge, Icon, Modal, MonthPicker, MoreMenu, NumericInput, PageHeader, PasswordInput, PermissionGuard, PetIcon, PhoneInput, PillTabs, Portal, SelectMenu, Sparkline, StatCard, StatusDot, Toast.

Tabelas: so 6 abas usam `table.module.css` (pacientes, financeiro, procedimentos, estoque, equipe, relatorios) e a classe global `resp-table` (10 arquivos: essas 6 + 4 do admin). Tabelas proprias: `components/admin/admin.module.css` (`.richTable/.table`), `configuracoes.module.css` (`.permTable`, `.userRow`), `components/agenda/TeamSchedule.tsx`, `components/prontuario/TabOdontograma.tsx`. Comissoes usa cartoes (`.cardsGrid`), nao tabela.

Padroes recriados com CSS proprio (classe -> arquivo:linha):

| Padrao | Recriacoes |
|---|---|
| Botao primario | `button.module.css:26` (padrao: pilula 999px, 40px, `#0D2421` sobre teal). Divergentes: `agenda.module.css:195` (copia fiel), `agenda` `.btnPhoneSave` (10px/38px) e `.btnNextStep` (12px/44px), `configuracoes.module.css:45` `.btnSave` (44px, 0.9rem) e `.btnAddUser`, `WhatsAppTab.module.css:31`, `WhatsAppSettingsForm.module.css:53` (10px/44px), `Crm.module.css:52` (cor `#06312B`, peso 700), `Inbox.module.css:167` (`#06312B`), `admin.module.css:143` (**gradiente #0D9488->#5EEAD4, texto branco**, raio `--radius-md`), `campanhas.module.css:10` (`#4DD9C0`, raio 10px, hover sobe 1px) e `:124` `.btnSend` (**verde #25D366**), `login.module.css:148` (48px, raio 12px, 0.95rem/700), `trial-expirado` `.btnContact`, `TabFicha/TabOdontograma/TabFaceograma/TabCorpograma .btnSave` (raio `--radius-md`, hover `opacity .88`). Total: cerca de 16 implementacoes de "botao primario" |
| Botao perigoso | `button.module.css:35` (solido `#DC2626`); `PatientFormModal.module.css:77` `.btnDelete`; `configuracoes.module.css:133` `.btnDelete` (contorno `#FCA5A5`, pilula); `admin.module.css:150` `.btnDanger` (contorno `#FECACA`, raio sm); `Crm.module.css:54` (so texto, sem fundo); `WhatsAppTab.module.css:35` (solido `#DC2626`, hover por opacidade) |
| Input/campo | padrao `modalForm.module.css:2-15` (44px, `--radius-field`, anel `--brand-light`). Divergentes: `Crm.module.css` `.input` (10px, fundo `--bg-secondary`, anel `outline` 2px), `campanhas.module.css` `.input` (10px, `--bg-primary`, anel `rgba` literal, foco com cor literal), `configuracoes.module.css` `.field input` (usa `--radius-field`) **e** `.field select` logo abaixo com `10px` literal, `admin.module.css` `.fieldInput` (`--radius-md`, so muda a borda no foco), `login.module.css` `.field input` (48px, borda `#C9D9D7`, 12px), `agenda` `.phoneInput`/`.patientSearch` |
| Badge/status | padrao: `StatusDot` + `.status-badge` global (ponto + texto). Divergentes: `agenda` `badge_*` (6 variantes) e `.waChip`; `Inbox.module.css` `.badge`, `.tabCount`, `.fileBadge`; `Crm.module.css` `.tag/.tagInfo/.tagWarn/.tagGood/.tagBad` (caixa colorida + tokens locais); `admin.module.css` `.statusPill`, `.planPill`, `.typeChip`, `.paidBadge/.unpaidBadge`, `.superBadge`, `.alertSevBadge` + `components/admin/StatusBadge.tsx`; `campanhas` `.tagSent/.tagDraft`; `configuracoes` `.roleChip`, `.userBadges`, `.selfBadge`; `pacientes` `.petBadge` |
| Abas / filtro de secao | `PillTabs` (pilula cinza) em 7 abas. Divergentes: sublinhado em `Crm.module.css:39-43` (44px, 0.9rem, teal-text) e `Inbox.module.css:65-69` (40px, 13px, `--brand-accent`, gap 18px); caixa branca com borda em `admin.module.css:9` (`.tabNav`); navegacao lateral/faixa em `configuracoes.module.css:9`; `relatorios .tabs` usa PillTabs |
| Cabecalho de pagina | `PageHeader`. Recriado em `dashboard` (`.hello` 1.625rem), `campanhas` (`.header` + `.btnNew`), `admin` (`.adminHeader`), `crm` (sem acoes) |
| Filtros / busca | `agenda` `.filters/.profFilterBtn/.search`; `estoque` `.filters/.search`; `Inbox` `.search`; `Crm` `.search/.ownerFilter`; `admin` `.logsFilters/.tableToolbar/.searchInput/.dateFilter`; `financeiro` `.patientSearchBox`. Sem componente `FilterBar`/`SearchInput` |
| Overlay/modal | `Modal` compartilhado em 9 abas. Proprios: `Crm.module.css:127-128` `.drawerOverlay/.drawer` (z-index 1000, fundo `--bg-primary`, cor de overlay `rgba(13,36,33,.45)` vs `.36` do Modal), `login.module.css:394,478` `.termsOverlay/.registerOverlay`, `TabTimeline .lightboxOverlay`, `ProntuarioModal .avatarOverlay`, `TabDocumentos .downloadPopover` (z-index 1000) |

---

## 4. Padroes divergentes (detalhe)

### 4.1 Titulo de pagina (h1)

| Onde | Tamanho / peso | Arquivo:linha |
|---|---|---|
| PageTitle (padrao) desktop | 1.75rem / 600, `letter-spacing -0.6px` | `components/layout/PageTitle.module.css:3` |
| PageTitle mobile (vai para TopBar) | 1.25rem / 600 | `PageTitle.module.css:8` |
| Dashboard `.hello` | 1.625rem / 600 | `dashboard.module.css:54` (h1 em `page.tsx:336`) |
| Campanhas `.title` | 1.6rem / **800** (CSS morto: `page.tsx` usa PageTitle, `.title/.sub` em `campanhas.module.css:7-8` nao sao referenciados) | |
| Trial-expirado `.title` | 1.4rem | `trial-expirado.module.css:35` |
| Login headline | `clamp(2.1rem,4.2vw,3.25rem)` / 700 | `login.module.css:31` |
| FinancialDashboard (demo) | 22px / **900**, inline | `components/ui/FinancialDashboard.tsx:234` |
| Titulos de card (h2 `Card`) | 0.844rem / 500 | `components/ui/card.module.css:20` |
| Titulos internos CRM/drawer | 1.15rem / **800** | `Crm.module.css:132` |

O peso 800 aparece em CRM, campanhas (morto) e outros; o padrao e 600.

### 4.2 Estados vazio / loading / erro

| Aba | Loading | Vazio | Erro |
|---|---|---|---|
| dashboard | `aria-busy`, `.chartLoading` so reserva altura | `.empty` `:154` (28px 0 18px, centrado) | toast |
| agenda | texto "Carregando agenda..." / "Carregando calendario...", `.loadingWrap + .spinner` (unico spinner de pagina), `.calLoading` | `.listEmpty`, `.patientDropEmpty` | inline `.gcalErrorMsg`, `.waErr` + toast |
| pacientes | `.loading` texto "Carregando..." (`pacientes.module.css:20`, padding 2rem 22px) | `t.empty` (40px 16px) | sem toast e sem inline (0 chamadas a `showToast`) |
| financeiro | `.loading` texto (`financeiro.module.css:16`), `.chartLoading` 260px | `t.empty`, `.chartEmpty` 56px 0 | nenhum visivel |
| mensagens | "Carregando conversas/mensagens..." (grafia com reticencias unicode) | `.empty` (28px 18px, alinhado a esquerda, com link) | `.sendError`, `.mediaError` |
| crm | `.loading` (centrado, 0.9rem) | `.emptyBox/.emptyTitle/.emptyText/.emptyLink` (unico vazio com titulo e CTA) e `.colEmpty` | `.errorBox`, `.formErr`, `.fieldErr` |
| procedimentos / estoque / equipe | `.loading` (padding 2rem 22px, esquerda) | `t.empty` | toast (equipe) / nenhum |
| configuracoes | "Carregando..." x2 | `.docTemplateStatusEmpty` etc. | **`alert()` nativo** (`page.tsx:460,474`), `.pwError`, `.gcalError`, `.docTemplateError`, toast |
| relatorios | `.loading` **padding 4rem centrado** (`relatorios.module.css:13`) | `.cardEmpty` | nenhum |
| comissoes | `.loading` centrado 1.5rem 0 | `.empty` 2rem 1rem centrado | nenhum |
| metas | `.loading` sem padding | `.empty` 1.5rem 0 centrado | `.goalErrorMsg` |
| campanhas | `if (loading) return <p className={styles.loading}>` **antes** do layout (`page.tsx:203`): a pagina inteira some, sem titulo | `.emptyHistory` | `.error` + caixa de sucesso inline em `style={{}}` |
| admin | `.loading` centrado 2rem, `.chartLoading` 3rem centrado | `.empty` com `!important` | `.msgErr`, `.fieldError` |

Resumo: **0 skeletons** em todo o app (o `@keyframes shimmer` global existe e nao e usado). 14 variantes de `.loading` com paddings diferentes (2rem 22px, 2rem, 3rem, 4rem, 1.5rem 0, 0) e alinhamento misto (esquerda vs centro). 11 variantes de `.empty`. Cores de erro: `--st-bad`, `#dc2626`, `#ef4444`, `#b91c1c`, `var(--bad)`.

### 4.3 Ordem filtros x acao principal (PageHeader `actions`)

PageHeader pede "primario por ultimo" (`PageHeader.tsx` comentario). Campanhas/CRM/Admin nao usam `actions`; em campanhas o botao esta numa `.header` propria alinhada em `flex-start` (PageHeader alinha em `flex-end`). Em agenda, o CTA esta em `.headerCta` dentro da barra `.tbLeft`, com filtros `profFilters*` em outra linha. Dashboard nao tem acao principal no cabecalho (so o botao "ocultar valores"). Mensagens: sem cabecalho no desktop.

### 4.4 Outros padroes que divergem

- Fundo da pagina: mensagens usa `background: var(--bg-primary)` e `--chat-bg: var(--bg-tertiary)` (legado), demais abas usam `--bg-page` + `Card` `--surface`.
- Raio de cartao: `Card` 22px; `.resp-table tr` mobile 18px literal (`globals.css`); agenda `border-radius: 18px/26px`; login 24px/20px; trial 20px.
- Verde de WhatsApp: `#25D366` em campanhas (`:127`), agenda (`:613`), admin (`:244,260`) e `LegacyAiLeads.module.css:326` (`agenda.module.css:613` `.btnWhatsApp`), sem token.
- `status-badge` global (`globals.css`) vs `StatusDot` componente vs badges de caixa colorida: tres linguagens para o mesmo conceito.
- Emoji na UI (regra proibida): `app/trial-expirado/page.tsx:42` renderiza o glifo de relogio; `app/(app)/campanhas/page.tsx:36-40` tem emojis nos textos-modelo de mensagem exibidos no textarea (conteudo enviado ao paciente, nao chrome, mas visivel na tela); tambem `lib/actionAlerts.ts:34-35` e `components/admin/AdminClinicas.tsx:24`/`ClinicEditModal.tsx:43` (texto de WhatsApp). Nao foram achados glifos de UI tipo X/check/lixeira em `.tsx` (a migracao para `Icon` da auditoria de julho parece concluida).
- Dark mode: abas com muito hex literal (login, trial-expirado, campanhas inline, admin gradiente) nao respondem ao `[data-theme="dark"]`.

---

## 5. Cruzamento com as duas auditorias anteriores

Docs: `docs/auditoria-ux-mobile-desktop-2026-07-06.md` (achados A1, A2, M1-M5, B1-B4) e `docs/qa-mobile-checklist-2026-08-07.md` (log noturno + 168 linhas de checklist ainda com status vazio, so 3 marcadas como aprovadas e 4 como falha).

| ID (jul) | Tema | Estado hoje (verificado no codigo) |
|---|---|---|
| A1 | Alvos de toque de acoes de tabela | **Corrigido** segundo o log de 08-07 (33 correcoes de min-height 44px, incl. `.btnClose`, tabs, SelectMenu, MonthPicker, DatePicker); nao reverificado em tela nesta fase |
| A2 | Tabelas viram cartoes no mobile | **Corrigido na maior parte**: `.resp-table*` em `globals.css`, usado em 10 arquivos. **Aberto**: `configuracoes` (permTable/lista de usuarios), `TeamSchedule.tsx`, `TabOdontograma.tsx`, comissoes (cartoes proprios) |
| M1 | `:focus-visible` global | **Parcial**: 102 ocorrencias espalhadas por modulo, **nenhum bloco global** em `globals.css`; elementos que nao tem a regra propria continuam sem anel (ex.: botoes de `campanhas`, `trial-expirado`, boa parte de `admin`) |
| M2 | Botoes fechar/mini-inputs < 44px | **Corrigido** (log 04:35: `.btnClose` 44px nos 3 modais restantes) |
| M3 | TopBar mobile sem titulo | **Corrigido**: `PageTitle` portal para `#topbar-title-slot` (`components/layout/PageTitle.tsx`) |
| M4 | Emoji como icone | **Quase fechado**: restam emoji em `trial-expirado/page.tsx:42` e nos textos-modelo de campanhas |
| M5 | `aria-label` vs `title=` | **Aberto**: hoje 145 linhas com `aria-label` e 184 com `title=` em `.tsx` (era 7 vs 49 em 08-07; a varredura dedicada nunca foi feita, o log a descreve como "fora de escopo") |
| B1 | max-width do conteudo | **Parcial**: 1260/1320/1080 por pagina (8 abas), mas agenda, crm, campanhas, admin sem limite e sem token compartilhado |
| B2 | Login com alvos 40-42px | **Corrigido** (log 00:00) |
| B3 | `max-width:100vw` | **Aberto**: `globals.css:11` ainda tem `html, body { max-width: 100vw }` |
| B4 | `fadeUp` com transform cria containing-block | **Mitigado, nao resolvido**: usam `backwards` em vez de `both` (comentario em `dashboard.module.css`/`pacientes.module.css`), mas a animacao com `transform` segue em 14 modulos, redefinida localmente em vez de usar o `@keyframes` global |

Itens do checklist de 08-07 que seguem abertos e relevantes para esta auditoria: Onda 4 (CRM e Campanhas) "opcional" e nunca executada; a varredura REG-M5; a tabela de checklist inteira sem marcacao (168 linhas vazias); bug P0 de banco para Fono/TO (`create_clinic_member`/`update_clinic_member`) registrado como "aguardando aprovacao" (nao e UI; confirmar estado no banco antes de qualquer fase que mexa em Equipe). Nenhum dos dois documentos tratou harmonia visual entre abas (tokens, tipografia, componente unico): eles so cobrem acessibilidade e mobile.

---

## 6. As 10 maiores divergencias (ordem de impacto visual)

1. **Cabecalho de pagina em 4 formatos.** PageHeader (10 abas), `PageTitle` solto sem padding (campanhas, crm, admin), hero com h1 dentro do cartao (dashboard), nenhum no desktop (mensagens). Distancia titulo->conteudo varia de ~16px a ~40px.
2. **Botao primario implementado ~16 vezes** (pilula 40px vs 44px vs 48px; raio 999/12/10/`--radius-md`; texto `#0D2421` vs `#06312B` vs branco; admin com gradiente; campanhas com verde WhatsApp).
3. **Tres vocabularios de superficie/raio convivendo**: legado (`--bg-*`, `--radius-sm/md/lg`), premium (`--surface*`, `--radius-card/inner/field`) e literais. Agenda 101 legado vs 76 premium; CRM 62 vs 9; admin 63 vs 1; campanhas 22 vs 0; prontuario 173 vs 32.
4. **Tipografia sem escala**: 75 font-sizes distintos, 26 passos entre 0.58rem e 0.88rem; mensagens e login misturam px e rem; nao ha token de tamanho/peso.
5. **Raios arbitrarios**: 36 valores; so 18% via token; `10px` (96x) e `12px` (57x) literais competem com `--radius-field`(10) e `--radius-md`(12); admin tem `99px` por typo.
6. **Navegacao por abas em 5 estilos** (PillTabs, sublinhado CRM, sublinhado Mensagens, caixa branca no Admin, nav lateral em Configuracoes).
7. **Larguras de container**: 1320 / 1260 / 1080 / sem limite / full-bleed; sem token; campanhas, crm, admin esticam em monitor largo.
8. **Estados de carregamento/vazio/erro sem componente**: 0 skeletons, 14 `.loading` e 11 `.empty` distintos, `alert()` nativo em Configuracoes (`page.tsx:460,474`), campanhas troca a pagina inteira por um `<p>` durante o load, financeiro/pacientes/relatorios/comissoes sem feedback de erro.
9. **Status/badge em 3 linguagens** (ponto+texto global, caixa colorida em CRM/admin/campanhas/configuracoes, chips de agenda/mensagens) e CRM redefine `--st-*` com valores proprios (`Crm.module.css:8-10`) diferentes dos globais.
10. **Paginas de borda fora do sistema**: login (238 cores literais, paleta `#06312B/#077a69`, 32 font-sizes, 0 premium) e trial-expirado (0 `var(--)`, fundo escuro fixo, emoji, sem tema) nao compartilham nada com o app; `experimentar` reutiliza `AuthFlow`, entao herda a divergencia.

Menores: cor de perigo duplicada (`#DC2626` vs `#EF4444`), anel de foco em 3 grafias, `fadeUp` local x14, `z-index` sem escala (19 valores), sombras literais (54 distintas), verde WhatsApp sem token.

---

## 7. Nao confirmado nesta fase

- Nada foi renderizado: contagens de CSS nao dizem o tamanho final computado nem quais regras perdem na cascata.
- A contagem de "usa componente" e por `import` em arquivos da aba; um componente importado mas condicional (ex.: modais por perfil) conta como X.
- `title=` x `aria-label`: contagem por linha com `rg`, pode incluir props `title` de componentes (ex.: `Card title=`), entao o numero de `title=` de atributo HTML e menor que 184.
- Estado real do bug P0 Fono/TO no banco (nao consultado; fora do escopo de UI).
- Rotas `financial-demo` e `DemoApp` (`components/demo/DemoApp.tsx`) foram vistas so de passagem; `FinancialDashboard.tsx` e orfao do app logado.
- Aba "prontuario" nao e rota; foi medida como modal de Pacientes.
