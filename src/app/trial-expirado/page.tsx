'use client'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { getPlanEntry } from '@/lib/planCatalog'
import { Icon } from '@/components/ui/Icon'
import styles from './trial-expirado.module.css'

export default function TrialExpiradoPage() {
  const { clinic, user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const planInfo = getPlanEntry(clinic?.plan)
  const priceInt = Math.floor(planInfo.priceValue)
  const priceCents = planInfo.priceValue % 1 > 0 ? `,${String(Math.round((planInfo.priceValue % 1) * 100)).padStart(2,'0')}` : ''

  async function handleSubscribe() {
    if (!clinic) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/asaas/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId:   clinic.id,
          clinicName: clinic.name,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) { setError(data.error ?? 'Não foi possível gerar o link de pagamento.'); return }
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Não foi possível iniciar o pagamento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true"><Icon name="clock" size={28} /></div>
        <h1 className={styles.title}>Seu período de teste encerrou</h1>
        <p className={styles.desc}>
          Para continuar com acesso completo ao MyClínica, assine o plano mensal.
        </p>

        <div className={styles.divider}/>

        <p className={styles.planBadge}>Plano {planInfo.label}</p>
        <div className={styles.price}>
          <span className={styles.priceCurrency}>R$</span>
          <span className={styles.priceValue}>{priceInt}</span>
          {priceCents && <span className={styles.priceCents}>{priceCents}</span>}
          <span className={styles.pricePeriod}>/mês</span>
        </div>

        <ul className={styles.features}>
          <li><Icon name="check" size={12} aria-hidden="true" />Prontuário eletrônico completo</li>
          <li><Icon name="check" size={12} aria-hidden="true" />Agenda com Google Calendar</li>
          <li><Icon name="check" size={12} aria-hidden="true" />Financeiro + relatórios</li>
          <li><Icon name="check" size={12} aria-hidden="true" />Odontograma / Faceograma</li>
          <li><Icon name="check" size={12} aria-hidden="true" />Múltiplos usuários e perfis</li>
          <li><Icon name="check" size={12} aria-hidden="true" />Suporte via WhatsApp</li>
        </ul>

        <div className={styles.divider}/>

        {error && <p className={styles.errMsg} role="alert">{error}</p>}

        <button
          className={styles.btnContact}
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? 'Aguarde...' : `Assinar agora — R$${priceInt}${priceCents}/mês`}
        </button>

        {user?.isSuperAdmin === false && (
          <a
            href="https://wa.me/5588920020570?text=Olá!%20Preciso%20de%20ajuda%20com%20o%20pagamento%20do%20MyClinica."
            target="_blank"
            rel="noopener noreferrer"
            className={styles.linkBack}
          >
            Precisa de ajuda? Fale pelo WhatsApp
          </a>
        )}

        <a href="/login" className={styles.linkBack}>Voltar ao login</a>
      </div>
    </div>
  )
}
