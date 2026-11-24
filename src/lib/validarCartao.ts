// Validação estrita (servidor) dos dados de cartão e do titular da assinatura no cartão. Pura e sem log.
// As mensagens de erro dizem QUAL campo falhou, nunca devolvem o valor digitado.

import { hojeBrasil } from '@/lib/brasilDate'
import { isValidCnpj, isValidCpf, luhnValido } from '@/lib/cartaoCheckout'
import { isSellablePlan, type SellablePlan } from '@/lib/planCatalog'
import { isValidBrPhone, normalizeBrPhone } from '@/lib/whatsapp/phone'
import type { CardData, CardHolderInfo } from '@/lib/asaasCartao'

// Luhn, CPF e CNPJ têm uma única implementação (cartaoCheckout.ts, funções puras sem React); o cliente usa a mesma.
export { luhnValido, isValidCnpj }

export interface AssinaturaCartaoInput {
  clinicId: string
  plan: SellablePlan
  card: CardData
  holder: CardHolderInfo
  /** Valor cheio mensal que a tela mostrou ao cliente; a rota recusa se o servidor calcular outro. */
  expectedFullValue: number
}

export type ValidacaoCartao = { ok: true; value: AssinaturaCartaoInput } | { ok: false; error: string }

const fail = (error: string): ValidacaoCartao => ({ ok: false, error })
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 && t.length <= max ? t : null
}
const digitsOnly = (v: unknown): string => (typeof v === 'string' ? v.replace(/\D/g, '') : '')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Valida o corpo inteiro de POST /api/asaas/assinatura-cartao. `now` é o instante do servidor (validade do cartão). */
export function validarAssinaturaCartao(body: unknown, now: Date = new Date()): ValidacaoCartao {
  if (!isObj(body)) return fail('Corpo inválido.')
  const clinicId = text(body.clinicId, 64)
  if (!clinicId) return fail('clinicId obrigatório.')
  if (body.aceite !== true) return fail('É preciso aceitar os termos para continuar.')
  const plan = body.plan
  if (typeof plan !== 'string' || !isSellablePlan(plan)) return fail('Plano inválido.')
  const expectedFullValue = body.expectedFullValue
  if (typeof expectedFullValue !== 'number' || !Number.isFinite(expectedFullValue) || expectedFullValue <= 0 || expectedFullValue > 100000) {
    return fail('Valor da assinatura ausente ou inválido.')
  }

  if (!isObj(body.card)) return fail('Dados do cartão ausentes.')
  const c = body.card
  const holderName = text(c.holderName, 100)
  if (!holderName) return fail('Nome impresso no cartão inválido.')
  const number = typeof c.number === 'string' ? c.number : ''
  if (!/^\d{13,19}$/.test(number) || !luhnValido(number)) return fail('Número do cartão inválido.')
  const expiryMonth = typeof c.expiryMonth === 'string' ? c.expiryMonth : ''
  if (!/^(0[1-9]|1[0-2])$/.test(expiryMonth)) return fail('Mês de validade inválido.')
  const expiryYear = typeof c.expiryYear === 'string' ? c.expiryYear : ''
  if (!/^\d{4}$/.test(expiryYear)) return fail('Ano de validade inválido.')
  // O cartão vale até o fim do mês de validade.
  const mesAtual = hojeBrasil(now).slice(0, 7)
  if (`${expiryYear}-${expiryMonth}` < mesAtual) return fail('Cartão vencido.')
  const ccv = typeof c.ccv === 'string' ? c.ccv : ''
  if (!/^\d{3,4}$/.test(ccv)) return fail('Código de segurança inválido.')

  if (!isObj(body.holder)) return fail('Dados do titular ausentes.')
  const h = body.holder
  const name = text(h.name, 100)
  if (!name) return fail('Nome do titular inválido.')
  const email = text(h.email, 120)
  if (!email || !EMAIL_RE.test(email)) return fail('E-mail do titular inválido.')
  const cpfCnpj = digitsOnly(h.cpfCnpj)
  if (!(cpfCnpj.length === 11 ? isValidCpf(cpfCnpj) : cpfCnpj.length === 14 ? isValidCnpj(cpfCnpj) : false)) {
    return fail('CPF ou CNPJ do titular inválido.')
  }
  const postalCode = digitsOnly(h.postalCode)
  if (!/^\d{8}$/.test(postalCode)) return fail('CEP inválido.')
  const addressNumber = text(h.addressNumber, 20)
  if (!addressNumber) return fail('Número do endereço inválido.')
  const phone = normalizeBrPhone(typeof h.phone === 'string' ? h.phone : '')
  if (!phone || !isValidBrPhone(phone)) return fail('Telefone do titular inválido.')

  return {
    ok: true,
    value: {
      clinicId, plan, expectedFullValue,
      card: { holderName, number, expiryMonth, expiryYear, ccv },
      holder: { name, email, cpfCnpj, postalCode, addressNumber, phone },
    },
  }
}
