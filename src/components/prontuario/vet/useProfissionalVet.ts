'use client'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useProfessionals } from '@/hooks/useClinicData'
import { profissionalVetParaImpresso } from '@/lib/vet/cabecalhoPet'
import type { Professional } from '@/types'

/**
 * Veterinário que assina os impressos clínicos (resumo de alta, exames): quem está logado; senão o único veterinário
 * da clínica; senão a pessoa escolhe na tela (`precisaEscolher`).
 */
export function useProfissionalVet(clinicId: string) {
  const user = useAuthStore(s => s.user)
  const { data: profissionais = [] } = useProfessionals(clinicId)
  const [manualId, setManualId] = useState('')

  const logado = user?.professionalId ? profissionais.find(p => p.id === user.professionalId) : undefined
  const candidatos: Professional[] = useMemo(() => {
    const vets = profissionais.filter(p => p.specialty_type === 'vet')
    return vets.length > 0 ? vets : profissionais
  }, [profissionais])
  const precisaEscolher = !logado && candidatos.length > 1
  const responsavel = logado ?? (manualId ? candidatos.find(p => p.id === manualId) : undefined) ?? (candidatos.length === 1 ? candidatos[0] : undefined)
  const profissional = useMemo(() => profissionalVetParaImpresso(responsavel, user?.displayName), [responsavel, user?.displayName])

  return { profissional, candidatos, precisaEscolher, manualId, setManualId }
}
