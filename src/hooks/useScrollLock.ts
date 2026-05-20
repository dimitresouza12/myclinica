import { useEffect } from 'react'

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const original = document.body.style.overflow
    const originalTouch = document.body.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    return () => {
      document.body.style.overflow = original
      document.body.style.touchAction = originalTouch
    }
  }, [active])
}
