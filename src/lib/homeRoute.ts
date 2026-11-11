// Rota inicial do usuário: o primeiro módulo permitido, na mesma ordem do menu lateral.
// Quem não tem Dashboard (ex.: recepção só com Agenda e Pacientes) não deve cair em "Acesso restrito".

interface HomeCandidate { path: string; module: string; plusOnly?: boolean }

// Ordem do menu (AppSidebar). Mensagens usa o módulo crm; Contratos usa prontuario.
const HOME_ORDER: HomeCandidate[] = [
  { path: '/dashboard',     module: 'dashboard' },
  { path: '/agenda',        module: 'agenda' },
  { path: '/pacientes',     module: 'pacientes' },
  { path: '/mensagens',     module: 'crm' },
  { path: '/financeiro',    module: 'financeiro' },
  { path: '/comissoes',     module: 'comissoes' },
  { path: '/metas',         module: 'metas' },
  { path: '/relatorios',    module: 'relatorios' },
  { path: '/procedimentos', module: 'procedimentos' },
  { path: '/contratos',     module: 'prontuario' },
  { path: '/estoque',       module: 'estoque' },
  { path: '/equipe',        module: 'equipe' },
  { path: '/crm',           module: 'crm' },
  { path: '/campanhas',     module: 'campanhas', plusOnly: true },
  { path: '/configuracoes', module: 'configuracoes' },
]

export const DEFAULT_HOME_ROUTE = '/dashboard'

/**
 * Primeira rota que o usuário pode ver. Admin vai ao dashboard. Sem nenhum módulo liberado,
 * devolve o dashboard (a tela mostra o aviso de acesso restrito).
 */
export function firstAllowedRoute(
  permissions: Record<string, { can_view?: boolean } | undefined>,
  opts: { isAdmin?: boolean; isPlus?: boolean } = {},
): string {
  if (opts.isAdmin) return DEFAULT_HOME_ROUTE
  const hit = HOME_ORDER.find(c => {
    if (c.plusOnly && !opts.isPlus) return false
    return permissions[c.module]?.can_view === true
  })
  return hit?.path ?? DEFAULT_HOME_ROUTE
}
