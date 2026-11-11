'use client'
import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { MoreMenu } from '@/components/ui/MoreMenu'
import { StatusDot } from '@/components/ui/StatusDot'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Skeleton'
import btn from '@/components/ui/button.module.css'
import t from '@/components/ui/table.module.css'
import type { InsurancePlan } from '@/lib/convenios/types'
import { PlanModal } from './PlanModal'
import styles from './convenios.module.css'

interface Props {
  clinicId: string
  plans: InsurancePlan[]
  /** false = migration ainda não aplicada: só avisa */
  available: boolean
  loading: boolean
  canEdit: boolean
  procedures: Array<{ id: string; name: string; price: number | null }>
  onChanged: () => void
}

export function ConveniosTab({ clinicId, plans, available, loading, canEdit, procedures, onChanged }: Props) {
  const [editing, setEditing] = useState<InsurancePlan | null>(null)
  const [open, setOpen] = useState(false)

  if (loading) return <Card title="Convênios cadastrados"><Skeleton height={120} /></Card>

  if (!available) {
    return (
      <Card title="Convênios cadastrados">
        <EmptyState
          compact
          icon="info"
          title="Cadastro de convênios ainda não habilitado"
          description="O banco desta clínica ainda não tem a tabela de convênios. Enquanto isso, o convênio do paciente continua como texto no cadastro, e a produção, as guias e o recibo funcionam com ele."
        />
      </Card>
    )
  }

  return (
    <>
      <Card
        flush
        title="Convênios cadastrados"
        actions={canEdit && <button type="button" className={btn.primary} onClick={() => { setEditing(null); setOpen(true) }}><Icon name="plus" size={15} /> Novo convênio</button>}
      >
        {plans.length === 0 ? (
          <EmptyState compact icon="receipt" title="Nenhum convênio cadastrado" description="Cadastre as operadoras que a clínica atende, com o registro ANS e a tabela de valores. O paciente é ligado ao convênio no cadastro dele." />
        ) : (
          <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
            <table className={`${t.table} resp-table`}>
              <thead>
                <tr><th>Convênio</th><th>Registro ANS</th><th className={t.num}>Valores na tabela</th><th>Situação</th><th aria-label="Ações" /></tr>
              </thead>
              <tbody>
                {plans.map(p => (
                  <tr key={p.id} className={styles.row}>
                    <td><div className={styles.who}><span className={styles.name}>{p.name}</span>{p.notes && <span className={styles.sub}>{p.notes}</span>}</div></td>
                    <td data-label="Registro ANS" className={t.muted}>{p.ans_registry ?? '-'}</td>
                    <td data-label="Valores na tabela" className={t.num}>{Object.keys(p.procedure_prices).length}</td>
                    <td data-label="Situação"><StatusDot tone={p.is_active ? 'ok' : 'idle'}>{p.is_active ? 'Ativo' : 'Inativo'}</StatusDot></td>
                    <td className={styles.actionsCell}>
                      <div className={t.rowActions}>
                        {canEdit && <MoreMenu label={`Ações de ${p.name}`} items={[{ label: 'Editar convênio', icon: 'edit', onClick: () => { setEditing(p); setOpen(true) } }]} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && (
        <PlanModal
          clinicId={clinicId}
          plan={editing}
          procedures={procedures}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); onChanged() }}
        />
      )}
    </>
  )
}
