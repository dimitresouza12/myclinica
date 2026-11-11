'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { NewPackageModal } from '@/components/agenda/NewPackageModal'
import { useProcedures } from '@/hooks/useClinicData'
import { usePatientPackages, type PatientPackage } from '@/hooks/usePatientPackages'
import { cancelPatientPackage } from '@/lib/agenda/packagesApi'
import { lowBalanceMessage, packageUsage, sessionLabel, sessionNumber, type PackageState } from '@/lib/agenda/packages'
import { hojeBrasil } from '@/lib/brasilDate'
import { formatCurrency } from '@/lib/utils'
import btn from '@/components/ui/button.module.css'
import styles from './patientPackagesModal.module.css'

const STATE_LABEL: Record<PackageState, string> = { ativo: 'Em andamento', esgotado: 'Concluído', expirado: 'Vencido', cancelado: 'Cancelado' }
const APPT_STATUS: Record<string, string> = { agendado: 'Agendada', confirmado: 'Confirmada', concluido: 'Feita', cancelado: 'Cancelada', faltou: 'Faltou' }

interface Props {
  open: boolean
  onClose: () => void
  clinicId: string
  userId?: string | null
  patient: { id: string; name: string }
  /** perfil só de visualização: esconde Novo pacote e Cancelar pacote */
  readOnly?: boolean
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Pacotes de sessões do paciente: progresso "3/10", saldo, aviso de fim de pacote e histórico das sessões. */
export function PatientPackagesModal({ open, onClose, clinicId, userId, patient, readOnly = false }: Props) {
  const queryClient = useQueryClient()
  const { data, isLoading } = usePatientPackages(clinicId)
  const { data: procedures = [] } = useProcedures(clinicId)
  const [selling, setSelling] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const today = hojeBrasil()

  const rows = useMemo(() => {
    const mine = (data?.packages ?? []).filter(p => p.patient_id === patient.id)
    const linked = data?.linked ?? []
    const order: Record<PackageState, number> = { ativo: 0, expirado: 1, esgotado: 2, cancelado: 3 }
    return mine
      .map(p => ({ pkg: p, usage: packageUsage(p, linked, today), sessions: linked.filter(a => a.package_id === p.id) }))
      .sort((a, b) => order[a.usage.state] - order[b.usage.state] || b.pkg.created_at.localeCompare(a.pkg.created_at))
  }, [data, patient.id, today])

  function refresh() { queryClient.invalidateQueries({ queryKey: ['packages', clinicId] }) }

  async function cancel(p: PatientPackage) {
    const ok = await confirmDialog({
      title: 'Cancelar pacote?',
      message: `${p.name} deixa de aceitar novas consultas. As sessões já feitas ficam no histórico e a receita lançada não é alterada.`,
      confirmText: 'Cancelar pacote',
      cancelText: 'Voltar',
      danger: true,
    })
    if (!ok) return
    setCancelling(p.id)
    const err = await cancelPatientPackage(clinicId, p.id)
    setCancelling(null)
    if (err) { showToast('error', `Não foi possível cancelar o pacote: ${err}`); return }
    showToast('ok', 'Pacote cancelado.')
    refresh()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Pacotes de sessões"
        subtitle={patient.name}
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={onClose}>Fechar</button>
            {data?.available && !readOnly && <button type="button" className={btn.primary} onClick={() => setSelling(true)}>Novo pacote</button>}
          </>
        }
      >
        {isLoading ? (
          <p className={styles.muted}>Carregando pacotes...</p>
        ) : !data?.available ? (
          <p className={styles.muted}>Os pacotes de sessões ainda não estão disponíveis neste ambiente.</p>
        ) : rows.length === 0 ? (
          <p className={styles.muted}>Este paciente não tem pacote de sessões. {readOnly ? '' : 'Use o botão Novo pacote para vender um.'}</p>
        ) : (
          <ul className={styles.list}>
            {rows.map(({ pkg, usage, sessions }) => {
              const warn = usage.state === 'ativo' ? lowBalanceMessage(usage.remaining) : null
              const pct = usage.total > 0 ? Math.min(100, Math.round((usage.used / usage.total) * 100)) : 0
              const ordered = [...sessions].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
              return (
                <li key={pkg.id} className={styles.card}>
                  <div className={styles.head}>
                    <strong className={styles.name}>{pkg.name}</strong>
                    <span className={`${styles.chip} ${styles[`chip_${usage.state}`]}`}>{STATE_LABEL[usage.state]}</span>
                  </div>
                  <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={usage.total} aria-valuenow={usage.used} aria-label={`${usage.used} de ${usage.total} sessões feitas`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className={styles.numbers}>
                    <strong>{usage.used}/{usage.total} sessões feitas</strong>
                    <span>Saldo: {usage.remaining} {usage.remaining === 1 ? 'sessão' : 'sessões'}{usage.scheduled > 0 ? ` · ${usage.scheduled} já marcada${usage.scheduled === 1 ? '' : 's'}` : ''}</span>
                  </div>
                  {warn && <p className={styles.warn}>{warn}. Avise o paciente para renovar.</p>}
                  <p className={styles.meta}>
                    {pkg.total_price > 0 ? `${formatCurrency(pkg.total_price)} no pacote` : 'Sem valor informado'}
                    {pkg.expires_at ? ` · válido até ${pkg.expires_at.split('-').reverse().join('/')}` : ''}
                    {pkg.financial_record_id && <> · <Link href={`/financeiro?record=${pkg.financial_record_id}`} className={styles.link}>Ver receita</Link></>}
                  </p>
                  {ordered.length > 0 && (
                    <ul className={styles.sessions} aria-label="Sessões do pacote">
                      {ordered.map(a => {
                        const n = sessionNumber(a.id, sessions)
                        return (
                          <li key={a.id}>
                            <span className={styles.sNum}>{n ? sessionLabel(n, usage.total) : '-'}</span>
                            <span>{fmtDate(a.scheduled_at)}</span>
                            <span className={styles.sStatus}>{APPT_STATUS[a.status ?? ''] ?? a.status}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {usage.state !== 'cancelado' && !readOnly && (
                    <button type="button" className={styles.cancel} onClick={() => cancel(pkg)} disabled={cancelling === pkg.id}>
                      {cancelling === pkg.id ? 'Cancelando...' : 'Cancelar pacote'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Modal>
      {selling && (
        <NewPackageModal
          open
          onClose={() => setSelling(false)}
          clinicId={clinicId}
          userId={userId}
          patient={patient}
          procedures={procedures}
          onCreated={() => { setSelling(false); refresh() }}
        />
      )}
    </>
  )
}
