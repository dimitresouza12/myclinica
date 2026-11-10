'use client'
import { useState, useMemo, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatCurrency, formatMonthLabel } from '@/lib/utils'
import { printRecibo, PAYMENT_METHOD_LABELS } from '@/lib/print'
import { audit } from '@/lib/audit'
import { useFinanceiroData, useProcedures } from '@/hooks/useClinicData'
import { mergeSpecialtyConfigs } from '@/lib/specialtyConfig'
import { COMMON_CONVENIOS } from '@/lib/convenios'
import { myScopedProfessionalId } from '@/lib/professionalScope'
import type { FinancialRecord, Patient } from '@/types'
import styles from './financeiro.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { usePermissions } from '@/hooks/usePermissions'
import { MoneyInput } from '@/components/ui/NumericInput'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { PillTabs } from '@/components/ui/PillTabs'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { Skeleton } from '@/components/ui/Skeleton'
import { BarList } from '@/components/ui/BarList'
import { MoreMenu, type MoreMenuItem } from '@/components/ui/MoreMenu'
import { Modal } from '@/components/ui/Modal'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import t from '@/components/ui/table.module.css'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { DatePicker } from '@/components/ui/DatePicker'
import { moneyShort, axisMoney, statMoney } from '@/lib/ui/money'

// Recharts – dynamic import to avoid SSR issues
const AreaTrendChart = dynamic(() => import('@/components/ui/AreaTrendChart').then(m => m.AreaTrendChart), { ssr: false, loading: () => <div className={styles.chartLoading} /> })



interface NewRecord {
  type: 'receita' | 'despesa'
  patient_id: string
  procedure_id: string
  total_amount: string
  payment_method: string
  convenio: string
  category: string
  notes: string
  record_date: string
}
const todayStr = () => new Date().toISOString().slice(0, 10)
const BLANK: NewRecord = { type: 'receita', patient_id: '', procedure_id: '', total_amount: '', payment_method: 'pix', convenio: '', category: '', notes: '', record_date: todayStr() }

function FinanceiroContent() {
  const { clinic, user } = useAuthStore()
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAdmin, canEdit, metadata } = usePermissions('financeiro')
  // Admin sempre vê totais; outros usuários dependem da permissão configurada (padrão: true)
  const showTotals = isAdmin || (metadata.show_totals !== false)
  // Modelo de acesso por profissional (Bloco C): não-admin/recepção só vê
  // (e os totais/gráficos abaixo só somam) as próprias receitas/despesas.
  const scopeProfessionalId = myScopedProfessionalId(user)
  const { data: finData, isLoading: loading, isError: loadFailed, isRefetching, refetch } = useFinanceiroData(clinic?.id, scopeProfessionalId)
  const { data: procedures = [] } = useProcedures(clinic?.id)
  const records = finData?.records ?? []
  const patients = finData?.patients ?? []
  const activeProcedures = procedures.filter(p => p.is_active)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<'receita' | 'despesa'>('receita')
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState<NewRecord>(BLANK)
  const [showConvenioSuggestions, setShowConvenioSuggestions] = useState(false)
  const filteredConvenioSuggestions = COMMON_CONVENIOS.filter(c =>
    c.toLowerCase().includes(form.convenio.trim().toLowerCase())
  )
  // Marca essa receita como venda de pacote — gera saldo pro paciente
  // consumir depois na Agenda, em vez de cobrar cada sessão de novo.
  const [grantCredit, setGrantCredit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<'todos' | 'receita' | 'despesa'>('todos')
  const [filterPatient, setFilterPatient] = useState('')
  const [patientSearch, setPatientSearch] = useState('')
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false)
  const [filterPeriod, setFilterPeriod] = useState<'diario' | 'semanal' | 'mensal' | 'geral'>('diario')
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7))

  function loadData() {
    queryClient.invalidateQueries({ queryKey: ['financeiro', clinic?.id] })
  }

  const periodRecords = useMemo(() => {
    const now = new Date()
    if (filterPeriod === 'geral') return records
    if (filterPeriod === 'mensal') {
      const monthStr = filterMonth
      return records.filter(r => r.created_at?.startsWith(monthStr))
    }
    if (filterPeriod === 'semanal') {
      const startOfWeek = new Date(now)
      startOfWeek.setDate(now.getDate() - now.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      return records.filter(r => {
        const d = new Date(r.created_at)
        return d >= startOfWeek
      })
    }
    // diario
    const todayStr = now.toISOString().slice(0, 10)
    return records.filter(r => r.created_at?.startsWith(todayStr))
  }, [records, filterPeriod, filterMonth])

  const stats = useMemo(() => {
    const receitas = periodRecords.filter(r => r.type === 'receita').reduce((s, r) => s + (r.total_amount ?? 0), 0)
    const despesas = periodRecords.filter(r => r.type === 'despesa').reduce((s, r) => s + (r.total_amount ?? 0), 0)
    const saldo = receitas - despesas
    const nReceitas = periodRecords.filter(r => r.type === 'receita').length
    const nDespesas = periodRecords.filter(r => r.type === 'despesa').length
    return {
      receitas, despesas, saldo, count: periodRecords.length, nReceitas, nDespesas,
      margin: receitas > 0 ? Math.round((saldo / receitas) * 100) : null,
      ticket: nReceitas > 0 ? receitas / nReceitas : 0,
    }
  }, [periodRecords])

  // Últimos 12 meses: receita (linha cheia) contra despesa (tracejada)
  const monthlyData = useMemo(() => {
    const months: { label: string; value: number; compare: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const short = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
      const monthRecords = records.filter(r => r.created_at?.startsWith(key))
      months.push({
        label: i === 11 || d.getMonth() === 0 ? `${short} ${String(d.getFullYear()).slice(2)}` : short,
        value: monthRecords.filter(r => r.type === 'receita').reduce((s, r) => s + (r.total_amount ?? 0), 0),
        compare: monthRecords.filter(r => r.type === 'despesa').reduce((s, r) => s + (r.total_amount ?? 0), 0),
      })
    }
    return months
  }, [records])

  // Category breakdown for selected period
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {}
    periodRecords.filter(r => r.type === 'receita').forEach(r => {
      const k = r.category ?? 'Outros'
      map[k] = (map[k] ?? 0) + (r.total_amount ?? 0)
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [periodRecords])

  // Receita por convênio no período — só registro informativo (não gera
  // guia TISS), mostra pra clínica quanto vem de particular vs. cada operadora.
  const convenioData = useMemo(() => {
    const map: Record<string, number> = {}
    periodRecords.filter(r => r.type === 'receita' && r.payment_method === 'convenio').forEach(r => {
      const k = r.convenio?.trim() || 'Não especificado'
      map[k] = (map[k] ?? 0) + (r.total_amount ?? 0)
    })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [periodRecords])

  const filtered = periodRecords.filter(r =>
    (filterType === 'todos' || r.type === filterType) &&
    (!filterPatient || r.patient_id === filterPatient) &&
    (!patientSearch.trim() || (r.patients?.name ?? '').toLowerCase().includes(patientSearch.trim().toLowerCase()))
  )

  const patientSuggestions = useMemo(() => {
    const q = patientSearch.trim().toLowerCase()
    if (!q) return []
    return patients
      .filter(p => p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 8)
  }, [patients, patientSearch])

  function selectPatientSuggestion(p: Patient) {
    setFilterPatient(p.id)
    setPatientSearch(p.name)
    setShowPatientSuggestions(false)
  }

  const patientSummary = useMemo(() => {
    const paid = filtered.filter(r => r.type === 'receita').reduce((s, r) => s + (r.total_amount ?? 0), 0)
    if (filterPatient) {
      const name = patients.find(p => p.id === filterPatient)?.name
        ?? filtered.find(r => r.patient_id === filterPatient)?.patients?.name
        ?? 'Paciente'
      return { name, paid, count: filtered.length }
    }
    if (patientSearch.trim()) {
      return { name: null, paid, count: filtered.length }
    }
    return null
  }, [filterPatient, patientSearch, filtered, patients])

  // Deep link vindo do toast de "agendamento concluído" (Agenda): abre direto
  // o lançamento gerado automaticamente (?record=<id>) pra definir a forma de
  // pagamento, ou já abre o modal de novo lançamento pré-preenchido
  // (?new=receita&patient=<id>&notes=<texto>) quando não havia preço definido.
  // Roda só uma vez (deepLinkHandledRef) e limpa a URL logo em seguida — sem
  // isso, salvar o lançamento invalida `records`, o efeito reexecuta e reabre
  // o modal sozinho depois de já ter sido fechado.
  const deepLinkHandledRef = useRef(false)
  useEffect(() => {
    if (loading || deepLinkHandledRef.current) return
    const recordId = searchParams.get('record')
    const isNewReceita = searchParams.get('new') === 'receita'
    const patientFilter = searchParams.get('patient')
    // Vindo da lista de Pacientes ("Financeiro" na linha do paciente) — só
    // pré-filtra a listagem, não abre nenhum modal.
    if (!recordId && !isNewReceita && patientFilter) {
      deepLinkHandledRef.current = true
      router.replace('/financeiro')
      setFilterPatient(patientFilter)
      setPatientSearch(patients.find(p => p.id === patientFilter)?.name ?? '')
      setFilterPeriod('geral')
      return
    }
    if (!recordId && !isNewReceita) return
    deepLinkHandledRef.current = true
    router.replace('/financeiro')
    if (recordId) {
      const record = records.find(r => r.id === recordId)
      if (record) openEdit(record)
      return
    }
    openModal('receita')
    setForm(p => ({
      ...p,
      patient_id: searchParams.get('patient') ?? '',
      notes: searchParams.get('notes') ?? '',
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, records, searchParams])

  function openModal(type: 'receita' | 'despesa') {
    setModalType(type)
    setEditingId(null)
    setForm({ ...BLANK, type, category: type === 'receita' ? 'Consulta' : 'Material', record_date: todayStr() })
    setGrantCredit(false)
    setShowModal(true)
  }

  function openEdit(record: FinancialRecord) {
    setModalType(record.type)
    setEditingId(record.id)
    setForm({
      type: record.type,
      patient_id: record.patient_id ?? '',
      procedure_id: record.procedure_id ?? '',
      total_amount: String(record.total_amount ?? ''),
      payment_method: record.payment_method ?? 'pix',
      convenio: record.convenio ?? '',
      category: record.category ?? '',
      notes: record.notes ?? '',
      record_date: record.created_at ? record.created_at.slice(0, 10) : todayStr(),
    })
    setGrantCredit(false)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setGrantCredit(false)
    setForm(BLANK)
  }

  async function handleSave() {
    if (!clinic) return
    setSaving(true)
    const payload = {
      clinic_id: clinic.id,
      patient_id: form.patient_id || null,
      // Procedimento só faz sentido pra receita — é o que aciona o cálculo
      // automático de comissão (trigger generate_commission_entries).
      procedure_id: form.type === 'receita' ? (form.procedure_id || null) : null,
      total_amount: parseFloat(form.total_amount) || 0,
      payment_method: form.payment_method,
      // Só grava convênio se a forma de pagamento realmente for convênio —
      // evita ficar com convênio "fantasma" numa receita que virou PIX depois.
      convenio: form.payment_method === 'convenio' ? (form.convenio.trim() || null) : null,
      category: form.category,
      notes: form.notes,
      type: form.type,
      // Meio-dia local evita que a data escolhida "role" um dia pra trás ao
      // ser convertida pra UTC perto da virada (ex: 00:00 em UTC-3 vira o
      // dia anterior em UTC).
      created_at: new Date(`${form.record_date}T12:00:00`).toISOString(),
      // Lançamento manual feito por um profissional restrito já nasce
      // atribuído a ele — senão a RLS do Bloco C rejeitaria o insert.
      ...(scopeProfessionalId ? { professional_id: scopeProfessionalId } : {}),
    }
    if (editingId) {
      await supabase.from('financial_records').update(payload).eq('id', editingId)
    } else {
      const { data: inserted } = await supabase.from('financial_records').insert([payload]).select('id').single()
      if (user) audit({ action: 'financial.create', user_id: user.id, clinic_id: clinic.id, module: 'financeiro', resource_id: inserted?.id, details: { type: form.type, amount: payload.total_amount } })
      // Venda de pacote: gera o saldo do paciente pra ele consumir depois na
      // Agenda em vez de cobrar cada sessão de novo.
      if (grantCredit && inserted && form.patient_id) {
        await supabase.from('patient_credits').insert([{
          clinic_id: clinic.id,
          patient_id: form.patient_id,
          amount: payload.total_amount,
          type: 'credito',
          financial_record_id: inserted.id,
          notes: form.notes || null,
          created_by: user?.id ?? null,
        }])
        if (user) audit({ action: 'financial.grant_credit', user_id: user.id, clinic_id: clinic.id, module: 'financeiro', resource_id: inserted.id, details: { patient_id: form.patient_id, amount: payload.total_amount } })
        queryClient.invalidateQueries({ queryKey: ['patient-credits', clinic.id] })
      }
    }
    setSaving(false)
    closeModal()
    loadData()
  }

  function handlePrintRecibo(record: FinancialRecord) {
    if (!clinic) return
    printRecibo(
      { name: clinic.name, logo: clinic.logo, address: clinic.address, phone: clinic.phone },
      record,
      record.patients?.name ?? 'Paciente'
    )
  }

  async function handleDelete(record: FinancialRecord) {
    if (!(await confirmDialog({ message: `Excluir este lançamento de ${formatCurrency(record.total_amount ?? 0)}? Esta ação não pode ser desfeita.`, confirmText: 'Excluir', danger: true }))) return
    setDeletingId(record.id)
    await supabase.from('financial_records').delete().eq('id', record.id)
    if (user && clinic) audit({ action: 'financial.delete', user_id: user.id, clinic_id: clinic.id, module: 'financeiro', resource_id: record.id, details: { type: record.type, amount: record.total_amount ?? 0 } })
    setDeletingId(null)
    loadData()
  }

  const specialty = mergeSpecialtyConfigs(clinic?.specialties?.length ? clinic.specialties : [clinic?.type ?? 'odonto'])
  const categorias = form.type === 'receita' ? specialty.financeCategoriasReceita : specialty.financeCategoriasDespesa

  const periodLabel =
    filterPeriod === 'diario' ? 'hoje' :
    filterPeriod === 'semanal' ? 'esta semana' :
    filterPeriod === 'mensal' ? 'do mês' :
    'geral'

  const periodLabelText = filterPeriod === 'diario' ? 'hoje' :
    filterPeriod === 'semanal' ? 'esta semana' :
    filterPeriod === 'mensal' ? formatMonthLabel(filterMonth) :
    'todos os períodos'

  const periodOptions = [
    { value: 'diario' as const, label: 'Diário' },
    { value: 'semanal' as const, label: 'Semanal' },
    { value: 'mensal' as const, label: 'Mensal' },
    { value: 'geral' as const, label: 'Geral' },
  ]
  const typeCounts = {
    todos: periodRecords.length,
    receita: stats.nReceitas,
    despesa: stats.nDespesas,
  }
  const hasTrend = monthlyData.some(m => m.value > 0 || m.compare > 0)

  function rowMenu(r: FinancialRecord): MoreMenuItem[] {
    const items: MoreMenuItem[] = []
    if (r.type === 'receita') items.push({ label: 'Imprimir recibo', icon: 'receipt', onClick: () => handlePrintRecibo(r) })
    if (canEdit) {
      items.push({ label: 'Editar lançamento', icon: 'edit', onClick: () => openEdit(r) })
      items.push({ label: 'Excluir lançamento', icon: 'trash', danger: true, onClick: () => handleDelete(r) })
    }
    return items
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Financeiro"
        subtitle={`${filtered.length} ${filtered.length === 1 ? 'lançamento' : 'lançamentos'}, ${periodLabelText}`}
        actions={
          <>
            {/* Período fica no topo (não na tabela, lá embaixo) porque também controla os cards de totais */}
            <PillTabs label="Período" value={filterPeriod} onChange={setFilterPeriod} options={periodOptions} />
            {filterPeriod === 'mensal' && <MonthPicker value={filterMonth} onChange={setFilterMonth} />}
            {canEdit && <button type="button" className={btn.secondary} onClick={() => openModal('despesa')}><Icon name="minus" size={15} /> Despesa</button>}
            {canEdit && <button type="button" className={btn.primary} onClick={() => openModal('receita')}><Icon name="plus" size={15} /> Receita</button>}
          </>
        }
      />

      {/* Cards de totais: controlados pela permissão "Ver totais" */}
      {showTotals && (
        <div className={styles.cards}>
          <StatCard title={`Receitas ${periodLabel}`} value={statMoney(stats.receitas)} compact hint={`${stats.nReceitas} ${stats.nReceitas === 1 ? 'lançamento' : 'lançamentos'}`} />
          <StatCard title={`Despesas ${periodLabel}`} value={statMoney(stats.despesas)} compact hint={`${stats.nDespesas} ${stats.nDespesas === 1 ? 'lançamento' : 'lançamentos'}`} />
          <StatCard
            title={`Saldo ${periodLabel}`}
            value={statMoney(stats.saldo)}
            compact
            hint={stats.margin !== null ? `margem de ${stats.margin}% sobre a receita` : 'sem receita no período'}
          />
          <StatCard title="Ticket médio" value={statMoney(stats.ticket)} compact hint="por receita no período" />
        </div>
      )}

      {/* Gráficos: também pela permissão "Ver totais" */}
      {!loading && showTotals && (
        <div className={styles.charts}>
          <Card title="Receitas e despesas" actions={<span className={styles.cardMeta}>últimos 12 meses</span>}>
            {hasTrend ? (
              <AreaTrendChart
                data={monthlyData}
                highlightIndex={11}
                valueName="Receitas"
                compareName="Despesas"
                formatValue={moneyShort}
                formatAxis={axisMoney}
                height={260}
                label="Receitas e despesas dos últimos 12 meses"
              />
            ) : (
              <p className={styles.chartEmpty}>Nenhum lançamento nos últimos 12 meses.</p>
            )}
          </Card>
          <div className={styles.side}>
            <Card title="Receitas por categoria" actions={<span className={styles.cardMeta}>{periodLabelText}</span>}>
              <BarList items={[...categoryData].sort((a, b) => b.value - a.value).slice(0, 6).map(c => ({ label: c.name, value: c.value }))} format={moneyShort} empty="Nenhuma receita neste período." />
            </Card>
            {/* Receita por convênio: só aparece se houve receita com forma de pagamento = convênio no período */}
            {convenioData.length > 0 && (
              <Card title="Receita por convênio" actions={<span className={styles.cardMeta}>{periodLabelText}</span>}>
                <BarList items={[...convenioData].sort((a, b) => b.value - a.value).slice(0, 6).map(c => ({ label: c.name, value: c.value }))} format={moneyShort} />
              </Card>
            )}
          </div>
        </div>
      )}

      <Card
        flush
        title="Lançamentos"
        actions={
          <>
            <div className={styles.patientSearchBox}>
              <SearchInput
                placeholder="Buscar por paciente"
                label="Buscar lançamentos por nome do paciente"
                value={patientSearch}
                onChange={v => {
                  setPatientSearch(v)
                  setFilterPatient('')
                  setShowPatientSuggestions(true)
                }}
                onFocus={() => setShowPatientSuggestions(true)}
                onBlur={() => setTimeout(() => setShowPatientSuggestions(false), 120)}
              />
              {showPatientSuggestions && patientSuggestions.length > 0 && (
                <div className={styles.patientSuggestions}>
                  {patientSuggestions.map(p => (
                    <button
                      type="button"
                      key={p.id}
                      className={styles.patientSuggestion}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => selectPatientSuggestion(p)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <PillTabs
              label="Tipo de lançamento"
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: 'todos', label: 'Todos', count: typeCounts.todos },
                { value: 'receita', label: 'Receitas', count: typeCounts.receita },
                { value: 'despesa', label: 'Despesas', count: typeCounts.despesa },
              ]}
            />
          </>
        }
      >
        {patientSummary && (
          <div className={styles.patientSummary}>
            <span>{patientSummary.name ? <>Extrato de <strong>{patientSummary.name}</strong></> : 'Resultado da busca'}, {periodLabel}</span>
            <span>{patientSummary.count} lançamento{patientSummary.count === 1 ? '' : 's'} · <strong>{formatCurrency(patientSummary.paid)}</strong> pago em receitas</span>
          </div>
        )}
        {loadFailed && !finData ? (
          <div className={styles.errorWrap}>
            <ErrorNotice
              title="Não foi possível carregar os lançamentos"
              message="Verifique sua conexão e tente de novo."
              onRetry={() => { void refetch() }}
              retrying={isRefetching}
            />
          </div>
        ) : loading ? (
          <div className={styles.loading} aria-busy="true">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={44} radius={10} />)}
          </div>
        ) : (
          <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
            <table className={`${t.table} resp-table`}>
              <thead>
                <tr>
                  <th>Lançamento</th>
                  <th>Paciente</th>
                  <th>Data</th>
                  <th>Método</th>
                  <th className={t.num}>Valor</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className={styles.emptyCell}>
                    <EmptyState
                      compact
                      icon="receipt"
                      title="Nenhum lançamento encontrado"
                      description={patientSearch.trim() || filterType !== 'todos' ? 'Ajuste a busca ou o tipo de lançamento para ver outros resultados.' : 'Não há receitas nem despesas neste período.'}
                    />
                  </td></tr>
                ) : filtered.map(r => {
                  const menu = rowMenu(r)
                  const isIn = r.type === 'receita'
                  return (
                    <tr key={r.id} className={styles.row}>
                      <td>
                        <div className={styles.entry}>
                          <span className={isIn ? styles.arrowIn : styles.arrowOut} aria-hidden="true">
                            <Icon name="arrowUp" size={14} style={isIn ? undefined : { transform: 'rotate(180deg)' }} />
                          </span>
                          <div className={styles.who}>
                            <span className={styles.name}>{r.category ?? (isIn ? 'Receita' : 'Despesa')}<span className={styles.srOnly}>{isIn ? ', receita' : ', despesa'}</span></span>
                            {r.notes && <span className={styles.sub}>{r.notes}</span>}
                          </div>
                        </div>
                      </td>
                      <td data-label="Paciente" className={t.muted}>{r.patients?.name ?? '-'}</td>
                      <td data-label="Data" className={t.muted}>{formatDate(r.created_at, true)}</td>
                      <td data-label="Método" className={t.muted}>
                        {r.payment_method === 'convenio' && r.convenio ? `Convênio: ${r.convenio}` : (PAYMENT_METHOD_LABELS[r.payment_method ?? ''] ?? r.payment_method ?? '-')}
                      </td>
                      <td data-label="Valor" className={`${t.num} ${styles.amount} ${isIn ? '' : styles.amountOut}`}>
                        {isIn ? '+' : '−'}{formatCurrency(r.total_amount ?? 0)}
                      </td>
                      <td className={styles.actionsCell}>
                        {menu.length > 0 && (
                          <div className={t.rowActions}>
                            <MoreMenu label={`Mais ações do lançamento de ${formatCurrency(r.total_amount ?? 0)}`} items={menu} />
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingId
          ? (form.type === 'receita' ? 'Editar Receita' : 'Editar Despesa')
          : (form.type === 'receita' ? 'Nova Receita' : 'Nova Despesa')}
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={closeModal}>Cancelar</button>
            <button type="button" className={btn.primary}
              onClick={handleSave} disabled={saving || !form.total_amount}>
              {saving ? 'Salvando...' : (editingId ? 'Salvar alterações' : 'Salvar')}
            </button>
          </>
        }
      >
        {(() => {
          const appt = editingId ? records.find(r => r.id === editingId)?.appointments : null
          if (!appt) return null
          return (
            <div className={styles.appointmentLink}>
              <Icon name="calendar" size={13} />
              Vinculado ao agendamento de {formatDate(appt.scheduled_at, true)}
              {appt.procedure_name ? ` — ${appt.procedure_name}` : ''}
            </div>
          )
        })()}
        <div className={f.field}>
          <label>Valor (R$) *</label>
          <MoneyInput value={form.total_amount}
            onChange={v => setForm(p => ({ ...p, total_amount: v }))} />
        </div>
        <div className={f.field}>
          <label>Data</label>
          <DatePicker ariaLabel="Data" value={form.record_date} max={todayStr()}
            onChange={v => setForm(p => ({ ...p, record_date: v }))} />
        </div>
        <div className={f.field}>
          <label>Categoria</label>
          <SelectMenu variant="field" ariaLabel="Categoria" value={form.category}
            onChange={v => setForm(p => ({ ...p, category: v }))}
            options={categorias.map(c => ({ value: c, label: c }))} />
        </div>
        {form.type === 'receita' && (
          <div className={f.field}>
            <label>Paciente</label>
            <SelectMenu
              variant="field"
              ariaLabel="Paciente"
              value={form.patient_id}
              onChange={v => {
                const selected = patients.find(pt => pt.id === v)
                setForm(p => ({
                  ...p,
                  patient_id: v,
                  // Pré-preenche com o convênio salvo no cadastro do
                  // paciente, só se o campo ainda estiver vazio.
                  convenio: !p.convenio && selected?.convenio ? selected.convenio : p.convenio,
                }))
              }}
              options={[{ value: '', label: 'Sem paciente' }, ...patients.map(p => ({ value: p.id, label: p.name }))]}
            />
          </div>
        )}
        {form.type === 'receita' && (
          <div className={f.field}>
            <label>Procedimento</label>
            <SelectMenu
              variant="field"
              ariaLabel="Procedimento"
              value={form.procedure_id}
              onChange={v => {
                const proc = activeProcedures.find(pr => pr.id === v)
                setForm(p => ({
                  ...p,
                  procedure_id: v,
                  // Preenche o valor com o preço cadastrado do procedimento
                  // — só se o campo Valor ainda não tiver sido digitado.
                  total_amount: proc && proc.price > 0 && !p.total_amount ? String(proc.price) : p.total_amount,
                }))
              }}
              options={[{ value: '', label: 'Sem procedimento vinculado' }, ...activeProcedures.map(pr => ({ value: pr.id, label: pr.name }))]}
            />
            <p className={f.hint}>Vincular um procedimento é o que permite calcular a comissão de cada pessoa sobre esse valor.</p>
          </div>
        )}
        <div className={f.field}>
          <label>Método de Pagamento</label>
          <SelectMenu
            variant="field"
            ariaLabel="Método de pagamento"
            value={form.payment_method}
            onChange={method => {
              const selectedPatient = patients.find(pt => pt.id === form.patient_id)
              setForm(p => ({
                ...p,
                payment_method: method,
                convenio: method === 'convenio' && !p.convenio && selectedPatient?.convenio
                  ? selectedPatient.convenio
                  : p.convenio,
              }))
            }}
            options={[
              { value: 'pix', label: 'PIX' },
              { value: 'dinheiro', label: 'Dinheiro' },
              { value: 'cartao_credito', label: 'Cartão de Crédito' },
              { value: 'cartao_debito', label: 'Cartão de Débito' },
              { value: 'convenio', label: 'Convênio' },
              { value: 'outro', label: 'Outro' },
            ]}
          />
        </div>
        {form.payment_method === 'convenio' && (
          <div className={f.field} style={{ position: 'relative' }}>
            <label>Qual convênio?</label>
            <input
              value={form.convenio}
              onChange={e => { setForm(p => ({ ...p, convenio: e.target.value })); setShowConvenioSuggestions(true) }}
              onFocus={() => setShowConvenioSuggestions(true)}
              onBlur={() => setTimeout(() => setShowConvenioSuggestions(false), 150)}
              placeholder="Ex: Unimed"
              autoComplete="off"
            />
            {showConvenioSuggestions && filteredConvenioSuggestions.length > 0 && (
              <div className={styles.patientSuggestions}>
                {filteredConvenioSuggestions.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={styles.patientSuggestion}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setForm(p => ({ ...p, convenio: c })); setShowConvenioSuggestions(false) }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className={f.field}>
          <label>Descrição</label>
          <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Detalhe o lançamento..." />
        </div>
        {!editingId && form.type === 'receita' && form.patient_id && (
          <label className={styles.checkboxField}>
            <input type="checkbox" checked={grantCredit} onChange={e => setGrantCredit(e.target.checked)} />
            Gerar saldo de pacote para o paciente
          </label>
        )}
      </Modal>
    </div>
  )
}

export default function FinanceiroPage() {
  return (
    <PermissionGuard module="financeiro">
      <Suspense fallback={<div />}>
        <FinanceiroContent />
      </Suspense>
    </PermissionGuard>
  )
}
