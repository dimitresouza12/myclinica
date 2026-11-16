'use client'
import { useCallback, useEffect, useState } from 'react'
import { listarMedico, type Indisponibilidade, type LinhaMedico, type TipoMedico } from '@/lib/medico/registros'

/** Carrega as linhas de medico_registros de um paciente e tipo; `recarregar` atualiza depois de salvar ou excluir. */
export function useMedicoLista(patientId: string, tipo: TipoMedico) {
  const [linhas, setLinhas] = useState<LinhaMedico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [motivo, setMotivo] = useState<Indisponibilidade | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    listarMedico(patientId, tipo).then(r => {
      if (!vivo) return
      if (r.ok) { setLinhas(r.linhas); setMotivo(null) } else { setMotivo(r.motivo) }
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [patientId, tipo, versao])

  const recarregar = useCallback(async () => { setVersao(v => v + 1) }, [])

  return { linhas, carregando, motivo, recarregar }
}
