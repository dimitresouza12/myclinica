'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { Modal } from '@/components/ui/Modal'
import f from '@/components/ui/modalForm.module.css'
import { useProcedures, useProfessionals, useCommissionsData } from '@/hooks/useClinicData'
import { formatCurrency, formatMonthLabel, formatPercent } from '@/lib/utils'
import { hojeBrasil } from '@/lib/brasilDate'
import { commissionErrorMessage } from '@/lib/commissionRpc'
import { showToast } from '@/components/ui/Toast'
import { useQueryClient } from '@tanstack/react-query'
import type { CommissionRecipient, CommissionRule, CommissionRecalcResult, CommissionRuleChange } from '@/types'
import styles from './comissoes.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'
import { MonthPicker } from '@/components/ui/MonthPicker'
import { PercentInput } from '@/components/ui/NumericInput'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { PillTabs } from '@/components/ui/PillTabs'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusDot } from '@/components/ui/StatusDot'
import { BarList } from '@/components/ui/BarList'
import { MoreMenu } from '@/components/ui/MoreMenu'
import { avatarTone } from '@/lib/ui/avatarTone'
import btn from '@/components/ui/button.module.css'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { DatePicker } from '@/components/ui/DatePicker'
import { Badge } from '@/components/ui/Badge'

type EarningsPeriod = 'diario' | 'semanal' | 'mensal'

interface RuleDraft { procedure_id: string; percent: string; only_when_attended: boolean }
interface RecipientForm {
  name: string
  role_label: string
  professional_id: string
  is_active: boolean
  generalPercent: string
  generalOnlyAttended: boolean
  specificRules: RuleDraft[]
}
const BLANK: RecipientForm = { name: '', role_label: '', professional_id: '', is_active: true, generalPercent: '', generalOnlyAttended: false, specificRules: [] }

// Mudança numa regra (% alterada, "só quem atendeu" alterado, regra criada ou removida),
// oferecida para recálculo retroativo
interface RuleChange {
  label: string
  oldPercent: number | null
  newPercent: number | null
  oldAttended: boolean | null
  newAttended: boolean | null
}
interface ApplyStep { recipientId: string; recipientName: string; changes: RuleChange[] }

function describeRuleChange(c: RuleChange): string {
  if (c.oldPercent === null) return `regra nova com ${formatPercent(c.newPercent)}`
  if (c.newPercent === null) return `regra removida (era ${formatPercent(c.oldPercent)})`
  const parts: string[] = []
  if (c.oldPercent !== c.newPercent) parts.push(`${formatPercent(c.oldPercent)} para ${formatPercent(c.newPercent)}`)
  if (c.oldAttended !== c.newAttended) parts.push(`só quem atendeu ${c.newAttended ? 'ativado' : 'desativado'}`)
  return parts.join(', ')
}
type ApplyMode = 'forward' | 'recalc'

const ATTENDED_HELP = 'A comissão só é gerada quando o atendimento foi feito por este beneficiário. Exige que o beneficiário esteja ligado a um profissional.'
const ATTENDED_NEEDS_PRO = 'Escolha o profissional da agenda acima para usar esta opção.'

// 'YYYY-MM-DD' -> 'DD/MM/AAAA' sem passar por Date (evita voltar um dia por fuso)
function fmtDay(d: string | null | undefined) {
  if (!d) return '-'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}
function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
// 'DD/MM' no fuso do Brasil a partir de um timestamp
function fmtDayMonth(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}
// Textos do campo note do histórico; qualquer outro valor não é exibido
const HISTORY_NOTES: Record<string, string> = {
  adjust_percent: 'Ajuste por porcentagem',
  adjust_amount: 'Ajuste por valor',
  reset: 'Voltou ao automático',
}
function firstOfCurrentMonth() {
  return `${hojeBrasil().slice(0, 7)}-01`
}

function ComissoesContent() {
  const { clinic, user } = useAuthStore()
  const queryClient = useQueryClient()
  // "Editar" = criar, alterar e remover beneficiários e regras; sem ele a tela é só de consulta.
  // Recálculo retroativo e histórico de mudanças de regra são só do admin (as RPCs exigem).
  const { canEdit, isAdmin } = usePermissions('comissoes')
  const { data: procedures = [] } = useProcedures(clinic?.id)
  const activeProcedures = procedures.filter(p => p.is_active)
  const { data: professionals = [] } = useProfessionals(clinic?.id)

  const [recipients, setRecipients] = useState<CommissionRecipient[]>([])
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RecipientForm>(BLANK)
  const [saving, setSaving] = useState(false)
  const [newRuleProc, setNewRuleProc] = useState('')
  const [newRulePercent, setNewRulePercent] = useState('')
  const [newRuleAttended, setNewRuleAttended] = useState(false)

  // Passo "Aplicar a receitas anteriores?" (depois de salvar uma mudança de %)
  const [applyStep, setApplyStep] = useState<ApplyStep | null>(null)
  const [applyMode, setApplyMode] = useState<ApplyMode>('forward')
  const [applyFrom, setApplyFrom] = useState(firstOfCurrentMonth)
  const [applySummary, setApplySummary] = useState<CommissionRecalcResult | null>(null)
  const [applyBusy, setApplyBusy] = useState(false)
  const [applyError, setApplyError] = useState('')

  // Histórico de mudanças
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<CommissionRuleChange[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyWho, setHistoryWho] = useState<Map<string, string>>(new Map())
  const [historyRecords, setHistoryRecords] = useState<Map<string, string>>(new Map())

  // Recebido por beneficiário — busca uma janela ampla (12 meses) uma vez só
  // e filtra no cliente por dia/semana/mês, igual ao padrão já usado no
  // Financeiro. Evita reconsultar o banco a cada troca de período.
  const [earningsPeriod, setEarningsPeriod] = useState<EarningsPeriod>('mensal')
  const [earningsMonth, setEarningsMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const { data: commissionsData, isLoading: loadingEarnings } = useCommissionsData(clinic?.id, '12m')
  const allEntries = commissionsData?.entries ?? []

  const periodEntries = useMemo(() => {
    const now = new Date()
    if (earningsPeriod === 'mensal') {
      return allEntries.filter(e => e.created_at?.startsWith(earningsMonth))
    }
    if (earningsPeriod === 'semanal') {
      const startOfWeek = new Date(now)
      startOfWeek.setDate(now.getDate() - now.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      return allEntries.filter(e => new Date(e.created_at) >= startOfWeek)
    }
    // diário
    const todayStr = now.toISOString().slice(0, 10)
    return allEntries.filter(e => e.created_at?.startsWith(todayStr))
  }, [allEntries, earningsPeriod, earningsMonth])

  const earningsByRecipient = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; count: number }>()
    for (const e of periodEntries) {
      const cur = map.get(e.recipient_id) ?? { id: e.recipient_id, name: e.recipient_name, total: 0, count: 0 }
      cur.total += e.amount
      cur.count += 1
      map.set(e.recipient_id, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [periodEntries])

  const earningsTotal = earningsByRecipient.reduce((s, e) => s + e.total, 0)

  const earningsPeriodLabel =
    earningsPeriod === 'diario' ? 'hoje' :
    earningsPeriod === 'semanal' ? 'esta semana' :
    formatMonthLabel(earningsMonth)

  useEffect(() => {
    if (!clinic?.id) return
    setRecipients([])
    setRules([])
    setLoading(true)
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  async function loadData() {
    if (!clinic) return
    const [recRes, rulesRes] = await Promise.all([
      supabase.from('commission_recipients').select('*').eq('clinic_id', clinic.id).order('name'),
      supabase.from('commission_rules').select('*, procedures(id, name)').eq('clinic_id', clinic.id),
    ])
    setRecipients((recRes.data ?? []) as CommissionRecipient[])
    setRules((rulesRes.data ?? []) as CommissionRule[])
    setLoading(false)
  }

  function rulesFor(recipientId: string) {
    return rules.filter(r => r.recipient_id === recipientId)
  }

  function openNew() {
    if (!canEdit) return
    setEditingId(null)
    setForm(BLANK)
    setNewRuleProc('')
    setNewRulePercent('')
    setNewRuleAttended(false)
    setShowModal(true)
  }

  function openEdit(recipient: CommissionRecipient) {
    if (!canEdit) return
    const mine = rulesFor(recipient.id)
    const general = mine.find(r => r.procedure_id === null)
    const specific = mine.filter(r => r.procedure_id !== null)
    setEditingId(recipient.id)
    setForm({
      name: recipient.name,
      role_label: recipient.role_label ?? '',
      professional_id: recipient.professional_id ?? '',
      is_active: recipient.is_active,
      generalPercent: general ? String(general.percent) : '',
      generalOnlyAttended: !!general?.only_when_attended,
      specificRules: specific.map(r => ({ procedure_id: r.procedure_id as string, percent: String(r.percent), only_when_attended: !!r.only_when_attended })),
    })
    setNewRuleProc('')
    setNewRulePercent('')
    setNewRuleAttended(false)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setForm(BLANK)
  }

  function addSpecificRule() {
    if (!newRuleProc || !newRulePercent) return
    const pct = parseFloat(newRulePercent)
    if (!pct || pct <= 0 || pct > 100) return
    setForm(p => ({
      ...p,
      specificRules: [...p.specificRules.filter(r => r.procedure_id !== newRuleProc), { procedure_id: newRuleProc, percent: newRulePercent, only_when_attended: newRuleAttended && !!p.professional_id }],
    }))
    setNewRuleProc('')
    setNewRulePercent('')
    setNewRuleAttended(false)
  }

  function updateSpecificRule(procedureId: string, patch: Partial<Omit<RuleDraft, 'procedure_id'>>) {
    setForm(p => ({ ...p, specificRules: p.specificRules.map(r => r.procedure_id === procedureId ? { ...r, ...patch } : r) }))
  }

  function removeSpecificRule(procedureId: string) {
    setForm(p => ({ ...p, specificRules: p.specificRules.filter(r => r.procedure_id !== procedureId) }))
  }

  async function handleSave() {
    if (!clinic || !form.name.trim()) return
    setSaving(true)

    const failSave = async (error?: { code?: string; message?: string } | null) => {
      setSaving(false)
      showToast('error', error ? commissionErrorMessage(error) : 'Não foi possível salvar todas as regras. Confira e tente de novo.')
      await loadData()
    }

    let recipientId = editingId
    if (editingId) {
      const { error } = await supabase.from('commission_recipients').update({
        name: form.name.trim(),
        role_label: form.role_label.trim() || null,
        professional_id: form.professional_id || null,
        is_active: form.is_active,
      }).eq('id', editingId)
      if (error) { await failSave(error); return }
    } else {
      const { data, error } = await supabase.from('commission_recipients').insert([{
        clinic_id: clinic.id,
        name: form.name.trim(),
        role_label: form.role_label.trim() || null,
        professional_id: form.professional_id || null,
        is_active: form.is_active,
      }]).select('id').single()
      if (error || !data?.id) { await failSave(error); return }
      recipientId = data.id
    }

    let offer: ApplyStep | null = null
    let logFailed = false

    if (recipientId) {
      // Regras desejadas: geral (procedure_id null, se preenchida) + específicas
      // "Só quem atendeu" exige profissional ligado: sem ele a flag é sempre falsa
      const hasPro = !!form.professional_id
      const desired: { procedure_id: string | null; percent: number; only_when_attended: boolean }[] = []
      const generalPct = parseFloat(form.generalPercent)
      if (generalPct > 0) desired.push({ procedure_id: null, percent: generalPct, only_when_attended: hasPro && form.generalOnlyAttended })
      for (const r of form.specificRules) {
        const pct = parseFloat(r.percent)
        if (pct > 0) desired.push({ procedure_id: r.procedure_id, percent: pct, only_when_attended: hasPro && r.only_when_attended })
      }

      const existing = editingId ? rulesFor(editingId) : []
      const desiredKeys = new Set(desired.map(d => d.procedure_id ?? 'null'))

      // Remove regras que não estão mais na lista desejada
      const toRemove = existing.filter(e => !desiredKeys.has(e.procedure_id ?? 'null'))
      let removedIds = new Set<string>()
      if (toRemove.length > 0) {
        const { data, error } = await supabase.from('commission_rules').delete().in('id', toRemove.map(r => r.id)).select('id')
        if (error) {
          // Se o beneficiário acabou de ser criado, a nova tentativa edita em vez de duplicar
          if (!editingId) setEditingId(recipientId)
          await failSave(error)
          return
        }
        removedIds = new Set(((data ?? []) as { id: string }[]).map(r => r.id))
      }

      // Upsert (cria ou atualiza) cada regra desejada
      let upserted: { id: string; procedure_id: string | null }[] = []
      if (desired.length > 0) {
        const { data, error } = await supabase.from('commission_rules').upsert(
          desired.map(d => ({
            clinic_id: clinic.id,
            recipient_id: recipientId,
            procedure_id: d.procedure_id,
            percent: d.percent,
            only_when_attended: d.only_when_attended,
            is_active: true,
          })),
          { onConflict: 'recipient_id,procedure_id' }
        ).select('id, procedure_id')
        if (error) {
          if (!editingId) setEditingId(recipientId)
          await failSave(error)
          return
        }
        upserted = (data ?? []) as { id: string; procedure_id: string | null }[]
      }

      // Histórico de mudanças de regra (RPC só de admin): registra só o que foi de fato gravado.
      // Falha no log não desfaz o salvamento.
      const existingByKey = new Map(existing.map(e => [e.procedure_id ?? 'null', e]))
      const upsertedByKey = new Map(upserted.map(u => [u.procedure_id ?? 'null', u.id]))
      const procName = (id: string | null) => id === null ? 'Padrão' : (procedures.find(p => p.id === id)?.name ?? 'Procedimento')
      type LogRow = { rule_id: string | null; procedure_id: string | null; old_percent: number | null; new_percent: number | null; old_flag: boolean | null; new_flag: boolean | null }
      const logRows: LogRow[] = []
      const ruleChanges: RuleChange[] = []
      let notWritten = 0

      for (const e of toRemove) {
        if (!removedIds.has(e.id)) { notWritten += 1; continue }
        logRows.push({ rule_id: e.id, procedure_id: e.procedure_id, old_percent: Number(e.percent), new_percent: null, old_flag: !!e.only_when_attended, new_flag: null })
        ruleChanges.push({ label: procName(e.procedure_id), oldPercent: Number(e.percent), newPercent: null, oldAttended: !!e.only_when_attended, newAttended: null })
      }
      for (const d of desired) {
        const key = d.procedure_id ?? 'null'
        const prev = existingByKey.get(key)
        const writtenId = upsertedByKey.get(key)
        if (!writtenId) { notWritten += 1; continue }
        if (!prev) {
          logRows.push({ rule_id: writtenId, procedure_id: d.procedure_id, old_percent: null, new_percent: d.percent, old_flag: null, new_flag: d.only_when_attended })
          ruleChanges.push({ label: procName(d.procedure_id), oldPercent: null, newPercent: d.percent, oldAttended: null, newAttended: d.only_when_attended })
          continue
        }
        const percentDiffers = Number(prev.percent) !== d.percent
        const flagDiffers = !!prev.only_when_attended !== d.only_when_attended
        if (percentDiffers || flagDiffers) {
          logRows.push({ rule_id: prev.id, procedure_id: d.procedure_id, old_percent: Number(prev.percent), new_percent: d.percent, old_flag: !!prev.only_when_attended, new_flag: d.only_when_attended })
          ruleChanges.push({ label: procName(d.procedure_id), oldPercent: Number(prev.percent), newPercent: d.percent, oldAttended: !!prev.only_when_attended, newAttended: d.only_when_attended })
        }
      }

      if (isAdmin && logRows.length > 0) {
        const results = await Promise.all(logRows.map(row => supabase.rpc('log_commission_rule_change', {
          p_recipient_id: recipientId,
          p_rule_id: row.rule_id,
          p_procedure_id: row.procedure_id,
          p_old_percent: row.old_percent,
          p_new_percent: row.new_percent,
          p_old_only_when_attended: row.old_flag,
          p_new_only_when_attended: row.new_flag,
        })))
        logFailed = results.some(r => r.error)
      }

      // Alguma regra não chegou a ser gravada: mantém o formulário aberto e não oferece recálculo
      if (notWritten > 0) {
        if (!editingId) setEditingId(recipientId)
        await failSave()
        return
      }

      // Pergunta sobre receitas anteriores quando uma regra existente mudou (% ou "só quem atendeu"),
      // foi criada ou foi removida, e o beneficiário está ativo
      if (isAdmin && editingId && form.is_active && ruleChanges.length > 0) {
        offer = { recipientId, recipientName: form.name.trim(), changes: ruleChanges }
      }
    }

    setSaving(false)
    closeModal()
    loadData()
    if (logFailed) showToast('error', 'Regras salvas, mas não foi possível registrar a mudança no histórico.')
    if (offer) {
      setApplyMode('forward')
      setApplyFrom(firstOfCurrentMonth())
      setApplySummary(null)
      setApplyError('')
      setApplyStep(offer)
    }
  }

  function closeApplyStep() {
    if (applyBusy) return
    setApplyStep(null)
    setApplySummary(null)
    setApplyError('')
  }

  function invalidateCommissionQueries() {
    if (!clinic) return
    queryClient.invalidateQueries({ queryKey: ['commission-entries', clinic.id] })
    queryClient.invalidateQueries({ queryKey: ['comissoes-relatorio', clinic.id] })
    queryClient.invalidateQueries({ queryKey: ['financeiro', clinic.id] })
    queryClient.invalidateQueries({ queryKey: ['relatorios-raw', clinic.id] })
  }

  async function runRecalc(dryRun: boolean) {
    if (!applyStep || !applyFrom) return
    setApplyBusy(true)
    setApplyError('')
    const { data, error } = await supabase.rpc('recalc_recipient_commissions', {
      p_recipient_id: applyStep.recipientId,
      p_from: applyFrom,
      p_dry_run: dryRun,
    })
    setApplyBusy(false)
    if (error) {
      setApplyError(commissionErrorMessage(error))
      return
    }
    const result = data as CommissionRecalcResult
    if (dryRun) {
      setApplySummary(result)
      return
    }
    invalidateCommissionQueries()
    showToast('ok', result.changed === 1 ? '1 receita recalculada.' : `${result.changed} receitas recalculadas.`)
    setApplyStep(null)
    setApplySummary(null)
  }

  async function openHistory() {
    if (!clinic || !isAdmin) return
    setShowHistory(true)
    setHistoryLoading(true)
    setHistoryError('')
    setHistoryRecords(new Map())
    const { data, error } = await supabase
      .from('commission_rule_changes')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      setHistory([])
      setHistoryError(commissionErrorMessage(error))
      setHistoryLoading(false)
      return
    }
    const rows = (data ?? []) as CommissionRuleChange[]
    setHistory(rows)
    setHistoryLoading(false)
    // Receitas mexidas nos ajustes manuais: uma consulta só, melhor esforço (se não achar, a linha some)
    const recordIds = [...new Set(rows.filter(r => r.kind === 'manual_entry' && r.financial_record_id).map(r => r.financial_record_id as string))]
    if (recordIds.length > 0) {
      const { data: recs } = await supabase
        .from('financial_records')
        .select('id, created_at, total_amount, notes, patients(name)')
        .eq('clinic_id', clinic.id)
        .in('id', recordIds)
      const recMap = new Map<string, string>()
      for (const r of (recs ?? []) as unknown as { id: string; created_at: string; total_amount: number | null; notes: string | null; patients: { name: string | null } | { name: string | null }[] | null }[]) {
        const patient = Array.isArray(r.patients) ? r.patients[0]?.name : r.patients?.name
        const parts = [`Receita de ${fmtDayMonth(r.created_at)}`]
        const who = patient || r.notes?.trim()
        if (who) parts.push(who)
        if (r.total_amount !== null) parts.push(formatCurrency(r.total_amount))
        recMap.set(r.id, parts.join(', '))
      }
      setHistoryRecords(recMap)
    }
    // Nome de quem mudou: melhor esforço (quem não lê clinic_users não vê o nome, e a coluna fica de fora)
    const { data: users } = await supabase.from('clinic_users').select('user_id, display_name').eq('clinic_id', clinic.id)
    const map = new Map<string, string>()
    for (const u of (users ?? []) as { user_id: string | null; display_name: string | null }[]) {
      if (u.user_id && u.display_name) map.set(u.user_id, u.display_name)
    }
    setHistoryWho(map)
  }

  async function handleDelete(recipient: CommissionRecipient) {
    if (!(await confirmDialog({
      message: `Remover "${recipient.name}"? Se já houver comissões registradas no histórico dessa pessoa, ela será desativada em vez de removida.`,
      confirmText: 'Remover', danger: true,
    }))) return
    const { error } = await supabase.from('commission_recipients').delete().eq('id', recipient.id).eq('clinic_id', clinic!.id)
    if (error) {
      // Bloqueado por ter commission_entries no histórico (ON DELETE RESTRICT) — desativa em vez de apagar
      await supabase.from('commission_recipients').update({ is_active: false }).eq('id', recipient.id)
    }
    loadData()
  }

  const availableForNewRule = activeProcedures.filter(p => !form.specificRules.some(r => r.procedure_id === p.id))

  const hasPro = !!form.professional_id
  const activeRecipients = recipients.filter(r => r.is_active).length
  const specificRules = recipients.reduce((n, r) => n + rulesFor(r.id).filter(x => x.procedure_id !== null).length, 0)

  return (
    <div className={styles.page}>
      <PageHeader
        title="Comissões"
        subtitle={`${recipients.length} ${recipients.length === 1 ? 'beneficiário' : 'beneficiários'}, calculado automaticamente a cada procedimento concluído`}
        actions={
          <>
            {isAdmin && <button type="button" className={btn.secondary} onClick={openHistory}><Icon name="clock" size={15} /> Histórico de mudanças</button>}
            <button type="button" className={btn.primary} onClick={openNew} disabled={!canEdit} title={canEdit ? undefined : 'Seu perfil só pode visualizar'}><Icon name="plus" size={15} /> Novo beneficiário</button>
          </>
        }
      />

      <div className={styles.stats}>
        <StatCard title="Beneficiários ativos" value={activeRecipients} hint={`de ${recipients.length} cadastrados`} />
        <StatCard title={`Recebido ${earningsPeriodLabel}`} value={formatCurrency(earningsTotal)} compact hint="soma de todos os beneficiários" />
        <StatCard title="Regras por procedimento" value={specificRules} hint="além da % padrão de cada pessoa" />
      </div>

      <div className={styles.note}>
        <Icon name="info" size={16} />
        <span>A % é aplicada sobre o valor de cada procedimento no momento em que a receita é lançada. Mudar a % aqui não altera comissões já calculadas, só vale para novos lançamentos.{isAdmin ? ' Ao salvar uma mudança nas regras, você pode escolher recalcular as receitas anteriores.' : ''}</span>
      </div>

      <Card
        title="Recebido por beneficiário"
        actions={
          <>
            {earningsPeriod === 'mensal' && <MonthPicker value={earningsMonth} onChange={setEarningsMonth} />}
            <PillTabs
              label="Período dos ganhos"
              value={earningsPeriod}
              onChange={setEarningsPeriod}
              options={[
                { value: 'diario', label: 'Diário' },
                { value: 'semanal', label: 'Semanal' },
                { value: 'mensal', label: 'Mensal' },
              ]}
            />
          </>
        }
      >
        {loadingEarnings ? (
          <p className={styles.loading}>Carregando...</p>
        ) : (
          <BarList
            items={earningsByRecipient.map(e => ({ label: `${e.name}, ${e.count} lançamento${e.count > 1 ? 's' : ''}`, value: e.total }))}
            format={formatCurrency}
            total={earningsTotal}
            empty={`Nenhuma comissão ${earningsPeriodLabel === 'hoje' ? 'hoje' : `em ${earningsPeriodLabel}`}.`}
          />
        )}
      </Card>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : recipients.length === 0 ? (
        <Card><p className={styles.empty}>{canEdit ? 'Nenhum beneficiário cadastrado. Clique em "Novo beneficiário" para começar.' : 'Nenhum beneficiário cadastrado.'}</p></Card>
      ) : (
        <div className={styles.cardsGrid}>
          {recipients.map(r => {
            const mine = rulesFor(r.id)
            const general = mine.find(x => x.procedure_id === null)
            const specificCount = mine.filter(x => x.procedure_id !== null).length
            return (
              <Card key={r.id} className={styles.recipientCard}>
                <div className={styles.recipientTop}>
                  <Avatar name={r.name} size={40} className={`${styles.avatar} ${styles[`tone${avatarTone(r.name)}`]}`} />
                  <div className={styles.recipientWho}>
                    <div className={styles.recipientName}>{r.name}</div>
                    <div className={styles.recipientLabel}>{r.role_label ?? 'Sem função'}</div>
                  </div>
                  {canEdit && (
                    <MoreMenu
                      label={`Mais ações de ${r.name}`}
                      items={[
                        { label: 'Editar', icon: 'edit', onClick: () => openEdit(r) },
                        { label: 'Remover', icon: 'trash', danger: true, onClick: () => handleDelete(r) },
                      ]}
                    />
                  )}
                </div>
                <div className={styles.recipientPercent}>
                  <span className={styles.recipientPercentValue}>{general ? `${general.percent}%` : '-'}</span>
                  <span className={styles.recipientPercentLabel}>{general ? 'padrão em cada procedimento' : 'sem % padrão definida'}</span>
                  {general?.only_when_attended && <span className={styles.ruleTag}>Só quem atendeu</span>}
                </div>
                <div className={styles.recipientFoot}>
                  <StatusDot tone={r.is_active ? 'ok' : 'idle'}>{r.is_active ? 'Ativo' : 'Inativo'}</StatusDot>
                  {specificCount > 0 && (
                    <span className={styles.recipientRulesCount}>{specificCount} regra{specificCount > 1 ? 's' : ''} por procedimento</span>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingId ? 'Editar Beneficiário' : 'Novo Beneficiário'}
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={closeModal}>Cancelar</button>
            <button type="button" className={btn.primary} onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className={f.row2}>
          <div className={f.field}>
            <label>Nome *</label>
            <input
              value={form.name}
              onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Ex: Dra. Camila"
              autoFocus
            />
          </div>
          <div className={f.field}>
            <label>Função</label>
            <input
              value={form.role_label}
              onChange={(e) => setForm(p => ({ ...p, role_label: e.target.value }))}
              placeholder="Ex: Dentista, Dona, Recepção..."
            />
          </div>
        </div>

        <div className={f.field}>
          <label>Profissional da agenda (opcional)</label>
          <SelectMenu variant="field" ariaLabel="Profissional da agenda" value={form.professional_id}
            onChange={(v) => setForm(p => ({ ...p, professional_id: v }))}
            options={[{ value: '', label: 'Nenhum' }, ...professionals.map(p => ({ value: p.id, label: p.name }))]} />
        </div>

        <div className={f.field}>
          <label>% padrão (aplica a qualquer procedimento sem regra específica)</label>
          <PercentInput
            value={form.generalPercent}
            onChange={(v) => setForm(p => ({ ...p, generalPercent: v }))}
            placeholder="Ex: 40"
          />
        </div>

        <div>
          <label className={styles.check} data-disabled={hasPro ? undefined : ''}>
            <input
              type="checkbox"
              checked={hasPro && form.generalOnlyAttended}
              disabled={!hasPro}
              onChange={(e) => setForm(p => ({ ...p, generalOnlyAttended: e.target.checked }))}
            />
            <span>Só quando for quem atendeu</span>
          </label>
          <p className={styles.checkHint}>{hasPro ? ATTENDED_HELP : `${ATTENDED_HELP} ${ATTENDED_NEEDS_PRO}`}</p>
          {hasPro && form.generalOnlyAttended && (
            <p className={styles.checkHint}>Também vale para receitas sem procedimento.</p>
          )}
        </div>

        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Beneficiário ativo</span>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm(p => ({ ...p, is_active: e.target.checked }))}
            />
            <span className={styles.toggleSlider} />
          </label>
        </div>

        <hr className={styles.sectionDivider} />
        <div>
          <div className={styles.sectionTitle}>Regras específicas por procedimento</div>
          <p className={styles.sectionSub}>Opcional — sobrescreve a % padrão só para o procedimento escolhido.</p>
        </div>

        {form.specificRules.length > 0 && (
          <div className={styles.rulesList}>
            {form.specificRules.map(r => {
              const proc = procedures.find(p => p.id === r.procedure_id)
              return (
                <div key={r.procedure_id} className={styles.ruleRow}>
                  <span className={styles.ruleProcName}>{proc?.name ?? 'Procedimento removido'}</span>
                  <div className={styles.rulePercentEdit}>
                    <PercentInput
                      className={styles.ruleInput}
                      aria-label={`Porcentagem de ${proc?.name ?? 'procedimento removido'}`}
                      value={r.percent}
                      onChange={(v) => updateSpecificRule(r.procedure_id, { percent: v })}
                      placeholder="0"
                    />
                    <span>%</span>
                  </div>
                  <button type="button" className={styles.ruleRemove} onClick={() => removeSpecificRule(r.procedure_id)} title="Remover regra" aria-label="Remover regra">
                    <Icon name="close" size={14} />
                  </button>
                  <label className={`${styles.check} ${styles.ruleAttended}`} data-disabled={hasPro ? undefined : ''}>
                    <input
                      type="checkbox"
                      checked={hasPro && r.only_when_attended}
                      disabled={!hasPro}
                      onChange={(e) => updateSpecificRule(r.procedure_id, { only_when_attended: e.target.checked })}
                    />
                    <span>Só quando for quem atendeu</span>
                  </label>
                  {!(parseFloat(r.percent) > 0) && (
                    <p className={`${styles.checkHint} ${styles.ruleWarn}`}>Sem porcentagem, esta regra será removida ao salvar.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className={styles.addRuleRow}>
          <div className={f.field}>
            <label>Procedimento</label>
            <SelectMenu variant="field" ariaLabel="Procedimento" value={newRuleProc}
              onChange={setNewRuleProc}
              options={[{ value: '', label: 'Selecione...' }, ...availableForNewRule.map(p => ({ value: p.id, label: p.name }))]} />
          </div>
          <div className={f.field} style={{ maxWidth: '110px' }}>
            <label>%</label>
            <PercentInput
              value={newRulePercent}
              onChange={setNewRulePercent}
              placeholder="0"
            />
          </div>
          <button type="button" className={btn.secondary} onClick={addSpecificRule} disabled={!newRuleProc || !newRulePercent}>
            + Adicionar
          </button>
        </div>
        <div>
          <label className={styles.check} data-disabled={hasPro ? undefined : ''}>
            <input
              type="checkbox"
              checked={hasPro && newRuleAttended}
              disabled={!hasPro}
              onChange={(e) => setNewRuleAttended(e.target.checked)}
            />
            <span>Só quando for quem atendeu (nesta regra)</span>
          </label>
          {!hasPro && <p className={styles.checkHint}>{ATTENDED_NEEDS_PRO}</p>}
        </div>
      </Modal>

      <Modal
        open={!!applyStep}
        onClose={closeApplyStep}
        title="Aplicar a receitas anteriores?"
        subtitle={applyStep?.recipientName}
        footer={
          applyMode === 'forward' ? (
            <button type="button" className={btn.primary} onClick={closeApplyStep}>Concluir</button>
          ) : (
            <>
              <button type="button" className={btn.secondary} onClick={closeApplyStep} disabled={applyBusy}>Cancelar</button>
              {applySummary ? (
                <button type="button" className={btn.primary} onClick={() => runRecalc(false)} disabled={applyBusy || applySummary.changed === 0}>
                  {applyBusy ? 'Aplicando...' : 'Aplicar recálculo'}
                </button>
              ) : (
                <button type="button" className={btn.primary} onClick={() => runRecalc(true)} disabled={applyBusy || !applyFrom}>
                  {applyBusy ? 'Simulando...' : 'Simular recálculo'}
                </button>
              )}
            </>
          )
        }
      >
        <p className={f.lead}>As mudanças nas regras já valem para os próximos lançamentos. Você quer corrigir também as receitas que já foram lançadas?</p>

        {applyStep && (
          <ul className={styles.changeList}>
            {applyStep.changes.map((c, i) => (
              <li key={i} className={styles.changeRow}>
                <span className={styles.changeLabel}>{c.label}</span>
                <span className={styles.changeValue}>{describeRuleChange(c)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.choiceList} role="radiogroup" aria-label="Aplicar a receitas anteriores">
          <label className={styles.choice} data-active={applyMode === 'forward' ? '' : undefined}>
            <input type="radio" name="applyMode" checked={applyMode === 'forward'} onChange={() => { setApplyMode('forward'); setApplySummary(null); setApplyError('') }} />
            <span className={styles.choiceBody}>
              <span className={styles.choiceTitle}>Só daqui para frente</span>
              <span className={styles.choiceDesc}>Receitas já lançadas continuam como estão.</span>
            </span>
          </label>
          <label className={styles.choice} data-active={applyMode === 'recalc' ? '' : undefined}>
            <input type="radio" name="applyMode" checked={applyMode === 'recalc'} onChange={() => { setApplyMode('recalc'); setApplySummary(null); setApplyError('') }} />
            <span className={styles.choiceBody}>
              <span className={styles.choiceTitle}>Recalcular receitas anteriores</span>
              <span className={styles.choiceDesc}>Refaz a comissão das receitas a partir de uma data. Você vê o resultado antes de confirmar.</span>
            </span>
          </label>
        </div>

        {applyMode === 'recalc' && (
          <>
            <div className={f.field}>
              <label htmlFor="recalc-from">Recalcular desde</label>
              <DatePicker
                id="recalc-from"
                ariaLabel="Recalcular desde"
                value={applyFrom}
                max={hojeBrasil()}
                onChange={(v) => { setApplyFrom(v); setApplySummary(null); setApplyError('') }}
              />
            </div>

            {applyFrom && applyFrom < firstOfCurrentMonth() && (
              <div className={styles.warnBox} role="note">
                <Icon name="alert" size={16} />
                <span>Esta data é anterior ao mês atual. Valores de comissão que já foram pagos podem mudar.</span>
              </div>
            )}

            {applySummary && (
              <div className={styles.summaryBox} aria-live="polite">
                {applySummary.changed === 0 ? (
                  <p className={styles.summaryMain}>Nenhuma receita muda com as novas regras a partir de {fmtDay(applySummary.applied_from)}.</p>
                ) : (
                  <p className={styles.summaryMain}>
                    {applySummary.changed === 1 ? '1 receita muda' : `${applySummary.changed} receitas mudam`} a partir de {fmtDay(applySummary.applied_from)}: a comissão passa de <strong>{formatCurrency(applySummary.old_total)}</strong> para <strong>{formatCurrency(applySummary.new_total)}</strong>.
                  </p>
                )}
                <p className={styles.summarySub}>{applySummary.records} {applySummary.records === 1 ? 'receita analisada' : 'receitas analisadas'}.</p>
                {applySummary.skipped_manual > 0 && (
                  <p className={styles.summarySub}>
                    {applySummary.skipped_manual === 1 ? '1 receita ajustada manualmente será preservada.' : `${applySummary.skipped_manual} receitas ajustadas manualmente serão preservadas.`}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {applyError && <p className={f.noteDanger} role="alert">{applyError}</p>}
      </Modal>

      {isAdmin && <Modal
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title="Histórico de mudanças"
        subtitle="As 50 mudanças mais recentes de regras, recálculos e ajustes"
        size="lg"
        footer={<button type="button" className={btn.secondary} onClick={() => setShowHistory(false)}>Fechar</button>}
      >
        {historyLoading ? (
          <p className={styles.loading}>Carregando...</p>
        ) : historyError ? (
          <p className={f.noteDanger} role="alert">{historyError}</p>
        ) : history.length === 0 ? (
          <p className={styles.empty}>Nenhuma mudança registrada ainda.</p>
        ) : (
          <ul className={styles.historyList}>
            {history.map(h => {
              const recipientName = recipients.find(r => r.id === h.recipient_id)?.name
              const who = h.changed_by ? (h.changed_by === user?.id ? 'Você' : historyWho.get(h.changed_by)) : undefined
              const procLabel = h.procedure_id ? (procedures.find(p => p.id === h.procedure_id)?.name ?? 'Procedimento removido') : 'Padrão'
              return (
                <li key={h.id} className={styles.historyItem}>
                  <div className={styles.historyTop}>
                    <Badge tone={h.kind === 'recalc' ? 'warning' : h.kind === 'manual_entry' ? 'info' : 'neutral'} dot={false}>
                      {h.kind === 'recalc' ? 'Recálculo' : h.kind === 'manual_entry' ? 'Ajuste manual' : 'Regra'}
                    </Badge>
                    <span className={styles.historyWhen}>{fmtDateTime(h.created_at)}{who ? `, ${who}` : ''}</span>
                  </div>
                  {recipientName && <div className={styles.historyWho}>{recipientName}</div>}
                  <div className={styles.historyText}>
                    {h.kind === 'recalc' ? (
                      <>
                        Recálculo a partir de {fmtDay(h.applied_from)}
                        {h.recalculated_count !== null && <>: {h.recalculated_count === 1 ? '1 receita' : `${h.recalculated_count} receitas`}</>}
                        {h.old_total !== null && h.new_total !== null && <>, de {formatCurrency(h.old_total)} para {formatCurrency(h.new_total)}</>}
                      </>
                    ) : h.old_percent === null && h.new_percent !== null ? (
                      <>{procLabel}: regra criada com {formatPercent(h.new_percent)}</>
                    ) : h.new_percent === null && h.old_percent !== null && h.kind === 'rule' ? (
                      <>{procLabel}: regra removida (era {formatPercent(h.old_percent)})</>
                    ) : h.old_percent !== null && h.new_percent !== null && h.old_percent !== h.new_percent ? (
                      <>{h.kind === 'rule' ? `${procLabel}: ` : ''}de {formatPercent(h.old_percent)} para {formatPercent(h.new_percent)}</>
                    ) : h.kind === 'rule' ? (
                      <>{procLabel}: {formatPercent(h.new_percent)}</>
                    ) : (
                      <>{h.note === 'reset' ? 'Comissão de uma receita' : 'Comissão de uma receita ajustada'}</>
                    )}
                    {h.kind === 'manual_entry' && h.old_total !== null && h.new_total !== null && (
                      <>. Total da comissão: de {formatCurrency(h.old_total)} para {formatCurrency(h.new_total)}</>
                    )}
                    {h.kind === 'rule' && h.old_only_when_attended !== h.new_only_when_attended && h.old_only_when_attended !== null && h.new_only_when_attended !== null && (
                      <>. Só quem atendeu: {h.new_only_when_attended ? 'ativado' : 'desativado'}</>
                    )}
                  </div>
                  {h.kind === 'manual_entry' && h.financial_record_id && historyRecords.get(h.financial_record_id) && (
                    <div className={styles.historyNote}>{historyRecords.get(h.financial_record_id)}</div>
                  )}
                  {h.note && HISTORY_NOTES[h.note] && <div className={styles.historyNote}>{HISTORY_NOTES[h.note]}</div>}
                </li>
              )
            })}
          </ul>
        )}
      </Modal>}
    </div>
  )
}

export default function ComissoesPage() {
  return <PermissionGuard module="comissoes"><ComissoesContent /></PermissionGuard>
}
