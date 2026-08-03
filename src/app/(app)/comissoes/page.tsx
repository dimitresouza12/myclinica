'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useScrollLock } from '@/hooks/useScrollLock'
import { useProcedures, useCommissionsData } from '@/hooks/useClinicData'
import { formatCurrency, formatMonthLabel } from '@/lib/utils'
import type { CommissionRecipient, CommissionRule } from '@/types'
import styles from './comissoes.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { Portal } from '@/components/ui/Portal'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'

type EarningsPeriod = 'diario' | 'semanal' | 'mensal'

interface RuleDraft { procedure_id: string; percent: string }
interface RecipientForm {
  name: string
  role_label: string
  is_active: boolean
  generalPercent: string
  specificRules: RuleDraft[]
}
const BLANK: RecipientForm = { name: '', role_label: '', is_active: true, generalPercent: '', specificRules: [] }

function ComissoesContent() {
  const { clinic } = useAuthStore()
  const { data: procedures = [] } = useProcedures(clinic?.id)
  const activeProcedures = procedures.filter(p => p.is_active)

  const [recipients, setRecipients] = useState<CommissionRecipient[]>([])
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RecipientForm>(BLANK)
  const [saving, setSaving] = useState(false)
  const [newRuleProc, setNewRuleProc] = useState('')
  const [newRulePercent, setNewRulePercent] = useState('')

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

  useScrollLock(showModal)

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
    setEditingId(null)
    setForm(BLANK)
    setNewRuleProc('')
    setNewRulePercent('')
    setShowModal(true)
  }

  function openEdit(recipient: CommissionRecipient) {
    const mine = rulesFor(recipient.id)
    const general = mine.find(r => r.procedure_id === null)
    const specific = mine.filter(r => r.procedure_id !== null)
    setEditingId(recipient.id)
    setForm({
      name: recipient.name,
      role_label: recipient.role_label ?? '',
      is_active: recipient.is_active,
      generalPercent: general ? String(general.percent) : '',
      specificRules: specific.map(r => ({ procedure_id: r.procedure_id as string, percent: String(r.percent) })),
    })
    setNewRuleProc('')
    setNewRulePercent('')
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
      specificRules: [...p.specificRules.filter(r => r.procedure_id !== newRuleProc), { procedure_id: newRuleProc, percent: newRulePercent }],
    }))
    setNewRuleProc('')
    setNewRulePercent('')
  }

  function removeSpecificRule(procedureId: string) {
    setForm(p => ({ ...p, specificRules: p.specificRules.filter(r => r.procedure_id !== procedureId) }))
  }

  async function handleSave() {
    if (!clinic || !form.name.trim()) return
    setSaving(true)

    let recipientId = editingId
    if (editingId) {
      await supabase.from('commission_recipients').update({
        name: form.name.trim(),
        role_label: form.role_label.trim() || null,
        is_active: form.is_active,
      }).eq('id', editingId)
    } else {
      const { data } = await supabase.from('commission_recipients').insert([{
        clinic_id: clinic.id,
        name: form.name.trim(),
        role_label: form.role_label.trim() || null,
        is_active: form.is_active,
      }]).select('id').single()
      recipientId = data?.id ?? null
    }

    if (recipientId) {
      // Regras desejadas: geral (procedure_id null, se preenchida) + específicas
      const desired: { procedure_id: string | null; percent: number }[] = []
      const generalPct = parseFloat(form.generalPercent)
      if (generalPct > 0) desired.push({ procedure_id: null, percent: generalPct })
      for (const r of form.specificRules) {
        const pct = parseFloat(r.percent)
        if (pct > 0) desired.push({ procedure_id: r.procedure_id, percent: pct })
      }

      const existing = editingId ? rulesFor(editingId) : []
      const desiredKeys = new Set(desired.map(d => d.procedure_id ?? 'null'))

      // Remove regras que não estão mais na lista desejada
      const toRemove = existing.filter(e => !desiredKeys.has(e.procedure_id ?? 'null'))
      if (toRemove.length > 0) {
        await supabase.from('commission_rules').delete().in('id', toRemove.map(r => r.id))
      }

      // Upsert (cria ou atualiza) cada regra desejada
      if (desired.length > 0) {
        await supabase.from('commission_rules').upsert(
          desired.map(d => ({
            clinic_id: clinic.id,
            recipient_id: recipientId,
            procedure_id: d.procedure_id,
            percent: d.percent,
            is_active: true,
          })),
          { onConflict: 'recipient_id,procedure_id' }
        )
      }
    }

    setSaving(false)
    closeModal()
    loadData()
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Comissões</h1>
          <p className={styles.sub}>{recipients.length} beneficiários · calculado automaticamente a cada procedimento concluído</p>
        </div>
        <button className={styles.btnPrimary} onClick={openNew}>+ Novo Beneficiário</button>
      </div>

      <div className={styles.warnBanner}>
        <Icon name="info" size={16} />
        <span>A % é aplicada sobre o valor de cada procedimento no momento em que a receita é lançada. Mudar a % aqui não altera comissões já calculadas — só vale para novos lançamentos.</span>
      </div>

      <div className={styles.earningsCard}>
        <div className={styles.earningsHeader}>
          <h2 className={styles.sectionTitleLg}>Recebido por beneficiário</h2>
          {earningsByRecipient.length > 0 && (
            <span className={styles.recipientRulesCount}>Total {earningsPeriodLabel}: {formatCurrency(earningsTotal)}</span>
          )}
        </div>
        <div className={styles.earningsControls}>
          <div className={styles.periodTabs}>
            {(['diario', 'semanal', 'mensal'] as const).map(p => (
              <button key={p} className={`${styles.periodTab} ${earningsPeriod === p ? styles.periodTabActive : ''}`} onClick={() => setEarningsPeriod(p)}>
                {p === 'diario' ? 'Diário' : p === 'semanal' ? 'Semanal' : 'Mensal'}
              </button>
            ))}
          </div>
          {earningsPeriod === 'mensal' && (
            <input
              type="month"
              value={earningsMonth}
              onChange={e => setEarningsMonth(e.target.value)}
              className={styles.monthInput}
            />
          )}
        </div>
        {loadingEarnings ? (
          <p className={styles.loading}>Carregando...</p>
        ) : earningsByRecipient.length === 0 ? (
          <p className={styles.emptySmall}>Nenhuma comissão {earningsPeriodLabel === 'hoje' ? 'hoje' : `em ${earningsPeriodLabel}`}.</p>
        ) : (
          <div className={styles.earningsList}>
            {earningsByRecipient.map(e => (
              <div key={e.id} className={styles.earningsRow}>
                <span className={styles.earningsName}>{e.name}</span>
                <span className={styles.earningsCount}>{e.count} lançamento{e.count > 1 ? 's' : ''}</span>
                <span className={styles.earningsAmount}>{formatCurrency(e.total)}</span>
              </div>
            ))}
            <div className={styles.earningsTotalRow}>
              <span>Total {earningsPeriodLabel}</span>
              <span>{formatCurrency(earningsTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : recipients.length === 0 ? (
        <div className={styles.empty}>Nenhum beneficiário cadastrado. Clique em &quot;+ Novo Beneficiário&quot; para começar.</div>
      ) : (
        <div className={styles.cardsGrid}>
          {recipients.map(r => {
            const mine = rulesFor(r.id)
            const general = mine.find(x => x.procedure_id === null)
            const specificCount = mine.filter(x => x.procedure_id !== null).length
            return (
              <div key={r.id} className={styles.recipientCard}>
                <div className={styles.recipientTop}>
                  <div>
                    <div className={styles.recipientName}>{r.name}</div>
                    {r.role_label && <div className={styles.recipientLabel}>{r.role_label}</div>}
                  </div>
                  {!r.is_active && <span className={styles.tagInactive}>Inativo</span>}
                </div>
                <div className={styles.recipientPercent}>
                  <span className={styles.recipientPercentValue}>{general ? `${general.percent}%` : '—'}</span>
                  <span className={styles.recipientPercentLabel}>{general ? 'padrão em cada procedimento' : 'sem % padrão definida'}</span>
                </div>
                {specificCount > 0 && (
                  <div className={styles.recipientRulesCount}>+ {specificCount} regra{specificCount > 1 ? 's' : ''} específica{specificCount > 1 ? 's' : ''} por procedimento</div>
                )}
                <div className={styles.recipientActions}>
                  <button className={styles.btnEdit} onClick={() => openEdit(r)}>Editar</button>
                  <button className={styles.btnDelete} onClick={() => handleDelete(r)}><Icon name="trash" size={14} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <Portal>
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingId ? 'Editar Beneficiário' : 'Novo Beneficiário'}</h2>
              <button className={styles.btnClose} onClick={closeModal}><Icon name="close" size={18} /></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.row2}>
                <div className={styles.field}>
                  <label>Nome *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Dra. Camila"
                    autoFocus
                  />
                </div>
                <div className={styles.field}>
                  <label>Função</label>
                  <input
                    value={form.role_label}
                    onChange={(e) => setForm(p => ({ ...p, role_label: e.target.value }))}
                    placeholder="Ex: Dentista, Dona, Recepção..."
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label>% padrão (aplica a qualquer procedimento sem regra específica)</label>
                <input
                  type="number" min="0" max="100" step="0.5"
                  value={form.generalPercent}
                  onChange={(e) => setForm(p => ({ ...p, generalPercent: e.target.value }))}
                  placeholder="Ex: 40"
                />
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
                        <span className={styles.rulePercent}>{r.percent}%</span>
                        <button className={styles.ruleRemove} onClick={() => removeSpecificRule(r.procedure_id)} title="Remover regra">
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className={styles.addRuleRow}>
                <div className={styles.field}>
                  <label>Procedimento</label>
                  <select value={newRuleProc} onChange={(e) => setNewRuleProc(e.target.value)}>
                    <option value="">Selecione...</option>
                    {availableForNewRule.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className={styles.field} style={{ maxWidth: '110px' }}>
                  <label>%</label>
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={newRulePercent}
                    onChange={(e) => setNewRulePercent(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <button className={styles.btnAddRule} onClick={addSpecificRule} disabled={!newRuleProc || !newRulePercent}>
                  + Adicionar
                </button>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={closeModal}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  )
}

export default function ComissoesPage() {
  return <PermissionGuard module="comissoes"><ComissoesContent /></PermissionGuard>
}
