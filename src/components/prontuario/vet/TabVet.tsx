'use client'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useProfessionals } from '@/hooks/useClinicData'
import type { AuthClinic, Patient } from '@/types'
import { PillTabs } from '@/components/ui/PillTabs'
import { hojeBrasil } from '@/lib/brasilDate'
import { pesoAtual } from '@/lib/vet/peso'
import { situacaoDaCarteira } from '@/lib/vet/vacinas'
import { CarteiraPanel } from './CarteiraPanel'
import { DosePanel } from './DosePanel'
import { PesoPanel } from './PesoPanel'
import { useVetDados } from './useVetDados'
import styles from './vet.module.css'

type Vista = 'carteira' | 'peso' | 'dose'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
}

/** Aba "Vacinas e peso" do prontuário veterinário: carteira de vacinas e antiparasitários, curva de peso e calculadora de dose. */
export function TabVet({ patient, clinic, clinicId }: Props) {
  const user = useAuthStore(s => s.user)
  const { data: profissionais = [] } = useProfessionals(clinic.id)
  const [vista, setVista] = useState<Vista>('carteira')
  const dados = useVetDados(patient.id)

  const atual = pesoAtual(dados.pesos)
  const pendentes = useMemo(() => {
    const s = situacaoDaCarteira(dados.registros, hojeBrasil())
    return s.vencidas.length + s.aVencer.length
  }, [dados.registros])

  return (
    <div className={styles.wrap}>
      <PillTabs<Vista>
        label="Seções de Vacinas e peso"
        value={vista}
        onChange={setVista}
        options={[
          { value: 'carteira', label: 'Carteira de vacinas', count: pendentes || undefined },
          { value: 'peso', label: 'Peso' },
          { value: 'dose', label: 'Dose por peso' },
        ]}
      />
      {vista === 'carteira' && (
        <CarteiraPanel
          patient={patient} clinic={clinic} clinicId={clinicId}
          registros={dados.registros} carregando={dados.carregandoRegistros} motivo={dados.motivoRegistros} recarregar={dados.recarregarRegistros}
          profissionais={profissionais} profissionalAtualId={user?.professionalId ?? null} pesoKg={atual?.weight_kg ?? patient.pet_weight ?? null}
        />
      )}
      {vista === 'peso' && (
        <PesoPanel patient={patient} clinicId={clinicId} pesos={dados.pesos} carregando={dados.carregandoPesos} motivo={dados.motivoPesos} recarregar={dados.recarregarPesos} />
      )}
      {vista === 'dose' && <DosePanel key={atual?.id ?? 'sem-pesagem'} pesoAtualKg={atual?.weight_kg ?? null} pesoCadastroKg={patient.pet_weight ?? null} />}
    </div>
  )
}
