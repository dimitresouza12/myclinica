// Leitura e formatação de números digitados (vírgula ou ponto). Funções puras.

/** "4,25" / "4.25" / 4.25 -> 4.25; vazio, texto ou não finito -> null. */
export function lerNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** 4.25 -> "4,25" (até `casas` casas, sem zeros sobrando); null/NaN -> "—". */
export function fmt(n: number | null | undefined, casas = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const f = 10 ** casas
  const r = Math.round((n + Number.EPSILON) * f) / f
  return String(r).replace('.', ',')
}
