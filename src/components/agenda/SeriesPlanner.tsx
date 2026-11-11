'use client'
import {
  FREQUENCY_LABEL, MAX_SERIES, MAX_WEEKDAYS, WEEKDAY_SHORT, normalizeWeekdays, weekdayOfKey,
  type OccurrenceState, type SeriesFrequency, type SeriesForm,
} from '@/lib/agenda/series'
import type { useSeriesPlan } from '@/hooks/useSeriesPlan'
import { DatePicker } from '@/components/ui/DatePicker'
import { IntegerInput } from '@/components/ui/NumericInput'
import f from '@/components/ui/modalForm.module.css'
import styles from './seriesPlanner.module.css'

type Plan = ReturnType<typeof useSeriesPlan>

const STATE_LABEL: Record<OccurrenceState, string> = { ok: 'Livre', conflito: 'Conflito', fora_escala: 'Fora da escala' }
const FREQUENCIES: SeriesFrequency[] = ['semanal', 'quinzenal', 'mensal']

const fmtDay = (d: string) => new Date(`${d}T00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).replace('.', '')

interface Props {
  series: SeriesForm
  onChange: (next: SeriesForm) => void
  /** data da primeira consulta ("AAAA-MM-DD") */
  startDate: string
  plan: Plan
  /** o profissional tem escala ligada */
  hasSchedule: boolean
  hasProfessional: boolean
  /** a clínica sincroniza com o Google Agenda (séries não entram nele) */
  gcalConnected: boolean
  /** quantas sessões do pacote escolhido ainda podem ser marcadas (null = sem pacote) */
  packageFree: number | null
}

/** "Repetir este agendamento": regra de repetição e a lista dos horários gerados para revisar antes de confirmar. */
export function SeriesPlanner({ series, onChange, startDate, plan, hasSchedule, hasProfessional, gcalConnected, packageFree }: Props) {
  const set = (patch: Partial<SeriesForm>) => onChange({ ...series, ...patch })
  const startWd = startDate ? weekdayOfKey(startDate) : null
  const weekdays = startDate ? normalizeWeekdays(startDate, series.weekdays) : []
  const weekly = series.frequency !== 'mensal'

  function toggleWeekday(wd: number) {
    if (wd === startWd) return
    const has = series.weekdays.includes(wd)
    if (!has && weekdays.length >= MAX_WEEKDAYS) return
    set({ weekdays: has ? series.weekdays.filter(w => w !== wd) : [...series.weekdays, wd] })
  }

  const out = plan.occurrences.length - plan.included.length
  const conflicts = plan.occurrences.filter(o => o.state === 'conflito').length

  return (
    <div className={styles.wrap}>
      <div className={f.switches}>
        <label className={f.switchRow}>
          <span className={f.switchText}>
            <b>Repetir este agendamento</b>
            <small>Semanal, quinzenal ou mensal, em vários dias da semana</small>
          </span>
          <span className={f.toggle}>
            <input type="checkbox" checked={series.on} onChange={e => set({ on: e.target.checked })} />
            <span />
          </span>
        </label>
      </div>

      {series.on && (
        <div className={styles.body}>
          <div className={f.field}>
            <label id="series-freq">Frequência</label>
            <div className={styles.chips} role="group" aria-labelledby="series-freq">
              {FREQUENCIES.map(fr => (
                <button key={fr} type="button" className={styles.chip} aria-pressed={series.frequency === fr} onClick={() => set({ frequency: fr })}>
                  {FREQUENCY_LABEL[fr]}
                </button>
              ))}
            </div>
          </div>

          {weekly && (
            <div className={f.field}>
              <label id="series-days">Dias da semana (até {MAX_WEEKDAYS} por semana)</label>
              <div className={styles.chips} role="group" aria-labelledby="series-days">
                {WEEKDAY_SHORT.map((name, wd) => {
                  const on = weekdays.includes(wd)
                  const locked = wd === startWd
                  const full = !on && weekdays.length >= MAX_WEEKDAYS
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`${styles.chip} ${styles.chipDay}`}
                      aria-pressed={on}
                      disabled={full}
                      title={locked ? 'Dia da primeira consulta' : full ? `No máximo ${MAX_WEEKDAYS} dias por semana` : undefined}
                      onClick={() => toggleWeekday(wd)}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className={f.field}>
            <label id="series-end">Termina</label>
            <div className={styles.chips} role="group" aria-labelledby="series-end">
              <button type="button" className={styles.chip} aria-pressed={series.endMode === 'contagem'} onClick={() => set({ endMode: 'contagem' })}>Depois de N consultas</button>
              <button type="button" className={styles.chip} aria-pressed={series.endMode === 'data'} onClick={() => set({ endMode: 'data' })}>Em uma data</button>
            </div>
            {series.endMode === 'contagem' ? (
              <IntegerInput value={series.occurrences || ''} onChange={v => set({ occurrences: v === '' ? 0 : Number(v) })} min={1} max={MAX_SERIES} placeholder="8" aria-label="Número de consultas da série" />
            ) : (
              <DatePicker ariaLabel="Repetir até" value={series.untilDate} onChange={d => set({ untilDate: d })} />
            )}
          </div>

          {!hasProfessional && <p className={f.hint}>Sem profissional escolhido, os conflitos de horário não são conferidos.</p>}
          {gcalConnected && <p className={f.hint}>As consultas de uma série não são enviadas ao Google Agenda automaticamente.</p>}

          {plan.ready && (
            <div className={styles.review}>
              <div className={styles.reviewHead}>
                <strong>{plan.included.length} {plan.included.length === 1 ? 'consulta será criada' : 'consultas serão criadas'}</strong>
                {out > 0 && <span className={styles.reviewMeta}>{out} fora da lista</span>}
              </div>
              {plan.truncated && <p className={f.hint}>Limite de {MAX_SERIES} consultas por série: as demais ficaram de fora.</p>}
              {conflicts > 0 && <p className={f.hint}>Horários com conflito ficam de fora. Remova ou inclua os outros como preferir.</p>}
              {hasSchedule && plan.occurrences.some(o => o.state === 'fora_escala') && (
                <p className={f.hint}>Dias fora da escala do profissional só entram como encaixe, para quem tem essa permissão.</p>
              )}
              {packageFree !== null && plan.included.length > packageFree && (
                <p className={`${f.hint} ${styles.warn}`}>O pacote só tem {packageFree} {packageFree === 1 ? 'sessão livre' : 'sessões livres'}: reduza a lista ou escolha outro pacote.</p>
              )}
              {plan.occurrences.length === 0 ? (
                <p className={f.hint}>Nenhuma data gerada. Confira a data de início e o fim da repetição.</p>
              ) : (
                <ul className={styles.list} aria-label="Horários da série">
                  {plan.occurrences.map(o => (
                    <li key={o.date} className={`${styles.row}${o.include ? '' : ` ${styles.rowOff}`}`}>
                      <span className={styles.idx}>{o.index}</span>
                      <span className={styles.when}>
                        <strong>{fmtDay(o.date)}</strong>
                        <span>{o.time}</span>
                      </span>
                      <span className={`${styles.tag} ${styles[`tag_${o.state}`]}`}>{o.conflictWith && o.state === 'conflito' ? o.conflictWith : STATE_LABEL[o.state]}</span>
                      <button
                        type="button"
                        className={styles.rowBtn}
                        onClick={() => plan.setInclude(o.date, !o.include)}
                        aria-label={`${o.include ? 'Remover' : 'Incluir'} ${fmtDay(o.date)}`}
                      >
                        {o.include ? 'Remover' : 'Incluir'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
