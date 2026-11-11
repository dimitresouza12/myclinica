// Formatação de datas das páginas públicas (fuso de Brasília). Funções puras.
import { BRASIL_TZ } from '@/lib/brasilDate'

export function fmtDateBr(isoOrDay: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDay)
  const d = new Date(day ? `${isoOrDay}T12:00:00-03:00` : isoOrDay)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { timeZone: BRASIL_TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDateTimeBr(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('pt-BR', { timeZone: BRASIL_TZ, weekday: 'short', day: '2-digit', month: '2-digit' })
  const time = d.toLocaleTimeString('pt-BR', { timeZone: BRASIL_TZ, hour: '2-digit', minute: '2-digit' })
  return `${date} às ${time}`
}

export function fmtKg(kg: number): string {
  return `${kg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
}
