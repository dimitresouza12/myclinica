// Tempos do atendimento: duração da consulta, espera (chegou -> início) e formatação no fuso de Brasília.
import { BRASIL_TZ } from '@/lib/brasilDate'

const MAX_REASONABLE_MS = 12 * 60 * 60 * 1000

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

/** Tempo decorrido desde `startIso` até `now` (nunca negativo). null se não há início. */
export function elapsedMs(startIso: string | null | undefined, now: Date): number | null {
  const s = ms(startIso)
  return s === null ? null : Math.max(0, now.getTime() - s)
}

/** Duração da consulta: início -> fim. Se ainda não terminou e `now` foi dado, conta até agora. */
export function consultMs(startedAt: string | null | undefined, finishedAt: string | null | undefined, now?: Date): number | null {
  const s = ms(startedAt)
  if (s === null) return null
  const f = ms(finishedAt) ?? (now ? now.getTime() : null)
  return f === null ? null : Math.max(0, f - s)
}

/** Espera do paciente: chegada -> início (ou -> agora, se ainda aguarda e `now` foi dado). null sem chegada. */
export function waitMs(arrivedAt: string | null | undefined, startedAt: string | null | undefined, now?: Date): number | null {
  const a = ms(arrivedAt)
  if (a === null) return null
  const end = ms(startedAt) ?? (now ? now.getTime() : null)
  return end === null ? null : Math.max(0, end - a)
}

const two = (n: number) => String(n).padStart(2, '0')

/** Relógio do cronômetro: "07:05" ou "1:02:09". */
export function formatClock(totalMs: number): string {
  const total = Math.max(0, Math.floor(totalMs / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`
}

/** Duração em texto curto: "menos de 1 min", "12 min", "1 h 05". */
export function formatMinutes(totalMs: number): string {
  const min = Math.round(Math.max(0, totalMs) / 60000)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${two(min % 60)}`
}

/** "HH:mm" no fuso de Brasília, independente do fuso do navegador. */
export function formatBrasilTime(iso: string | null | undefined): string {
  const t = ms(iso)
  if (t === null) return '-'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BRASIL_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(t))
}

/** Quão pesada está a espera, para o realce da fila: até 15 min tranquilo, até 30 atenção, depois alerta. */
export type WaitTone = 'ok' | 'wait' | 'warn'
export function waitTone(waited: number): WaitTone {
  const min = waited / 60000
  return min < 15 ? 'ok' : min < 30 ? 'wait' : 'warn'
}

export interface AttendanceTimes {
  arrived_at?: string | null
  started_at?: string | null
  finished_at?: string | null
}

export interface AttendanceMetrics {
  /** média de duração das consultas (minutos), null se não há amostra */
  consultAvgMin: number | null
  consultCount: number
  /** média de espera chegada -> início (minutos) */
  waitAvgMin: number | null
  waitCount: number
}

/** Médias simples. Descarta tempos negativos (relógio errado) e acima de 12 h (esquecido aberto). */
export function attendanceMetrics(rows: AttendanceTimes[]): AttendanceMetrics {
  const consults: number[] = []
  const waits: number[] = []
  for (const r of rows) {
    if (r.started_at && r.finished_at) {
      const s = ms(r.started_at); const f = ms(r.finished_at)
      if (s !== null && f !== null && f >= s && f - s <= MAX_REASONABLE_MS) consults.push(f - s)
    }
    if (r.arrived_at && r.started_at) {
      const a = ms(r.arrived_at); const s = ms(r.started_at)
      if (a !== null && s !== null && s >= a && s - a <= MAX_REASONABLE_MS) waits.push(s - a)
    }
  }
  const avg = (v: number[]) => (v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length / 60000) : null)
  return { consultAvgMin: avg(consults), consultCount: consults.length, waitAvgMin: avg(waits), waitCount: waits.length }
}
