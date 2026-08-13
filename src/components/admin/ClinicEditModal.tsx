'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Clinic } from '@/types'
import { computeClinicStatus } from '@/lib/clinicStatus'
import { PLAN_CATALOG, professionalLimitFor, type SellablePlan } from '@/lib/planCatalog'
import { Portal } from '@/components/ui/Portal'
import { StatusBadge } from './StatusBadge'
import styles from './admin.module.css'
import { Icon } from '@/components/ui/Icon'

function planHint(value: SellablePlan): string {
  const entry = PLAN_CATALOG[value]
  const limit = entry.professionalLimit
  return `${entry.price} — ${limit === null ? 'profissionais ilimitados' : `até ${limit} profissional${limit === 1 ? '' : 'is'}`}`
}

const SELLABLE_PLAN_OPTIONS = (Object.keys(PLAN_CATALOG) as SellablePlan[]).map(value => ({
  value, label: PLAN_CATALOG[value].label, hint: planHint(value),
}))
// 'avancado' foi aposentado — não aparece pra clínica nova, mas segue
// selecionável aqui se a clínica editada ainda estiver nesse plano (não
// deve mais acontecer em produção após a migration, mas sem essa opção o
// superadmin ficaria sem conseguir nem visualizar o valor atual dela).
const LEGACY_PLAN_OPTION = { value: 'avancado', label: 'Avançado (legado)', hint: 'R$119,90/mês — até 3 usuários (plano aposentado, só existe em clínicas antigas)' }

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function buildWhatsAppUrl(phone: string, clinicName: string, dueDay: number | null): string {
  const clean = phone.replace(/\D/g, '')
  const number = clean.startsWith('55') ? clean : `55${clean}`
  const dia = dueDay ? `dia ${dueDay}` : 'este mês'
  const msg = encodeURIComponent(
    `Olá! Passando para lembrar que a mensalidade do MyClinica referente ao ${dia} está em aberto. Qualquer dúvida estou à disposição! 😊`
  )
  return `https://wa.me/${number}?text=${msg}`
}

function buildPaymentLinkWhatsAppUrl(phone: string, link: string): string {
  const clean = phone.replace(/\D/g, '')
  const number = clean.startsWith('55') ? clean : `55${clean}`
  const msg = encodeURIComponent(`Olá! Segue o link para pagamento da sua mensalidade do MyClinica: ${link}`)
  return `https://wa.me/${number}?text=${msg}`
}

interface Props {
  clinic: Clinic
  onClose: () => void
  onSaved: () => void
}

export function ClinicEditModal({ clinic, onClose, onSaved }: Props) {
  const PLANS = clinic.plan === 'avancado' ? [...SELLABLE_PLAN_OPTIONS, LEGACY_PLAN_OPTION] : SELLABLE_PLAN_OPTIONS
  const [plan, setPlan] = useState(clinic.plan ?? 'basico')
  const [maxPatients, setMaxPatients] = useState(clinic.max_patients ?? 200)
  const [maxUsers, setMaxUsers] = useState<number | ''>(clinic.max_users ?? '')
  const [trialMode, setTrialMode] = useState<'trial' | 'permanente'>(
    clinic.trial_ends_at ? 'trial' : 'permanente'
  )
  const [trialDate, setTrialDate] = useState(toDateInputValue(clinic.trial_ends_at))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Cobrança
  const [billingPhone, setBillingPhone] = useState(clinic.billing_phone ?? clinic.phone ?? '')
  const [billingDueDay, setBillingDueDay] = useState<string>(
    clinic.billing_due_day ? String(clinic.billing_due_day) : ''
  )
  const [billingPaid, setBillingPaid] = useState(clinic.billing_paid ?? false)

  // Link de cobrança — gerado pela mesma rota que o autoatendimento usa, então
  // qualquer pagamento feito por ele já chega marcado como "pago" sozinho via
  // webhook (ver src/app/api/asaas/webhook/route.ts). Evita o caminho antigo
  // de criar o link direto no painel da Asaas, que não tem como a Asaas
  // avisar de volta qual clínica pagou — daí a caixinha "Mensalidade paga"
  // nunca atualizava sozinha pra esses clientes.
  const [generatingLink, setGeneratingLink] = useState(false)
  const [generatedLink,  setGeneratedLink]  = useState('')
  const [linkError,      setLinkError]      = useState('')
  const [linkCopied,     setLinkCopied]     = useState(false)

  async function handleGenerateLink() {
    setGeneratingLink(true)
    setLinkError('')
    setLinkCopied(false)
    try {
      const res = await fetch('/api/asaas/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: clinic.id, clinicName: clinic.name }),
      })
      const data = await res.json()
      if (data.url) setGeneratedLink(data.url)
      else setLinkError(data.error ?? 'Erro ao gerar link.')
    } catch {
      setLinkError('Erro de conexão.')
    } finally {
      setGeneratingLink(false)
    }
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(generatedLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  // Exclusão
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/admin/delete-clinic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ clinicId: clinic.id }),
    })
    setDeleting(false)
    onSaved()
    onClose()
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    // Dia de vencimento: só mexe se o valor realmente mudou. Passa pela
    // mesma rota que a própria clínica usa — ela grava o dia no banco E,
    // se já existir assinatura ativa na Asaas, empurra o novo nextDueDate
    // pra lá também (antes, o admin só editava um campo decorativo).
    const newDueDay = billingDueDay ? Number(billingDueDay) : null
    const dueDayChanged = newDueDay !== (clinic.billing_due_day ?? null)
    if (dueDayChanged && newDueDay !== null) {
      if (newDueDay < 1 || newDueDay > 28) {
        setError('Dia de vencimento deve ser entre 1 e 28.')
        setSaving(false)
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/asaas/billing-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clinicId: clinic.id, action: 'change_due_day', day: newDueDay }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error ?? 'Erro ao atualizar dia de vencimento na Asaas.')
        setSaving(false)
        return
      }
    }

    const trial_ends_at = trialMode === 'permanente'
      ? null
      : trialDate ? new Date(trialDate + 'T23:59:59').toISOString() : null
    // Marcar como paga também limpa o atraso — espelha o que o webhook do Asaas faz
    const billing_overdue_since = billingPaid ? null : clinic.billing_overdue_since
    const status = computeClinicStatus({ trial_ends_at, billing_paid: billingPaid, billing_overdue_since })
    const { error: err } = await supabase
      .from('clinics')
      .update({
        plan,
        max_patients: maxPatients,
        max_users: maxUsers === '' ? null : maxUsers,
        status,
        is_active: status !== 'suspended',
        trial_ends_at,
        billing_phone: billingPhone.trim() || null,
        billing_paid: billingPaid,
        billing_overdue_since,
      })
      .eq('id', clinic.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
    onClose()
  }

  const canCharge = billingPhone.trim().length >= 10

  const previewTrialEndsAt = trialMode === 'permanente'
    ? null
    : trialDate ? new Date(trialDate + 'T23:59:59').toISOString() : null
  const previewClinic = {
    trial_ends_at: previewTrialEndsAt,
    billing_paid: billingPaid,
    billing_overdue_since: billingPaid ? null : clinic.billing_overdue_since,
  }

  return (
    <Portal>
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Editar clínica: {clinic.name}</h2>
          <button className={styles.btnClose} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className={styles.modalBody}>

          {/* — Plano — */}
          <div className={styles.field}>
            <label>Plano</label>
            <div className={styles.planGrid}>
              {PLANS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`${styles.planBtn} ${plan === p.value ? styles.planBtnActive : ''}`}
                  onClick={() => setPlan(p.value)}
                  title={p.hint}
                >
                  <span>{p.label}</span>
                  <span className={styles.planHint}>{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* — Limite de pacientes — */}
          <div className={styles.field}>
            <label>Limite de pacientes</label>
            <input
              type="number"
              min={10}
              step={50}
              value={maxPatients}
              onChange={(e) => setMaxPatients(Number(e.target.value))}
              className={styles.fieldInput}
            />
          </div>

          {/* — Limite de profissionais — */}
          <div className={styles.field}>
            <label>Limite de profissionais</label>
            <input
              type="number"
              min={1}
              step={1}
              placeholder={`Padrão do plano (${professionalLimitFor(plan, null) ?? 'ilimitado'})`}
              value={maxUsers}
              onChange={(e) => setMaxUsers(e.target.value === '' ? '' : Number(e.target.value))}
              className={styles.fieldInput}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Vazio = usa o padrão do plano. Preencha para dar uma exceção a essa clínica sem trocar o plano. Conta profissionais cadastrados (com ou sem login) — recepção/auxiliar não entram.
            </p>
          </div>

          {/* — Trial — */}
          <div className={styles.field}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <label>Período de teste</label>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Status resultante: <StatusBadge clinic={previewClinic} />
              </span>
            </div>
            <div className={styles.statusBtnGroup}>
              <button
                type="button"
                className={`${styles.statusChoiceBtn} ${trialMode === 'trial' ? styles.statusChoiceBtnActive : ''}`}
                onClick={() => setTrialMode('trial')}
              >
                ⏳ Trial com data limite
              </button>
              <button
                type="button"
                className={`${styles.statusChoiceBtn} ${trialMode === 'permanente' ? styles.statusChoiceBtnActive : ''}`}
                onClick={() => setTrialMode('permanente')}
              >
                Acesso permanente
              </button>
            </div>
            {trialMode === 'trial' && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Data de expiração do trial</span>
                <input
                  type="date"
                  className={styles.fieldInput}
                  value={trialDate}
                  onChange={(e) => setTrialDate(e.target.value)}
                />
              </div>
            )}
            {trialMode === 'permanente' && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                A clínica não será bloqueada por expiração de trial.
              </p>
            )}
          </div>

          {/* — Cobrança — */}
          <div className={styles.billingSection}>
            <p className={styles.billingSectionTitle}>Cobrança de mensalidade</p>

            <div className={styles.billingRow}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label>WhatsApp do responsável</label>
                <input
                  type="tel"
                  className={styles.fieldInput}
                  placeholder="11 99999-9999"
                  value={billingPhone}
                  onChange={(e) => setBillingPhone(e.target.value)}
                />
              </div>
              <div className={styles.field} style={{ width: '110px' }}>
                <label>Dia de vencimento</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  className={styles.fieldInput}
                  placeholder="Ex: 10"
                  value={billingDueDay}
                  onChange={(e) => setBillingDueDay(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.billingPaidRow}>
              <label className={styles.billingPaidLabel}>
                <input
                  type="checkbox"
                  checked={billingPaid}
                  onChange={(e) => setBillingPaid(e.target.checked)}
                  className={styles.billingPaidCheck}
                />
                <span>Mensalidade paga</span>
                <span className={billingPaid ? styles.paidBadge : styles.unpaidBadge}>
                  {billingPaid ? <><Icon name="check" size={11} /> Pago</> : <><Icon name="alert" size={11} /> Pendente</>}
                </span>
              </label>

              {canCharge && (
                <a
                  href={buildWhatsAppUrl(billingPhone, clinic.name, billingDueDay ? Number(billingDueDay) : null)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.btnWhatsApp}
                >
                  <Icon name="phone" size={13} /> Cobrar via WhatsApp
                </a>
              )}
            </div>

            {/* — Link de cobrança — */}
            <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
              {!generatedLink ? (
                <button
                  type="button"
                  onClick={handleGenerateLink}
                  disabled={generatingLink}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', background: 'none', border: '1px solid var(--teal, #0D9488)', color: 'var(--teal, #0D9488)', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: generatingLink ? 'not-allowed' : 'pointer', opacity: generatingLink ? 0.6 : 1 }}
                >
                  {generatingLink ? 'Gerando...' : 'Gerar link de cobrança'}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary, #94a3b8)', margin: 0 }}>
                    Pagamentos feitos por este link marcam a mensalidade como paga automaticamente.
                  </p>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <code style={{ flex: 1, minWidth: '180px', padding: '0.4rem 0.6rem', background: 'var(--bg-tertiary, #f8fafc)', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '6px', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {generatedLink}
                    </code>
                    <button type="button" onClick={handleCopyLink} className={styles.btnCancel} style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem' }}>
                      {linkCopied ? 'Copiado!' : 'Copiar'}
                    </button>
                    {canCharge && (
                      <a
                        href={buildPaymentLinkWhatsAppUrl(billingPhone, generatedLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.btnWhatsApp}
                      >
                        <Icon name="phone" size={13} /> Enviar no WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              )}
              {linkError && <p className={styles.fieldError} style={{ marginTop: '0.4rem' }}>{linkError}</p>}
            </div>
          </div>

          {error && <p className={styles.fieldError}>{error}</p>}
        </div>
        <div className={styles.modalFooter}>
          <button
            style={{ padding: '0.55rem 1rem', background: 'none', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', marginRight: 'auto' }}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Excluir clínica
          </button>
          <button className={styles.btnCancel} onClick={onClose}>Cancelar</button>
          <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>

    {showDeleteConfirm && (
      <div className={styles.overlay} onClick={() => setShowDeleteConfirm(false)} style={{ zIndex: 1100 }}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
          <div className={styles.modalHeader}>
            <h2>Excluir clínica</h2>
            <button className={styles.btnClose} onClick={() => setShowDeleteConfirm(false)}><Icon name="close" size={18} /></button>
          </div>
          <div className={styles.modalBody}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              Tem certeza que deseja excluir permanentemente a clínica <strong>{clinic.name}</strong>?
            </p>
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.75rem', marginTop: '0.5rem' }}>
              <Icon name="alert" size={13} /> Esta ação é irreversível. Todos os dados da clínica e o login do responsável serão apagados.
            </p>
          </div>
          <div className={styles.modalFooter}>
            <button className={styles.btnCancel} onClick={() => setShowDeleteConfirm(false)}>Cancelar</button>
            <button
              style={{ padding: '0.55rem 1.25rem', background: '#DC2626', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Excluindo...' : 'Sim, excluir'}
            </button>
          </div>
        </div>
      </div>
    )}
    </Portal>
  )
}
