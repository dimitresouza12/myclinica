'use client'
import { Suspense, use } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Patient } from '@/types'
import { ProntuarioView } from '@/components/prontuario/ProntuarioView'
import { PatientCadastroView } from '@/components/pacientes/PatientCadastroView'
import { usePermissions } from '@/hooks/usePermissions'
import { showsProntuario } from '@/lib/pacientes/cadastro'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { EmptyState } from '@/components/ui/EmptyState'
import btn from '@/components/ui/button.module.css'
import styles from './prontuarioPage.module.css'

function NotFound() {
  return (
    <div className={styles.state}>
      <EmptyState
        icon="patients"
        title="Paciente não encontrado"
        description="Este paciente não existe, foi removido ou não pertence a esta clínica."
        action={<Link href="/pacientes" className={btn.primary}>Voltar para Pacientes</Link>}
      />
    </div>
  )
}

function ProntuarioPage({ id }: { id: string }) {
  const clinic = useAuthStore(s => s.clinic)
  // Sem can_view de 'prontuario' a página é só o cadastro (o banco já nega os dados clínicos; aqui some o casco)
  const prontuarioPerm = usePermissions('prontuario')
  const { data: patient, isLoading, isError, refetch } = useQuery({
    queryKey: ['paciente', clinic?.id, id],
    enabled: !!clinic?.id,
    // refetch ao focar a janela devolveria a ficha ao banco no meio da edição
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async (): Promise<Patient | null> => {
      // sempre escopado à clínica da sessão: paciente de outra clínica é "não encontrado", nunca dado
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .eq('clinic_id', clinic!.id)
        .eq('is_active', true)
        .maybeSingle<Patient>()
      // id que não é um uuid válido também é "não encontrado"
      if (error && error.code === '22P02') return null
      if (error) throw error
      return data ?? null
    },
  })

  const withProntuario = showsProntuario(prontuarioPerm)
  if (!clinic || isLoading || !prontuarioPerm.loaded) {
    return <p className={styles.loading}>{withProntuario || !prontuarioPerm.loaded ? 'Carregando prontuário...' : 'Carregando cadastro...'}</p>
  }
  if (isError) {
    return (
      <div className={styles.state}>
        <EmptyState
          icon="alert"
          title={withProntuario ? 'Não foi possível abrir o prontuário' : 'Não foi possível abrir o cadastro'}
          description="Verifique sua conexão e tente de novo."
          action={<button type="button" className={btn.primary} onClick={() => refetch()}>Tentar de novo</button>}
        />
      </div>
    )
  }
  if (!patient || patient.clinic_id !== clinic.id) return <NotFound />

  if (!withProntuario) return <PatientCadastroView key={patient.id} patient={patient} clinic={clinic} />

  // key: trocar de paciente remonta tudo (abas, avisos de não salvo, dados do anterior)
  return <ProntuarioView key={patient.id} patient={patient} clinic={clinic} />
}

export default function ProntuarioRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <PermissionGuard module="pacientes">
      <Suspense fallback={<p className={styles.loading}>Carregando prontuário...</p>}>
        <ProntuarioPage id={id} />
      </Suspense>
    </PermissionGuard>
  )
}
