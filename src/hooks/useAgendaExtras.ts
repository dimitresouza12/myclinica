'use client'
import { useEffect, useState } from 'react'
import { probeAgendaExtras, type AgendaExtras } from '@/lib/agenda/extrasSchema'

const NONE: AgendaExtras = { series: false, packages: false, meeting: false }

/** O que o banco já suporta: séries recorrentes e pacotes de sessões. Falso até a migration ser aplicada. */
export function useAgendaExtras(): AgendaExtras {
  const [extras, setExtras] = useState<AgendaExtras>(NONE)
  useEffect(() => {
    let live = true
    probeAgendaExtras().then(v => { if (live) setExtras(v) })
    return () => { live = false }
  }, [])
  return extras
}
