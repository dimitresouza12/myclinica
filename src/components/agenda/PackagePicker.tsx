'use client'
import { useMemo, useState } from 'react'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { NewPackageModal } from './NewPackageModal'
import { freeSessions, lowBalanceMessage, packageUsage, sessionLabel, sessionNumber, suggestPackage, type LinkedAppt } from '@/lib/agenda/packages'
import { hojeBrasil } from '@/lib/brasilDate'
import type { PatientPackage } from '@/hooks/usePatientPackages'
import type { Procedure } from '@/types'
import f from '@/components/ui/modalForm.module.css'
import btn from '@/components/ui/button.module.css'
import styles from './packagePicker.module.css'

const NEW = '__novo__'

interface Props {
  clinicId: string
  userId?: string | null
  patient: { id: string; name: string } | null
  procedures: Procedure[]
  /** procedimento escolhido no agendamento ('' = nenhum, 'outro' = digitado) */
  procedureId: string
  packages: PatientPackage[]
  linked: LinkedAppt[]
  /** pacote escolhido ('' = sem pacote) */
  value: string
  onChange: (packageId: string) => void
  /** consulta que está sendo editada: sai da conta de sessões marcadas */
  editingApptId?: string | null
  /** data e hora da consulta ("AAAA-MM-DDTHH:mm") para calcular "Sessão k/N" */
  scheduledAt: string
  /** quantas sessões este agendamento vai ocupar (1, ou o tamanho da série) */
  needed: number
  /** depois de vender um pacote: recarrega a lista */
  onCreated: () => void
  /** vender pacote exige ver valores em R$ (módulo Financeiro); sem isso a opção some */
  canSell?: boolean
}

/** Escolha do pacote de sessões do paciente no agendamento: sem cobrança nova a cada sessão. */
export function PackagePicker({ clinicId, userId, patient, procedures, procedureId, packages, linked, value, onChange, editingApptId, scheduledAt, needed, onCreated, canSell = true }: Props) {
  const [selling, setSelling] = useState(false)
  const today = hojeBrasil()

  const mine = useMemo(() => packages.filter(p => p.patient_id === patient?.id), [packages, patient?.id])
  const options = useMemo(() => {
    return mine
      .filter(p => p.id === value || freeSessions(p, linked, today, editingApptId ?? undefined) > 0)
      .map(p => {
        const u = packageUsage(p, linked, today)
        return { value: p.id, label: `${p.name} · ${u.used}/${u.total} feitas · ${u.unscheduled} sem horário` }
      })
  }, [mine, linked, today, value, editingApptId])

  const chosen = mine.find(p => p.id === value)
  const suggestion = !value && patient ? suggestPackage(mine, linked, procedureId && procedureId !== 'outro' ? procedureId : null, today) : null

  const chosenInfo = useMemo(() => {
    if (!chosen) return null
    const u = packageUsage(chosen, linked.filter(a => a.id !== editingApptId), today)
    const when = scheduledAt ? new Date(scheduledAt) : null
    const hypothetical: LinkedAppt[] = [
      ...linked.filter(a => a.id !== editingApptId),
      { id: '__nova__', package_id: chosen.id, status: 'agendado', scheduled_at: when && !Number.isNaN(when.getTime()) ? when.toISOString() : new Date().toISOString() },
    ]
    const n = sessionNumber('__nova__', hypothetical)
    return { u, n, free: Math.max(0, u.unscheduled) }
  }, [chosen, linked, editingApptId, scheduledAt, today])

  if (!patient) return null

  return (
    <div className={f.field}>
      <label>Pacote de sessões</label>
      <SelectMenu
        variant="field"
        ariaLabel="Pacote de sessões"
        value={value}
        onChange={v => (v === NEW ? setSelling(true) : onChange(v))}
        options={[
          { value: '', label: 'Sem pacote (cobrança normal)' },
          ...options,
          ...(canSell ? [{ value: NEW, label: '+ Vender novo pacote de sessões' }] : []),
        ]}
      />
      {suggestion && (
        <div className={styles.suggest}>
          <span>{patient.name.split(' ')[0]} tem o pacote <strong>{suggestion.name}</strong> com sessões disponíveis.</span>
          <button type="button" className={btn.secondary} onClick={() => onChange(suggestion.id)}>Usar este pacote</button>
        </div>
      )}
      {chosen && chosenInfo && (
        <div className={styles.info} role="status">
          <strong>{chosenInfo.n ? sessionLabel(chosenInfo.n, chosen.total_sessions) : chosen.name}</strong>
          <span>Esta consulta consome uma sessão do pacote ao ser concluída, sem nova cobrança.</span>
          {chosenInfo.free < needed && <span className={styles.warn}>Sessões livres: {chosenInfo.free}. Este agendamento precisa de {needed}.</span>}
          {lowBalanceMessage(chosenInfo.u.remaining) && <span className={styles.warn}>{lowBalanceMessage(chosenInfo.u.remaining)}. Avise o paciente para renovar.</span>}
        </div>
      )}
      {selling && (
        <NewPackageModal
          open
          onClose={() => setSelling(false)}
          clinicId={clinicId}
          userId={userId}
          patient={patient}
          procedures={procedures}
          defaultProcedureId={procedureId}
          onCreated={id => { setSelling(false); onCreated(); onChange(id) }}
        />
      )}
    </div>
  )
}
