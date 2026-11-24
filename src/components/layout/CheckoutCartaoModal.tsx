'use client'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import btn from '@/components/ui/button.module.css'
import styles from './PaymentLateBanner.module.css'
import { PLAN_CATALOG, isSellablePlan, type SellablePlan } from '@/lib/planCatalog'
import { firstDueDateFor } from '@/lib/campanha'
import { elegivelPromoPrimeiraCobranca, valorPrimeiraCobranca } from '@/lib/promoPrimeiraCobranca'
import { formatBrl, formatDiaBr, CARD_BRAND_LABELS } from '@/lib/cartaoCheckout'
import { TrialCardForm, type TrialCardResult } from './TrialCardForm'

/**
 * Checkout interno por cartão, sem abrir nenhuma página do Asaas.
 * - Clínica sem assinatura: cadastra o cartão e agenda a primeira cobrança (com termo de aceite).
 * - Clínica com assinatura: troca o cartão e quita a fatura em aberto, se houver.
 */
export function CheckoutCartaoModal({ onClose, plano }: { onClose: () => void; plano?: SellablePlan }) {
  const { clinic, user, setSession } = useAuthStore()
  const wide = useMediaQuery('(min-width: 900px)')
  const [done, setDone] = useState<TrialCardResult | null>(null)
  if (!clinic) return null

  const atualizar = !!clinic.asaasSubscriptionId
  const planoDaClinica: SellablePlan = isSellablePlan(clinic.plan) ? clinic.plan : 'essencial'
  // `plano` vem da tela de escolha; se for outro plano, o preço combinado da clínica não se aplica.
  const plan: SellablePlan = plano ?? planoDaClinica
  const frozen = plan === planoDaClinica ? clinic.customMonthlyPrice : null
  const hasFrozen = typeof frozen === 'number' && Number.isFinite(frozen) && frozen > 0
  const fullValue = Math.round((hasFrozen ? frozen : PLAN_CATALOG[plan].priceValue) * 100) / 100
  const promo = elegivelPromoPrimeiraCobranca(clinic.createdAt)
  const firstValue = valorPrimeiraCobranca(fullValue, promo)
  const dueLabel = formatDiaBr(firstDueDateFor(clinic.trialEndsAt))

  function handleSuccess(r: TrialCardResult) {
    if (clinic && user) {
      setSession(atualizar
        ? { ...clinic, billingOverdueSince: null }
        : { ...clinic, plan, billingFirstDue: r.firstDueDate }, user)
    }
    setDone(r)
  }

  if (done) {
    const marca = done.cardBrand ? CARD_BRAND_LABELS[done.cardBrand] : null
    const linha = [marca, done.cardLast4 ? `final ${done.cardLast4}` : null].filter(Boolean).join(' ')
    return (
      <Modal open onClose={onClose} title={atualizar ? 'Cartão atualizado' : 'Cartão cadastrado'}>
        <div className={styles.successHead}>
          <span className={styles.successIcon} aria-hidden="true"><Icon name="checkCircle" size={26} /></span>
          <div className={styles.successText}>
            {linha && <p className={styles.successCard}>{linha}</p>}
            <p className={styles.desc}>{atualizar ? 'Seu cartão foi salvo e o pagamento em aberto, se havia, foi enviado para cobrança.' : 'Seu acesso segue liberado e nada muda no seu uso.'}</p>
          </div>
        </div>
        {!atualizar && (
          <dl className={styles.successList}>
            <div className={styles.successRow}><dt>Primeira cobrança</dt><dd>{formatDiaBr(done.firstDueDate)}, {formatBrl(done.firstValue)}</dd></div>
            <div className={styles.successRow}><dt>Depois</dt><dd>{formatBrl(done.fullValue)} por mês</dd></div>
          </dl>
        )}
        <div className={styles.modalActions}>
          <button type="button" className={`${btn.primary} ${styles.block}`} onClick={onClose}>Concluir</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title={atualizar ? 'Pagar com cartão' : 'Cadastrar cartão'} size={wide ? 'xl' : 'md'}>
      <TrialCardForm
        clinicId={clinic.id}
        plan={plan}
        fullValue={fullValue}
        firstValue={firstValue}
        promo={promo}
        dueLabel={dueLabel}
        defaultPhone={clinic.billingPhone ?? ''}
        modo={atualizar ? 'atualizar' : 'nova'}
        onBack={onClose}
        onSuccess={handleSuccess}
      />
    </Modal>
  )
}
