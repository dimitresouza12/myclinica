// Navegação do prontuário como página (/pacientes/[id]): rota, aba na URL e o estado da lista de pacientes
// que precisa sobreviver à ida e volta. Lógica pura (testada em navigation.test.ts).

export type ProntuarioTab =
  | 'ficha' | 'odontograma' | 'faceograma' | 'corpograma' | 'metas' | 'nutri' | 'vet' | 'comparador'
  | 'timeline' | 'documentos' | 'chat' | 'conversas'

/**
 * Aba "Chat IA" do prontuário. Depende do n8n (list_messages_by_phone) e foi substituída pela aba Conversas;
 * fica escondida, mas o código (TabChatIA) é mantido para consulta de histórico antigo do bot.
 * Com false a aba não é listada nem renderizada, e ?aba=chat cai na aba padrão.
 */
export const CHAT_IA_ATIVO = false

/** Rota do prontuário de um paciente. `aba` abre direto numa seção (?aba=odontograma). */
export function patientHref(id: string, aba?: string | null): string {
  const base = `/pacientes/${encodeURIComponent(id)}`
  return aba && aba !== 'ficha' ? `${base}?aba=${encodeURIComponent(aba)}` : base
}

/** Aba pedida na URL, desde que exista para esta clínica; senão cai na Ficha. */
export function resolveTab(raw: string | null | undefined, available: readonly string[]): ProntuarioTab {
  if (raw && available.includes(raw)) return raw as ProntuarioTab
  return 'ficha'
}

/** URL da página com a aba trocada, preservando o resto da query e o hash. A Ficha é a aba padrão e não vai na URL. */
export function withTab(pathname: string, search: string, hash: string, tab: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (tab === 'ficha') params.delete('aba')
  else params.set('aba', tab)
  const qs = params.toString()
  return `${pathname}${qs ? `?${qs}` : ''}${hash}`
}

// ── Estado da lista de pacientes ────────────────────────────────

export const PATIENT_FILTERS = ['todos', 'agendados', 'sem_retorno', 'com_saldo'] as const
export type StoredPatientFilter = (typeof PATIENT_FILTERS)[number]

export const LIST_STATE_KEY = 'myclinica:pacientes:lista'

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

function defaultStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}

/** Guarda o filtro da lista ao abrir um prontuário, para o "Voltar" cair na mesma lista. Nunca lança. */
export function saveListState(filter: string, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  try { storage.setItem(LIST_STATE_KEY, JSON.stringify({ filter })) } catch { /* sem armazenamento: a lista abre no padrão */ }
}

/** Filtro guardado da lista, ou null se não há nada válido. Nunca lança. */
export function loadListFilter(storage: StorageLike | null = defaultStorage()): StoredPatientFilter | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(LIST_STATE_KEY)
    if (!raw) return null
    const f = (JSON.parse(raw) as { filter?: unknown } | null)?.filter
    return typeof f === 'string' && (PATIENT_FILTERS as readonly string[]).includes(f) ? (f as StoredPatientFilter) : null
  } catch { return null }
}
