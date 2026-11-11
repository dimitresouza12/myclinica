'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { formatCurrency } from '@/lib/utils'
import { formatBrPhone } from '@/lib/phoneFormat'
import { syncLeadAppointments } from '@/lib/sync-leads'
import { hasWhatsAppAI } from '@/lib/planGates'
import { usePacientesData, usePatientCreditsData } from '@/hooks/useClinicData'
import { isScopedProfessional } from '@/lib/professionalScope'
import { avatarTone } from '@/lib/ui/avatarTone'
import { addDays, lastDays, patientsSeries, startOfDay } from '@/lib/dashboard/metrics'
import { exportRows, filterPatients, matchesFilter, summarizePatients, toCsv, type PatientFilter } from '@/lib/pacientes/summary'
import type { Patient } from '@/types'
import { PatientFormModal } from '@/components/pacientes/PatientFormModal'
import { PatientPackagesModal } from '@/components/pacientes/PatientPackagesModal'
import { usePatientPackages } from '@/hooks/usePatientPackages'
import { usePetVacinaAlertas } from '@/hooks/usePetVacinaAlertas'
import { packageUsage } from '@/lib/agenda/packages'
import { hojeBrasil } from '@/lib/brasilDate'
import { PetIcon } from '@/components/ui/PetIcon'
import { Icon } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { PillTabs } from '@/components/ui/PillTabs'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusDot } from '@/components/ui/StatusDot'
import { MoreMenu } from '@/components/ui/MoreMenu'
import btn from '@/components/ui/button.module.css'
import t from '@/components/ui/table.module.css'
import { loadListFilter, patientHref, saveListState } from '@/lib/prontuario/navigation'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import styles from './pacientes.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { usePermissions } from '@/hooks/usePermissions'
import { patientOpenLabel } from '@/lib/pacientes/cadastro'
import { canSeeFinancialTotals } from '@/lib/permissionPresets'

const dayShort = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
const nextFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function nextLabel(iso: string): string {
  const p: Record<string, string> = {}
  for (const x of nextFmt.formatToParts(new Date(iso))) if (x.type !== 'literal') p[x.type] = x.value
  return `${p.weekday.replace('.', '')}, ${p.day}/${p.month}, ${p.hour}h${p.minute === '00' ? '' : p.minute}`
}

function PacientesContent() {
  const { clinic, user } = useAuthStore()
  // sem o módulo Prontuário, /pacientes/[id] abre só o cadastro: o atalho muda de nome
  const openLabel = patientOpenLabel(usePermissions('prontuario').canView)
  // "Editar" = criar, alterar, enviar, exportar; sem ele a tela é só de consulta
  const { canEdit } = usePermissions('pacientes')
  // Saldo de pacotes é valor em R$: só com Ver no Financeiro (e "Ver totais financeiros" ligado)
  const canSeeBalance = canSeeFinancialTotals(usePermissions('financeiro'))
  const readOnlyTitle = 'Seu perfil só pode visualizar'
  // clínica com acesso por profissional + usuário que não é admin/recepção: o paciente que ele criasse
  // sumiria da lista dele (RLS), então o cadastro direto fica só com a recepção
  const cannotCreatePatient = isScopedProfessional(clinic, user)
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: pacientesData, isLoading: loading } = usePacientesData(clinic?.id)
  const patients = useMemo(() => pacientesData?.patients ?? [], [pacientesData])
  const appointments = useMemo(() => pacientesData?.appointments ?? [], [pacientesData])
  const { data: creditsData } = usePatientCreditsData(clinic?.id)
  // Saldo de pacote por paciente — soma do ledger, só entra no mapa quando ≠ 0
  // (a maioria dos pacientes não usa pacote, então não faz sentido guardar
  // zero pra todo mundo).
  const creditBalances = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of creditsData?.credits ?? []) {
      map.set(c.patient_id, (map.get(c.patient_id) ?? 0) + Number(c.amount))
    }
    for (const [id, balance] of map) if (balance === 0) map.delete(id)
    return map
  }, [creditsData])

  // Veterinária: selo de vacina vencida ou a vencer por pet (vazio enquanto a carteira não existe no banco)
  const isVet = clinic?.type === 'vet' || !!clinic?.specialties?.includes('vet')
  const { data: vacinaAlertas } = usePetVacinaAlertas(clinic?.id, isVet)

  // Pacotes de sessões: o pacote em andamento de cada paciente ("3/10 sessões"), quando o banco já suporta
  const { data: pkgData } = usePatientPackages(clinic?.id)
  const packageByPatient = useMemo(() => {
    const map = new Map<string, { used: number; total: number; remaining: number; low: boolean }>()
    if (!pkgData?.available) return map
    const today = hojeBrasil()
    for (const p of pkgData.packages) {
      const u = packageUsage(p, pkgData.linked, today)
      if (u.state !== 'ativo' || map.has(p.patient_id)) continue
      map.set(p.patient_id, { used: u.used, total: u.total, remaining: u.remaining, low: u.low })
    }
    return map
  }, [pkgData])
  const [packagesPatient, setPackagesPatient] = useState<Patient | null>(null)

  const [editPatient, setEditPatient] = useState<Patient | null>(null)
  const [showNewPatient, setShowNewPatient] = useState(false)
  // o filtro volta como estava depois de abrir um prontuário e clicar em Voltar (guardado na sessão)
  const [filter, setFilter] = useState<PatientFilter>(() => loadListFilter() ?? 'todos')
  function changeFilter(f: PatientFilter) { setFilter(f); saveListState(f) }
  function openProntuario(p: Patient) {
    saveListState(filter)
    router.push(patientHref(p.id))
  }

  // Fire-and-forget sync in background
  useEffect(() => {
    if (clinic && hasWhatsAppAI(clinic.plan)) syncLeadAppointments(clinic.id, clinic.slug)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  // Links antigos (/pacientes?patient=<id>, de avisos e favoritos) levam ao prontuário, que agora é uma página
  const legacyPatientId = searchParams.get('patient')
  useEffect(() => {
    if (legacyPatientId) router.replace(patientHref(legacyPatientId))
  }, [legacyPatientId, router])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['pacientes', clinic?.id] })
  }

  function handleSaved() {
    setEditPatient(null)
    setShowNewPatient(false)
    invalidate()
  }

  // "agora" fixo por carga de dados: a lista não precisa se mexer a cada render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [pacientesData])
  const summary = useMemo(() => summarizePatients(appointments, now), [appointments, now])

  const counts = useMemo(() => {
    const c: Record<PatientFilter, number> = { todos: patients.length, agendados: 0, sem_retorno: 0, com_saldo: 0 }
    for (const p of patients) {
      if (matchesFilter(p.id, 'agendados', summary, creditBalances)) c.agendados++
      if (matchesFilter(p.id, 'sem_retorno', summary, creditBalances)) c.sem_retorno++
      if (matchesFilter(p.id, 'com_saldo', summary, creditBalances)) c.com_saldo++
    }
    return c
  }, [patients, summary, creditBalances])

  const visible = useMemo(() => filterPatients(patients, filter, summary, creditBalances), [patients, filter, summary, creditBalances])

  const stats = useMemo(() => {
    const today = startOfDay(now)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
    const newThisMonth = patients.filter(p => new Date(p.created_at).getTime() >= monthStart).length
    const days = lastDays(today, 7)
    const recent = patients.filter(p => new Date(p.created_at).getTime() >= addDays(today, -7).getTime()).map(p => p.created_at)
    let balance = 0
    for (const v of creditBalances.values()) if (v > 0) balance += v
    return { newThisMonth, series: patientsSeries(patients.length, recent, days), balance }
  }, [patients, now, creditBalances])

  function exportCsv() {
    const csv = toCsv(exportRows(visible, summary, creditBalances))
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `pacientes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filterLabels: Record<PatientFilter, string> = { todos: 'Todos', agendados: 'Com consulta marcada', sem_retorno: 'Sem retorno', com_saldo: 'Com saldo' }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Pacientes"
        subtitle={`${patients.length} ${patients.length === 1 ? 'paciente ativo' : 'pacientes ativos'}`}
        actions={
          <>
            {/* no desktop a busca de pacientes fica na barra de cima */}
            <div className={styles.mobileSearch}><GlobalSearch /></div>
            <button type="button" className={btn.secondary} onClick={exportCsv} disabled={visible.length === 0 || !canEdit} title={canEdit ? undefined : readOnlyTitle}>
              <Icon name="download" size={15} /> Exportar
            </button>
            {!cannotCreatePatient && (
              <button type="button" className={btn.primary} onClick={() => setShowNewPatient(true)} disabled={!canEdit} title={canEdit ? undefined : readOnlyTitle}>
                <Icon name="plus" size={15} /> Novo paciente
              </button>
            )}
          </>
        }
      />

      {cannotCreatePatient && (
        <p className={styles.scopeNote} role="note">
          <Icon name="info" size={15} />
          <span>Pacientes novos são cadastrados pela recepção ao agendar.</span>
        </p>
      )}

      <div className={`${styles.stats} ${canSeeBalance ? '' : styles.stats3}`}>
        <StatCard
          title="Pacientes ativos"
          value={patients.length}
          hint={`${stats.newThisMonth} ${stats.newThisMonth === 1 ? 'novo' : 'novos'} neste mês`}
          delta={stats.newThisMonth > 0 ? { label: `+${stats.newThisMonth}` } : undefined}
          spark={{ values: stats.series, label: `Pacientes ativos nos últimos 7 dias: de ${stats.series[0]} para ${stats.series[stats.series.length - 1]}` }}
        />
        <StatCard title="Com consulta marcada" value={counts.agendados} hint={`de ${patients.length} no cadastro`} />
        <StatCard title="Sem retorno" value={counts.sem_retorno} hint="45 dias ou mais sem voltar" />
        {canSeeBalance && <StatCard title="Saldo de pacotes" value={formatCurrency(stats.balance)} compact hint={`${counts.com_saldo} ${counts.com_saldo === 1 ? 'paciente com saldo' : 'pacientes com saldo'}`} />}
      </div>

      <Card
        flush
        title="Lista de pacientes"
        actions={
          <PillTabs
            label="Filtrar pacientes"
            value={filter}
            onChange={changeFilter}
            options={(Object.keys(filterLabels) as PatientFilter[]).map(v => ({ value: v, label: filterLabels[v], count: counts[v] }))}
          />
        }
      >
        {loading ? (
          <p className={styles.loading}>Carregando...</p>
        ) : (
          <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
            <table className={`${t.table} resp-table`}>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Procedimento principal</th>
                  <th>Última consulta</th>
                  <th>Próxima consulta</th>
                  <th className={t.num}>Saldo</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={6} className={t.empty}>{filter === 'todos' ? 'Nenhum paciente cadastrado ainda.' : 'Nenhum paciente neste filtro.'}</td></tr>
                ) : visible.map(p => {
                  const s = summary.get(p.id)
                  const balance = creditBalances.get(p.id)
                  const pkg = packageByPatient.get(p.id)
                  return (
                    <tr key={p.id} className={`${t.clickable} ${styles.row}`} onClick={() => openProntuario(p)}>
                      <td>
                        <div className={styles.person}>
                          {isVet ? (
                            <span className={styles.petBadge}><PetIcon species={p.pet_species} size={20} /></span>
                          ) : (
                            <Avatar url={p.avatar_url} name={p.name} size={36} className={`${styles.avatar} ${styles[`tone${avatarTone(p.name)}`]}`} />
                          )}
                          <div className={styles.who}>
                            <button type="button" className={styles.name} onClick={e => { e.stopPropagation(); openProntuario(p) }}>{p.name}</button>
                            <span className={styles.sub}>
                              {isVet && p.pet_name ? p.pet_name : formatBrPhone(p.phone) || 'Sem telefone'}
                            </span>
                            {isVet && vacinaAlertas?.get(p.id) && (
                              <StatusDot tone={vacinaAlertas.get(p.id)!.tom === 'vencida' ? 'bad' : 'warn'}>
                                Vacina: {vacinaAlertas.get(p.id)!.selo}
                              </StatusDot>
                            )}
                          </div>
                        </div>
                      </td>
                      <td data-label="Procedimento" className={t.muted}>{s?.mainProcedure ?? '-'}</td>
                      <td data-label="Última consulta" className={t.muted}>{s?.lastAt ? dayShort.format(new Date(s.lastAt)) : '-'}</td>
                      <td data-label="Próxima consulta">
                        {s?.nextAt ? nextLabel(s.nextAt) : s?.noReturn ? <StatusDot tone="warn">Sem retorno</StatusDot> : <span className={t.muted}>-</span>}
                      </td>
                      <td data-label="Saldo" className={`${t.num} ${balance ? styles.balance : t.muted}`}>{balance ? formatCurrency(balance) : pkg ? '' : '-'}
                        {pkg && (
                          <button type="button" className={`${styles.pkgChip}${pkg.low ? ` ${styles.pkgChipLow}` : ''}`} onClick={e => { e.stopPropagation(); setPackagesPatient(p) }} title={pkg.low ? `Restam ${pkg.remaining} sessões: avise para renovar` : 'Ver pacote de sessões'}>
                            Pacote {pkg.used}/{pkg.total}
                          </button>
                        )}
                      </td>
                      <td className={styles.actionsCell}>
                        <div className={t.rowActions} onClick={e => e.stopPropagation()}>
                          <span className={`${t.hoverOnly} ${styles.shortcuts}`}>
                            <button type="button" className={styles.shortcut} title={openLabel} aria-label={`${openLabel} de ${p.name}`} onClick={() => openProntuario(p)}>
                              <Icon name="procedures" size={15} />
                            </button>
                            {canEdit && (
                              <button type="button" className={styles.shortcut} title="Editar cadastro" aria-label={`Editar cadastro de ${p.name}`} onClick={() => setEditPatient(p)}>
                                <Icon name="edit" size={15} />
                              </button>
                            )}
                          </span>
                          <MoreMenu
                            label={`Mais ações de ${p.name}`}
                            items={[
                              { label: openLabel, icon: 'procedures', onClick: () => openProntuario(p) },
                              ...(canEdit ? [{ label: 'Editar cadastro', icon: 'edit' as const, onClick: () => setEditPatient(p) }] : []),
                              ...(pkgData?.available ? [{ label: canEdit ? 'Pacotes de sessões' : 'Ver pacotes de sessões', icon: 'receipt' as const, onClick: () => setPackagesPatient(p) }] : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {packagesPatient && clinic && (
        <PatientPackagesModal open onClose={() => setPackagesPatient(null)} clinicId={clinic.id} userId={user?.id} patient={{ id: packagesPatient.id, name: packagesPatient.name }} readOnly={!canEdit} />
      )}

      {canEdit && (editPatient || (showNewPatient && !cannotCreatePatient)) && (
        <PatientFormModal
          patient={editPatient}
          clinicId={clinic!.id}
          onClose={() => { setEditPatient(null); setShowNewPatient(false) }}
          onSaved={handleSaved}
        />
      )}

    </div>
  )
}

export default function PacientesPage() {
  return (
    <PermissionGuard module="pacientes">
      <Suspense fallback={<div />}>
        <PacientesContent />
      </Suspense>
    </PermissionGuard>
  )
}
