'use client'
import { useCallback, useEffect, useState } from 'react'
import { hojeBrasil } from '@/lib/brasilDate'
import { somarDias } from '@/lib/vet/datas'
import type { RegistroDiario } from '@/lib/nutri/diario'
import { listarDiario, urlsDasFotosDiario } from '@/lib/nutri/diarioStorage'
import type { Indisponibilidade } from '@/lib/nutri/erros'

/** Dias carregados do diário (de hoje para trás). */
export const DIAS_DO_DIARIO = 30

/** Carrega os últimos dias do diário do paciente, com as URLs assinadas das fotos; `recarregar` busca de novo. */
export function useDiario(clinicId: string, patientId: string) {
  const [registros, setRegistros] = useState<RegistroDiario[]>([])
  const [fotos, setFotos] = useState<Map<string, string>>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [motivo, setMotivo] = useState<Indisponibilidade | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    const desde = somarDias(hojeBrasil(), -(DIAS_DO_DIARIO - 1)) ?? hojeBrasil()
    listarDiario(clinicId, patientId, desde).then(async r => {
      if (!vivo) return
      if (!r.ok) { setMotivo(r.motivo); setCarregando(false); return }
      setMotivo(null)
      setRegistros(r.linhas)
      const urls = await urlsDasFotosDiario(r.linhas.map(l => l.foto_path).filter((p): p is string => !!p))
      if (!vivo) return
      setFotos(urls)
      setCarregando(false)
    })
    return () => { vivo = false }
  }, [clinicId, patientId, versao])

  const recarregar = useCallback(() => { setCarregando(true); setVersao(v => v + 1) }, [])

  return { registros, fotos, carregando, motivo, recarregar }
}
