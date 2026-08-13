'use client'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import styles from './PaymentLateBanner.module.css'
import { Icon } from '@/components/ui/Icon'
import { PLAN_CATALOG, type SellablePlan } from '@/lib/planCatalog'

const WHATSAPP = 'https://wa.me/5588920020570?text=Olá!%20Quero%20mais%20tempo%20para%20testar%20o%20MyClinica.'

// Completo+ fica de fora do seletor de autoatendimento — é sob consulta
// (mesmo padrão do cadastro em login/page.tsx).
const PLANS = (['essencial', 'completo', 'ilimitado'] as const).map(value => ({
  value,
  label: PLAN_CATALOG[value].label,
  price: PLAN_CATALOG[value].price,
  desc: PLAN_CATALOG[value].description,
}))

type PlanValue = SellablePlan

export function PaymentLateBanner() {
  const { clinic, user } = useAuthStore()
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [portalError,   setPortalError]   = useState('')
  const [dismissedDue, setDismissedDue]   = useState(false)
  const [selectedPlan, setSelectedPlan]   = useState<PlanValue | null>(null)

  if (!clinic || user?.isSuperAdmin) return null

  const now          = Date.now()
  const trialExpired = !!clinic.trialEndsAt && now > new Date(clinic.trialEndsAt).getTime()
  const neverPaid    = !clinic.billingPaid && !clinic.billingOverdueSince
  const isOverdue    = !!clinic.billingOverdueSince
  const daysOverdue  = isOverdue
    ? Math.floor((now - new Date(clinic.billingOverdueSince!).getTime()) / 86_400_000)
    : 0
  const daysUntilDue = clinic.nextBillingDate
    ? Math.ceil((new Date(clinic.nextBillingDate).getTime() - now) / 86_400_000)
    : null
  const dueTomorrow  = daysUntilDue !== null && daysUntilDue <= 1 && clinic.billingPaid && !isOverdue

  async function handlePortal(planOverride?: string) {
    if (!clinic) return
    setLoadingPortal(true)
    setPortalError('')
    try {
      const res  = await fetch('/api/asaas/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: clinic.id, clinicName: clinic.name, plan: planOverride }),
      })
      const data = await res.json()
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      } else {
        setPortalError(data.error ?? 'Não foi possível gerar o link de pagamento.')
      }
    } catch {
      setPortalError('Erro de conexão. Tente novamente.')
    } finally {
      setLoadingPortal(false)
    }
  }

  // ── Trial encerrado — modal bloqueante ───────────────────────────────
  if (trialExpired && neverPaid) {
    const activePlan = selectedPlan ?? (PLANS.find(p => p.value === clinic.plan)?.value ?? 'essencial')
    const planInfo   = PLANS.find(p => p.value === activePlan) ?? PLANS[0]

    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.modalIcon}>⏰</div>
          <h2 className={styles.modalTitle}>Seu período de teste encerrou</h2>
          <p className={styles.modalDesc}>
            Seus dados estão salvos. Escolha um plano e continue usando o MyClinica sem perder nada.
          </p>

          <div className={styles.planSelector}>
            {PLANS.map(p => (
              <button
                key={p.value}
                className={`${styles.planOption} ${activePlan === p.value ? styles.planOptionActive : ''}`}
                onClick={() => setSelectedPlan(p.value)}
              >
                <span className={styles.planOptionLabel}>{p.label}</span>
                <span className={styles.planOptionPrice}>{p.price}</span>
                <span className={styles.planOptionDesc}>{p.desc}</span>
              </button>
            ))}
          </div>

          {portalError && <p className={styles.errMsg}>{portalError}</p>}

          <div className={styles.modalActions}>
            <button
              className={styles.btnPrimary}
              onClick={() => void handlePortal(activePlan)}
              disabled={loadingPortal}
            >
              {loadingPortal ? 'Aguarde...' : `Assinar plano ${planInfo.label} — ${planInfo.price}`}
            </button>
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btnSecondary}
            >
              Não testei o suficiente — falar com suporte
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── Pagamento em atraso (clientes permanentes) — banner topo ─────────
  if (isOverdue) {
    return (
      <div className={styles.overdueBanner}>
        <span className={styles.overdueIcon}><Icon name="alert" size={13} /></span>
        <span className={styles.overdueMsg}>
          {daysOverdue > 1 ? `Pagamento em atraso há ${daysOverdue} dias.` : 'Pagamento em atraso.'}
        </span>
        <button className={styles.overdueBtn} onClick={() => void handlePortal()} disabled={loadingPortal}>
          {loadingPortal ? 'Aguarde...' : 'Pagar agora'}
        </button>
      </div>
    )
  }

  // ── Vence amanhã/hoje (clientes permanentes) — notificação topo ──────
  if (dueTomorrow && !dismissedDue) {
    const label = daysUntilDue === 0 ? 'hoje' : 'amanhã'
    return (
      <div className={styles.dueBanner}>
        <span className={styles.dueIcon}><Icon name="bell" size={13} /></span>
        <span className={styles.dueMsg}>
          Pagamento vence <strong>{label}</strong>.
        </span>
        <button className={styles.dueBtn} onClick={() => void handlePortal()} disabled={loadingPortal}>
          {loadingPortal ? 'Aguarde...' : 'Pagar agora'}
        </button>
        <button className={styles.dueDismiss} onClick={() => setDismissedDue(true)} aria-label="Fechar"><Icon name="close" size={12} /></button>
      </div>
    )
  }

  return null
}
