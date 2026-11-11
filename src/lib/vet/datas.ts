// Datas AAAA-MM-DD sem fuso (a carteira e as pesagens são datas de calendário, não instantes). Funções puras.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** true quando é uma data de calendário real (2026-02-30 não é). */
export function isoValido(iso: string | null | undefined): iso is string {
  const m = ISO.exec(iso ?? '')
  if (!m) return false
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

const utc = (iso: string) => { const m = ISO.exec(iso)!; return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) }

/** Soma dias a uma data AAAA-MM-DD. Data inválida ou n não inteiro: null. */
export function somarDias(iso: string | null | undefined, dias: number): string | null {
  if (!isoValido(iso) || !Number.isInteger(dias)) return null
  const t = new Date(utc(iso) + dias * 86_400_000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** Dias de `a` até `b` (positivo quando b é depois de a). Alguma data inválida: null. */
export function diasEntre(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!isoValido(a) || !isoValido(b)) return null
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

/** 2026-11-14 -> 14/11/2026 (valor que não é data volta como veio). */
export function dataBr(iso: string | null | undefined): string {
  const m = ISO.exec((iso ?? '').slice(0, 10))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '')
}

/** 2026-11-14 -> 14/11 */
export function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}
