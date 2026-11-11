'use client'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { BarList } from '@/components/ui/BarList'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { DatePicker } from '@/components/ui/DatePicker'
import { MoreMenu, type MoreMenuItem } from '@/components/ui/MoreMenu'
import { StatusDot, type StatusTone } from '@/components/ui/StatusDot'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { Skeleton } from '@/components/ui/Skeleton'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import t from '@/components/ui/table.module.css'
import { hojeBrasil } from '@/lib/brasilDate'
import { formatCurrency } from '@/lib/utils'
import { moneyShort } from '@/lib/ui/money'
import { useProducao } from '@/lib/convenios/api'
import { baixarArquivo, diaBR } from '@/lib/convenios/csv'
import { imprimirGuia } from '@/lib/convenios/imprimir'
import { PARTICULAR, type ConvenioProcedure, type ConvenioProfessional, type InsurancePlan } from '@/lib/convenios/types'
import {
  buildProducao, conveniosNasLinhas, filtrarPorConvenio, producaoParaCsv, resumirPorConvenio, VALOR_ORIGEM_LABEL, type ProducaoRow,
} from '@/lib/convenios/producao'
import { valorDaGuia, type GuiaContexto, type GuiaTipo } from '@/lib/convenios/tiss'
import { carteirinhaStatus } from '@/lib/convenios/plans'
import type { AppointmentStatus } from '@/types'
import { ReciboModal } from './ReciboModal'
import styles from './convenios.module.css'

const TOM: Record<AppointmentStatus, StatusTone> = { agendado: 'wait', confirmado: 'wait', arrived: 'wait', in_progress: 'wait', concluido: 'ok', faltou: 'bad', cancelado: 'idle', bloqueado: 'idle' }

interface Props {
  plans: InsurancePlan[]
  procedures: ConvenioProcedure[]
  professionals: ConvenioProfessional[]
  scopeProfessionalId: string | null
  /** perfil só de visualização: sem exportar, imprimir guia nem emitir recibo (padrão: pode) */
  canEdit?: boolean
}

function firstOfMonth(day: string) { return `${day.slice(0, 8)}01` }
function lastOfMonth(day: string) {
  const [y, m] = day.split('-').map(Number)
  return `${day.slice(0, 8)}${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

export function ProducaoTab({ plans, procedures, professionals, scopeProfessionalId, canEdit = true }: Props) {
  const { clinic } = useAuthStore()
  const hoje = hojeBrasil()
  const [from, setFrom] = useState(() => firstOfMonth(hoje))
  const [to, setTo] = useState(() => lastOfMonth(hoje))
  const [convenio, setConvenio] = useState('')
  const [recibo, setRecibo] = useState<ProducaoRow | null>(null)
  const { data, isLoading, isError, refetch, isRefetching } = useProducao(clinic?.id, from, to, scopeProfessionalId)

  const todas = useMemo(() => data ? buildProducao({ ...data, plans, procedures }) : [], [data, plans, procedures])
  const rows = useMemo(() => filtrarPorConvenio(todas, convenio), [todas, convenio])
  const resumo = useMemo(() => resumirPorConvenio(rows), [rows])
  const nomes = useMemo(() => conveniosNasLinhas(todas), [todas])
  const totais = useMemo(() => ({
    realizados: resumo.reduce((s, r) => s + r.realizados, 0),
    valorRealizado: resumo.reduce((s, r) => s + r.valorRealizado, 0),
    valorPrevisto: resumo.reduce((s, r) => s + r.valorPrevisto, 0),
    semValor: resumo.reduce((s, r) => s + r.semValor, 0),
  }), [resumo])

  function contexto(row: ProducaoRow): GuiaContexto | null {
    const appt = data?.appointments.find(a => a.id === row.appointmentId)
    const patient = data?.patients.find(p => p.id === row.patientId)
    if (!clinic || !appt || !patient) return null
    return {
      clinic: { name: clinic.name, address: clinic.address, phone: clinic.phone },
      clinicType: clinic.type,
      patient,
      plans,
      appointment: appt,
      professional: professionals.find(p => p.id === appt.professional_id) ?? null,
      procedures,
    }
  }

  async function guia(tipo: GuiaTipo, row: ProducaoRow) {
    const ctx = contexto(row)
    if (!ctx) return showToast('error', 'Não foi possível montar a guia deste atendimento.')
    await imprimirGuia(tipo, ctx)
  }

  function menu(row: ProducaoRow): MoreMenuItem[] {
    const out: MoreMenuItem[] = []
    if (!canEdit) return out
    if (row.convenio !== PARTICULAR) {
      out.push({ label: 'Imprimir guia de consulta', icon: 'receipt', onClick: () => guia('consulta', row) })
      out.push({ label: 'Imprimir guia SP/SADT', icon: 'receipt', onClick: () => guia('sadt', row) })
    }
    out.push({ label: 'Recibo para reembolso', icon: 'wallet', onClick: () => setRecibo(row) })
    return out
  }

  function exportar() {
    baixarArquivo(`producao-convenios-${from}-a-${to}.csv`, producaoParaCsv(rows))
  }

  const reciboCtx = recibo ? contexto(recibo) : null
  const reciboAppt = recibo ? data?.appointments.find(a => a.id === recibo.appointmentId) : undefined
  const reciboPatient = recibo ? data?.patients.find(p => p.id === recibo.patientId) : undefined
  const carteirinhaVencida = (row: ProducaoRow) => {
    const p = data?.patients.find(x => x.id === row.patientId)
    return row.convenio !== PARTICULAR && carteirinhaStatus(p?.convenio_validade, row.dia) === 'vencida'
  }

  return (
    <>
      <div className={styles.stats}>
        <StatCard title="Atendimentos realizados" value={totais.realizados} hint="no período e filtro" />
        <StatCard title="Valor realizado" value={formatCurrency(totais.valorRealizado)} compact hint="atendimentos concluídos" />
        <StatCard title="Valor previsto" value={formatCurrency(totais.valorPrevisto)} compact hint="agendados e confirmados" />
        <StatCard title="Realizados sem valor" value={totais.semValor} hint={totais.semValor ? 'confira o preço do procedimento' : 'tudo com valor'} />
      </div>

      {resumo.length > 1 && (
        <Card title="Por convênio" actions={<span className={styles.sub}>valor realizado</span>}>
          <BarList items={resumo.map(r => ({ label: r.convenio, value: r.valorRealizado }))} format={moneyShort} />
        </Card>
      )}

      <Card flush title="Produção">
        <div className={styles.toolbar}>
          <div className={styles.dates}>
            <DatePicker value={from} onChange={v => { setFrom(v); if (v > to) setTo(lastOfMonth(v)) }} ariaLabel="De" max={to} />
            <span className={styles.sub}>até</span>
            <DatePicker value={to} onChange={setTo} ariaLabel="Até" min={from} />
          </div>
          <SelectMenu
            ariaLabel="Convênio"
            value={convenio}
            onChange={setConvenio}
            options={[{ value: '', label: 'Todos os convênios' }, ...nomes.map(n => ({ value: n, label: n }))]}
          />
          <span className={styles.toolbarSpacer} />
          <button type="button" className={`${btn.secondary} ${styles.toolBtn}`} onClick={exportar} disabled={rows.length === 0 || !canEdit} title={canEdit ? undefined : 'Seu perfil só pode visualizar'}>
            <Icon name="download" size={15} /> Exportar CSV
          </button>
        </div>

        {isError ? (
          <div style={{ padding: '0 22px 18px' }}><ErrorNotice message="Não foi possível carregar a produção." onRetry={() => refetch()} retrying={isRefetching} /></div>
        ) : isLoading ? (
          <div style={{ padding: '0 22px 18px' }}><Skeleton height={160} /></div>
        ) : (
          <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
            <table className={`${t.table} resp-table`}>
              <thead>
                <tr>
                  <th>Data</th><th>Paciente</th><th>Convênio</th><th>Procedimento</th>
                  <th className={t.num}>Valor</th><th>Status</th><th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className={t.empty}>Nenhum atendimento neste período e filtro.</td></tr>
                ) : rows.map(r => (
                  <tr key={r.appointmentId} className={styles.row}>
                    <td data-label="Data" className={t.muted}>{diaBR(r.dia)}</td>
                    <td>
                      <div className={styles.who}>
                        <span className={styles.name}>{r.paciente}</span>
                        {r.carteirinha && <span className={styles.sub}>Carteirinha {r.carteirinha}</span>}
                        {carteirinhaVencida(r) && <span className={`${styles.sub} ${styles.warn}`}>Carteirinha vencida</span>}
                      </div>
                    </td>
                    <td data-label="Convênio">{r.convenio}</td>
                    <td data-label="Procedimento" className={t.muted}>{r.procedimento || '-'}</td>
                    <td data-label="Valor" className={t.num} title={VALOR_ORIGEM_LABEL[r.valorOrigem]}>{r.valor != null ? formatCurrency(r.valor) : 'Sem valor'}</td>
                    <td data-label="Status"><StatusDot tone={TOM[r.status]}>{r.statusLabel}</StatusDot></td>
                    <td className={styles.actionsCell}>
                      <div className={t.rowActions}>{canEdit && <MoreMenu label={`Ações de ${r.paciente}`} items={menu(r)} />}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {recibo && reciboCtx && reciboAppt && reciboPatient && (
        <ReciboModal
          base={{ clinic: reciboCtx.clinic, clinicType: reciboCtx.clinicType, patient: reciboPatient, professional: reciboCtx.professional, dia: recibo.dia }}
          valorInicial={recibo.valor ?? valorDaGuia(reciboCtx)}
          descricaoInicial={recibo.procedimento}
          onClose={() => setRecibo(null)}
        />
      )}
    </>
  )
}
