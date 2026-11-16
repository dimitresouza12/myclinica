'use client'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { useProfessionals } from '@/hooks/useClinicData'
import type { AuthClinic, Patient } from '@/types'
import { PillTabs } from '@/components/ui/PillTabs'
import { hojeBrasil } from '@/lib/brasilDate'
import { somarDias } from '@/lib/vet/datas'
import type { Execucao, Exercicio } from '@/lib/fisio/exercicios'
import { listarExecucoes, listarExercicios, listarProgramas, urlsDasFotos, type Indisponibilidade, type ProgramaCompleto } from '@/lib/fisio/storage'
import { BibliotecaPanel } from './BibliotecaPanel'
import { ProgramaPanel } from './ProgramaPanel'
import styles from './fisio.module.css'

type Vista = 'programa' | 'biblioteca'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
}

const SEM_EXERCICIOS: Exercicio[] = []
const SEM_PROGRAMAS: ProgramaCompleto[] = []
const SEM_EXECUCOES: Execucao[] = []
const SEM_FOTOS: ReadonlyMap<string, string> = new Map()

/** Aba "Exercícios" do prontuário de fisioterapia: programa do paciente (com o que ele marcou) e biblioteca da clínica. */
export function TabExercicios({ patient, clinic, clinicId }: Props) {
  const user = useAuthStore(s => s.user)
  const { data: profissionais = [] } = useProfessionals(clinic.id)
  const [vista, setVista] = useState<Vista>('programa')
  const desde = somarDias(hojeBrasil(), -29) ?? hojeBrasil()

  const biblioteca = useQuery({ queryKey: ['fisio-exercicios', clinicId], queryFn: () => listarExercicios(clinicId), staleTime: 30_000 })
  const programas = useQuery({ queryKey: ['fisio-programas', clinicId, patient.id], queryFn: () => listarProgramas(clinicId, patient.id), staleTime: 15_000 })
  const execucoes = useQuery({ queryKey: ['fisio-execucoes', clinicId, patient.id], queryFn: () => listarExecucoes(clinicId, patient.id, desde), staleTime: 15_000, refetchOnWindowFocus: true })

  const listaBiblioteca = biblioteca.data?.ok ? biblioteca.data.linhas : SEM_EXERCICIOS
  const motivoBiblioteca: Indisponibilidade | null = biblioteca.data && !biblioteca.data.ok ? biblioteca.data.motivo : null
  const listaProgramas = programas.data?.ok ? programas.data.programas : SEM_PROGRAMAS
  const motivoProgramas: Indisponibilidade | null = programas.data && !programas.data.ok ? programas.data.motivo : null
  const listaExecucoes = execucoes.data?.ok ? execucoes.data.linhas : SEM_EXECUCOES

  const caminhos = useMemo(() => {
    const s = new Set<string>()
    for (const e of listaBiblioteca) if (e.image_path) s.add(e.image_path)
    for (const p of listaProgramas) for (const i of p.itens) if (i.image_path) s.add(i.image_path)
    return [...s].sort()
  }, [listaBiblioteca, listaProgramas])
  const fotos = useQuery({ queryKey: ['fisio-fotos', clinicId, caminhos.join('|')], queryFn: () => urlsDasFotos(caminhos), enabled: caminhos.length > 0, staleTime: 50 * 60_000 })
  const mapaFotos = fotos.data ?? SEM_FOTOS

  const ativos = useMemo(() => listaBiblioteca.filter(e => e.active), [listaBiblioteca])

  return (
    <div className={styles.wrap}>
      <PillTabs<Vista>
        label="Seções de Exercícios"
        value={vista}
        onChange={setVista}
        options={[
          { value: 'programa', label: 'Programa do paciente' },
          { value: 'biblioteca', label: 'Biblioteca da clínica' },
        ]}
      />
      {/* as duas ficam montadas: trocar de seção não perde o programa que está sendo montado */}
      <div style={{ display: vista === 'programa' ? undefined : 'none' }}>
        <ProgramaPanel
          patient={patient} clinic={clinic} clinicId={clinicId}
          programas={listaProgramas} carregando={programas.isPending} motivo={motivoProgramas}
          execucoes={listaExecucoes} biblioteca={ativos} fotos={mapaFotos}
          profissionais={profissionais} profissionalAtualId={user?.professionalId ?? null}
          irParaBiblioteca={() => setVista('biblioteca')}
        />
      </div>
      <div style={{ display: vista === 'biblioteca' ? undefined : 'none' }}>
        <BibliotecaPanel clinicId={clinicId} exercicios={listaBiblioteca} carregando={biblioteca.isPending} motivo={motivoBiblioteca} fotos={mapaFotos} />
      </div>
    </div>
  )
}
