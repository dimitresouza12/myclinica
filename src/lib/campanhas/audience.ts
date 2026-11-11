// Públicos das campanhas: aniversariantes do mês e pacientes sem retorno. Funções puras.
import { hojeBrasil } from '@/lib/brasilDate'

export interface AudiencePatient {
  id: string
  name: string
  phone: string | null
  created_at: string
  birth_date?: string | null
}

export interface AudienceAppt {
  patient_id: string | null
  scheduled_at: string
  status: string | null
}

/** Consulta que não conta como visita: cancelada, falta e bloqueio de agenda. */
const NOT_A_VISIT = new Set(['cancelado', 'faltou', 'bloqueado'])

const DAY_MS = 24 * 60 * 60 * 1000

/** Maior janela de "sem retorno" oferecida; a consulta de consultas precisa cobrir pelo menos isto. */
export const MAX_RETURN_WINDOW_DAYS = 90

/** Dia e mês de "AAAA-MM-DD" (ignora ano); data inválida → null. */
export function birthMonthDay(birth: string | null | undefined): { month: number; day: number } | null {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(birth ?? '')
  if (!m) return null
  const month = Number(m[1]), day = Number(m[2])
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { month, day } : null
}

/** Pacientes que fazem aniversário no mês corrente de Brasília, em ordem de dia. Sem data de nascimento: fora. */
export function birthdaysOfMonth<T extends AudiencePatient>(patients: T[], now: Date = new Date()): T[] {
  const month = Number(hojeBrasil(now).slice(5, 7))
  return patients
    .map(p => ({ p, md: birthMonthDay(p.birth_date) }))
    .filter((x): x is { p: T; md: { month: number; day: number } } => !!x.md && x.md.month === month)
    .sort((a, b) => a.md.day - b.md.day || a.p.name.localeCompare(b.p.name, 'pt-BR'))
    .map(x => x.p)
}

/** Última consulta válida (qualquer data, inclusive futura) de cada paciente, em ms. */
export function lastVisitByPatient(appts: AudienceAppt[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const a of appts) {
    if (!a.patient_id || NOT_A_VISIT.has(a.status ?? '')) continue
    const t = Date.parse(a.scheduled_at)
    if (Number.isNaN(t)) continue
    if (t > (out.get(a.patient_id) ?? -Infinity)) out.set(a.patient_id, t)
  }
  return out
}

/**
 * Pacientes sem consulta (passada ou marcada) nos últimos `days` dias. A referência é a consulta mais
 * recente; quem nunca teve consulta cai no dia do cadastro, para um paciente recém-cadastrado não entrar.
 * `appts` precisa cobrir pelo menos a janela (MAX_RETURN_WINDOW_DAYS): consulta mais antiga que isso não é lida,
 * mas também não muda o resultado, pois já estaria fora da janela.
 */
export function withoutReturn<T extends AudiencePatient>(patients: T[], appts: AudienceAppt[], days: number, now: Date = new Date()): T[] {
  const cutoff = now.getTime() - days * DAY_MS
  const last = lastVisitByPatient(appts)
  return patients.filter(p => {
    const created = Date.parse(p.created_at)
    const ref = Math.max(last.get(p.id) ?? -Infinity, Number.isNaN(created) ? -Infinity : created)
    return ref < cutoff
  })
}
