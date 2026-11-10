'use client'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { localDateKey } from '@/lib/agenda/slots'
import { weekDates, type DayRow, type PatternRow, type Shift } from '@/lib/agenda/availability'
import {
  apptOutsideChoice, choiceFromSchedule, dayRowsFromDraft, isShiftOn, patternFromWeek, toggleOff, toggleShift, type DayChoice,
} from '@/lib/agenda/scheduleDraft'
import type { Professional } from '@/types'
import styles from './scheduleEditor.module.css'

interface Props {
  open: boolean
  onClose: () => void
  professional: Professional
  clinicId: string
  userId?: string
  shifts: Shift[]
  /** o que já está salvo para esse profissional */
  saved: { pattern: PatternRow[]; days: DayRow[] }
  /** semana inicial (qualquer dia dela) */
  initialDate: Date
}

const WEEKDAY = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const parseDate = (d: string) => new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
const addDays = (d: string, n: number) => { const x = parseDate(d); x.setDate(x.getDate() + n); return localDateKey(x) }

/** "Editar dias e horários": marca por dia os turnos em que o profissional atende, semana a semana. */
export function ScheduleEditor({ open, onClose, professional, clinicId, userId, shifts, saved, initialDate }: Props) {
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(!!professional.schedule_enabled)
  const [anchor, setAnchor] = useState(() => localDateKey(initialDate))
  const [edits, setEdits] = useState<Record<string, DayChoice>>({})
  const [repeat, setRepeat] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dates = useMemo(() => weekDates(parseDate(anchor)), [anchor])
  const savedSchedule = useMemo(() => ({ enabled: true, pattern: saved.pattern, days: saved.days }), [saved])
  const choiceOf = (d: string): DayChoice => edits[d] ?? choiceFromSchedule(savedSchedule, d, shifts)

  // consultas da semana, para avisar das que ficam fora da escala (elas não são mexidas)
  const { data: weekAppts = [] } = useQuery({
    queryKey: ['schedule-impact', professional.id, dates[0]],
    enabled: open && enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('appointments')
        .select('scheduled_at, duration_minutes')
        .eq('clinic_id', clinicId)
        .eq('professional_id', professional.id)
        .not('status', 'in', '(cancelado,bloqueado)')
        .gte('scheduled_at', new Date(`${dates[0]}T00:00:00`).toISOString())
        .lt('scheduled_at', new Date(`${addDays(dates[6], 1)}T00:00:00`).toISOString())
      return (data ?? []) as { scheduled_at: string; duration_minutes: number | null }[]
    },
  })
  const outsideCount = weekAppts.filter(a => {
    const dt = new Date(a.scheduled_at)
    const time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
    return apptOutsideChoice(choiceOf(localDateKey(dt)), time, a.duration_minutes ?? 30)
  }).length

  const set = (date: string, c: DayChoice) => setEdits(prev => ({ ...prev, [date]: c }))
  const copyPrevWeek = () => setEdits(prev => {
    const next = { ...prev }
    for (const d of dates) {
      const from = addDays(d, -7)
      next[d] = prev[from] ?? choiceFromSchedule(savedSchedule, from, shifts)
    }
    return next
  })
  const clearWeek = () => setEdits(prev => ({ ...prev, ...Object.fromEntries(dates.map(d => [d, { kind: 'unset' } as DayChoice])) }))

  const weekLabel = `${fmtDay(dates[0])} a ${fmtDay(dates[6])}`
  const dirty = enabled !== !!professional.schedule_enabled || Object.keys(edits).length > 0 || repeat

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      if (enabled !== !!professional.schedule_enabled) {
        const { error: e } = await supabase.from('professionals').update({ schedule_enabled: enabled }).eq('id', professional.id).eq('clinic_id', clinicId)
        if (e) throw e
      }
      if (enabled) {
        const base = { clinic_id: clinicId, professional_id: professional.id, updated_by: userId ?? null, updated_at: new Date().toISOString() }
        const week = Object.fromEntries(dates.map(d => [d, choiceOf(d)]))
        const draft = repeat ? { ...edits, ...Object.fromEntries(dates.map(d => [d, { kind: 'unset' } as DayChoice])) } : edits
        // repetir toda semana: a rotina passa a valer e as marcações avulsas desta semana saem do caminho
        const { upsert, clear } = dayRowsFromDraft(draft)
        if (upsert.length > 0) {
          const { error: e } = await supabase.from('professional_day_schedule')
            .upsert(upsert.map(r => ({ ...base, date: r.date, works: r.works, windows: r.windows })), { onConflict: 'professional_id,date' })
          if (e) throw e
        }
        if (clear.length > 0) {
          const { error: e } = await supabase.from('professional_day_schedule').delete()
            .eq('clinic_id', clinicId).eq('professional_id', professional.id).in('date', clear)
          if (e) throw e
        }
        if (repeat) {
          const p = patternFromWeek(week)
          if (p.upsert.length > 0) {
            const { error: e } = await supabase.from('professional_week_pattern')
              .upsert(p.upsert.map(r => ({ ...base, weekday: r.weekday, windows: r.windows })), { onConflict: 'professional_id,weekday' })
            if (e) throw e
          }
          const { error: e } = await supabase.from('professional_week_pattern').delete()
            .eq('clinic_id', clinicId).eq('professional_id', professional.id).in('weekday', p.clear)
          if (e) throw e
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['schedules', clinicId] }),
        queryClient.invalidateQueries({ queryKey: ['professionals', clinicId] }),
      ])
      showToast('ok', 'Escala salva')
      onClose()
    } catch (e) {
      setError(`Não foi possível salvar a escala: ${(e as { message?: string })?.message ?? 'erro desconhecido'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Escala de ${professional.name}`}
      subtitle="Dias e horários em que atende"
      size="lg"
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={btn.primary} onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Salvando...' : 'Salvar escala'}
          </button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={f.switches}>
          <label className={f.switchRow}>
            <span className={f.switchText}>
              <b>Controlar os horários deste profissional</b>
              <small>{enabled ? 'A agenda só oferece os dias e horários marcados abaixo.' : 'Desligado: atende em qualquer horário, como hoje.'}</small>
            </span>
            <span className={f.toggle}>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              <span />
            </span>
          </label>
        </div>

        {enabled && (
          <>
            <div className={styles.weekNav}>
              <button type="button" className={styles.navBtn} aria-label="Semana anterior" onClick={() => setAnchor(a => addDays(a, -7))}>‹</button>
              <strong className={styles.weekLabel}>{weekLabel}</strong>
              <button type="button" className={styles.navBtn} aria-label="Próxima semana" onClick={() => setAnchor(a => addDays(a, 7))}>›</button>
            </div>

            <ul className={styles.days}>
              {dates.map(d => {
                const c = choiceOf(d)
                return (
                  <li key={d} className={styles.day}>
                    <span className={styles.dayName}>
                      <b>{WEEKDAY[parseDate(d).getDay()]}</b>
                      <small>{fmtDay(d)}</small>
                    </span>
                    <span className={styles.chips} role="group" aria-label={`Atendimento de ${WEEKDAY[parseDate(d).getDay()]}`}>
                      {shifts.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          className={`${styles.chip}${isShiftOn(c, s) ? ` ${styles.chipOn}` : ''}`}
                          aria-pressed={isShiftOn(c, s)}
                          title={`${s.start} às ${s.end}`}
                          onClick={() => set(d, toggleShift(c, s))}
                        >{s.name}</button>
                      ))}
                      <button
                        type="button"
                        className={`${styles.chip}${c.kind === 'off' ? ` ${styles.chipOff}` : ''}`}
                        aria-pressed={c.kind === 'off'}
                        onClick={() => set(d, toggleOff(c))}
                      >Não atende</button>
                    </span>
                    {c.kind === 'unset' && <span className={styles.unset}>Por definir</span>}
                  </li>
                )
              })}
            </ul>

            <div className={styles.tools}>
              <button type="button" className={styles.tool} onClick={copyPrevWeek}>Copiar semana anterior</button>
              <button type="button" className={styles.tool} onClick={clearWeek}>Limpar semana</button>
            </div>

            <label className={styles.repeat}>
              <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} />
              <span>
                <b>Repetir toda semana</b>
                <small>Usa esta semana como rotina. Dias sem turno marcado ficam como não atende.</small>
              </span>
            </label>

            {outsideCount > 0 && (
              <p className={styles.warn} role="status">
                {outsideCount} {outsideCount === 1 ? 'consulta desta semana fica' : 'consultas desta semana ficam'} fora da escala. Elas não são alteradas, mas você pode precisar remarcar.
              </p>
            )}
          </>
        )}

        {error && <p className={f.error} role="alert" ref={el => el?.scrollIntoView({ block: 'nearest' })}>{error}</p>}
      </div>
    </Modal>
  )
}
