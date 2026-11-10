// Rascunho da escala no editor: o que o usuário marcou em cada dia, antes de salvar.
import { localDateKey } from './slots'
import { dayStatus, fitsWindows, windowOfShift, weekdayOf, type DayRow, type PatternRow, type ScheduleData, type Shift, type Window } from './availability'

/** unset = por definir; off = não atende; on = atende nas janelas (turnos marcados) */
export type DayChoice = { kind: 'unset' } | { kind: 'off' } | { kind: 'on'; windows: Window[] }

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** O que a escala já salva diz sobre esse dia, no formato do editor. */
export function choiceFromSchedule(schedule: ScheduleData | undefined, dateStr: string, shifts: Shift[]): DayChoice {
  const st = dayStatus(schedule, dateStr)
  if (st.state === 'nao_atende') return { kind: 'off' }
  if (st.state === 'atende') return { kind: 'on', windows: st.windows.length > 0 ? st.windows : shifts.map(windowOfShift) }
  return { kind: 'unset' }
}

export function isShiftOn(choice: DayChoice, shift: Shift): boolean {
  return choice.kind === 'on' && choice.windows.some(w => w.shift_id === shift.id)
}

/** Liga ou desliga um turno no dia. Sem turno nenhum, o dia volta a "por definir". */
export function toggleShift(choice: DayChoice, shift: Shift): DayChoice {
  const current = choice.kind === 'on' ? choice.windows : []
  const windows = isShiftOn(choice, shift)
    ? current.filter(w => w.shift_id !== shift.id)
    : [...current, windowOfShift(shift)].sort((a, b) => toMin(a.start) - toMin(b.start))
  return windows.length === 0 ? { kind: 'unset' } : { kind: 'on', windows }
}

/** "Não atende" alterna: marcado de novo, volta a por definir. */
export function toggleOff(choice: DayChoice): DayChoice {
  return choice.kind === 'off' ? { kind: 'unset' } : { kind: 'off' }
}

/** Uma consulta fica fora do que foi marcado para o dia? Dia por definir não conta. */
export function apptOutsideChoice(choice: DayChoice, time: string, durationMin: number): boolean {
  if (choice.kind === 'unset') return false
  if (choice.kind === 'off') return true
  return !fitsWindows(time, durationMin, choice.windows)
}

/** Linhas para gravar a escala por data. Dia por definir não gera linha (a linha antiga, se houver, é apagada). */
export function dayRowsFromDraft(draft: Record<string, DayChoice>): { upsert: DayRow[]; clear: string[] } {
  const upsert: DayRow[] = []
  const clear: string[] = []
  for (const [date, c] of Object.entries(draft)) {
    if (c.kind === 'unset') clear.push(date)
    else upsert.push({ date, works: c.kind === 'on', windows: c.kind === 'on' ? c.windows : [] })
  }
  return { upsert, clear }
}

/** Rotina semanal a partir de uma semana de escolhas (7 datas, uma por dia da semana). Dia sem janela não gera linha. */
export function patternFromWeek(week: Record<string, DayChoice>): { upsert: PatternRow[]; clear: number[] } {
  const upsert: PatternRow[] = []
  const clear: number[] = []
  for (let wd = 0; wd < 7; wd++) clear.push(wd)
  for (const [date, c] of Object.entries(week)) {
    if (c.kind !== 'on') continue
    const wd = weekdayOf(date)
    upsert.push({ weekday: wd, windows: c.windows })
    clear.splice(clear.indexOf(wd), 1)
  }
  return { upsert, clear }
}

/** "AAAA-MM-DD" menos `n` dias, pelo calendário local. */
export function shiftDate(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return localDateKey(new Date(y, m - 1, d + n))
}

/**
 * Copiar a semana anterior: para cada dia por definir, repete o que o mesmo dia da semana anterior tinha
 * (atende nas mesmas janelas ou não atende). Dia já definido, ou cuja semana anterior também ficou por definir, não muda.
 */
export function rowsToCopyPrevWeek(schedule: ScheduleData | undefined, dates: string[]): DayRow[] {
  if (!schedule || !schedule.enabled) return []
  const rows: DayRow[] = []
  for (const date of dates) {
    if (dayStatus(schedule, date).state !== 'por_definir') continue
    const prev = dayStatus(schedule, shiftDate(date, -7))
    if (prev.state === 'atende') rows.push({ date, works: true, windows: prev.windows })
    else if (prev.state === 'nao_atende') rows.push({ date, works: false, windows: [] })
  }
  return rows
}
