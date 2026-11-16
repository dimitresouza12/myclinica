// Slug do link público (/agendar/<slug>). Mesmo formato do CHECK da tabela clinic_online_booking.

export const SLUG_MIN = 3
export const SLUG_MAX = 40
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

/** Texto livre (nome da clínica) -> slug: sem acento, minúsculas, hífen no lugar do resto, até 40 caracteres. */
export function slugify(text: string): string {
  const base = (text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '')
  return base
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && SLUG_RE.test(slug)
}

/** Mensagem do primeiro problema do slug digitado, ou null se serve. */
export function slugProblem(raw: string): string | null {
  const slug = raw.trim()
  if (!slug) return 'Escolha o endereço do link.'
  if (slug.length < SLUG_MIN) return `Use pelo menos ${SLUG_MIN} caracteres.`
  if (slug.length > SLUG_MAX) return `Use no máximo ${SLUG_MAX} caracteres.`
  if (!/^[a-z0-9-]+$/.test(slug)) return 'Use só letras minúsculas sem acento, números e hífen.'
  if (slug.startsWith('-') || slug.endsWith('-')) return 'O endereço não pode começar nem terminar com hífen.'
  return null
}
