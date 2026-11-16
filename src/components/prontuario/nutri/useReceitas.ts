'use client'
import { useCallback, useEffect, useState } from 'react'
import { listarReceitas } from '@/lib/nutri/receitasStorage'
import type { Receita } from '@/lib/nutri/receitas'
import type { Indisponibilidade } from '@/lib/nutri/erros'

/** Carrega o banco de receitas da clínica; `recarregar` atualiza depois de salvar ou excluir. */
export function useReceitas(clinicId: string) {
  const [receitas, setReceitas] = useState<Receita[]>([])
  const [carregando, setCarregando] = useState(true)
  const [motivo, setMotivo] = useState<Indisponibilidade | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    listarReceitas(clinicId).then(r => {
      if (!vivo) return
      if (r.ok) { setReceitas(r.linhas); setMotivo(null) } else { setMotivo(r.motivo) }
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [clinicId, versao])

  const recarregar = useCallback(async () => { setVersao(v => v + 1) }, [])

  return { receitas, carregando, motivo, recarregar }
}
