'use client'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import styles from './trial-expirado.module.css'

const PLAN_PRICES: Record<string, { label: string; value: number }> = {
  essencial:    { label: 'Essencial',  value: 99      },
  avancado:     { label: 'Avançado',   value: 119.90  },
  completo:     { label: 'Completo',   value: 129.90  },
  completo_plus:{ label: 'Completo+',  value: 199     },
}

export default function TrialExpiradoPage() {
  const { clinic, user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const planInfo = PLAN_PRICES[clinic?.plan ?? ''] ?? PLAN_PRICES.essencial
  const priceInt = Math.floor(planInfo.value)
  const priceCents = planInfo.value % 1 > 0 ? `,${String(Math.round((planInfo.value % 1) * 100)).padStart(2,'0')}` : ''

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
        <div className={styles.icon}>⏰</div>
        <h1 className={styles.title}>Seu período de teste encerrou</h1>
        <p className={styles.desc}>
          Para continuar com acesso completo ao myclinica, assine o plano mensal.
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
          <li>Prontuário eletrônico completo</li>
          <li>Agenda com Google Calendar</li>
          <li>Financeiro + relatórios</li>
          <li>Odontograma / Faceograma</li>
          <li>Múltiplos usuários e perfis</li>
          <li>Suporte via WhatsApp</li>
        </ul>

        <div className={styles.divider}/>

        {error && <p className={styles.errMsg}>{error}</p>}

        <button
          className={styles.btnContact}
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? 'Aguarde...' : `Assinar agora — R$${priceInt}${priceCents}/mês`}
        </button>

        {user?.isSuperAdmin === false && (
          <a
            href="https://wa.me/55889200205070?text=Olá!%20Preciso%20de%20ajuda%20com%20o%20pagamento%20do%20MyClinica."
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
