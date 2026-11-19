// Impressão da Agenda: período, áreas, folhas, linhas e resumo. Funções puras, no fuso local do navegador,
// para testar sem tela nem banco. A tela (components/agenda/AgendaPrint.tsx) só desenha o que sai daqui.
import type { Appointment, Professional } from '@/types'
import { addDays, localDayKey } from '@/lib/dashboard/metrics'
import { formatBrPhone } from '@/lib/phoneFormat'
import { petLabel } from '@/lib/pacientes/pet'
import { dayStatus, freeSlotsOfDay, type ScheduleData } from './availability'
import { SLOT_MINUTES, MAX_APPT_MS, isClinicBlock } from './slots'
import { rangeFor } from './view'

export type PrintPeriod = 'dia' | 'semana' | 'mes' | 'custom'
export type PrintGrouping = 'folha' | 'lista'

/** O que aparece na folha (os interruptores de "Mostrar"). */
export interface PrintShow {
  phone: boolean
  convenio: boolean
  notes: boolean
  /** horários livres e bloqueios */
  free: boolean
  /** cancelados e faltas */
  canceled: boolean
  /** coluna "Chegou" com a caixinha para marcar à mão */
  arrival: boolean
  summary: boolean
}

export const DEFAULT_SHOW: PrintShow = { phone: true, convenio: true, notes: true, free: true, canceled: false, arrival: true, summary: true }

/** Mais que isso numa impressão só vira uma pilha de papel: o período personalizado para aqui. */
export const MAX_CUSTOM_DAYS = 93

export type PrintProf = Pick<Professional, 'id' | 'name' | 'specialty_type'>

const DAY_MS = 86400000
const pad = (n: number) => String(n).padStart(2, '0')
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// ── Período ──────────────────────────────────────────────────

/** "AAAA-MM-DD" → data local, ou null se não for uma data real. */
export function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null
}

export type PeriodResult = { ok: true; start: Date; end: Date; days: number } | { ok: false; error: string }

/**
 * Período a imprimir: [início, fim) com o fim exclusivo, como `rangeFor`.
 * Dia, Semana e Mês saem do dia em foco; o personalizado vem das duas datas (a final entra inteira).
 */
export function resolvePeriod(period: PrintPeriod, focus: Date, from: string, to: string): PeriodResult {
  if (period !== 'custom') {
    const { start, end } = rangeFor(period, focus)
    return { ok: true, start, end, days: Math.round((end.getTime() - start.getTime()) / DAY_MS) }
  }
  const a = parseDayKey(from)
  const b = parseDayKey(to)
  if (!a || !b) return { ok: false, error: 'Informe a data inicial e a data final.' }
  if (b.getTime() < a.getTime()) return { ok: false, error: 'A data final precisa ser igual ou depois da inicial.' }
  const end = addDays(b, 1)
  const days = Math.round((end.getTime() - a.getTime()) / DAY_MS)
  if (days > MAX_CUSTOM_DAYS) return { ok: false, error: `Escolha no máximo ${MAX_CUSTOM_DAYS} dias (cerca de 3 meses) por impressão.` }
  return { ok: true, start: a, end, days }
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

export const dateBr = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`

/** "quarta-feira, 18/11/2026" */
export const dayTitle = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${dateBr(d)}`

/** "Agenda de quarta-feira, 18/11/2026" ou "Agenda de 15/11/2026 a 21/11/2026". */
export function periodTitle(start: Date, end: Date): string {
  const last = addDays(end, -1)
  return start.getTime() === last.getTime()
    ? `Agenda de ${dayTitle(start)}`
    : `Agenda de ${dateBr(start)} a ${dateBr(last)}`
}

// ── Áreas e profissionais ────────────────────────────────────

export const AREA_LABELS: Record<string, string> = {
  medico: 'Medicina',
  odonto: 'Odontologia',
  nutri: 'Nutrição',
  fisio: 'Fisioterapia',
  psico: 'Psicologia',
  fono: 'Fonoaudiologia',
  to: 'Terapia ocupacional',
  estetica: 'Estética',
  vet: 'Veterinária',
}
const AREA_ORDER = Object.keys(AREA_LABELS)

/** Áreas que existem na clínica (pelo `specialty_type` dos profissionais), na ordem fixa da lista. */
export function areasOf(profs: PrintProf[]): { value: string; label: string }[] {
  const present = new Set(profs.map(p => p.specialty_type).filter((t): t is NonNullable<typeof t> => !!t))
  return AREA_ORDER.filter(v => present.has(v as never)).map(value => ({ value, label: AREA_LABELS[value] }))
}

/** Profissionais que entram na impressão: o restrito só vê a própria agenda; senão vale área e profissional escolhidos. */
export function pickProfessionals(profs: PrintProf[], opts: { areas: string[]; professionalIds: string[]; scopeId: string | null }): PrintProf[] {
  if (opts.scopeId) return profs.filter(p => p.id === opts.scopeId)
  let list = profs
  if (opts.areas.length > 0) list = list.filter(p => !!p.specialty_type && opts.areas.includes(p.specialty_type))
  if (opts.professionalIds.length > 0) list = list.filter(p => opts.professionalIds.includes(p.id))
  return list
}

// ── Folhas ───────────────────────────────────────────────────

export interface PrintRow {
  key: string
  kind: 'appt' | 'free' | 'block'
  time: string
  /** texto da linha cinza (horário livre, bloqueio) */
  text: string
  patient: string
  phone: string
  procedure: string
  convenio: string
  status: string
  statusLabel: string
  notes: string
  /** hora em que o paciente chegou, ou '' para a caixinha vazia */
  arrived: string
  professional: string
  /** só para ordenar: instante da linha */
  at: number
}

export interface PrintDay { key: string; title: string; rows: PrintRow[] }

export interface PrintSheet {
  key: string
  /** nome sob o título; null = sem profissional (lista com mais de um) */
  professional: string | null
  days: PrintDay[]
  /** atendimentos da folha (sem bloqueios e sem cancelados) */
  count: number
  summary: string
  /** a coluna "Profissional" aparece só na lista que mistura profissionais */
  showProfessional: boolean
}

export const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado', confirmado: 'Confirmado', arrived: 'Aguardando', in_progress: 'Em atendimento',
  concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou', bloqueado: 'Bloqueado',
}

// resumo: "4 confirmados, 4 agendados"
const STATUS_PLURAL: Record<string, [string, string]> = {
  agendado: ['agendado', 'agendados'],
  confirmado: ['confirmado', 'confirmados'],
  arrived: ['aguardando', 'aguardando'],
  in_progress: ['em atendimento', 'em atendimento'],
  concluido: ['concluído', 'concluídos'],
  faltou: ['falta', 'faltas'],
  cancelado: ['cancelado', 'cancelados'],
}
const STATUS_ORDER = ['agendado', 'confirmado', 'arrived', 'in_progress', 'concluido', 'faltou', 'cancelado']
const KIND_ORDER = { block: 0, free: 1, appt: 2 } as const

export const PARTICULAR = 'Particular'

export interface BuildInput {
  appointments: Appointment[]
  /** já filtrados por área/profissional */
  professionals: PrintProf[]
  /** consultas sem profissional entram (só quando não há filtro de área nem de profissional) */
  includeUnassigned: boolean
  start: Date
  end: Date
  group: PrintGrouping
  show: PrintShow
  /** patient_id → convênio; vazio ou ausente = Particular */
  convenios: Record<string, string | null | undefined>
  /** nome mostrado sob o título quando a folha mistura profissionais (ex.: "Todos os profissionais") */
  listLabel: string
  scheduleFor?: (professionalId: string) => ScheduleData | undefined
  /** grade de horários da clínica ("HH:mm") */
  slots: string[]
}

/** Horários livres e bloqueios só têm sentido com um profissional só na folha. */
export function freeAllowed(group: PrintGrouping, professionalCount: number): boolean {
  return group === 'folha' || professionalCount <= 1
}

function atMs(day: string, time: string): number {
  return new Date(`${day}T${time}:00`).getTime()
}

/** Faixas livres do dia, coladas: casas seguidas viram uma linha só ("a partir de 09:00, até 11:30"). */
function freeRows(opts: {
  prof: PrintProf
  day: string
  /** tudo que ocupa a agenda dele nesse dia e vizinhança (consultas dele e bloqueios da clínica) */
  busy: Appointment[]
  schedule: ScheduleData | undefined
  slots: string[]
}): PrintRow[] {
  const { prof, day, busy, schedule, slots } = opts
  let free = freeSlotsOfDay(busy, { professionalId: prof.id, dateStr: day, durationMin: SLOT_MINUTES, slots, schedule })
  if (dayStatus(schedule, day).state === 'sem_escala') {
    // sem escala o profissional "atende a qualquer hora": só vale o vão entre a primeira e a última consulta do dia
    const real = busy.filter(a => a.status !== 'bloqueado' && a.status !== 'cancelado' && a.professional_id === prof.id && localDayKey(new Date(a.scheduled_at)) === day)
    if (real.length === 0) return []
    const first = Math.min(...real.map(a => { const d = new Date(a.scheduled_at); return d.getHours() * 60 + d.getMinutes() }))
    const last = Math.max(...real.map(a => { const d = new Date(a.scheduled_at); return d.getHours() * 60 + d.getMinutes() + (a.duration_minutes || SLOT_MINUTES) }))
    free = free.filter(s => toMin(s) >= first && toMin(s) < last)
  }
  const mins = free.map(toMin).sort((a, b) => a - b)
  const out: PrintRow[] = []
  let i = 0
  while (i < mins.length) {
    let j = i
    while (j + 1 < mins.length && mins[j + 1] === mins[j] + SLOT_MINUTES) j++
    const from = fromMin(mins[i])
    const until = fromMin(mins[j] + SLOT_MINUTES)
    out.push({
      key: `free:${prof.id}:${day}:${from}`, kind: 'free', time: from,
      text: j > i ? `Horário livre até ${until}` : 'Horário livre',
      patient: '', phone: '', procedure: '', convenio: '', status: '', statusLabel: '', notes: '', arrived: '', professional: prof.name,
      at: atMs(day, from),
    })
    i = j + 1
  }
  return out
}

const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`

/** "Resumo: 4 confirmados, 4 agendados · Particular 4, Unimed 2" */
export function summarize(rows: PrintRow[], withConvenio: boolean): string {
  const appts = rows.filter(r => r.kind === 'appt')
  if (appts.length === 0) return ''
  const byStatus = new Map<string, number>()
  const byConv = new Map<string, number>()
  for (const r of appts) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1)
    byConv.set(r.convenio, (byConv.get(r.convenio) ?? 0) + 1)
  }
  const order = (s: string) => { const i = STATUS_ORDER.indexOf(s); return i < 0 ? STATUS_ORDER.length : i }
  const statusPart = [...byStatus.entries()]
    .sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]))
    .map(([s, n]) => plural(n, STATUS_PLURAL[s] ?? [(STATUS_LABELS[s] ?? s).toLowerCase(), (STATUS_LABELS[s] ?? s).toLowerCase()]))
    .join(', ')
  const convPart = withConvenio
    ? [...byConv.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([c, n]) => `${c} ${n}`).join(', ')
    : ''
  return `Resumo: ${statusPart}${convPart ? ` · ${convPart}` : ''}`
}

function toRows(rows: PrintRow[]): { days: PrintDay[]; count: number } {
  const sorted = [...rows].sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.key.localeCompare(b.key))
  const days: PrintDay[] = []
  for (const r of sorted) {
    const key = localDayKey(new Date(r.at))
    let day = days[days.length - 1]
    if (!day || day.key !== key) {
      day = { key, title: dayTitle(new Date(r.at)), rows: [] }
      days.push(day)
    }
    day.rows.push(r)
  }
  return { days, count: rows.filter(r => r.kind === 'appt' && r.status !== 'cancelado').length }
}

/** Monta as folhas: uma por profissional ou uma lista única, já com as linhas na ordem do dia. */
export function buildSheets(input: BuildInput): { sheets: PrintSheet[]; count: number } {
  const { show, start, end, group, professionals } = input
  const startMs = start.getTime()
  const endMs = end.getTime()
  const profName = new Map(professionals.map(p => [p.id, p.name]))
  const inPeriod = input.appointments.filter(a => {
    const t = new Date(a.scheduled_at).getTime()
    return t >= startMs && t < endMs
  })

  const apptRow = (a: Appointment): PrintRow => {
    const d = new Date(a.scheduled_at)
    const conv = a.patient_id ? (input.convenios[a.patient_id] ?? '').trim() : ''
    return {
      key: `appt:${a.id}`, kind: 'appt', time: hm(d), text: '',
      patient: a.patients ? petLabel(a.patients) || a.patients.name : '—',
      phone: formatBrPhone(a.patients?.phone),
      procedure: a.procedure_name?.trim() || 'Consulta',
      convenio: conv || PARTICULAR,
      status: a.status ?? 'agendado',
      statusLabel: STATUS_LABELS[a.status ?? 'agendado'] ?? String(a.status),
      notes: (a.notes ?? '').replace(/\s+/g, ' ').trim(),
      arrived: a.arrived_at ? hm(new Date(a.arrived_at)) : '',
      professional: (a.professional_id ? profName.get(a.professional_id) ?? a.professionals?.name : '') ?? '',
      at: d.getTime(),
    }
  }
  const blockRow = (a: Appointment): PrintRow => {
    const d = new Date(a.scheduled_at)
    const until = hm(new Date(d.getTime() + (a.duration_minutes || 60) * 60000))
    const why = (a.notes ?? '').replace(/\s+/g, ' ').trim()
    return {
      key: `block:${a.id}`, kind: 'block', time: hm(d), text: `Bloqueado até ${until}${why ? ` · ${why}` : ''}`,
      patient: '', phone: '', procedure: '', convenio: '', status: 'bloqueado', statusLabel: '', notes: '', arrived: '', professional: '',
      at: d.getTime(),
    }
  }
  const keepStatus = (a: Appointment) => a.status !== 'bloqueado' && (show.canceled || (a.status !== 'cancelado' && a.status !== 'faltou'))

  // Cada folha é um conjunto de profissionais (ou "sem profissional", id null).
  type Scope = { key: string; ids: (string | null)[]; label: string | null }
  let scopes: Scope[]
  if (group === 'folha' || professionals.length + (input.includeUnassigned ? 1 : 0) <= 1) {
    scopes = professionals.map(p => ({ key: p.id, ids: [p.id], label: p.name }))
    if (input.includeUnassigned) scopes.push({ key: 'sem-profissional', ids: [null], label: 'Sem profissional' })
  } else {
    scopes = [{ key: 'lista', ids: [...professionals.map(p => p.id), ...(input.includeUnassigned ? [null] : [])], label: null }]
  }
  const withFree = show.free && freeAllowed(group, scopes.length === 1 ? scopes[0].ids.length : 2)

  // dias do período, para os horários livres
  const dayKeys: string[] = []
  for (let d = start; d.getTime() < endMs; d = addDays(d, 1)) dayKeys.push(localDayKey(d))

  const sheets: PrintSheet[] = []
  for (const scope of scopes) {
    const ids = new Set(scope.ids)
    const rows: PrintRow[] = []
    for (const a of inPeriod) {
      if (keepStatus(a) && ids.has(a.professional_id ?? null)) rows.push(apptRow(a))
    }
    if (show.free) {
      for (const a of inPeriod) {
        if (a.status === 'bloqueado' && ((a.professional_id && ids.has(a.professional_id)) || (isClinicBlock(a) && !ids.has(null)))) rows.push(blockRow(a))
      }
    }
    const only = scope.ids.length === 1 ? professionals.find(p => p.id === scope.ids[0]) : undefined
    if (withFree && only) {
      // o que ocupa a agenda dele: consultas dele e bloqueios da clínica, com folga de 12 h antes para o que atravessa a meia-noite
      const busy = input.appointments.filter(a => {
        const t = new Date(a.scheduled_at).getTime()
        return t >= startMs - MAX_APPT_MS && t < endMs && (a.professional_id === only.id || isClinicBlock(a))
      })
      const schedule = input.scheduleFor?.(only.id)
      for (const day of dayKeys) rows.push(...freeRows({ prof: only, day, busy, schedule, slots: input.slots }))
    }
    // só bloqueio (ex.: feriado da clínica) não faz uma folha
    if (!rows.some(r => r.kind !== 'block')) continue
    const { days, count } = toRows(rows)
    sheets.push({
      key: scope.key,
      professional: scope.label ?? input.listLabel,
      days,
      count,
      summary: show.summary ? summarize(rows, show.convenio) : '',
      showProfessional: scope.label === null,
    })
  }
  return { sheets, count: sheets.reduce((n, s) => n + s.count, 0) }
}

/** Precisa buscar no banco? O carregamento da agenda só alcança 3 meses para trás; com folga de um mês. */
export function needsFetch(start: Date, now: Date = new Date()): boolean {
  const safe = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())
  return start.getTime() < safe.getTime()
}

/** Título do documento no diálogo de impressão do navegador (vira o nome do PDF). */
export function documentTitle(clinicName: string, start: Date, end: Date): string {
  const last = addDays(end, -1)
  const a = dateBr(start).replace(/\//g, '-')
  const b = dateBr(last).replace(/\//g, '-')
  return `Agenda ${clinicName} ${a === b ? a : `${a} a ${b}`}`.trim()
}
