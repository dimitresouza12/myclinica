import { useEffect } from 'react'

// Com contador: modais empilhados (ex.: confirmação sobre um modal) travam e destravam em qualquer ordem.
// A página só volta ao normal quando a última trava sai.
let locks = 0
let saved: { overflow: string; touchAction: string } | null = null

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (locks === 0) {
      saved = { overflow: document.body.style.overflow, touchAction: document.body.style.touchAction }
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
    }
    locks++
    return () => {
      locks--
      if (locks === 0 && saved) {
        document.body.style.overflow = saved.overflow
        document.body.style.touchAction = saved.touchAction
        saved = null
      }
    }
  }, [active])
}
