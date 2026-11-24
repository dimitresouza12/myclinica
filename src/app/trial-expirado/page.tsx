'use client'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { getPlanEntry, type PublicPlan } from '@/lib/planCatalog'
import { CheckoutCartaoModal } from '@/components/layout/CheckoutCartaoModal'
import { AssinarEscolha } from '@/components/configuracoes/AssinarEscolha'
import { Icon } from '@/components/ui/Icon'
import styles from './trial-expirado.module.css'

export default function TrialExpiradoPage() {
  const { clinic } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [escolha, setEscolha] = useState(false)
  const [plano, setPlano] = useState<PublicPlan | undefined>(undefined)

  const planInfo = getPlanEntry(clinic?.plan)
  const priceInt = Math.floor(planInfo.priceValue)
  const priceCents = planInfo.priceValue % 1 > 0 ? `,${String(Math.round((planInfo.priceValue % 1) * 100)).padStart(2,'0')}` : ''

  const supportMsg = `Olá! Meu período de teste do MyClinica${clinic?.name ? ` (${clinic.name})` : ''} encerrou e preciso de ajuda.`
  const supportHref = `https://wa.me/5588920020570?text=${encodeURIComponent(supportMsg)}`

  return (
    <div className={styles.page}>
      {open && <CheckoutCartaoModal plano={plano} onClose={() => setOpen(false)} />}
      {escolha && clinic && (
        <AssinarEscolha
          clinic={clinic}
          onClose={() => setEscolha(false)}
          onCartao={p => { setEscolha(false); setPlano(p); setOpen(true) }}
          onContratoConcluido={() => { setEscolha(false); window.location.reload() }}
        />
      )}
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true"><Icon name="clock" size={28} /></div>
        <h1 className={styles.title}>Seu período de teste encerrou</h1>
        <p className={styles.desc}>
          Para continuar com acesso completo ao MyClínica, escolha o prazo e assine.
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

        <button
          className={styles.btnContact}
          onClick={() => { const combinado = !!clinic?.customMonthlyPrice && clinic.customMonthlyPrice > 0; if (combinado) { setPlano(undefined); setOpen(true) } else setEscolha(true) }}
        >
          Escolher prazo e assinar
        </button>

        <a
          href={supportHref}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.btnSupport}
        >
          Falar com o suporte
        </a>

        <a href="/login" className={styles.linkBack}>Voltar ao login</a>
      </div>
    </div>
  )
}
