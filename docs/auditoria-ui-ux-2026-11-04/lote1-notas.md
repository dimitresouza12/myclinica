# Lote 1 - fundação (notas para quem migra as telas)

Tudo aditivo: nenhum token ou classe existente foi removido. Única mudança em comportamento existente: `.danger` em `button.module.css` agora usa `var(--danger)` / `var(--danger-hover)` (mesmos valores de antes, #DC2626 / #B91C1C).

## Tokens (src/styles/design-system.css, em `:root`)

| Grupo | Tokens |
|---|---|
| Texto | `--fs-2xs` 11px, `--fs-xs` 12, `--fs-sm` 13, `--fs-md` 14, `--fs-base` 16, `--fs-lg` 20, `--fs-xl` 28 (todos em rem) |
| Peso | `--fw-regular` 400, `--fw-medium` 500, `--fw-semibold` 600 |
| Espaço (base 4px) | `--space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 20, `-6` 24, `-7` 32, `-8` 48 |
| Camadas | `--z-base` 0, `--z-sticky` 10, `--z-dropdown` 100, `--z-overlay` 900, `--z-modal` 1000, `--z-toast` 1100 |
| Largura | `--container-max` 1260px |
| Perigo | `--danger` #DC2626, `--danger-hover` #B91C1C, `--danger-text` (texto vermelho; claro #B91C1C, escuro #F87171), `--danger-soft` (fundo suave; muda no escuro) |
| Info | `--st-info` (claro #2563EB, escuro #60A5FA) |
| WhatsApp | `--whatsapp` #25D366 (só onde o elemento é do próprio WhatsApp) |

Substituição sugerida: `0.8125rem`->`var(--fs-sm)`, `0.875rem`->`var(--fs-md)`, `#DC2626`/`#EF4444`->`var(--danger)`, fundo de erro -> `var(--danger-soft)`, texto de erro -> `var(--danger-text)`.

## Foco global (src/app/globals.css)

Anel `2px solid var(--brand-accent)` (no escuro `--brand-primary`), offset 2px, para `a, button, summary, select, [role=button|tab|menuitem], [tabindex]` e checkbox/radio. Usa `:where()`, então qualquer `.classe:focus-visible` dos módulos continua vencendo. Campos de texto ficam de fora (já têm borda teal + halo no próprio módulo).

## Componentes (src/components/ui)

Todos aceitam `className`. Sem emoji; ícones via `Icon.tsx`.

- **Button** (`Button.tsx`, usa `button.module.css`; `forwardRef`, aceita todos os atributos de `<button>`)
  - `variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon'` (padrão `secondary`)
  - `icon?: IconName` - ícone antes do texto (único conteúdo na variante `icon`, que exige `aria-label`)
  - `loading?: boolean` - spinner, `aria-busy`, ignora cliques, mantém o visual (não vira cinza)
  - `fullWidth?: boolean`
  - `type` padrão `button`. 40px no desktop, 44px no mobile, raio 999px.
- **EmptyState** - `title: string`, `description?: ReactNode`, `icon?: IconName`, `action?: ReactNode`, `compact?: boolean`
- **Skeleton** - `width?` (padrão 100%), `height?` (16), `radius?` (8; `'50%'` para círculo), `style?`. Decorativo (`aria-hidden`): marque o contêiner com `aria-busy="true"`.
- **SkeletonLines** (mesmo arquivo) - `lines?` (3), `lineHeight?` (14), `shortLast?` (true)
- **Spinner** - `size?` (20), `label?` ("Carregando"), `decorative?` (false; true esconde do leitor de tela). Herda `currentColor`.
- **Badge** - `tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'` (padrão `neutral`), `dot?` (true), `children`. Fundo suave via `color-mix` do `--st-*`, texto sempre `--text-primary` (contraste), ponto colorido como o StatusDot.
- **ErrorNotice** (`role="alert"`) - `message: string`, `title?`, `onRetry?` (mostra o botão), `retryLabel?` ("Tentar novamente"), `retrying?`. No mobile o botão ocupa a largura toda (44px).
- **SearchInput** - controlado: `value: string`, `onChange: (value: string) => void` (já recebe o texto), `placeholder?` ("Buscar"), `label?` (nome acessível, padrão = placeholder), `hideClear?`; demais atributos de `<input>` passam direto. 40px desktop / 44px mobile, raio `--radius-field` (10px), botão de limpar embutido. Fundo `--surface-2`.

## Fora do lote

- Keyframes `fadeUp` duplicados nos módulos de página **não foram tocados**: em CSS Modules o nome é escopado ao arquivo, trocar pelo global exigiria `:global(fadeUp)` em cada `animation` e as distâncias diferem (8px vs 10px). Fica para o lote de migração de cada tela.
- Nenhuma tela foi migrada.

## Para o QA

Nenhuma tela usa os componentes ainda. Conferir só regressão: foco por teclado (Tab) em botões/links nas telas existentes não deve ter anel duplicado nem trocado onde já havia estilo próprio, e o botão de excluir (`btn.danger`) segue vermelho igual.
