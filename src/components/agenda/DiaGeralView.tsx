'use client'
import { useMemo, useRef, useEffect } from 'react'
import type { Appointment, Professional } from '@/types'
import styles from './DiaGeralView.module.css'

// Cores por status (semânticas, alinhadas à agenda)
const STATUS_DOTS: Record<string, string> = {
  agendado: '#3B82F6', confirmado: '#0EA5A0', concluido: '#10B981', cancelado: '#EF4444', faltou: '#F59E0B',
}
// Preenchimento sólido pastel — card totalmente colorido por status
const STATUS_FILL: Record<string, string> = {
  agendado: '#DBEAFE', confirmado: '#A7F3DE', concluido: '#BBF7D0', cancelado: '#FECDD3', faltou: '#FED7AA',
}
// Cor do texto principal — tom escuro do mesmo matiz, alto contraste
const STATUS_TEXT: Record<string, string> = {
  agendado: '#1E40AF', confirmado: '#0F766E', concluido: '#15803D', cancelado: '#9F1239', faltou: '#9A3412',
}
const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado', confirmado: 'Confirmado', concluido: 'Concluído', cancelado: 'Cancelado', faltou: 'Faltou',
}

const SLOT_MIN = 30      // granularidade de cada linha
const SLOT_H = 64        // altura px por slot de 30min
const DEFAULT_START = 7  // hora inicial padrão
const DEFAULT_END = 21   // hora final padrão

interface Props {
  date: Date
  appointments: Appointment[]      // já filtrados para o dia
  professionals: Professional[]
  profColorIndex: Record<string, number>
  onSelect: (a: Appointment) => void
  onSlotClick?: (professionalId: string | null, dateISO: string) => void
}

const PROF_COLORS = [
  '#4DD9C0', '#0B9B85', '#127C9A', '#2F6FB0',
  '#7C5CBF', '#E0735A', '#E8A838', '#3BAD88',
  '#CF4B8B', '#5A9E5C',
]
function profColor(profId: string | null, profIndex: Record<string, number>): string {
  if (!profId) return '#9BB5B3'
  return PROF_COLORS[(profIndex[profId] ?? 0) % PROF_COLORS.length]
}

function minutesOf(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function initialsOf(name?: string | null): string {
  return (name ?? '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—'
}

// Algoritmo de lanes: distribui agendamentos sobrepostos lado a lado
function assignLanes(appts: Appointment[]): { appt: Appointment; lane: number; lanes: number }[] {
  const sorted = [...appts].sort((a, b) =>
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )
  const laneEnds: number[] = []        // fim (min) de cada lane
  const placed: { appt: Appointment; lane: number; start: number; end: number }[] = []
  for (const appt of sorted) {
    const start = minutesOf(appt.scheduled_at)
    const end = start + Math.max(appt.duration_minutes ?? 60, 15)
    let lane = laneEnds.findIndex(e => e <= start)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(end) }
    else laneEnds[lane] = end
    placed.push({ appt, lane, start, end })
  }
  // calcula nº de lanes em cada cluster de sobreposição
  return placed.map(p => {
    const overlapping = placed.filter(o => o.start < p.end && o.end > p.start)
    const lanes = Math.max(...overlapping.map(o => o.lane)) + 1
    return { appt: p.appt, lane: p.lane, lanes }
  })
}

export function DiaGeralView({ date, appointments, professionals, profColorIndex, onSelect, onSlotClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Faixa de horas: expande conforme os agendamentos do dia
  const [startHour, endHour] = useMemo(() => {
    let min = DEFAULT_START, max = DEFAULT_END
    appointments.forEach(a => {
      const s = Math.floor(minutesOf(a.scheduled_at) / 60)
      const e = Math.ceil((minutesOf(a.scheduled_at) + (a.duration_minutes ?? 60)) / 60)
      if (s < min) min = Math.max(0, s)
      if (e > max) max = Math.min(24, e)
    })
    return [min, max]
  }, [appointments])

  const slots = useMemo(() => {
    const arr: { label: string; min: number }[] = []
    for (let m = startHour * 60; m < endHour * 60; m += SLOT_MIN) {
      arr.push({ label: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, min: m })
    }
    return arr
  }, [startHour, endHour])

  // Colunas = profissionais; coluna extra "Sem profissional" só se houver agendamentos órfãos
  const columns = useMemo(() => {
    const cols: { id: string | null; name: string }[] = professionals.map(p => ({ id: p.id, name: p.name }))
    const hasOrphan = appointments.some(a => !a.professional_id || !professionals.find(p => p.id === a.professional_id))
    if (hasOrphan) cols.push({ id: null, name: 'Sem profissional' })
    return cols
  }, [professionals, appointments])

  const byColumn = useMemo(() => {
    const map = new Map<string | null, Appointment[]>()
    columns.forEach(c => map.set(c.id, []))
    appointments.forEach(a => {
      const key = a.professional_id && professionals.find(p => p.id === a.professional_id) ? a.professional_id : null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    })
    return map
  }, [appointments, columns, professionals])

  const dayStartMin = startHour * 60
  const totalHeight = slots.length * SLOT_H

  // Linha do "agora" (só se for hoje)
  const isToday = new Date().toDateString() === date.toDateString()
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const nowTop = ((nowMin - dayStartMin) / SLOT_MIN) * SLOT_H
  const showNow = isToday && nowMin >= dayStartMin && nowMin <= endHour * 60

  // Auto-scroll até a linha do agora ao montar
  useEffect(() => {
    if (showNow && scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, nowTop - 120)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (columns.length === 0) {
    return (
      <div className={styles.emptyState}>
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span>Cadastre profissionais para usar a visão Dia geral</span>
      </div>
    )
  }

  return (
    <div className={styles.wrap} ref={scrollRef}>
      <div className={styles.grid} style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(150px, 1fr))` }}>

        {/* Cabeçalho: canto + profissionais */}
        <div className={`${styles.corner} ${styles.headerCell}`} />
        {columns.map(col => (
          <div key={col.id ?? 'none'} className={styles.headerCell}>
            <div className={styles.profAvatar} style={{ background: profColor(col.id, profColorIndex) }}>
              {initialsOf(col.name)}
            </div>
            <span className={styles.profName}>{col.name}</span>
          </div>
        ))}

        {/* Coluna do gutter de horas */}
        <div className={styles.timeGutter} style={{ height: totalHeight }}>
          {slots.map(s => (
            <div
              key={s.min}
              className={`${styles.timeLabel} ${s.min % 60 !== 0 ? styles.timeLabelHalf : ''}`}
              style={{ height: SLOT_H }}
            >
              {s.label}
            </div>
          ))}
        </div>

        {/* Colunas dos profissionais */}
        {columns.map(col => {
          const placed = assignLanes(byColumn.get(col.id) ?? [])
          return (
            <div key={col.id ?? 'none'} className={styles.colBody} style={{ height: totalHeight }}>
              {/* linhas de fundo + clique para criar */}
              {slots.map(s => (
                <div
                  key={s.min}
                  className={`${styles.slotLine} ${s.min % 60 === 0 ? styles.slotHour : ''}`}
                  style={{ height: SLOT_H }}
                  onClick={() => {
                    if (!onSlotClick) return
                    const d = new Date(date)
                    d.setHours(Math.floor(s.min / 60), s.min % 60, 0, 0)
                    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(Math.floor(s.min / 60)).padStart(2, '0')}:${String(s.min % 60).padStart(2, '0')}`
                    onSlotClick(col.id, iso)
                  }}
                />
              ))}

              {/* linha do agora */}
              {showNow && (
                <div className={styles.nowLine} style={{ top: nowTop }}>
                  <span className={styles.nowDot} />
                </div>
              )}

              {/* agendamentos */}
              {placed.map(({ appt, lane, lanes }) => {
                const start = minutesOf(appt.scheduled_at)
                const top = ((start - dayStartMin) / SLOT_MIN) * SLOT_H
                // altura proporcional à duração, mas nunca menor que um slot inteiro
                const rawHeight = (Math.max(appt.duration_minutes ?? 60, SLOT_MIN) / SLOT_MIN) * SLOT_H
                const height = Math.max(rawHeight, SLOT_H)
                const widthPct = 100 / lanes
                const status = appt.status ?? 'agendado'
                const fill = STATUS_FILL[status] ?? STATUS_FILL.agendado
                const txt = STATUS_TEXT[status] ?? STATUS_TEXT.agendado
                const accent = STATUS_DOTS[status] ?? STATUS_DOTS.agendado
                return (
                  <button
                    key={appt.id}
                    className={styles.event}
                    style={{
                      top: top,
                      height: height,
                      left: `calc(${lane * widthPct}% + 1px)`,
                      width: `calc(${widthPct}% - 2px)`,
                      background: fill,
                      borderColor: accent,
                      color: txt,
                    }}
                    onClick={() => onSelect(appt)}
                    title={`${fmtTime(appt.scheduled_at)} · ${appt.patients?.name ?? 'Paciente'} · ${STATUS_LABELS[status] ?? status}`}
                  >
                    <span className={styles.evTime} style={{ color: txt }}>{fmtTime(appt.scheduled_at)}</span>
                    <span className={styles.evName} style={{ color: txt }}>{appt.patients?.name ?? 'Paciente'}</span>
                    {height > 44 && appt.procedure_name && (
                      <span className={styles.evProc} style={{ color: txt, opacity: 0.8 }}>{appt.procedure_name}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
