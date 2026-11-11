'use client'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusDot } from '@/components/ui/StatusDot'
import { Icon } from '@/components/ui/Icon'
import btn from '@/components/ui/button.module.css'
import t from '@/components/ui/table.module.css'
import { hojeBrasil } from '@/lib/brasilDate'
import { formatCurrency } from '@/lib/utils'
import { useReceitaSaude } from '@/lib/convenios/api'
import { baixarArquivo, diaBR } from '@/lib/convenios/csv'
import { buildReceitaSaude, receitaSaudeParaCsv, resumirReceitaSaude } from '@/lib/convenios/receitaSaude'
import type { ConvenioProfessional } from '@/lib/convenios/types'
import styles from './convenios.module.css'

interface Props { professionals: ConvenioProfessional[]; scopeProfessionalId: string | null; /** perfil só de visualização: sem exportar */ canEdit?: boolean }

export function ReceitaSaudeTab({ professionals, scopeProfessionalId, canEdit = true }: Props) {
  const { clinic, user } = useAuthStore()
  const [mes, setMes] = useState(() => hojeBrasil().slice(0, 7))
  const { data, isLoading, isError, refetch, isRefetching } = useReceitaSaude(clinic?.id, mes, scopeProfessionalId)

  const rows = useMemo(() => data ? buildReceitaSaude({ ...data, professionals, mes }) : [], [data, professionals, mes])
  const resumo = useMemo(() => resumirReceitaSaude(rows), [rows])

  async function exportar() {
    baixarArquivo(`receita-saude-${mes}.csv`, receitaSaudeParaCsv(rows))
    // exportação de CPFs de pacientes fica registrada (sem dado pessoal no log)
    if (user?.id && clinic?.id) await audit({ action: 'patient.export', user_id: user.id, clinic_id: clinic.id, module: 'financeiro', details: { tipo: 'receita_saude', mes, linhas: rows.length } })
  }

  return (
    <>
      <div className={styles.stats}>
        <StatCard title="Recebido de pessoa física" value={formatCurrency(resumo.total)} compact hint="sem convênio, no mês" />
        <StatCard title="Lançamentos" value={resumo.lancamentos} hint="no mês" />
        <StatCard title="Com pendência de CPF" value={resumo.comPendencia} hint={resumo.comPendencia ? 'corrija antes de lançar' : 'tudo em ordem'} />
      </div>
      <Card flush title="Receita Saúde">
        <div className={styles.toolbar}>
          <MonthPicker value={mes} onChange={setMes} />
          <span className={styles.toolbarSpacer} />
          <button type="button" className={`${btn.secondary} ${styles.toolBtn}`} onClick={exportar} disabled={rows.length === 0 || !canEdit} title={canEdit ? undefined : 'Seu perfil só pode visualizar'}>
            <Icon name="download" size={15} /> Exportar CSV
          </button>
        </div>
        <p className={styles.notice}>
          Lista de conferência dos recebimentos de pacientes pessoa física, com o CPF do pagador e do beneficiário, para lançar no Receita Saúde.
          A data é a do lançamento no Financeiro. Recebimentos por convênio não entram. O arquivo é uma planilha de apoio: o Receita Saúde não é alimentado automaticamente.
        </p>
        {isError ? (
          <div style={{ padding: '0 22px 18px' }}><ErrorNotice message="Não foi possível carregar os recebimentos." onRetry={() => refetch()} retrying={isRefetching} /></div>
        ) : isLoading ? (
          <div style={{ padding: '0 22px 18px' }}><Skeleton height={160} /></div>
        ) : (
          <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
            <table className={`${t.table} resp-table`}>
              <thead>
                <tr><th>Data</th><th>Pagador</th><th>Beneficiário</th><th className={t.num}>Valor</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className={t.empty}>Nenhum recebimento de pessoa física neste mês.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.recordId} className={styles.row}>
                    <td data-label="Data" className={t.muted}>{diaBR(r.dia)}</td>
                    <td data-label="Pagador"><div className={styles.who}><span className={styles.name}>{r.pagadorNome}</span><span className={styles.sub}>{r.pagadorCpf || 'CPF em branco'}</span></div></td>
                    <td data-label="Beneficiário"><div className={styles.who}><span className={styles.name}>{r.beneficiarioNome}</span><span className={styles.sub}>{r.beneficiarioCpf || 'CPF em branco'}</span></div></td>
                    <td data-label="Valor" className={t.num}>{formatCurrency(r.valor)}</td>
                    <td data-label="Situação">{r.pendencias.length === 0 ? <StatusDot tone="ok">Pronto</StatusDot> : <StatusDot tone="warn">{r.pendencias.join(', ')}</StatusDot>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
