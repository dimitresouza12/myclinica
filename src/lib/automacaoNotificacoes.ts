// Avisos da automação para a recepção (tabela automacao_notificacoes): o sino, o aviso no canto da tela e "Ações necessárias".
// Aqui ficam só as regras puras (sem React nem rede), para o hook e os testes usarem a mesma lógica.

export type AutomacaoTipo = 'confirmou' | 'pediu_remarcar' | 'nao_entendi' | 'sem_resposta'
export const AUTOMACAO_TIPOS: readonly AutomacaoTipo[] = ['confirmou', 'pediu_remarcar', 'nao_entendi', 'sem_resposta']

export interface AutomacaoNotificacao {
  id: string
  clinic_id: string
  tipo: AutomacaoTipo
  titulo: string
  corpo: string | null
  link: string | null
  appointment_id: string | null
  criada_em: string
  lida_em: string | null
}

export const NOTIFICACOES_COLUNAS = 'id, clinic_id, tipo, titulo, corpo, link, appointment_id, criada_em, lida_em'
/** Quantas não lidas o sino carrega (as mais recentes). */
export const NOTIFICACOES_LIMITE = 50

export interface NotificacoesEstado {
  /** false enquanto a migration 20261139 não foi aplicada: o sino e o aviso na tela seguem como antes, sem erro */
  available: boolean
  items: AutomacaoNotificacao[]
}

export const NOTIFICACOES_VAZIAS: NotificacoesEstado = { available: false, items: [] }

interface ErroLike { code?: string | null; message?: string | null }

/** A tabela ainda não existe (Postgres 42P01) ou o PostgREST não a conhece (PGRST205): não é falha, é migration pendente. */
export function isTabelaAusente(error: ErroLike | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  // alguns caminhos (proxy, versão antiga do PostgREST) devolvem só a mensagem
  return /automacao_notificacoes/.test(error.message ?? '') && /(does not exist|schema cache)/i.test(error.message ?? '')
}

/** Aceita só linha bem formada (o Realtime entrega o registro inteiro, mas nunca confiar no formato). */
export function parseNotificacao(raw: unknown): AutomacaoNotificacao | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.clinic_id !== 'string') return null
  if (typeof r.tipo !== 'string' || !(AUTOMACAO_TIPOS as readonly string[]).includes(r.tipo)) return null
  if (typeof r.titulo !== 'string' || typeof r.criada_em !== 'string') return null
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return {
    id: r.id,
    clinic_id: r.clinic_id,
    tipo: r.tipo as AutomacaoTipo,
    titulo: r.titulo,
    corpo: str(r.corpo),
    link: str(r.link),
    appointment_id: str(r.appointment_id),
    criada_em: r.criada_em,
    lida_em: str(r.lida_em),
  }
}

const byRecentes = (a: AutomacaoNotificacao, b: AutomacaoNotificacao) => b.criada_em.localeCompare(a.criada_em)

/**
 * Lê as não lidas. Tabela ausente vira `available: false` (sem lançar); qualquer outro erro é lançado
 * (quem chama decide: o sino ignora em silêncio e tenta de novo depois).
 */
export async function carregarNaoLidas(
  buscar: () => PromiseLike<{ data: unknown; error: ErroLike | null }>,
): Promise<NotificacoesEstado> {
  const { data, error } = await buscar()
  if (error) {
    if (isTabelaAusente(error)) return NOTIFICACOES_VAZIAS
    throw new Error(error.message ?? 'Falha ao ler os avisos da automação.')
  }
  const items = (Array.isArray(data) ? data : [])
    .map(parseNotificacao)
    .filter((n): n is AutomacaoNotificacao => !!n && !n.lida_em)
    .sort(byRecentes)
  return { available: true, items }
}

export interface EventoNotificacao { tipo: 'INSERT' | 'UPDATE'; novo: unknown }

/**
 * Aplica um evento do Realtime à lista de não lidas.
 * `vistas` guarda os ids que a tela já conhece (os do carregamento e os já avisados): `nova` só vem preenchida
 * para um INSERT não lido que ainda não estava lá, então recarregar a página ou receber o mesmo evento duas vezes
 * nunca repete o aviso. Altera `vistas` de propósito.
 */
export function aplicarEvento(
  items: AutomacaoNotificacao[],
  vistas: Set<string>,
  evento: EventoNotificacao,
  clinicId: string,
): { items: AutomacaoNotificacao[]; nova: AutomacaoNotificacao | null } {
  const n = parseNotificacao(evento.novo)
  if (!n || n.clinic_id !== clinicId) return { items, nova: null }
  if (n.lida_em) return { items: items.filter(i => i.id !== n.id), nova: null }
  const jaVista = vistas.has(n.id)
  vistas.add(n.id)
  const next = [n, ...items.filter(i => i.id !== n.id)].sort(byRecentes).slice(0, NOTIFICACOES_LIMITE)
  return { items: next, nova: evento.tipo === 'INSERT' && !jaVista ? n : null }
}

/** Trava do aviso no canto da tela: no máximo `max` ao mesmo tempo (cada um dura `ttlMs`). O resto continua só no sino. */
export function createToastGate(max: number, ttlMs: number) {
  let shown: number[] = []
  return {
    tryShow(now: number): boolean {
      shown = shown.filter(t => now - t < ttlMs)
      if (shown.length >= max) return false
      shown.push(now)
      return true
    },
  }
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias". */
export function tempoRelativo(iso: string, now: number): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, now - t)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  return `há ${d} dias`
}

/** Destino do aviso: só caminho interno do próprio sistema; sem link válido, abre a consulta (ou a Agenda). */
export function linkDoAviso(n: Pick<AutomacaoNotificacao, 'link' | 'appointment_id'>): string {
  const l = n.link?.trim()
  if (l && l.startsWith('/') && !l.startsWith('//') && !l.includes('\\')) return l
  return n.appointment_id ? `/agenda?consulta=${encodeURIComponent(n.appointment_id)}` : '/agenda'
}

/** Texto do aviso no canto da tela: a frase pronta já diz quem e quando; sem ela, o título. */
export function textoDoAviso(n: Pick<AutomacaoNotificacao, 'titulo' | 'corpo'>): string {
  return n.corpo || n.titulo
}

/** Quem vê os avisos: o módulo Agenda (admin vê tudo; superadmin não tem clínica própria). Mesma regra da RLS da tabela. */
export function podeVerAvisosAutomacao(
  user: { role: string; isSuperAdmin?: boolean } | null | undefined,
  permissions: Record<string, { can_view: boolean } | undefined>,
  loaded: boolean,
): boolean {
  if (!user || user.isSuperAdmin) return false
  return user.role === 'admin' || (loaded && !!permissions['agenda']?.can_view)
}
