'use client'
import { useEffect, useMemo, useState } from 'react'
import type { AuthClinic, Patient } from '@/types'
import { PillTabs } from '@/components/ui/PillTabs'
import { normalizarAvaliacao, resumirAvaliacao } from '@/lib/nutri/avaliacao'
import type { MetaDiaria } from '@/lib/nutri/plano'
import { AvaliacaoPanel } from './AvaliacaoPanel'
import { EvolucaoPanel } from './EvolucaoPanel'
import { PlanoPanel } from './PlanoPanel'
import { useNutriLista } from './useNutriLista'
import styles from './nutri.module.css'

type Vista = 'avaliacao' | 'evolucao' | 'plano'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  onDirtyChange?: (dirty: boolean) => void
}

/** Aba "Nutrição" do prontuário: avaliação antropométrica com cálculos, evolução em gráficos e plano alimentar. */
export function TabNutri({ patient, clinic, clinicId, onDirtyChange }: Props) {
  const [vista, setVista] = useState<Vista>('avaliacao')
  const [avalDirty, setAvalDirty] = useState(false)
  const [planoDirty, setPlanoDirty] = useState(false)
  const avaliacoes = useNutriLista(patient.id, 'avaliacao')
  const planos = useNutriLista(patient.id, 'plano')

  const dirty = avalDirty || planoDirty
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // meta da avaliação mais recente, para o plano alimentar sugerir com um clique
  const metaSugerida = useMemo<MetaDiaria | null>(() => {
    const ult = avaliacoes.linhas[0]
    if (!ult) return null
    const r = resumirAvaliacao(normalizarAvaliacao(ult.dados), { nascimento: patient.birth_date, data: ult.data })
    if (r.metaKcal === null) return null
    return {
      kcal: r.metaKcal,
      proteinaG: r.macros ? Math.round(r.macros.proteinaG) : null,
      carboidratoG: r.macros ? Math.round(r.macros.carboidratoG) : null,
      lipidioG: r.macros ? Math.round(r.macros.lipidioG) : null,
    }
  }, [avaliacoes.linhas, patient.birth_date])

  const clinica = { name: clinic.name, address: clinic.address ?? undefined, phone: clinic.phone ?? undefined }

  return (
    <div className={styles.wrap}>
      <PillTabs<Vista>
        label="Seções da Nutrição"
        value={vista}
        onChange={setVista}
        options={[
          { value: 'avaliacao', label: 'Avaliação' },
          { value: 'evolucao', label: 'Evolução' },
          { value: 'plano', label: 'Plano alimentar' },
        ]}
      />
      <div style={{ display: vista === 'avaliacao' ? undefined : 'none' }}>
        <AvaliacaoPanel
          patient={patient} clinicId={clinicId}
          linhas={avaliacoes.linhas} carregando={avaliacoes.carregando} motivo={avaliacoes.motivo}
          recarregar={avaliacoes.recarregar} onDirtyChange={setAvalDirty}
        />
      </div>
      <div style={{ display: vista === 'evolucao' ? undefined : 'none' }}>
        <EvolucaoPanel patient={patient} clinica={clinica} linhas={avaliacoes.linhas} carregando={avaliacoes.carregando} />
      </div>
      <div style={{ display: vista === 'plano' ? undefined : 'none' }}>
        <PlanoPanel
          patient={patient} clinicId={clinicId} clinica={clinica}
          linhas={planos.linhas} carregando={planos.carregando} motivo={planos.motivo}
          recarregar={planos.recarregar} onDirtyChange={setPlanoDirty} metaSugerida={metaSugerida}
        />
      </div>
    </div>
  )
}
