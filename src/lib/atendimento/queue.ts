// Fila do dia da recepção: aguardando (com tempo de espera), em atendimento e atendidos. Função pura.
import { brasilDayOf } from '@/lib/brasilDate'
import { stageOf, type FlowAppt } from './status'
import { waitMs } from './time'

export interface QueueAppt extends FlowAppt {
  id: string
  scheduled_at: string
  professional_id: string | null
  procedure_name?: string | null
  patients?: { name?: string | null } | null
  professionals?: { name?: string | null } | null
}

export interface QueueItem {
  id: string
  patientName: string
  professionalId: string | null
  professionalName: string | null
  procedure: string | null
  scheduledAt: string
  arrivedAt: string | null
  calledAt: string | null
  startedAt: string | null
  finishedAt: string | null
  /** espera em ms: até o início, ou até agora se ainda aguarda */
  waitedMs: number | null
}

export interface ProfessionalWait {
  professionalId: string | null
  name: string
  count: number
  longestMs: number
}

export interface DayQueue {
  waiting: QueueItem[]
  inProgress: QueueItem[]
  done: QueueItem[]
  byProfessional: ProfessionalWait[]
}

function toItem(a: QueueAppt, now: Date): QueueItem {
  return {
    id: a.id,
    patientName: a.patients?.name?.trim() || 'Paciente',
    professionalId: a.professional_id,
    professionalName: a.professionals?.name?.trim() || null,
    procedure: a.procedure_name ?? null,
    scheduledAt: a.scheduled_at,
    arrivedAt: a.arrived_at ?? null,
    calledAt: a.called_at ?? null,
    startedAt: a.started_at ?? null,
    finishedAt: a.finished_at ?? null,
    waitedMs: waitMs(a.arrived_at, a.started_at, now),
  }
}

const byIso = (x: string | null, y: string | null) => (x ?? '').localeCompare(y ?? '')

/**
 * Monta a fila das consultas do dia `dayKey` (AAAA-MM-DD em Brasília). Aguardando: quem chegou há mais tempo primeiro.
 * Em atendimento: início mais antigo primeiro. Atendidos: o último a sair primeiro.
 */
export function buildQueue(appts: QueueAppt[], dayKey: string, now: Date): DayQueue {
  const waiting: QueueItem[] = []
  const inProgress: QueueItem[] = []
  const done: QueueItem[] = []
  for (const a of appts) {
    if (brasilDayOf(a.scheduled_at) !== dayKey) continue
    const stage = stageOf(a)
    if (stage === 'waiting') waiting.push(toItem(a, now))
    else if (stage === 'in_progress') inProgress.push(toItem(a, now))
    else if (stage === 'done') done.push(toItem(a, now))
  }
  waiting.sort((x, y) => byIso(x.arrivedAt ?? x.scheduledAt, y.arrivedAt ?? y.scheduledAt))
  inProgress.sort((x, y) => byIso(x.startedAt, y.startedAt))
  done.sort((x, y) => byIso(y.finishedAt ?? y.scheduledAt, x.finishedAt ?? x.scheduledAt))

  const groups = new Map<string, ProfessionalWait>()
  for (const w of waiting) {
    const key = w.professionalId ?? ''
    const g = groups.get(key) ?? { professionalId: w.professionalId, name: w.professionalName ?? 'Sem profissional', count: 0, longestMs: 0 }
    g.count++
    g.longestMs = Math.max(g.longestMs, w.waitedMs ?? 0)
    groups.set(key, g)
  }
  const byProfessional = [...groups.values()].sort((a, b) => b.longestMs - a.longestMs)
  return { waiting, inProgress, done, byProfessional }
}
