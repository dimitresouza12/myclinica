'use client'
import { useEffect, useMemo, useState } from 'react'
import type { AuthClinic, Patient } from '@/types'
import { PillTabs } from '@/components/ui/PillTabs'
import { normalizarAvaliacao, resumirAvaliacao } from '@/lib/nutri/avaliacao'
import type { MetaDiaria } from '@/lib/nutri/plano'
import { AvaliacaoPanel } from './AvaliacaoPanel'
import { EvolucaoPanel } from './EvolucaoPanel'
import { DiarioPanel } from './DiarioPanel'
import { PlanoPanel } from './PlanoPanel'
import { ReceitasPanel } from './ReceitasPanel'
import { RecordatorioPanel } from './RecordatorioPanel'
import { useNutriLista } from './useNutriLista'
import { useReceitas } from './useReceitas'
import styles from './nutri.module.css'

type Vista = 'avaliacao' | 'recordatorio' | 'evolucao' | 'plano' | 'receitas' | 'diario'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  onDirtyChange?: (dirty: boolean) => void
}

/** Aba "Nutrição" do prontuário: avaliação antropométrica com cálculos, recordatório 24h, evolução em gráficos, plano alimentar, banco de receitas e diário alimentar do paciente. */
export function TabNutri({ patient, clinic, clinicId, onDirtyChange }: Props) {
  const [vista, setVista] = useState<Vista>('avaliacao')
  const [avalDirty, setAvalDirty] = useState(false)
  const [planoDirty, setPlanoDirty] = useState(false)
  const [recDirty, setRecDirty] = useState(false)
  const [receitaDirty, setReceitaDirty] = useState(false)
  const avaliacoes = useNutriLista(patient.id, 'avaliacao')
  const planos = useNutriLista(patient.id, 'plano')
  const recordatorios = useNutriLista(patient.id, 'recordatorio')
  const receitas = useReceitas(clinicId)

  const dirty = avalDirty || planoDirty || recDirty || receitaDirty
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
          { value: 'recordatorio', label: 'Recordatório 24h' },
          { value: 'evolucao', label: 'Evolução' },
          { value: 'plano', label: 'Plano alimentar' },
          { value: 'receitas', label: 'Receitas' },
          { value: 'diario', label: 'Diário' },
        ]}
      />
      <div style={{ display: vista === 'avaliacao' ? undefined : 'none' }}>
        <AvaliacaoPanel
          patient={patient} clinicId={clinicId}
          linhas={avaliacoes.linhas} carregando={avaliacoes.carregando} motivo={avaliacoes.motivo}
          recarregar={avaliacoes.recarregar} onDirtyChange={setAvalDirty}
        />
      </div>
      <div style={{ display: vista === 'recordatorio' ? undefined : 'none' }}>
        <RecordatorioPanel
          patient={patient} clinicId={clinicId}
          linhas={recordatorios.linhas} carregando={recordatorios.carregando} motivo={recordatorios.motivo}
          recarregar={recordatorios.recarregar} onDirtyChange={setRecDirty} metaSugerida={metaSugerida}
        />
      </div>
      <div style={{ display: vista === 'evolucao' ? undefined : 'none' }}>
        <EvolucaoPanel patient={patient} clinica={clinica} linhas={avaliacoes.linhas} carregando={avaliacoes.carregando} />
      </div>
      <div style={{ display: vista === 'plano' ? undefined : 'none' }}>
        <PlanoPanel
          patient={patient} clinicId={clinicId} clinica={clinica}
          linhas={planos.linhas} carregando={planos.carregando} motivo={planos.motivo}
          recarregar={planos.recarregar} onDirtyChange={setPlanoDirty} metaSugerida={metaSugerida} receitas={receitas.receitas}
        />
      </div>
      <div style={{ display: vista === 'receitas' ? undefined : 'none' }}>
        <ReceitasPanel
          patient={patient} clinicId={clinicId} clinica={clinica}
          receitas={receitas.receitas} carregando={receitas.carregando} motivo={receitas.motivo}
          recarregar={receitas.recarregar} onDirtyChange={setReceitaDirty}
        />
      </div>
      {vista === 'diario' && <DiarioPanel patient={patient} clinicId={clinicId} />}
    </div>
  )
}
