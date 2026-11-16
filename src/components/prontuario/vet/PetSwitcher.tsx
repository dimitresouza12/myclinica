'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Patient } from '@/types'
import { Button } from '@/components/ui/Button'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { usePermissions } from '@/hooks/usePermissions'
import { buscarPetsDoTutor, vincularAoTutor } from '@/lib/vet/clinicoStorage'
import { patientHref } from '@/lib/prontuario/navigation'
import { formatBrPhone } from '@/lib/phoneFormat'
import { candidatosAoVinculo, especieDoPet, petsDoTutor, petsDoTutorPorContato, raizDoTutor, rotuloDoPet, type PetLinha } from '@/lib/vet/tutor'
import styles from './vet.module.css'

const PatientFormModal = dynamic(() => import('@/components/pacientes/PatientFormModal').then(m => m.PatientFormModal), { ssr: false })

interface Props {
  patient: Patient
  clinicId: string
  /** aba aberta, para continuar nela ao trocar de pet */
  aba: string
}

const comoLinha = (p: Patient): PetLinha => ({
  id: p.id, name: p.name, phone: p.phone, cpf: p.cpf, pet_name: p.pet_name, pet_species: p.pet_species, tutor_id: p.tutor_id ?? null,
})

/**
 * Barra de pets do mesmo tutor, acima das abas do prontuário: troca de pet sem voltar à lista, cadastra outro pet do mesmo
 * tutor sem digitar o contato de novo e junta cadastros antigos que parecem ser do mesmo tutor.
 */
export function PetSwitcher({ patient, clinicId, aba }: Props) {
  const queryClient = useQueryClient()
  const { canEdit } = usePermissions('pacientes')
  const [novoPet, setNovoPet] = useState(false)
  const [juntando, setJuntando] = useState<string | null>(null)
  const atual = useMemo(() => comoLinha(patient), [patient])

  const { data } = useQuery({
    queryKey: ['vet-pets-tutor', clinicId, patient.id, patient.tutor_id ?? null],
    queryFn: () => buscarPetsDoTutor(clinicId, atual),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const vinculo = data?.vinculo ?? false
  const grupo = useMemo(() => {
    if (!data) return [atual]
    return vinculo ? petsDoTutor(atual, data.grupo) : petsDoTutorPorContato(atual, data.grupo)
  }, [data, vinculo, atual])
  const candidatos = useMemo(() => (data && vinculo ? candidatosAoVinculo(atual, data.candidatos) : []), [data, vinculo, atual])

  // o cadastro principal do tutor (o primeiro pet) guarda o contato que o novo pet herda
  const principal = grupo.find(p => p.id === raizDoTutor(atual)) ?? atual

  function atualizar() {
    queryClient.invalidateQueries({ queryKey: ['vet-pets-tutor', clinicId] })
    queryClient.invalidateQueries({ queryKey: ['pacientes', clinicId] })
  }

  async function juntar(c: PetLinha) {
    const ok = await confirmDialog({
      title: `Juntar ${rotuloDoPet(c)} ao tutor ${principal.name}?`,
      message: 'Os dois cadastros continuam como estão, com todo o histórico. Só passam a aparecer juntos na barra de pets do tutor.',
      confirmText: 'Juntar', cancelText: 'Cancelar',
    })
    if (!ok) return
    setJuntando(c.id)
    const r = await vincularAoTutor(clinicId, raizDoTutor(atual), c.id)
    setJuntando(null)
    if (!r.ok) { showToast('error', 'Não foi possível juntar agora. Tente de novo.'); return }
    showToast('ok', `${rotuloDoPet(c)} agora aparece junto dos pets de ${principal.name}.`)
    atualizar()
  }

  return (
    <div className={styles.switcher} aria-label="Pets do mesmo tutor">
      <div className={styles.switcherHead}>
        <span className={styles.switcherLabel}>
          {grupo.length > 1 ? `Pets de ${principal.name}` : `Tutor: ${principal.name}`}
        </span>
        {canEdit && (
          <Button variant="secondary" icon="plus" onClick={() => setNovoPet(true)}>Novo pet deste tutor</Button>
        )}
      </div>

      <div className={styles.petList}>
        {grupo.map(p => {
          const on = p.id === patient.id
          const conteudo = (
            <>
              <span className={styles.petName}>{rotuloDoPet(p)}</span>
              {especieDoPet(p) && <span className={styles.petSpecies}>{especieDoPet(p)}</span>}
            </>
          )
          return on
            ? <span key={p.id} className={`${styles.petLink} ${styles.petLinkOn}`} aria-current="page">{conteudo}</span>
            : <Link key={p.id} href={patientHref(p.id, aba)} className={styles.petLink} aria-label={`Abrir o prontuário de ${rotuloDoPet(p)}`}>{conteudo}</Link>
        })}
      </div>

      {canEdit && candidatos.map(c => (
        <div key={c.id} className={styles.candidateRow}>
          <span className={styles.candidateText}>
            <b>{rotuloDoPet(c)}</b>, de {c.name}{c.phone ? ` (${formatBrPhone(c.phone)})` : ''}, parece ser do mesmo tutor.
          </span>
          <Button variant="secondary" loading={juntando === c.id} onClick={() => juntar(c)}>Juntar</Button>
        </div>
      ))}

      {novoPet && (
        <PatientFormModal
          patient={null}
          clinicId={clinicId}
          tutorInicial={patient}
          onClose={() => setNovoPet(false)}
          onSaved={() => { setNovoPet(false); atualizar() }}
        />
      )}
    </div>
  )
}
