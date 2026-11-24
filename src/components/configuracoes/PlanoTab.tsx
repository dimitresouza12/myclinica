'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AuthClinic } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { IntegerInput } from '@/components/ui/NumericInput'
import { PLAN_CATALOG, getPlanEntry } from '@/lib/planCatalog'
import { CARD_BRAND_LABELS, formatBrl, formatDiaBr, normalizeCardBrand } from '@/lib/cartaoCheckout'
import { CheckoutCartaoModal } from '@/components/layout/CheckoutCartaoModal'
import { AssinarEscolha } from './AssinarEscolha'
import type { PublicPlan } from '@/lib/planCatalog'
import { avisoPromo, podeAssinarAgora, situacaoDoPlano } from './planoResumo'
import styles from './PlanoTab.module.css'

interface Cobranca { dueDate: string; paidAt: string | null; value: number; situacao: 'paga' | 'pendente' | 'atrasada' | 'outra' }
interface Resumo {
  hasSubscription: boolean
  plan: string
  planLabel: string
  fullValue: number
  firstValue: number
  promo: boolean
  firstDue: string | null
  nextDueDate: string | null
  paid: boolean
  card: { brand: string | null; last4: string | null } | null
  payments: Cobranca[]
  asaas: 'ok' | 'sem_assinatura' | 'indisponivel'
}

const SITUACAO_TXT: Record<Cobranca['situacao'], { txt: string; cls: string }> = {
  paga: { txt: 'Paga', cls: styles.bOk },
  pendente: { txt: 'Pendente', cls: styles.bInfo },
  atrasada: { txt: 'Atrasada', cls: styles.bBad },
  outra: { txt: 'Outro', cls: styles.bWarn },
}
const TOM_CLS = { ok: styles.bOk, info: styles.bInfo, warn: styles.bWarn, bad: styles.bBad }

export function PlanoTab({ clinic }: { clinic: AuthClinic }) {
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [busy, setBusy] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [escolhaOpen, setEscolhaOpen] = useState(false)
  const [planoCheckout, setPlanoCheckout] = useState<PublicPlan | undefined>(undefined)
  const [actionError, setActionError] = useState('')
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [changingDay, setChangingDay] = useState(false)
  const [dueDayInput, setDueDayInput] = useState('')
  const [dueDayMsg, setDueDayMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // `tentativa` só muda no "Tentar de novo" e na troca do dia de vencimento: refaz a consulta.
  const [tentativa, setTentativa] = useState(0)
  const carregar = useCallback(() => setTentativa(n => n + 1), [])

  useEffect(() => {
    let vivo = true
    fetch('/api/asaas/assinatura', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() as Promise<Resumo> : Promise.reject(new Error('status'))))
      .then(data => { if (vivo) { setResumo(data); setLoadError(false) } })
      .catch(() => { if (vivo) setLoadError(true) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [tentativa])

  const situacao = situacaoDoPlano({
    trialEndsAt: clinic.trialEndsAt,
    billingPaid: clinic.billingPaid,
    billingOverdueSince: clinic.billingOverdueSince,
    billingFirstDue: clinic.billingFirstDue ?? null,
    asaasSubscriptionId: clinic.asaasSubscriptionId,
  })
  const podeAssinar = podeAssinarAgora({
    trialEndsAt: clinic.trialEndsAt, billingPaid: clinic.billingPaid, billingOverdueSince: clinic.billingOverdueSince,
    billingFirstDue: clinic.billingFirstDue ?? null, asaasSubscriptionId: clinic.asaasSubscriptionId,
  })

  // Valores: o servidor manda o que vale (preço congelado, promoção); sem resposta, cai no preço do plano.
  const entry = getPlanEntry(clinic.plan)
  const fullValue = resumo?.fullValue ?? (clinic.customMonthlyPrice && clinic.customMonthlyPrice > 0 ? clinic.customMonthlyPrice : entry.priceValue)
  const planLabel = resumo?.planLabel ?? (clinic.plan === 'avancado' ? 'Avançado' : entry.label)
  const promo = resumo?.promo === true
  const congelado = !promo && !!clinic.customMonthlyPrice && clinic.customMonthlyPrice > 0
  const firstDue = resumo?.firstDue ?? clinic.billingFirstDue ?? null
  const proxima = resumo?.nextDueDate ?? clinic.nextBillingDate ?? firstDue
  const proximoValor = clinic.billingPaid ? fullValue : (resumo?.firstValue ?? fullValue)

  async function postBilling(action: 'change_due_day', extra: object = {}) {
    const res = await fetch('/api/asaas/billing-action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicId: clinic.id, action, ...extra }),
    })
    return res.json() as Promise<{ url?: string; ok?: boolean; error?: string; message?: string; nextDueDate?: string }>
  }

  // Preço combinado (congelado) não entra na tabela de contratos: segue direto para o cartão.
  const precoCombinado = !!clinic.customMonthlyPrice && clinic.customMonthlyPrice > 0
  function handleSubscribe() {
    setActionError('')
    if (precoCombinado) { setPlanoCheckout(undefined); setCheckoutOpen(true) } else setEscolhaOpen(true)
  }
  function handleRegularizar() { setActionError(''); setPlanoCheckout(undefined); setCheckoutOpen(true) }

  async function handleChangeDueDay() {
    const day = parseInt(dueDayInput, 10)
    if (isNaN(day) || day < 1 || day > 28) { setDueDayMsg({ ok: false, text: 'Escolha um dia entre 1 e 28.' }); return }
    setBusy(true); setDueDayMsg(null)
    try {
      const data = await postBilling('change_due_day', { day })
      if (data.ok) {
        setDueDayMsg({ ok: true, text: data.nextDueDate ? `Próximo vencimento: ${formatDiaBr(data.nextDueDate)}` : data.message ?? 'Dia de preferência salvo.' })
        setChangingDay(false); setDueDayInput('')
        carregar()
      } else setDueDayMsg({ ok: false, text: data.error ?? 'Erro ao alterar vencimento.' })
    } catch { setDueDayMsg({ ok: false, text: 'Erro de conexão. Tente novamente.' }) } finally { setBusy(false) }
  }

  // 'avancado' some da grade de upgrade; só reaparece se a própria clínica ainda estiver nele.
  const planos: Record<string, { label: string; price: string }> = clinic.plan === 'avancado'
    ? { avancado: { label: 'Avançado', price: 'R$119,90/mês' }, ...PLAN_CATALOG }
    : PLAN_CATALOG

  const marca = resumo?.card?.brand ? (normalizeCardBrand(resumo.card.brand) ? CARD_BRAND_LABELS[normalizeCardBrand(resumo.card.brand)!] : resumo.card.brand) : null

  return (
    <div className={styles.stack}>
      {checkoutOpen && <CheckoutCartaoModal plano={planoCheckout} onClose={() => { setCheckoutOpen(false); carregar() }} />}
      {escolhaOpen && (
        <AssinarEscolha
          clinic={clinic}
          onClose={() => setEscolhaOpen(false)}
          onCartao={plano => { setEscolhaOpen(false); setPlanoCheckout(plano); setCheckoutOpen(true) }}
          onContratoConcluido={() => { setEscolhaOpen(false); carregar() }}
        />
      )}
      {/* 1. Situação */}
      <section className={styles.card} aria-labelledby="pl-sit">
        <div className={styles.head}>
          <h2 id="pl-sit" className={styles.title}>Plano e faturamento</h2>
          <span className={`${styles.badge} ${TOM_CLS[situacao.tom]}`}>
            <Icon name={situacao.tom === 'bad' ? 'alert' : 'check'} size={12} /> {situacao.badge}
          </span>
        </div>
        <p className={styles.sub}>{situacao.frase}</p>
      </section>

      {/* 2. Cobrança */}
      <section className={styles.card} aria-labelledby="pl-cob">
        <h2 id="pl-cob" className={styles.title}>Cobrança</h2>
        {loading && !resumo ? (
          <div aria-busy="true" aria-label="Carregando"><div className={styles.skel} style={{ width: '60%' }} /></div>
        ) : (
          <>
            {promo && resumo && (
              <p className={styles.promo}><Icon name="check" size={14} /> {avisoPromo(resumo.firstValue, resumo.fullValue)}</p>
            )}
            <dl className={styles.rows}>
              <div><dt>Plano</dt><dd>{planLabel}</dd></div>
              <div>
                <dt>Mensalidade</dt>
                <dd>{formatBrl(fullValue)}{congelado && <small>Preço garantido para a sua clínica</small>}</dd>
              </div>
              {firstDue && resumo?.hasSubscription && (
                <div><dt>Primeira cobrança</dt><dd>{formatBrl(resumo.firstValue)}<small>em {formatDiaBr(firstDue)}</small></dd></div>
              )}
              {proxima && (clinic.billingPaid || resumo?.hasSubscription) && !(proxima === firstDue && !clinic.billingPaid) && (
                <div><dt>Próxima cobrança</dt><dd>{formatBrl(proximoValor)}<small>em {formatDiaBr(proxima)}</small></dd></div>
              )}
              {!resumo?.hasSubscription && clinic.trialEndsAt && !clinic.billingPaid && (
                <div><dt>Fim do teste</dt><dd>{formatDiaBr(clinic.trialEndsAt.slice(0, 10))}</dd></div>
              )}
            </dl>
          </>
        )}
      </section>

      {/* 3. Cartão */}
      <section className={styles.card} aria-labelledby="pl-card">
        <h2 id="pl-card" className={styles.title}>Cartão de crédito</h2>
        {loading && !resumo ? (
          <div aria-busy="true"><div className={styles.skel} style={{ width: '40%' }} /></div>
        ) : loadError ? (
          <div className={styles.retry}>
            <p className={styles.msgErr}><Icon name="alert" size={13} /> Não foi possível carregar os dados da assinatura.</p>
            <button type="button" className={styles.btnGhost} onClick={() => { setLoading(true); setLoadError(false); carregar() }}>Tentar de novo</button>
          </div>
        ) : resumo?.card ? (
          <div className={styles.cardLine}>
            <span className={styles.cardChip}>{marca ?? 'Cartão'} final {resumo.card.last4 ?? '----'}</span>
            <button type="button" className={styles.btnGhost} onClick={handleRegularizar}>Trocar cartão</button>
          </div>
        ) : resumo?.hasSubscription ? (
          <p className={styles.sub}>
            {resumo.asaas === 'indisponivel'
              ? 'Seu cartão está cadastrado, mas não conseguimos consultar os detalhes agora. Tente de novo em instantes.'
              : 'Seu cartão está cadastrado.'}
          </p>
        ) : (
          <p className={styles.sub}>Nenhum cartão cadastrado.</p>
        )}
      </section>

      {/* 4. Histórico */}
      <section className={styles.card} aria-labelledby="pl-hist">
        <h2 id="pl-hist" className={styles.title}>Histórico de cobranças</h2>
        {loading && !resumo ? (
          <div aria-busy="true"><div className={styles.skel} style={{ width: '70%' }} /></div>
        ) : resumo && resumo.payments.length > 0 ? (
          <ul className={styles.list}>
            {resumo.payments.map(p => {
              const s = SITUACAO_TXT[p.situacao]
              return (
                <li key={p.dueDate} className={styles.item}>
                  <span className={styles.itemDate}>Vencimento {formatDiaBr(p.dueDate)}</span>
                  <span className={styles.itemVal}>{formatBrl(p.value)}</span>
                  <span className={styles.itemNote}>{p.paidAt ? `Paga em ${formatDiaBr(p.paidAt)}` : ' '}</span>
                  <span className={`${styles.badge} ${s.cls} ${styles.itemTag}`}>{s.txt}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className={styles.sub}>
            {resumo?.asaas === 'indisponivel'
              ? 'Não conseguimos consultar o histórico agora. Tente de novo em instantes.'
              : resumo?.hasSubscription
                ? `Ainda não há cobranças. A primeira será${firstDue ? ` em ${formatDiaBr(firstDue)}` : ' na data combinada'}.`
                : 'Ainda não há cobranças.'}
          </p>
        )}
      </section>

      {/* 5. Ações */}
      <section className={styles.card} aria-labelledby="pl-acoes">
        <h2 id="pl-acoes" className={styles.title}>Ações</h2>
        {actionError && <p className={styles.msgErr}><Icon name="alert" size={13} /> {actionError}</p>}
        <div className={styles.actions}>
          {podeAssinar && (
            <button type="button" className={styles.btn} onClick={handleSubscribe} disabled={busy}>
              Escolher prazo e assinar
            </button>
          )}
          {!!clinic.billingOverdueSince && (
            <button type="button" className={styles.btn} onClick={handleRegularizar} disabled={busy}>
              Regularizar pagamento
            </button>
          )}
          {clinic.billingPaid && !changingDay && (
            <button type="button" className={styles.link} onClick={() => { setChangingDay(true); setDueDayMsg(null) }}>Mudar dia do vencimento</button>
          )}
          {!showUpgrade && (
            <button type="button" className={styles.link} onClick={() => setShowUpgrade(true)}>Fazer upgrade de plano</button>
          )}
        </div>

        {changingDay && (
          <div className={styles.dayRow}>
            <span className={styles.sub}>Novo dia de vencimento (1–28):</span>
            <IntegerInput min={1} max={28} value={dueDayInput} onChange={setDueDayInput} className={styles.dayInput} placeholder="15" />
            <button type="button" className={styles.btn} onClick={handleChangeDueDay} disabled={busy}>{busy ? 'Salvando...' : 'Confirmar'}</button>
            <button type="button" className={styles.link} onClick={() => { setChangingDay(false); setDueDayInput(''); setDueDayMsg(null) }}>Cancelar</button>
          </div>
        )}
        {dueDayMsg && (
          <p className={dueDayMsg.ok ? styles.msgOk : styles.msgErr}>
            <Icon name={dueDayMsg.ok ? 'check' : 'alert'} size={13} /> {dueDayMsg.text}
          </p>
        )}

        {showUpgrade && (
          <>
            <p className={styles.sub}>Selecione o plano desejado e entraremos em contato:</p>
            <div className={styles.plans}>
              {Object.entries(planos).map(([slug, info]) => {
                const atual = slug === (clinic.plan ?? 'essencial')
                const msg = `Olá! Gostaria de fazer upgrade do meu plano para *${info.label}* (${info.price}). Minha clínica é *${clinic.name}*.`
                return (
                  <a
                    key={slug}
                    className={`${styles.planOpt} ${atual ? styles.planOptCur : ''}`}
                    href={atual ? undefined : `https://wa.me/5588920020570?text=${encodeURIComponent(msg)}`}
                    target="_blank" rel="noopener noreferrer"
                    onClick={atual ? e => e.preventDefault() : undefined}
                    aria-current={atual ? 'true' : undefined}
                  >
                    <span className={styles.planName}>{info.label}{atual && <Icon name="check" size={12} />}</span>
                    <span className={styles.planPrice}>{info.price}</span>
                    {!atual && <span className={styles.planCta}>Solicitar via WhatsApp <Icon name="chevronRight" size={11} /></span>}
                  </a>
                )
              })}
            </div>
            <button type="button" className={styles.link} onClick={() => setShowUpgrade(false)}>Cancelar</button>
          </>
        )}
      </section>
    </div>
  )
}
