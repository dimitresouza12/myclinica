'use client'
import { useCallback, useEffect, useState } from 'react'
import { listarCarteira, listarPesos, type Indisponibilidade } from '@/lib/vet/storage'
import type { Pesagem } from '@/lib/vet/peso'
import type { RegistroCarteira } from '@/lib/vet/vacinas'

/**
 * Carrega a carteira e as pesagens de um pet. Cada lista tem seu próprio `motivo` (tabela ausente, sem permissão, erro),
 * para a tela avisar em vez de quebrar. `recarregar*` atualiza depois de salvar ou excluir.
 */
export function useVetDados(patientId: string) {
  const [registros, setRegistros] = useState<RegistroCarteira[]>([])
  const [pesos, setPesos] = useState<Pesagem[]>([])
  const [carregandoRegistros, setCarregandoRegistros] = useState(true)
  const [carregandoPesos, setCarregandoPesos] = useState(true)
  const [motivoRegistros, setMotivoRegistros] = useState<Indisponibilidade | null>(null)
  const [motivoPesos, setMotivoPesos] = useState<Indisponibilidade | null>(null)
  const [versaoR, setVersaoR] = useState(0)
  const [versaoP, setVersaoP] = useState(0)

  useEffect(() => {
    let vivo = true
    listarCarteira(patientId).then(r => {
      if (!vivo) return
      if (r.ok) { setRegistros(r.linhas); setMotivoRegistros(null) } else { setMotivoRegistros(r.motivo) }
      setCarregandoRegistros(false)
    })
    return () => { vivo = false }
  }, [patientId, versaoR])

  useEffect(() => {
    let vivo = true
    listarPesos(patientId).then(r => {
      if (!vivo) return
      if (r.ok) { setPesos(r.linhas); setMotivoPesos(null) } else { setMotivoPesos(r.motivo) }
      setCarregandoPesos(false)
    })
    return () => { vivo = false }
  }, [patientId, versaoP])

  const recarregarRegistros = useCallback(async () => { setVersaoR(v => v + 1) }, [])
  const recarregarPesos = useCallback(async () => { setVersaoP(v => v + 1) }, [])

  return { registros, pesos, carregandoRegistros, carregandoPesos, motivoRegistros, motivoPesos, recarregarRegistros, recarregarPesos }
}
