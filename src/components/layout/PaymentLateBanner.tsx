'use client'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import styles from './PaymentLateBanner.module.css'

const WHATSAPP = 'https://wa.me/5588988557247?text=Olá!%20Quero%20mais%20tempo%20para%20testar%20o%20MyClinica.'

const PLANS = [
  { value: 'essencial', label: 'Essencial',  price: 'R$99/mês',      desc: 'Agenda, prontuário e financeiro básico' },
  { value: 'avancado',  label: 'Avançado',   price: 'R$119,90/mês',  desc: 'Equipe, relatórios e pacientes ilimitados' },
  { value: 'completo',  label: 'Completo',   price: 'R$129,90/mês',  desc: 'Multi-clínica e usuários ilimitados' },
] as const

type PlanValue = typeof PLANS[number]['value']

export function PaymentLateBanner() {
  const { clinic, user } = useAuthStore()
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [dismissedDue, setDismissedDue]   = useState(false)
  const [selectedPlan, setSelectedPlan]   = useState<PlanValue | null>(null)
  const [coupon, setCoupon]               = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('promoCoupon') ?? '') : ''
  )
  const couponUpper   = coupon.trim().toUpperCase()
  const couponValid   = couponUpper === 'COPA50'
  const couponInvalid = couponUpper.length > 0 && !couponValid

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
    try {
      const appliedCoupon = couponValid ? couponUpper : undefined
      const res  = await fetch('/api/asaas/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: clinic.id, clinicName: clinic.name, plan: planOverride, couponCode: appliedCoupon }),
      })
      const data = await res.json()
      if (data.url) {
        if (appliedCoupon) localStorage.removeItem('promoCoupon')
        window.location.href = data.url
      }
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

          <div className={styles.couponField}>
            <input
              type="text"
              className={`${styles.couponInput} ${couponValid ? styles.couponInputValid : couponInvalid ? styles.couponInputInvalid : ''}`}
              placeholder="Código promocional (ex: COPA50)"
              value={coupon}
              onChange={e => setCoupon(e.target.value)}
              maxLength={20}
            />
            {couponValid   && <span className={styles.couponOk}>✓ 50% de desconto na 1ª mensalidade</span>}
            {couponInvalid && <span className={styles.couponErr}>Código inválido</span>}
          </div>

          <div className={styles.modalActions}>
            <button
              className={styles.btnPrimary}
              onClick={() => void handlePortal(activePlan)}
              disabled={loadingPortal}
            >
              {loadingPortal
                ? 'Aguarde...'
                : couponValid
                  ? `Assinar plano ${planInfo.label} com 50% off`
                  : `Assinar plano ${planInfo.label} — ${planInfo.price}`}
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
        <span className={styles.overdueIcon}>⚠️</span>
        <span className={styles.overdueMsg}>
          {daysOverdue > 1
            ? `Pagamento em atraso há ${daysOverdue} dias.`
            : 'Seu pagamento está em atraso.'}{' '}
          Regularize para garantir a continuidade do acesso.
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
        <span className={styles.dueIcon}>🔔</span>
        <span className={styles.dueMsg}>
          Seu próximo pagamento vence <strong>{label}</strong>. Certifique-se de que o método de pagamento está ativo.
        </span>
        <button className={styles.dueDismiss} onClick={() => setDismissedDue(true)} aria-label="Fechar">✕</button>
      </div>
    )
  }

  return null
}
