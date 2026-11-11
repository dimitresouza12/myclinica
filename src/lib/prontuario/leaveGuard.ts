// Aviso de alterações não salvas ao sair do prontuário. O que cada aba ainda não salvou vira uma frase;
// a página registra um guarda global que botões, links do menu e a busca consultam antes de navegar.

export interface UnsavedFlags {
  ficha?: boolean
  evolucao?: boolean
  odontograma?: boolean
  faceograma?: boolean
  corpograma?: boolean
  metas?: boolean
  nutri?: boolean
  escalas?: boolean
}

/** O que ainda não foi salvo, em português, na ordem em que as abas aparecem. */
export function unsavedLabels(f: UnsavedFlags): string[] {
  return [
    f.ficha && 'a Ficha clínica',
    f.evolucao && 'a anotação da Evolução',
    f.odontograma && 'o Odontograma',
    f.faceograma && 'o Faceograma',
    f.corpograma && 'o Corpograma',
    f.metas && 'a avaliação do Plano terapêutico',
    f.nutri && 'a Nutrição (avaliação ou plano alimentar)',
    f.escalas && 'a escala clínica em preenchimento',
  ].filter(Boolean) as string[]
}

/** "a, b e c". */
export function joinLabels(list: string[]): string {
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}` : (list[0] ?? '')
}

/**
 * Destino interno (caminho + query + hash) de um link, ou null quando o clique não deve ser interceptado:
 * outra origem, mesma página, protocolo que não é http(s).
 */
export function internalTarget(href: string, origin: string, current: string): string | null {
  let url: URL
  try { url = new URL(href, current) } catch { return null }
  if (!/^https?:$/.test(url.protocol) || url.origin !== origin) return null
  const target = `${url.pathname}${url.search}${url.hash}`
  const here = new URL(current)
  if (`${here.pathname}${here.search}` === `${url.pathname}${url.search}`) return null
  return target
}

// ── Guarda global ───────────────────────────────────────────────

type Guard = () => Promise<boolean>
let guard: Guard | null = null

/** Registra (ou remove, com null) a pergunta feita antes de sair. Um guarda por vez: o da página aberta. */
export function setLeaveGuard(fn: Guard | null): void { guard = fn }

/** Pode sair? Sem guarda registrado, sim. Com alterações pendentes, pergunta à pessoa. */
export async function canLeave(): Promise<boolean> { return guard ? guard() : true }
