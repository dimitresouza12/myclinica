'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { PillTabs, type PillOption } from '@/components/ui/PillTabs'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import btn from '@/components/ui/button.module.css'
import { listContracts } from '@/components/prontuario/contratos/contratosApi'
import { ContratoBadge } from '@/components/prontuario/contratos/ContratoBadge'
import { hojeBrasil } from '@/lib/brasilDate'
import { formatDateBr } from '@/lib/documentos/campos'
import { formatCurrency } from '@/lib/utils'
import { patientHref } from '@/lib/prontuario/navigation'
import { countByStatus, filterContracts, STATUS_LABEL, STATUS_ORDER, vigenciaTexto, type ContractStatus } from '@/lib/contratos/status'
import styles from './contratos.module.css'

type StatusFilter = ContractStatus | 'todos'

function ContratosContent() {
  const clinic = useAuthStore(s => s.clinic)
  const today = hojeBrasil()
  const [status, setStatus] = useState<StatusFilter>('todos')
  const [query, setQuery] = useState('')
  const [vencendo, setVencendo] = useState(false)

  const { data: contracts = [], isLoading, isError, error } = useQuery({
    queryKey: ['contratos-clinica', clinic?.id],
    queryFn: () => listContracts(),
    enabled: !!clinic?.id,
    staleTime: 30_000,
  })

  const counts = useMemo(() => countByStatus(contracts), [contracts])
  const expiringCount = useMemo(() => contracts.filter(c => c.expiringSoon).length, [contracts])
  const filtered = useMemo(() => filterContracts(contracts, { status, query, vencendo }, today), [contracts, status, query, vencendo, today])

  const options: PillOption<StatusFilter>[] = [
    { value: 'todos', label: 'Todos', count: contracts.length },
    ...STATUS_ORDER.map(s => ({ value: s as StatusFilter, label: STATUS_LABEL[s], count: counts[s] })),
  ]
  const unavailable = isError && error instanceof Error && /ainda não estão ativos/i.test(error.message)

  return (
    <div className={styles.page}>
      <PageHeader title="Contratos" subtitle="Contratos de todos os pacientes da clínica, com o estado de cada um. Para criar ou enviar um contrato, abra o prontuário do paciente." />

      <Card>
        <div className={styles.toolbar}>
          <div className={styles.pillsScroll}>
            <PillTabs label="Estado do contrato" options={options} value={status} onChange={setStatus} />
          </div>
          <div className={styles.filters}>
            <SearchInput className={styles.search} value={query} onChange={setQuery} placeholder="Buscar por paciente ou título" />
            <button type="button" className={styles.toggle} aria-pressed={vencendo} onClick={() => setVencendo(v => !v)}>
              Vencendo em 30 dias{expiringCount > 0 ? ` (${expiringCount})` : ''}
            </button>
          </div>
        </div>
      </Card>

      <Card flush>
        {isLoading && <div style={{ padding: 16 }}><Skeleton height={64} /></div>}
        {isError && (
          <p className={styles.note} role="alert">
            {unavailable ? 'Os contratos com status ainda não estão ativos nesta conta.' : (error instanceof Error ? error.message : 'Não foi possível carregar os contratos.')}
          </p>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <EmptyState
            icon="receipt"
            title={contracts.length === 0 ? 'Nenhum contrato ainda' : 'Nenhum contrato neste filtro'}
            description={contracts.length === 0 ? 'Abra o prontuário de um paciente, aba Documentos e contratos, para criar o primeiro.' : 'Mude o estado, a busca ou desligue o filtro de vencimento.'}
          />
        )}
        <div className={styles.list} style={{ padding: filtered.length ? '0 16px' : 0 }}>
          {filtered.map(c => {
            const alerta = c.status === 'vencido' || c.expiringSoon ? vigenciaTexto(c.validUntil, today) : ''
            const link = c.status === 'enviado' && c.linkSituacao && c.linkSituacao !== 'ativo'
            return (
              <div key={c.id} className={styles.row}>
                <div className={styles.main}>
                  <div className={styles.titleLine}>
                    <Link href={`${patientHref(c.patientId, 'documentos')}&secao=contratos`} className={styles.patient}>{c.patientName || 'Paciente'}</Link>
                    <ContratoBadge status={c.status} />
                  </div>
                  <span className={styles.meta}>
                    {c.title}
                    {c.validUntil ? ` · vigência até ${formatDateBr(c.validUntil)}` : ' · sem término de vigência'}
                    {c.amount !== null ? ` · ${formatCurrency(c.amount)}` : ''}
                  </span>
                  {alerta && <span className={c.status === 'vencido' ? `${styles.alert} ${styles.alertBad}` : styles.alert}>{alerta}</span>}
                  {link && <span className={styles.alert}>Link {c.linkSituacao === 'expirado' ? 'expirado' : 'revogado'}: reenvie para o paciente assinar</span>}
                </div>
                <Link href={`${patientHref(c.patientId, 'documentos')}&secao=contratos`} className={`${btn.secondary} ${styles.open}`}>Abrir no prontuário</Link>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

export default function ContratosPage() {
  // mesma permissão do prontuário: quem não vê o prontuário não vê os contratos
  return <PermissionGuard module="prontuario"><ContratosContent /></PermissionGuard>
}
