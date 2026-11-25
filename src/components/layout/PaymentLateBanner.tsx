'use client'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import styles from './PaymentLateBanner.module.css'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import btn from '@/components/ui/button.module.css'
import { PLAN_CATALOG, PUBLIC_PLANS, isSellablePlan, type SellablePlan } from '@/lib/planCatalog'
import { primeiraCobrancaCombinada, primeiraCobrancaVencida } from '@/lib/clinicStatus'
import { firstDueDateFor } from '@/lib/campanha'
import { elegivelPromoPrimeiraCobranca, valorPrimeiraCobranca } from '@/lib/promoPrimeiraCobranca'
import { formatBrl, formatDiaBr, CARD_BRAND_LABELS } from '@/lib/cartaoCheckout'
import { TrialCardForm, type TrialCardResult } from './TrialCardForm'
import { CheckoutCartaoModal } from './CheckoutCartaoModal'
import { AssinarEscolha } from '@/components/configuracoes/AssinarEscolha'

const WHATSAPP = 'https://wa.me/5588920020570?text=Olá!%20Quero%20mais%20tempo%20para%20testar%20o%20MyClinica.'

const WHATSAPP_COBRANCA = 'https://wa.me/5588920020570?text=Olá!%20Preciso%20de%20ajuda%20com%20a%20cobrança%20do%20MyClinica.'

// Planos de autoatendimento = PUBLIC_PLANS (o mesmo que o endpoint de cartão aceita). O plano atual da
// clínica só entra se estiver fora dessa lista (ex.: Ilimitado de quem já está nele).
function plansFor(currentPlan: string | null | undefined) {
  const values: SellablePlan[] = [...PUBLIC_PLANS]
  if (isSellablePlan(currentPlan) && !values.includes(currentPlan)) values.push(currentPlan)
  return values.map(value => ({
    value,
    label: PLAN_CATALOG[value].label,
    price: PLAN_CATALOG[value].price,
    desc: PLAN_CATALOG[value].description,
  }))
}

type PlanValue = SellablePlan

export function PaymentLateBanner() {
  const { clinic, user, setSession } = useAuthStore()
  const [portalOpen, setPortalOpen] = useState(false)
  const [step, setStep] = useState<'plan' | 'card'>('plan')
  const [escolhaOpen, setEscolhaOpen] = useState(false)
  // cartão cadastrado: o acesso já foi liberado no store; esta tela só confirma e fecha no clique
  const [success, setSuccess] = useState<TrialCardResult | null>(null)
  const [dismissedDue, setDismissedDue]   = useState(false)
  const [selectedPlan, setSelectedPlan]   = useState<PlanValue | null>(null)
  // desktop: escolha de plano e cartão usam o modal largo (duas colunas); abaixo disso segue o modal estreito de sempre
  const wideLayout = useMediaQuery('(min-width: 900px)')

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
  // cartão já cadastrado com 1ª cobrança combinada: acesso liberado até 2 dias depois do vencimento
  const primeiraCobranca = primeiraCobrancaCombinada({ billing_first_due: clinic.billingFirstDue, billing_paid: clinic.billingPaid }, new Date(now))

  const checkoutModal = portalOpen ? <CheckoutCartaoModal onClose={() => setPortalOpen(false)} /> : null

  // ── Cartão cadastrado — confirmação (o acesso já está liberado; F5 aqui segue normal, sem esta tela) ──
  if (success) {
    const brandLabel = success.cardBrand ? CARD_BRAND_LABELS[success.cardBrand] : null
    const cardLine = [brandLabel, success.cardLast4 ? `final ${success.cardLast4}` : null].filter(Boolean).join(' ')
    return (
      <Modal open onClose={() => setSuccess(null)} title="Cartão cadastrado">
        <div className={styles.successHead}>
          <span className={styles.successIcon} aria-hidden="true"><Icon name="checkCircle" size={26} /></span>
          <div className={styles.successText}>
            {cardLine && <p className={styles.successCard}>{cardLine}</p>}
            <p className={styles.desc}>Seu acesso segue liberado e nada muda no seu uso.</p>
          </div>
        </div>

        <dl className={styles.successList}>
          <div className={styles.successRow}>
            <dt>Primeira cobrança</dt>
            <dd>{formatDiaBr(success.firstDueDate)}, {formatBrl(success.firstValue)}</dd>
          </div>
          <div className={styles.successRow}>
            <dt>Depois</dt>
            <dd>{formatBrl(success.fullValue)} por mês</dd>
          </div>
        </dl>

        <div className={styles.modalActions}>
          <button type="button" className={`${btn.primary} ${styles.block}`} onClick={() => setSuccess(null)}>
            Começar a usar
          </button>
        </div>
      </Modal>
    )
  }

  // ── 1ª cobrança combinada passou da tolerância sem pagamento — modal bloqueante ──
  // Decide só por data (não depende do webhook) e vale mesmo com billing_overdue_since preenchido.
  if (primeiraCobrancaVencida({ billing_first_due: clinic.billingFirstDue, billing_paid: clinic.billingPaid }, new Date(now))) {
    return (
      <>
      {checkoutModal}
      <Modal open onClose={() => {}} dismissible={false} title="Não conseguimos confirmar sua cobrança">
        <p className={styles.desc}>
          A cobrança do cartão cadastrado não foi confirmada. Seus dados estão salvos. Pague agora para liberar o acesso, ou fale com o suporte.
        </p>

        <div className={styles.modalActions}>
          <button
            type="button"
            className={`${btn.primary} ${styles.block}`}
            onClick={() => setPortalOpen(true)}
          >
            Pagar agora
          </button>
          <a
            href={WHATSAPP_COBRANCA}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btn.secondary} ${styles.block}`}
          >
            Falar com o suporte
          </a>
        </div>
      </Modal>
      </>
    )
  }

  // ── Trial encerrado — modal bloqueante ───────────────────────────────
  if (trialExpired && neverPaid && !primeiraCobranca) {
    const plans      = plansFor(clinic.plan)
    const activePlan = selectedPlan && plans.some(p => p.value === selectedPlan)
      ? selectedPlan
      : (plans.find(p => p.value === clinic.plan)?.value ?? 'essencial')
    const planInfo   = plans.find(p => p.value === activePlan) ?? plans[0]

    // Preço congelado (custom_monthly_price) vale só para o plano atual da clínica; igual ao servidor.
    const frozen     = clinic.customMonthlyPrice
    const hasFrozen  = typeof frozen === 'number' && Number.isFinite(frozen) && frozen > 0
    const fullValue  = Math.round((activePlan === clinic.plan && hasFrozen ? frozen : PLAN_CATALOG[activePlan].priceValue) * 100) / 100
    // Rótulo de preço de cada plano: o plano atual mostra o preço congelado.
    const priceLabel = (value: PlanValue, tablePrice: string) =>
      value === clinic!.plan && hasFrozen ? `${formatBrl(Math.round(frozen * 100) / 100)}/mês` : tablePrice
    const planPrice  = priceLabel(planInfo.value, planInfo.price)
    const promo      = elegivelPromoPrimeiraCobranca(clinic.createdAt)
    const firstValue = valorPrimeiraCobranca(fullValue, promo)
    const dueDay     = firstDueDateFor(clinic.trialEndsAt)
    const dueLabel   = formatDiaBr(dueDay)

    function handleCardSuccess(result: TrialCardResult) {
      if (!clinic || !user) return
      setSession({ ...clinic, plan: activePlan, billingFirstDue: result.firstDueDate }, user)
      setSuccess(result)
      setStep('plan')
    }

    if (step === 'card') {
      return (
        <Modal open onClose={() => {}} dismissible={false} title="Cadastrar cartão" size={wideLayout ? 'xl' : 'md'}>
          <TrialCardForm
            clinicId={clinic.id}
            plan={activePlan}
            fullValue={fullValue}
            firstValue={firstValue}
            promo={promo}
            dueLabel={dueLabel}
            defaultPhone={clinic.billingPhone ?? ''}
            onBack={() => setStep('plan')}
            onSuccess={handleCardSuccess}
          />
        </Modal>
      )
    }

    return (
      <>
      {escolhaOpen && (
        <AssinarEscolha
          clinic={clinic}
          onClose={() => setEscolhaOpen(false)}
          onCartao={p => { setEscolhaOpen(false); setSelectedPlan(p); setStep('card') }}
          onContratoConcluido={() => { setEscolhaOpen(false); window.location.reload() }}
        />
      )}
      <Modal open onClose={() => {}} dismissible={false} title="Seu período de teste encerrou" size={wideLayout ? 'lg' : 'md'}>
        <div className={styles.planStep}>
        <p className={`${styles.desc} ${styles.planDesc}`}>
          Seus dados estão salvos. Escolha um plano para continuar usando o MyClinica sem perder nada. A primeira cobrança só acontece em {dueLabel}.
        </p>

        <div className={styles.planSelector}>
          {plans.map(p => (
            <button
              key={p.value}
              type="button"
              className={`${styles.planOption} ${activePlan === p.value ? styles.planOptionActive : ''}`}
              aria-pressed={activePlan === p.value}
              onClick={() => setSelectedPlan(p.value)}
            >
              <span className={styles.planOptionLabel}>{p.label}</span>
              <span className={styles.planOptionPrice}>{priceLabel(p.value, p.price)}</span>
              <span className={styles.planOptionDesc}>{p.desc}</span>
            </button>
          ))}
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            className={`${btn.primary} ${styles.block}`}
            onClick={() => setStep('card')}
          >
            {`Continuar com o plano ${planInfo.label} — ${planPrice}`}
          </button>
          <button type="button" className={`${btn.secondary} ${styles.block}`} onClick={() => setEscolhaOpen(true)}>
            Ver contratos de 3, 6 ou 12 meses com desconto
          </button>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className={`${btn.secondary} ${styles.block}`}
          >
            Falar com o suporte
          </a>
        </div>
        </div>
      </Modal>
      </>
    )
  }

  // ── Pagamento em atraso (clientes permanentes) — banner topo ─────────
  if (isOverdue) {
    return (
      <>{checkoutModal}<div className={styles.overdueBanner}>
        <span className={styles.overdueIcon}><Icon name="alert" size={13} /></span>
        <span className={styles.overdueMsg}>
          {daysOverdue > 1 ? `Pagamento em atraso há ${daysOverdue} dias.` : 'Pagamento em atraso.'}
        </span>
        <button className={styles.overdueBtn} onClick={() => setPortalOpen(true)}>
          Pagar agora
        </button>
      </div></>
    )
  }

  // ── Vence amanhã/hoje (clientes permanentes) — notificação topo ──────
  if (dueTomorrow && !dismissedDue) {
    const label = daysUntilDue === 0 ? 'hoje' : 'amanhã'
    return (
      <>{checkoutModal}<div className={styles.dueBanner}>
        <span className={styles.dueIcon}><Icon name="bell" size={13} /></span>
        <span className={styles.dueMsg}>
          Pagamento vence <strong>{label}</strong>.
        </span>
        <button className={styles.dueBtn} onClick={() => setPortalOpen(true)}>
          Pagar agora
        </button>
        <button className={styles.dueDismiss} onClick={() => setDismissedDue(true)} aria-label="Fechar"><Icon name="close" size={12} /></button>
      </div></>
    )
  }

  return null
}
