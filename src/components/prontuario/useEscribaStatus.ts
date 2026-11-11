'use client'
import { useCallback, useEffect, useState } from 'react'
import { fetchEscribaStatus, type EscribaStatus } from './iaEscribaApi'

export type EscribaEstado =
  | { kind: 'carregando' }
  | { kind: 'oculto' }                   // sem plano com IA (ou falha ao consultar): não mostra nada
  | { kind: 'nao_configurada' }          // aviso neutro, botão desabilitado
  | { kind: 'sem_consentimento'; suportado: boolean }
  | { kind: 'pronto' }

export function estadoDe(s: EscribaStatus | null): EscribaEstado {
  if (!s) return { kind: 'oculto' }
  if (!s.plano) return { kind: 'oculto' }
  if (!s.configurada) return { kind: 'nao_configurada' }
  if (!s.consentimento) return { kind: 'sem_consentimento', suportado: s.consentimento_suportado }
  return { kind: 'pronto' }
}

/** Estado da IA escriba para a clínica logada. Tudo desligado por padrão; falha de consulta = oculto. */
export function useEscribaStatus(enabled: boolean): { estado: EscribaEstado; reload: () => void } {
  const [estado, setEstado] = useState<EscribaEstado>({ kind: 'carregando' })

  const load = useCallback((force: boolean) => {
    fetchEscribaStatus(force)
      .then(s => setEstado(estadoDe(s)))
      .catch(() => setEstado({ kind: 'oculto' }))
  }, [])

  useEffect(() => {
    if (!enabled) return
    load(false)
  }, [enabled, load])

  return { estado: enabled ? estado : { kind: 'oculto' }, reload: () => load(true) }
}
