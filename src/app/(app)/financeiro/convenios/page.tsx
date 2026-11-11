'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { PageHeader } from '@/components/ui/PageHeader'
import { PillTabs } from '@/components/ui/PillTabs'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { Icon } from '@/components/ui/Icon'
import btn from '@/components/ui/button.module.css'
import { usePermissions } from '@/hooks/usePermissions'
import { useProcedures } from '@/hooks/useClinicData'
import { myScopedProfessionalId } from '@/lib/professionalScope'
import { useConvenioProfessionals, usePlans } from '@/lib/convenios/api'
import { ConveniosTab } from './ConveniosTab'
import { ProducaoTab } from './ProducaoTab'
import { ReceitaSaudeTab } from './ReceitaSaudeTab'
import styles from './convenios.module.css'

type Tab = 'producao' | 'convenios' | 'receita'

function ConveniosContent() {
  const { clinic, user } = useAuthStore()
  const queryClient = useQueryClient()
  const { canEdit } = usePermissions('financeiro')
  const [tab, setTab] = useState<Tab>('producao')
  // acesso por profissional: quem só vê o que é seu enxerga só a própria produção
  const scopeProfessionalId = myScopedProfessionalId(user)
  const plansQuery = usePlans(clinic?.id)
  const professionals = useConvenioProfessionals(clinic?.id)
  const { data: procedureList = [] } = useProcedures(clinic?.id)
  const procedures = useMemo(() => procedureList.map(p => ({ id: p.id, name: p.name, price: p.price })), [procedureList])
  const plans = plansQuery.data?.plans ?? []

  return (
    <div className={styles.page}>
      <PageHeader
        title="Convênios"
        subtitle="Produção, guias TISS, recibos e Receita Saúde"
        actions={
          <>
            <PillTabs
              label="Seção"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'producao', label: 'Produção' },
                { value: 'convenios', label: 'Convênios', count: plans.length },
                { value: 'receita', label: 'Receita Saúde' },
              ]}
            />
            <Link href="/financeiro" className={btn.secondary}><Icon name="chevronLeft" size={15} /> Financeiro</Link>
          </>
        }
      />

      {(plansQuery.isError || professionals.isError) && (
        <ErrorNotice message="Não foi possível carregar os convênios ou os profissionais." onRetry={() => { plansQuery.refetch(); professionals.refetch() }} />
      )}

      {tab === 'producao' && (
        <ProducaoTab plans={plans} procedures={procedures} professionals={professionals.data ?? []} scopeProfessionalId={scopeProfessionalId} canEdit={canEdit} />
      )}
      {tab === 'convenios' && clinic && (
        <ConveniosTab
          clinicId={clinic.id}
          plans={plans}
          available={plansQuery.data?.available ?? false}
          loading={plansQuery.isLoading}
          canEdit={canEdit}
          procedures={procedures.filter((_, i) => procedureList[i]?.is_active)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['convenios-plans', clinic.id] })}
        />
      )}
      {tab === 'receita' && <ReceitaSaudeTab professionals={professionals.data ?? []} scopeProfessionalId={scopeProfessionalId} canEdit={canEdit} />}
    </div>
  )
}

export default function ConveniosPage() {
  return <PermissionGuard module="financeiro"><ConveniosContent /></PermissionGuard>
}
