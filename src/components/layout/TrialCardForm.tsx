'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/ui/Icon'
import { PhoneInput } from '@/components/ui/PhoneInput'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { onlyDigits } from '@/lib/numericFormat'
import { phoneInputError } from '@/lib/phoneFormat'
import {
  maskCardNumber, maskExpiry, maskCcv, maskCpfCnpj, maskCep,
  cardNumberError, expiryError, ccvError, holderNameError, cpfCnpjError, cepError, emailError,
  parseExpiry, formatBrl, deveLimparCartao, errosDeCampoVisiveis,
  detectCardBrand, maskCardPreview, normalizeCardBrand, type CardBrand,
} from '@/lib/cartaoCheckout'
import { CardPreview } from './CardPreview'
import styles from './TrialCardForm.module.css'

export interface TrialCardResult {
  firstDueDate: string
  firstValue: number
  fullValue: number
  promo: boolean
  /** Últimos 4 dígitos e bandeira devolvidos pelo servidor (podem vir null). A bandeira é a do servidor, ou a detectada no número se ele não mandou. */
  cardLast4?: string | null
  cardBrand?: CardBrand | null
}

interface Props {
  clinicId: string
  plan: string
  /** Valor cheio da mensalidade do plano escolhido. */
  fullValue: number
  /** Valor da 1ª cobrança (já com 50% off quando elegível). */
  firstValue: number
  promo: boolean
  /** Data da 1ª cobrança já formatada (DD/MM/AAAA). */
  dueLabel: string
  defaultPhone: string
  onBack: () => void
  onSuccess: (result: TrialCardResult) => void
}

type Field = 'number' | 'holder' | 'expiry' | 'ccv' | 'cpf' | 'email' | 'phone' | 'cep' | 'addressNumber'

/** Ordem visual dos campos: o primeiro inválido recebe o foco no envio. */
const FIELD_ORDER: Field[] = ['number', 'holder', 'expiry', 'ccv', 'cpf', 'email', 'phone', 'cep', 'addressNumber']

interface Shown { fullValue: number; firstValue: number; promo: boolean }

interface ApiBody extends Partial<Omit<TrialCardResult, 'cardBrand' | 'cardLast4'>> {
  cardLast4?: string | null
  cardBrand?: string | null
  ok?: boolean
  error?: string
  code?: string
}

const VALOR_MUDOU = 'O valor do seu plano mudou. Revise e confirme novamente.'

function LockIcon() {
  return (
    <svg className={styles.lock} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  )
}

/**
 * Formulário de cartão do modal de fim de teste. Os dados do cartão vivem só neste componente, vão
 * direto para /api/asaas/assinatura-cartao e são apagados do estado assim que a resposta chega.
 * Nada daqui é gravado em storage nem registrado em log.
 */
export function TrialCardForm({ clinicId, plan, fullValue, firstValue, promo, dueLabel, defaultPhone, onBack, onSuccess }: Props) {
  // valores mostrados no resumo e no consentimento; o servidor pode corrigi-los (409 valor_diferente)
  const [shown, setShown] = useState<Shown>({ fullValue, firstValue, promo })
  const [number, setNumber] = useState('')
  const [holder, setHolder] = useState('')
  const [expiry, setExpiry] = useState('')
  const [ccv, setCcv] = useState('')
  const [cpf, setCpf] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState(defaultPhone)
  const [cep, setCep] = useState('')
  const [addressNumber, setAddressNumber] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  // campos do cartão limpos por causa de erro do servidor: esconde os erros de "obrigatório" até o próximo envio
  const [limpoPorErro, setLimpoPorErro] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const [serverError, setServerError] = useState('')
  const lock = useRef(false)
  const emailTouched = useRef(false)

  // e-mail do login como sugestão, sem sobrescrever o que a pessoa já digitou
  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      const mail = data.session?.user?.email
      if (alive && mail && !emailTouched.current) setEmail(mail)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  // depois de limpar o cartão por erro do servidor, o foco volta ao primeiro campo limpo (número)
  useEffect(() => {
    if (focusTick > 0) document.getElementById('tcf-number')?.focus()
  }, [focusTick])

  const errors: Record<Field, string | null> = {
    number: cardNumberError(number),
    holder: holderNameError(holder),
    expiry: expiryError(expiry),
    ccv: ccvError(ccv),
    cpf: cpfCnpjError(cpf),
    email: emailError(email),
    phone: phoneInputError(phone, { required: true }),
    cep: cepError(cep),
    addressNumber: addressNumber.trim() ? null : 'Informe o número do endereço.',
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const showErrors = errosDeCampoVisiveis(submitted, limpoPorErro)
  const err = (k: Field) => (showErrors ? errors[k] : null)
  const show = (k: Field) => {
    const msg = err(k)
    return msg ? <span id={`tcf-${k}-err`} className={styles.fieldError} role="alert">{msg}</span> : null
  }
  // aria-invalid e aria-describedby só existem enquanto o erro está visível
  const a11y = (k: Field) => (err(k)
    ? { 'aria-invalid': true as const, 'aria-describedby': `tcf-${k}-err` }
    : {})
  const consentMissing = showErrors && !accepted

  const brand = detectCardBrand(number)
  const maskedNumber = maskCardPreview(number, brand)

  function focusFirstInvalid() {
    const first = FIELD_ORDER.find(k => errors[k])
    const id = first ? `tcf-${first}` : (!accepted ? 'tcf-consent' : null)
    if (id) document.getElementById(id)?.focus()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (lock.current || loading) return
    setSubmitted(true)
    setLimpoPorErro(false)
    setServerError('')
    if (hasErrors || !accepted) { focusFirstInvalid(); return }
    const exp = parseExpiry(expiry)
    if (!exp) return

    lock.current = true
    setLoading(true)
    const detectedBrand = detectCardBrand(number)
    const clearSensitive = () => { setNumber(''); setExpiry(''); setCcv('') }
    try {
      const res = await fetch('/api/asaas/assinatura-cartao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          plan,
          aceite: true,
          expectedFullValue: shown.fullValue,
          card: {
            holderName: holder.trim(),
            number: onlyDigits(number),
            expiryMonth: exp.month,
            expiryYear: exp.year,
            ccv: onlyDigits(ccv),
          },
          holder: {
            name: holder.trim(),
            email: email.trim(),
            cpfCnpj: onlyDigits(cpf),
            postalCode: onlyDigits(cep),
            addressNumber: addressNumber.trim(),
            phone: onlyDigits(phone),
          },
        }),
      })
      const data = await res.json().catch(() => ({})) as ApiBody
      // número, validade e CVV só saem da memória quando a tentativa terminou de vez (sucesso, 5xx ou recusa do cartão)
      const limpar = deveLimparCartao(res.status, data.code, data.error)
      if (limpar) clearSensitive()

      if (res.ok && data.ok && data.firstDueDate) {
        onSuccess({
          firstDueDate: data.firstDueDate,
          firstValue: data.firstValue ?? shown.firstValue,
          fullValue: data.fullValue ?? shown.fullValue,
          promo: data.promo ?? shown.promo,
          cardLast4: typeof data.cardLast4 === 'string' && data.cardLast4 ? data.cardLast4 : null,
          cardBrand: normalizeCardBrand(data.cardBrand) ?? detectedBrand,
        })
        return
      }

      if (res.status === 409 && data.code === 'valor_diferente') {
        // o preço mudou: mostra os valores do servidor, pede nova autorização e mantém os dados digitados
        if (typeof data.fullValue === 'number' && typeof data.firstValue === 'number') {
          setShown({ fullValue: data.fullValue, firstValue: data.firstValue, promo: !!data.promo })
        }
        setAccepted(false)
        setServerError(VALOR_MUDOU)
        requestAnimationFrame(() => document.getElementById('tcf-consent')?.focus())
        return
      }

      if (limpar) { setLimpoPorErro(true); setFocusTick(t => t + 1) }
      setServerError(data.error ?? (res.status === 409
        ? 'Já existe uma assinatura cadastrada para esta clínica.'
        : 'Não foi possível cadastrar o cartão. Confira os dados e tente novamente.'))
    } catch {
      setServerError('Erro de conexão. Tente novamente.')
    } finally {
      lock.current = false
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.side}>
      <section className={styles.timeline} aria-label="Resumo da cobrança">
        <ol className={styles.steps}>
          <li className={styles.step}>
            <span className={styles.when}>Hoje</span>
            <span className={styles.amount}>{formatBrl(0)}</span>
          </li>
          <li className={styles.step}>
            <span className={styles.when}>{dueLabel}</span>
            <span className={styles.amount}>
              {formatBrl(shown.firstValue)}
              {shown.promo && <span className={styles.promoBadge}>50% off</span>}
            </span>
          </li>
          <li className={styles.step}>
            <span className={styles.when}>Depois</span>
            <span className={styles.amount}>{formatBrl(shown.fullValue)} por mês</span>
          </li>
        </ol>
        <p className={styles.cancel}>Cancele quando quiser.</p>
      </section>

      <CardPreview brand={brand} maskedNumber={maskedNumber} holder={holder} expiry={expiry} />

      {/* só no desktop (coluna do resumo); no celular os mesmos avisos ficam abaixo do número do cartão e do consentimento */}
      <div className={styles.trust}>
        <ul className={styles.secure}>
          <li><LockIcon /> Pagamento seguro, processado pelo Asaas</li>
          <li><LockIcon /> Conexão criptografada</li>
        </ul>
        <p className={styles.secureNote}><LockIcon /> Não guardamos o número nem o código do seu cartão</p>
      </div>
      </div>

      <div className={styles.main}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Cartão de crédito</legend>
        <div className={f.field}>
          <label htmlFor="tcf-number">Número do cartão</label>
          <input
            id="tcf-number" name="cardnumber" type="text" inputMode="numeric"
            autoComplete="cc-number" placeholder="0000 0000 0000 0000"
            value={number} onChange={e => setNumber(maskCardNumber(e.target.value))}
            {...a11y('number')} disabled={loading}
          />
          {show('number')}
        </div>
        <ul className={`${styles.secure} ${styles.secureInline}`}>
          <li><LockIcon /> Pagamento seguro, processado pelo Asaas</li>
          <li><LockIcon /> Conexão criptografada</li>
        </ul>
        <div className={f.field}>
          <label htmlFor="tcf-holder">Nome impresso no cartão</label>
          <input
            id="tcf-holder" name="ccname" type="text" autoComplete="cc-name"
            autoCapitalize="characters" spellCheck={false} placeholder="Como está no cartão"
            value={holder} onChange={e => setHolder(e.target.value.slice(0, 60))}
            {...a11y('holder')} disabled={loading}
          />
          {show('holder')}
        </div>
        <div className={f.row2}>
          <div className={f.field}>
            <label htmlFor="tcf-expiry">Validade</label>
            <input
              id="tcf-expiry" name="cc-exp" type="text" inputMode="numeric"
              autoComplete="cc-exp" placeholder="MM/AA"
              value={expiry} onChange={e => setExpiry(maskExpiry(e.target.value))}
              {...a11y('expiry')} disabled={loading}
            />
            {show('expiry')}
          </div>
          <div className={f.field}>
            <label htmlFor="tcf-ccv">Código de segurança</label>
            <input
              id="tcf-ccv" name="cvc" type="password" inputMode="numeric"
              autoComplete="cc-csc" placeholder="CVV"
              value={ccv} onChange={e => setCcv(maskCcv(e.target.value))}
              {...a11y('ccv')} disabled={loading}
            />
            {show('ccv')}
          </div>
        </div>
      </fieldset>

      <fieldset className={`${styles.group} ${styles.groupHolder}`}>
        <legend className={styles.legend}>Titular do cartão</legend>
        <div className={f.field}>
          <label htmlFor="tcf-cpf">CPF ou CNPJ</label>
          <input
            id="tcf-cpf" name="cpfcnpj" type="text" inputMode="numeric" autoComplete="off"
            placeholder="000.000.000-00"
            value={cpf} onChange={e => setCpf(maskCpfCnpj(e.target.value))}
            {...a11y('cpf')} disabled={loading}
          />
          {show('cpf')}
        </div>
        <div className={f.field}>
          <label htmlFor="tcf-email">E-mail</label>
          <input
            id="tcf-email" name="email" type="email" inputMode="email" autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email} onChange={e => { emailTouched.current = true; setEmail(e.target.value) }}
            {...a11y('email')} disabled={loading}
          />
          {show('email')}
        </div>
        <div className={`${f.field} ${styles.span2}`}>
          <label htmlFor="tcf-phone">Telefone</label>
          <PhoneInput
            id="tcf-phone" value={phone} onChange={setPhone}
            {...a11y('phone')} disabled={loading}
          />
          {show('phone')}
        </div>
        <div className={`${f.row2} ${styles.rowFlat}`}>
          <div className={f.field}>
            <label htmlFor="tcf-cep">CEP</label>
            <input
              id="tcf-cep" name="postal-code" type="text" inputMode="numeric"
              autoComplete="postal-code" placeholder="00000-000"
              value={cep} onChange={e => setCep(maskCep(e.target.value))}
              {...a11y('cep')} disabled={loading}
            />
            {show('cep')}
          </div>
          <div className={f.field}>
            <label htmlFor="tcf-addressNumber">Número do endereço</label>
            <input
              id="tcf-addressNumber" name="address-number" type="text" inputMode="numeric"
              autoComplete="off" placeholder="Ex.: 120"
              value={addressNumber} onChange={e => setAddressNumber(e.target.value.slice(0, 10))}
              {...a11y('addressNumber')} disabled={loading}
            />
            {show('addressNumber')}
          </div>
        </div>
      </fieldset>

      <label className={styles.consent}>
        <input
          id="tcf-consent" type="checkbox" checked={accepted} disabled={loading}
          onChange={e => setAccepted(e.target.checked)}
          aria-invalid={consentMissing ? true : undefined}
          aria-describedby={consentMissing ? 'tcf-consent-err' : undefined}
        />
        <span>
          Autorizo a cobrança de {formatBrl(shown.firstValue)} em {dueLabel} e a renovação mensal de {formatBrl(shown.fullValue)} neste cartão. Posso cancelar quando quiser.
        </span>
      </label>
      {consentMissing && (
        <span id="tcf-consent-err" className={styles.fieldError} role="alert">Marque a autorização para continuar.</span>
      )}

      {serverError && <p className={f.error} role="alert">{serverError}</p>}

      <p className={`${styles.secureNote} ${styles.secureNoteMain}`}><LockIcon /> Não guardamos o número nem o código do seu cartão</p>

      <div className={styles.actions}>
        <button type="submit" className={`${btn.primary} ${styles.block}`} disabled={loading} aria-busy={loading}>
          {loading ? 'Cadastrando cartão...' : 'Cadastrar cartão e continuar'}
        </button>
        <button type="button" className={`${btn.ghost} ${styles.block}`} onClick={onBack} disabled={loading}>
          <Icon name="chevronLeft" size={16} /> Voltar
        </button>
      </div>
      </div>
    </form>
  )
}
