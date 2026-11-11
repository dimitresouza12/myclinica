import { useSyncExternalStore } from 'react'

// Estado compartilhado de "a imagem da sprite falhou ao carregar". Quando falha (rede, 404, bloqueio), os dentes
// passam a mostrar o contorno vetorial no lugar da foto, em vez de a arcada ficar invisível.
let failed = false
let probed = false
const subs = new Set<() => void>()

export function markSpriteFailed() {
  if (failed) return
  failed = true
  subs.forEach(f => f())
}

/** Testa o carregamento da sprite uma vez por página (o navegador reaproveita o cache da própria imagem do atlas). */
export function probeSprite(src: string) {
  if (probed || typeof window === 'undefined') return
  probed = true
  const img = new Image()
  img.onerror = markSpriteFailed
  img.src = src
}

const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb) } }
export const useSpriteFailed = () => useSyncExternalStore(subscribe, () => failed, () => false)

/** Só para testes. */
export const resetSpriteStatus = () => { failed = false; probed = false; subs.clear() }
export const spriteFailed = () => failed
