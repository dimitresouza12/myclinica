'use client'
import { useCallback, useEffect, useState } from 'react'
import { listarOdonto, type LinhaOdonto, type TabelaOdonto } from '@/lib/odonto/storage'
import type { Indisponibilidade } from '@/lib/nutri/erros'

/** Carrega as linhas de uma tabela da Odontologia para o paciente; `recarregar` atualiza depois de salvar ou excluir. */
export function useOdontoLista(tabela: TabelaOdonto, patientId: string) {
  const [linhas, setLinhas] = useState<LinhaOdonto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [motivo, setMotivo] = useState<Indisponibilidade | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    listarOdonto(tabela, patientId).then(r => {
      if (!vivo) return
      if (r.ok) { setLinhas(r.linhas); setMotivo(null) } else { setMotivo(r.motivo) }
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [tabela, patientId, versao])

  const recarregar = useCallback(async () => { setVersao(v => v + 1) }, [])

  return { linhas, carregando, motivo, recarregar }
}
