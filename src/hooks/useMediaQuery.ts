import { useSyncExternalStore } from 'react'

/** Segue uma media query sem setState em efeito. No servidor devolve `serverValue`, e o valor real entra na hidratação. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    notify => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', notify)
      return () => mq.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  )
}
