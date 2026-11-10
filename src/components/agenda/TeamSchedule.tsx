'use client'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import btn from '@/components/ui/button.module.css'
import { describeDay, dayStatus, weekDates, type Shift } from '@/lib/agenda/availability'
import { rowsToCopyPrevWeek, shiftDate } from '@/lib/agenda/scheduleDraft'
import { scheduleOf, type SchedulesResult } from '@/hooks/useSchedules'
import type { Professional } from '@/types'
import styles from './teamSchedule.module.css'

interface Props {
  open: boolean
  onClose: () => void
  professionals: Professional[]
  schedules: SchedulesResult
  shifts: Shift[]
  clinicId: string
  userId?: string
  initialDate: Date
  colorOf: (professionalId: string) => string
  initialsOf: (name: string) => string
  /** abre o editor de escala desse profissional na semana pedida */
  onEdit: (professional: Professional, date: Date) => void
}

const parseDate = (d: string) => new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Escala da equipe inteira numa semana: quem atende quando, o que falta definir, e a cópia da semana anterior. */
export function TeamSchedule({ open, onClose, professionals, schedules, shifts, clinicId, userId, initialDate, colorOf, initialsOf, onEdit }: Props) {
  const queryClient = useQueryClient()
  const [anchor, setAnchor] = useState(() => weekDates(initialDate)[0])
  const [copying, setCopying] = useState(false)
  const dates = useMemo(() => weekDates(parseDate(anchor)), [anchor])

  const rows = professionals.map(p => ({ prof: p, sched: scheduleOf(schedules, p.id, p.schedule_enabled) }))
  const pending = rows.reduce((n, r) => n + (r.sched ? dates.filter(d => dayStatus(r.sched, d).state === 'por_definir').length : 0), 0)
  const withoutSchedule = rows.filter(r => !r.sched).length
  const copyRows = rows.map(r => ({ prof: r.prof, rows: rowsToCopyPrevWeek(r.sched, dates) })).filter(x => x.rows.length > 0)
  const copyTotal = copyRows.reduce((n, x) => n + x.rows.length, 0)

  async function copyPrev() {
    const ok = await confirmDialog({
      title: 'Copiar a semana anterior?',
      message: `${copyTotal} ${copyTotal === 1 ? 'dia por definir será preenchido' : 'dias por definir serão preenchidos'} em ${copyRows.length} ${copyRows.length === 1 ? 'profissional' : 'profissionais'}, repetindo a semana anterior. Dias já definidos não mudam.`,
      confirmText: 'Copiar',
    })
    if (!ok) return
    setCopying(true)
    const stamp = new Date().toISOString()
    const payload = copyRows.flatMap(x => x.rows.map(r => ({
      clinic_id: clinicId, professional_id: x.prof.id, date: r.date, works: r.works, windows: r.windows, updated_by: userId ?? null, updated_at: stamp,
    })))
    const { error } = await supabase.from('professional_day_schedule').upsert(payload, { onConflict: 'professional_id,date' })
    setCopying(false)
    if (error) { showToast('error', `Não foi possível copiar: ${error.message}`); return }
    await queryClient.invalidateQueries({ queryKey: ['schedules', clinicId] })
    showToast('ok', 'Semana copiada')
  }

  return (
    <Modal open={open} onClose={onClose} title="Escala da equipe" subtitle="Quem atende em cada dia" size="xl">
      <div className={styles.body}>
        <div className={styles.bar}>
          <div className={styles.nav}>
            <button type="button" className={styles.navBtn} aria-label="Semana anterior" onClick={() => setAnchor(a => shiftDate(a, -7))}>‹</button>
            <strong className={styles.week}>{dates[0].slice(8)}/{dates[0].slice(5, 7)} a {dates[6].slice(8)}/{dates[6].slice(5, 7)}</strong>
            <button type="button" className={styles.navBtn} aria-label="Próxima semana" onClick={() => setAnchor(a => shiftDate(a, 7))}>›</button>
          </div>
          <p className={pending > 0 ? styles.pending : styles.ok} role="status">
            {pending > 0 ? `${pending} ${pending === 1 ? 'dia por definir' : 'dias por definir'} nesta semana` : 'Nenhum dia por definir nesta semana'}
          </p>
          <button type="button" className={btn.secondary} onClick={copyPrev} disabled={copying || copyTotal === 0} title={copyTotal === 0 ? 'Não há dia por definir com semana anterior para copiar' : undefined}>
            {copying ? 'Copiando...' : 'Copiar semana anterior'}
          </button>
        </div>

        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.who}>Profissional</th>
                {dates.map((d, i) => <th key={d} scope="col">{DOW[i]} {d.slice(8)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ prof, sched }) => (
                <tr key={prof.id}>
                  <th scope="row" className={styles.who}>
                    <span className={styles.avatar} style={{ background: colorOf(prof.id) }} aria-hidden="true">{initialsOf(prof.name)}</span>
                    <span className={styles.name}>{prof.name}</span>
                  </th>
                  {dates.map(d => {
                    const st = dayStatus(sched, d)
                    const cls = st.state === 'atende' ? styles.on : st.state === 'nao_atende' ? styles.off : st.state === 'por_definir' ? styles.todo : styles.none
                    return (
                      <td key={d}>
                        <button type="button" className={`${styles.cell} ${cls}`} onClick={() => onEdit(prof, parseDate(d))} aria-label={`${prof.name}, ${DOW[parseDate(d).getDay()]} ${d.slice(8)}: ${describeDay(st, shifts)}. Editar escala`}>
                          {describeDay(st, shifts)}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {withoutSchedule > 0 && (
          <p className={styles.hint}>{withoutSchedule} {withoutSchedule === 1 ? 'profissional está' : 'profissionais estão'} sem escala: atendem em qualquer horário. Toque numa célula para definir.</p>
        )}
      </div>
    </Modal>
  )
}
