// Cálculos clínicos da ficha médica: IMC e idade gestacional / data provável do parto por DUM.
// Funções puras; datas em "AAAA-MM-DD" (sem fuso) e "hoje" vem de quem chama (hojeBrasil()).

const DAY = 86_400_000

export interface Bmi {
  value: number
  /** uma casa decimal, vírgula: "24,2" */
  text: string
  category: string
}

/** Classificação da OMS para adultos. */
export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'Abaixo do peso'
  if (bmi < 25) return 'Peso normal'
  if (bmi < 30) return 'Sobrepeso'
  if (bmi < 35) return 'Obesidade grau I'
  if (bmi < 40) return 'Obesidade grau II'
  return 'Obesidade grau III'
}

/** Aceita "70", "70,5" ou "70.5"; fora disso, NaN. */
export function parseDecimal(v: string | number | null | undefined): number {
  if (typeof v === 'number') return v
  const s = (v ?? '').toString().trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

/** IMC a partir de peso (kg) e altura (cm). Fora de faixa plausível (1–500 kg, 30–250 cm): null. */
export function calcBmi(weightKg: string | number, heightCm: string | number): Bmi | null {
  const w = parseDecimal(weightKg)
  const h = parseDecimal(heightCm)
  if (!(w >= 1 && w <= 500) || !(h >= 30 && h <= 250)) return null
  const m = h / 100
  const value = Math.round((w / (m * m)) * 10) / 10
  return { value, text: value.toFixed(1).replace('.', ','), category: bmiCategory(value) }
}

/** Texto para o campo "Peso / Altura / IMC" da ficha. */
export function bmiSummary(weightKg: string, heightCm: string): string {
  const b = calcBmi(weightKg, heightCm)
  if (!b) return ''
  return `Peso ${weightKg.trim().replace('.', ',')} kg | Altura ${heightCm.trim().replace('.', ',')} cm | IMC ${b.text} kg/m² (${b.category})`
}

const utcDay = (key: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(t)
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? t : null
}

const toKey = (t: number) => new Date(t).toISOString().slice(0, 10)

export interface Gestation {
  weeks: number
  days: number
  totalDays: number
  /** AAAA-MM-DD */
  dpp: string
  /** "12s3d" */
  label: string
}

/** Data provável do parto: DUM + 280 dias (regra de Naegele). */
export function calcDpp(dumKey: string): string | null {
  const t = utcDay(dumKey)
  return t == null ? null : toKey(t + 280 * DAY)
}

/**
 * Idade gestacional por DUM. DUM no futuro ou mais de 44 semanas atrás (não é gestação em curso): null.
 */
export function calcGestation(dumKey: string, todayKey: string): Gestation | null {
  const dum = utcDay(dumKey)
  const today = utcDay(todayKey)
  if (dum == null || today == null) return null
  const totalDays = Math.round((today - dum) / DAY)
  if (totalDays < 0 || totalDays > 44 * 7) return null
  const weeks = Math.floor(totalDays / 7)
  const days = totalDays % 7
  return { weeks, days, totalDays, dpp: toKey(dum + 280 * DAY), label: `${weeks}s${days}d` }
}

const brDate = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`

/** Texto para o campo de semanas de gestação / DPP. */
export function gestationSummary(dumKey: string, todayKey: string): string {
  const g = calcGestation(dumKey, todayKey)
  if (!g) return ''
  return `IG ${g.weeks} semanas e ${g.days} ${g.days === 1 ? 'dia' : 'dias'} (por DUM) | DPP ${brDate(g.dpp)}`
}
