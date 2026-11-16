'use client'
import { useCallback, useEffect, useState } from 'react'
import { listarExamesVet, listarInternacoes, listarItensDeInternacao, type Indisponibilidade } from '@/lib/vet/clinicoStorage'
import type { ExameVetLinha } from '@/lib/vet/exames'
import type { Internacao, ItemInternacao } from '@/lib/vet/internacao'

/**
 * Carrega as internações (com os itens delas) e os exames de um pet. Cada lista tem seu próprio `motivo` (tabela ausente,
 * sem permissão, erro), para a tela avisar em vez de quebrar. `recarregar*` atualiza depois de salvar ou excluir.
 */
export function useVetClinico(patientId: string) {
  const [internacoes, setInternacoes] = useState<Internacao[]>([])
  const [itens, setItens] = useState<ItemInternacao[]>([])
  const [exames, setExames] = useState<ExameVetLinha[]>([])
  const [carregandoInternacao, setCarregandoInternacao] = useState(true)
  const [carregandoExames, setCarregandoExames] = useState(true)
  const [motivoInternacao, setMotivoInternacao] = useState<Indisponibilidade | null>(null)
  const [motivoExames, setMotivoExames] = useState<Indisponibilidade | null>(null)
  const [versaoI, setVersaoI] = useState(0)
  const [versaoE, setVersaoE] = useState(0)

  useEffect(() => {
    let vivo = true
    Promise.all([listarInternacoes(patientId), listarItensDeInternacao(patientId)]).then(([a, b]) => {
      if (!vivo) return
      if (a.ok && b.ok) { setInternacoes(a.linhas); setItens(b.linhas); setMotivoInternacao(null) }
      else { setMotivoInternacao(!a.ok ? a.motivo : !b.ok ? b.motivo : null) }
      setCarregandoInternacao(false)
    })
    return () => { vivo = false }
  }, [patientId, versaoI])

  useEffect(() => {
    let vivo = true
    listarExamesVet(patientId).then(r => {
      if (!vivo) return
      if (r.ok) { setExames(r.linhas); setMotivoExames(null) } else { setMotivoExames(r.motivo) }
      setCarregandoExames(false)
    })
    return () => { vivo = false }
  }, [patientId, versaoE])

  const recarregarInternacao = useCallback(async () => { setVersaoI(v => v + 1) }, [])
  const recarregarExames = useCallback(async () => { setVersaoE(v => v + 1) }, [])

  return { internacoes, itens, exames, carregandoInternacao, carregandoExames, motivoInternacao, motivoExames, recarregarInternacao, recarregarExames }
}
