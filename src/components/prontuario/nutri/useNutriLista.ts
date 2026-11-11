'use client'
import { useCallback, useEffect, useState } from 'react'
import { listarNutri, type LinhaNutri, type TipoNutri } from '@/lib/nutri/storage'
import type { Indisponibilidade } from '@/lib/nutri/erros'

/** Carrega as linhas de nutri_avaliacoes de um paciente e tipo; `recarregar` atualiza depois de salvar ou excluir. */
export function useNutriLista(patientId: string, tipo: TipoNutri) {
  const [linhas, setLinhas] = useState<LinhaNutri[]>([])
  const [carregando, setCarregando] = useState(true)
  const [motivo, setMotivo] = useState<Indisponibilidade | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    listarNutri(patientId, tipo).then(r => {
      if (!vivo) return
      if (r.ok) { setLinhas(r.linhas); setMotivo(null) } else { setMotivo(r.motivo) }
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [patientId, tipo, versao])

  const recarregar = useCallback(async () => { setVersao(v => v + 1) }, [])

  return { linhas, carregando, motivo, recarregar }
}
