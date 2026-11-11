'use client'
import { useMemo } from 'react'
import type { Appointment } from '@/types'
import { buildBusyMap } from '@/lib/agenda/slots'
import { gridTemplate, ROW_PX as ROW_BY_DENSITY, type Density } from '@/lib/agenda/dayGrid'
import styles from './dayColumns.module.css'

export interface DayColumn { id: string; name: string; initials: string; color: string }

interface Props {
  /** "AAAA-MM-DD" do dia mostrado */
  dateStr: string
  /** uma coluna por profissional visível; id '' = consultas sem profissional */
  columns: DayColumn[]
  /** consultas e bloqueios do dia (já filtrados pelo que está visível) */
  appointments: Appointment[]
  /** casas da grade em que dá para marcar ("07:00", "07:30"…) */
  slots: string[]
  statusLabels: Record<string, string>
  onOpenAppt: (a: Appointment) => void
  /** clicou numa casa livre de um profissional */
  onFreeSlot: (professionalId: string, time: string) => void
  /** casa dentro da escala do profissional? Ausente = sempre (sem escala configurada) */
  isOpen?: (professionalId: string, time: string) => boolean
  /** normal: bloco com horário, nome e detalhes; compacta: uma linha com hora e paciente */
  density?: Density
}

const STEP = 30
const pad = (n: number) => String(n).padStart(2, '0')
const toLabel = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Dia em colunas: um profissional por coluna, consultas no horário e as casas livres clicáveis. */
export function DayColumns({ dateStr, columns, appointments, slots, statusLabels, onOpenAppt, onFreeSlot, isOpen, density = 'normal' }: Props) {
  const ROW_PX = ROW_BY_DENSITY[density]
  const compact = density === 'compacta'
  const shown = useMemo(() => appointments.filter(a => a.status !== 'cancelado'), [appointments])

  // a grade cobre o horário da clínica e, se houver consulta fora dele, estica até ela
  const { startMin, endMin } = useMemo(() => {
    let start = toMin(slots[0])
    let end = toMin(slots[slots.length - 1]) + STEP
    const dayStart = new Date(`${dateStr}T00:00:00`).getTime()
    for (const a of shown) {
      const s = Math.round((new Date(a.scheduled_at).getTime() - dayStart) / 60000)
      const e = s + (a.duration_minutes ?? 60)
      start = Math.min(start, Math.floor(Math.max(s, 0) / STEP) * STEP)
      end = Math.max(end, Math.ceil(Math.min(e, 24 * 60) / STEP) * STEP)
    }
    return { startMin: start, endMin: end }
  }, [shown, slots, dateStr])

  const rows = useMemo(() => {
    const out: number[] = []
    for (let m = startMin; m < endMin; m += STEP) out.push(m)
    return out
  }, [startMin, endMin])

  const dayStartMs = new Date(`${dateStr}T00:00:00`).getTime()
  const pxPerMin = ROW_PX / STEP

  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.grid}${compact ? ` ${styles.compact}` : ''}`}
        style={{ gridTemplateColumns: gridTemplate(columns.length), ['--row' as string]: `${ROW_PX}px` }}
      >
        {/* cabeçalho das colunas */}
        <div className={styles.corner} />
        {columns.map(c => {
          const count = shown.filter(a => a.status !== 'bloqueado' && (a.professional_id ?? '') === c.id).length
          return (
            <div key={c.id || 'none'} className={styles.colHead}>
              <span className={styles.colAvatar} style={{ background: c.color }}>{c.initials}</span>
              <span className={styles.colWho}>
                <strong className={styles.colName}>{c.name}</strong>
                <span className={styles.colCount}>{count} {count === 1 ? 'consulta' : 'consultas'}</span>
              </span>
            </div>
          )
        })}

        {/* trilho de horários */}
        <div className={styles.rail} style={{ height: rows.length * ROW_PX }}>
          {rows.map((m, i) => (
            <span key={m} className={styles.railTime} style={{ top: i * ROW_PX }}>{toLabel(m)}</span>
          ))}
        </div>

        {columns.map(c => (
          <Column
            key={c.id || 'none'}
            col={c}
            dateStr={dateStr}
            all={shown}
            rows={rows}
            slots={slots}
            dayStartMs={dayStartMs}
            startMin={startMin}
            endMin={endMin}
            pxPerMin={pxPerMin}
            rowPx={ROW_PX}
            compact={compact}
            statusLabels={statusLabels}
            onOpenAppt={onOpenAppt}
            onFreeSlot={onFreeSlot}
            isOpen={isOpen}
          />
        ))}
      </div>
    </div>
  )
}

function Column({ col, dateStr, all, rows, slots, dayStartMs, startMin, endMin, pxPerMin, rowPx, compact, statusLabels, onOpenAppt, onFreeSlot, isOpen }: {
  col: DayColumn
  dateStr: string
  all: Appointment[]
  rows: number[]
  slots: string[]
  dayStartMs: number
  startMin: number
  endMin: number
  pxPerMin: number
  rowPx: number
  compact: boolean
  statusLabels: Record<string, string>
  onOpenAppt: (a: Appointment) => void
  onFreeSlot: (professionalId: string, time: string) => void
  isOpen?: (professionalId: string, time: string) => boolean
}) {
  const ROW_PX = rowPx
  // casas ocupadas desse profissional (os bloqueios da clínica toda contam)
  const busy = useMemo(
    () => (col.id ? buildBusyMap(all, { dateStr, professionalId: col.id, slots }) : new Map<string, string>()),
    [all, dateStr, col.id, slots],
  )
  const mine = all.filter(a =>
    a.status === 'bloqueado' && !a.professional_id ? true : (a.professional_id ?? '') === col.id,
  )

  return (
    <div className={styles.col} style={{ height: rows.length * ROW_PX }}>
      {rows.map((m, i) => {
        const time = toLabel(m)
        const closed = !!col.id && !!isOpen && !isOpen(col.id, time)
        const bookable = !!col.id && slots.includes(time) && !busy.has(time) && !closed
        if (closed) {
          return <span key={m} className={`${styles.cell} ${styles.cellClosed}`} style={{ top: i * ROW_PX, height: ROW_PX }} title="Fora da escala" aria-hidden="true" />
        }
        return bookable ? (
          <button
            key={m}
            type="button"
            className={styles.free}
            style={{ top: i * ROW_PX, height: ROW_PX }}
            onClick={() => onFreeSlot(col.id, time)}
            aria-label={`Agendar ${col.name} às ${time}`}
          >
            <span className={styles.freeText}>Livre</span>
          </button>
        ) : (
          <span key={m} className={styles.cell} style={{ top: i * ROW_PX, height: ROW_PX }} aria-hidden="true" />
        )
      })}

      {mine.map(a => {
        const startRel = Math.round((new Date(a.scheduled_at).getTime() - dayStartMs) / 60000)
        const dur = a.duration_minutes ?? 60
        const from = Math.max(startRel, startMin)
        const to = Math.min(startRel + dur, endMin)
        if (to <= from) return null
        const top = (from - startMin) * pxPerMin
        const height = Math.max((to - from) * pxPerMin - 2, compact ? 18 : 22)
        const blocked = a.status === 'bloqueado'
        return (
          <button
            key={a.id}
            type="button"
            className={`${styles.appt}${blocked ? ` ${styles.apptBlocked}` : ''}`}
            data-status={a.status ?? 'agendado'}
            style={{ top, height, ['--accent' as string]: col.color }}
            onClick={() => onOpenAppt(a)}
          >
            {compact ? (
              <span className={styles.apptLine}>
                <span className={styles.apptTime}>{toLabel(startRel)}</span>
                <strong className={styles.apptName}>{blocked ? 'Bloqueado' : (a.patients?.name ?? '-')}</strong>
              </span>
            ) : (
              <>
                <span className={styles.apptTime}>{toLabel(startRel)} · {dur} min</span>
                <strong className={styles.apptName}>{blocked ? 'Horário bloqueado' : (a.patients?.name ?? '-')}</strong>
              </>
            )}
            {!compact && height >= 64 && (
              <span className={styles.apptSub}>
                {blocked ? (a.notes || 'Indisponível') : `${a.procedure_name ?? 'Consulta'} · ${statusLabels[a.status ?? ''] ?? a.status}${a.arrived_at && a.status !== 'arrived' && a.status !== 'in_progress' ? ' · Chegou' : ''}${a.extra_slot_reason ? ' · Encaixe' : ''}`}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
