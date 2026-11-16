'use client'
import { useEffect, useMemo, useState } from 'react'
import type { AuthClinic, Patient } from '@/types'
import { useAuthStore } from '@/store/auth'
import { useProfessionals } from '@/hooks/useClinicData'
import { PillTabs } from '@/components/ui/PillTabs'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { hojeBrasil } from '@/lib/brasilDate'
import { profissionalParaImpresso } from '@/lib/medico/cabecalho'
import { DIAS_MAX, diasDeVida } from '@/lib/medico/crescimento/oms'
import { CrescimentoPanel } from './CrescimentoPanel'
import { ExamesPanel } from './ExamesPanel'
import { ReceitaPanel } from './ReceitaPanel'
import { useMedicoLista } from './useMedicoLista'
import styles from './medicina.module.css'

type Vista = 'exames' | 'receita' | 'crescimento'

interface Props {
  patient: Patient
  clinic: AuthClinic
  clinicId: string
  onDirtyChange?: (dirty: boolean) => void
}

// Depois dos 5 anos as curvas da OMS desta aba não se aplicam; a seção continua visível até os 6 para registrar a medida atrasada.
const DIAS_ATE_ESCONDER_CRESCIMENTO = DIAS_MAX + 365

/**
 * Aba "Exames e receitas" do prontuário médico: pedido de exames estruturado, receita estruturada (ambos com impressão e
 * histórico) e, para crianças de até 5 anos, as curvas de crescimento da OMS com as medidas de cada consulta.
 */
export function TabMedicina({ patient, clinic, clinicId, onDirtyChange }: Props) {
  const user = useAuthStore(s => s.user)
  const { data: profissionais = [] } = useProfessionals(clinic.id)
  const [vista, setVista] = useState<Vista>('exames')
  const [examesDirty, setExamesDirty] = useState(false)
  const [receitaDirty, setReceitaDirty] = useState(false)
  const [crescDirty, setCrescDirty] = useState(false)
  const pedidos = useMedicoLista(patient.id, 'pedido_exames')
  const receitas = useMedicoLista(patient.id, 'receita')
  const medidas = useMedicoLista(patient.id, 'crescimento')

  const dirty = examesDirty || receitaDirty || crescDirty
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // Profissional que assina: quem está logado; senão, o único médico da clínica; senão, escolhe-se aqui.
  const logado = user?.professionalId ? profissionais.find(p => p.id === user.professionalId) : undefined
  const candidatos = useMemo(() => {
    const medicos = profissionais.filter(p => p.specialty_type === 'medico')
    return medicos.length > 0 ? medicos : profissionais
  }, [profissionais])
  const [manualId, setManualId] = useState('')
  const precisaEscolher = !logado && candidatos.length > 1
  const responsavel = logado ?? (manualId ? candidatos.find(p => p.id === manualId) : undefined) ?? (candidatos.length === 1 ? candidatos[0] : undefined)
  const profissional = useMemo(() => profissionalParaImpresso(responsavel, user?.displayName), [responsavel, user?.displayName])

  const dias = diasDeVida(patient.birth_date ? patient.birth_date.slice(0, 10) : null, hojeBrasil())
  const mostraCrescimento = !patient.birth_date || (dias !== null && dias <= DIAS_ATE_ESCONDER_CRESCIMENTO)

  return (
    <div className={styles.wrap}>
      <PillTabs<Vista>
        label="Seções de Exames e receitas"
        value={vista}
        onChange={setVista}
        options={[
          { value: 'exames', label: 'Exames' },
          { value: 'receita', label: 'Receita' },
          ...(mostraCrescimento ? [{ value: 'crescimento' as const, label: 'Crescimento' }] : []),
        ]}
      />

      {precisaEscolher && (
        <div className={styles.card}>
          <div className={styles.field}>
            <label htmlFor="mx-prof">Profissional responsável</label>
            <SelectMenu
              variant="field" id="mx-prof" value={manualId} onChange={setManualId} placeholder="Escolha quem assina"
              options={[{ value: '', label: 'Escolha quem assina' }, ...candidatos.map(p => ({ value: p.id, label: p.name }))]}
            />
            <span className={styles.hint}>O nome e o registro (CRM, RQE) dele saem na assinatura do pedido e da receita.</span>
          </div>
        </div>
      )}

      <div style={{ display: vista === 'exames' ? undefined : 'none' }}>
        <ExamesPanel
          patient={patient} clinic={clinic} clinicId={clinicId} profissional={profissional}
          linhas={pedidos.linhas} carregando={pedidos.carregando} motivo={pedidos.motivo} recarregar={pedidos.recarregar} onDirtyChange={setExamesDirty}
        />
      </div>
      <div style={{ display: vista === 'receita' ? undefined : 'none' }}>
        <ReceitaPanel
          patient={patient} clinic={clinic} clinicId={clinicId} profissional={profissional}
          linhas={receitas.linhas} carregando={receitas.carregando} motivo={receitas.motivo} recarregar={receitas.recarregar} onDirtyChange={setReceitaDirty}
        />
      </div>
      {mostraCrescimento && (
        <div style={{ display: vista === 'crescimento' ? undefined : 'none' }}>
          <CrescimentoPanel
            patient={patient} clinicId={clinicId}
            linhas={medidas.linhas} carregando={medidas.carregando} motivo={medidas.motivo} recarregar={medidas.recarregar} onDirtyChange={setCrescDirty}
          />
        </div>
      )}
    </div>
  )
}
