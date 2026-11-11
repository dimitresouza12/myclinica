'use client'
import { useEffect, useState } from 'react'
import { probeAtendimentoSchema } from '@/lib/atendimento/schema'

/** O banco já suporta o fluxo de atendimento? Falso até a migration ser aplicada (e enquanto carrega). */
export function useAtendimentoSchema(): { available: boolean; checked: boolean } {
  const [state, setState] = useState({ available: false, checked: false })
  useEffect(() => {
    let live = true
    probeAtendimentoSchema().then(v => { if (live) setState({ available: v, checked: true }) })
    return () => { live = false }
  }, [])
  return state
}
