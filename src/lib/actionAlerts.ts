import { waMeNumber } from '@/lib/phoneFormat'
import type { DashboardAlert, DashboardAlertReason } from '@/hooks/useClinicData'
import type { IconName } from '@/components/ui/Icon'

// "Ações necessárias": o que o Dashboard e a barra de cima mostram como pendência da clínica.

export const ALERT_META: Record<DashboardAlertReason, { label: string; icon: IconName; color: string }> = {
  faltou:        { label: 'Faltou',       icon: 'alert',    color: '#EF4444' },
  sem_retorno:   { label: 'Sem retorno',  icon: 'calendar', color: '#F59E0B' },
  aniversario:   { label: 'Aniversário',  icon: 'cake',     color: '#8B5CF6' },
  estoque_baixo: { label: 'Estoque baixo', icon: 'stock',   color: '#F59E0B' },
  pediu_remarcacao: { label: 'Pediu para remarcar', icon: 'swap', color: '#D97706' },
  respondeu:     { label: 'Respondeu',    icon: 'mail',     color: '#2563EB' },
  whatsapp_pausado: { label: 'WhatsApp pausado', icon: 'pause', color: '#DC2626' },
  escala_pendente: { label: 'Escala por definir', icon: 'calendar', color: '#D97706' },
}

/** Pendências da clínica (não de um paciente): em vez de "Responder", levam à tela certa. */
export const SYSTEM_ALERT_LINK: Partial<Record<DashboardAlertReason, { href: string; label: string }>> = {
  estoque_baixo: { href: '/estoque', label: 'Ver estoque' },
  whatsapp_pausado: { href: '/configuracoes?tab=whatsapp', label: 'Ver WhatsApp' },
  escala_pendente: { href: '/agenda?escala=1', label: 'Abrir escala' },
}

export function buildWaLink(phone: string, message: string): string {
  return `https://wa.me/${waMeNumber(phone)}?text=${encodeURIComponent(message)}`
}

export function alertMessage(reason: DashboardAlertReason, name: string, clinicName: string): string {
  const first = name.split(' ')[0]
  if (reason === 'pediu_remarcacao') return `Olá ${first}! Recebemos seu pedido para remarcar a consulta na ${clinicName}. Qual dia e horário ficam melhores para você?`
  if (reason === 'respondeu') return `Olá ${first}! Vimos sua mensagem sobre a consulta na ${clinicName}. Como podemos ajudar?`
  if (reason === 'faltou') return `Olá ${first}! Notamos que você não conseguiu comparecer à sua última consulta na ${clinicName}. Vamos reagendar? 😊`
  if (reason === 'aniversario') return `Olá ${first}! 🎉 A equipe da ${clinicName} deseja um Feliz Aniversário! Se quiser aproveitar para marcar sua próxima consulta, é só chamar por aqui.`
  return `Olá ${first}! Faz um tempo desde seu último atendimento na ${clinicName}. Que tal agendarmos seu retorno? 😊`
}

/** Soma o aviso de estoque baixo (vem de outra consulta) à lista de pendências. */
export function withLowStockAlert(alerts: DashboardAlert[], lowStockCount: number): DashboardAlert[] {
  if (lowStockCount <= 0) return [...alerts]
  return [...alerts, {
    patientId: 'estoque',
    name: `${lowStockCount} ${lowStockCount === 1 ? 'item' : 'itens'} abaixo do estoque mínimo`,
    phone: null,
    date: new Date().toISOString(),
    reason: 'estoque_baixo',
  }]
}

/** Soma o lembrete de escala (profissionais com dia por definir) à lista de pendências. */
export function withScheduleAlert(alerts: DashboardAlert[], reminder: { professionals: number; days: number } | null): DashboardAlert[] {
  if (!reminder) return [...alerts]
  return [...alerts, {
    patientId: 'escala',
    name: `Escala: ${reminder.days} ${reminder.days === 1 ? 'dia' : 'dias'} por definir`,
    phone: null,
    date: new Date().toISOString(),
    reason: 'escala_pendente',
  }]
}

// ── Linhas do painel: uma por paciente, agrupadas por tipo ──────────────────

/** Ordem dos grupos: primeiro o que está esperando resposta da clínica, por último a rotina. */
export const GROUP_ORDER: DashboardAlertReason[] = ['whatsapp_pausado', 'respondeu', 'pediu_remarcacao', 'faltou', 'escala_pendente', 'aniversario', 'sem_retorno', 'estoque_baixo']

/** O que não pode esperar: alguém está aguardando resposta da clínica, ou o envio automático parou. */
export const URGENT_REASONS: ReadonlySet<DashboardAlertReason> = new Set<DashboardAlertReason>(['respondeu', 'pediu_remarcacao', 'whatsapp_pausado'])

export const countUrgent = (rows: { reason: DashboardAlertReason }[]) => rows.filter(r => URGENT_REASONS.has(r.reason)).length

export const GROUP_TITLE: Record<DashboardAlertReason, string> = {
  whatsapp_pausado: 'WhatsApp',
  respondeu: 'Responderam',
  pediu_remarcacao: 'Pediram para remarcar',
  faltou: 'Faltaram',
  aniversario: 'Aniversariantes de hoje',
  sem_retorno: 'Sem retorno',
  estoque_baixo: 'Estoque',
  escala_pendente: 'Escala',
}

/** Texto do botão principal quando há telefone: diz o que a mensagem vai fazer. */
export const PRIMARY_LABEL: Partial<Record<DashboardAlertReason, string>> = {
  respondeu: 'Responder',
  pediu_remarcacao: 'Responder',
  faltou: 'Reagendar',
  sem_retorno: 'Chamar',
  aniversario: 'Parabenizar',
}

export interface AlertRow {
  key: string
  reason: DashboardAlertReason
  patientId: string
  name: string
  phone: string | null
  /** a data que importa (a última falta, a consulta mais próxima) */
  date: string
  /** quantas ocorrências foram juntadas nesta linha */
  count: number
  /** frase de contexto: "Faltou há 11 dias" */
  context: string
  /** identifica esta ocorrência: se mudar, uma pendência já resolvida volta a aparecer */
  sig: string
}

export interface AlertGroup { reason: DashboardAlertReason; title: string; rows: AlertRow[] }

const dayNumber = (d: Date) => Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000)

/** Dias de `date` até `now` (positivo = passado, negativo = futuro), pelo calendário local */
export function daysAgo(date: string, now: number): number {
  return dayNumber(new Date(now)) - dayNumber(new Date(date))
}

function pastPhrase(days: number): string {
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days >= 60) return `há ${Math.round(days / 30)} meses`
  return `há ${days} dias`
}

function futurePhrase(days: number): string {
  const ahead = -days
  if (ahead <= 0) return 'hoje'
  if (ahead === 1) return 'amanhã'
  return `em ${ahead} dias`
}

function contextOf(reason: DashboardAlertReason, date: string, count: number, now: number): string {
  const d = daysAgo(date, now)
  switch (reason) {
    case 'faltou': return count > 1 ? `Faltou ${count} vezes, a última ${pastPhrase(d)}` : `Faltou ${pastPhrase(d)}`
    case 'sem_retorno': return `Última consulta ${pastPhrase(d)}`
    case 'aniversario': return 'Faz aniversário hoje'
    case 'respondeu': return `Respondeu à confirmação, consulta ${futurePhrase(d)}`
    case 'pediu_remarcacao': return `Pediu para remarcar a consulta de ${futurePhrase(d)}`
    case 'escala_pendente': return 'Nos próximos dias, há profissional sem escala definida'
    default: return ''
  }
}

/** Junta as ocorrências do mesmo paciente e tipo numa linha só (3 faltas viram "Faltou 3 vezes"). */
export function buildAlertRows(alerts: DashboardAlert[], now: number): AlertRow[] {
  const byKey = new Map<string, { a: DashboardAlert; count: number; date: string }>()
  for (const a of alerts) {
    const key = alertKeyOf(a)
    const cur = byKey.get(key)
    if (!cur) { byKey.set(key, { a, count: 1, date: a.date }); continue }
    cur.count += 1
    // falta e sem retorno: vale a mais recente; resposta e remarcação: a consulta mais próxima
    const keepLatest = a.reason === 'faltou' || a.reason === 'sem_retorno'
    if (keepLatest ? a.date > cur.date : a.date < cur.date) cur.date = a.date
  }
  return [...byKey.entries()].map(([key, { a, count, date }]) => ({
    key,
    reason: a.reason,
    patientId: a.patientId,
    name: a.name,
    phone: a.phone,
    date,
    count,
    context: contextOf(a.reason, date, count, now),
    // o aviso de estoque nasce com a data de agora: o que o identifica é o texto ("2 itens abaixo...")
    sig: a.reason === 'estoque_baixo' || a.reason === 'escala_pendente' ? a.name : date,
  }))
}

/** Grupos na ordem de prioridade; dentro de cada um, o mais urgente primeiro. */
export function groupAlertRows(rows: AlertRow[]): AlertGroup[] {
  return GROUP_ORDER.flatMap(reason => {
    const list = rows.filter(r => r.reason === reason)
    if (list.length === 0) return []
    list.sort((x, y) => {
      if (reason === 'faltou') return y.date.localeCompare(x.date)            // faltou há menos tempo primeiro
      if (reason === 'sem_retorno') return x.date.localeCompare(y.date)       // sumido há mais tempo primeiro
      if (reason === 'respondeu' || reason === 'pediu_remarcacao') return x.date.localeCompare(y.date) // consulta mais próxima
      return x.name.localeCompare(y.name, 'pt-BR')
    })
    return [{ reason, title: GROUP_TITLE[reason], rows: list }]
  })
}

// ── Pendências resolvidas ou adiadas ─────────────────────────────────────────
// Ficam guardadas neste navegador, por clínica.
// "Já resolvi" some até a próxima ocorrência (outra falta, outra consulta); "Adiar" some por 7 dias.

const SNOOZE_DAYS = 7
const RESOLVED_KEEP_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000
const IGNORE_EVENT = 'myclinica-alerts-ignored'
export const ignoredStorageKey = (clinicId: string) => `myclinica-alerts-ignored:${clinicId}`

export type DismissKind = 'resolved' | 'snoozed'
export interface Dismissal { kind: DismissKind; at: number; sig: string }
export type DismissedMap = Record<string, Dismissal>

export function alertKeyOf(a: Pick<DashboardAlert, 'reason' | 'patientId'>): string {
  return `${a.reason}-${a.patientId}`
}

/** Lê o texto guardado, descarta o que já venceu e aceita o formato antigo (só a hora, tratado como adiado). */
export function parseDismissed(raw: string | null, now: number): DismissedMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, number | Dismissal>
    const out: DismissedMap = {}
    for (const [key, v] of Object.entries(parsed)) {
      const d: Dismissal | null = typeof v === 'number'
        ? { kind: 'snoozed', at: v, sig: '' }
        : v && typeof v === 'object' && typeof v.at === 'number' && (v.kind === 'resolved' || v.kind === 'snoozed')
          ? { kind: v.kind, at: v.at, sig: String(v.sig ?? '') }
          : null
      if (!d) continue
      const keep = d.kind === 'snoozed' ? SNOOZE_DAYS : RESOLVED_KEEP_DAYS
      if (d.at > now - keep * DAY_MS) out[key] = d
    }
    return out
  } catch { return {} }
}

/** A linha fica escondida? Resolvida: enquanto for a mesma ocorrência. Adiada: até vencer os 7 dias. */
export function isDismissed(d: Dismissal | undefined, row: Pick<AlertRow, 'sig'>): boolean {
  if (!d) return false
  return d.kind === 'snoozed' || d.sig === row.sig
}

/** Para useSyncExternalStore: avisa quando a lista muda (nesta aba ou em outra). */
export function subscribeIgnoredAlerts(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(IGNORE_EVENT, onChange)
  return () => { window.removeEventListener('storage', onChange); window.removeEventListener(IGNORE_EVENT, onChange) }
}

export function dismissAlert(clinicId: string, row: Pick<AlertRow, 'key' | 'sig'>, kind: DismissKind, current: DismissedMap, now = Date.now()) {
  const next: DismissedMap = { ...current, [row.key]: { kind, at: now, sig: row.sig } }
  try { window.localStorage.setItem(ignoredStorageKey(clinicId), JSON.stringify(next)) } catch { /* sem armazenamento: vale só até recarregar */ }
  window.dispatchEvent(new Event(IGNORE_EVENT))
}
