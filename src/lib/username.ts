export function normalizeUsername(raw: string) {
  return raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_.-]/g, '')
}

export const USERNAME_REGEX = /^[a-z0-9][a-z0-9_.-]{2,29}$/

function digits4() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

/**
 * Usuário gerado a partir do e-mail (parte antes do @), para quem se cadastra sem escolher um.
 * Sempre devolve algo que passa em USERNAME_REGEX: tira símbolos, garante que começa com letra/número e,
 * se sobrar curto demais (menos de 3), completa com 4 dígitos aleatórios. Com `comSufixo`, anexa os 4 dígitos
 * de qualquer jeito (usado ao tentar de novo quando o nome já existe).
 */
export function usernameFromEmail(email: string, comSufixo = false) {
  const prefixo = normalizeUsername((email.split('@')[0] ?? '')).replace(/^[^a-z0-9]+/, '')
  const base = comSufixo || prefixo.length < 3 ? prefixo.slice(0, 25) : prefixo.slice(0, 30)
  const nome = comSufixo || base.length < 3 ? `${base}${digits4()}` : base
  return USERNAME_REGEX.test(nome) ? nome : `user${digits4()}`
}
