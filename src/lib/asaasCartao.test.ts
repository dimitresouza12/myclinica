import { describe, expect, it, vi } from 'vitest'
import type { AsaasApi } from '@/lib/asaas'
import { AsaasCardError, cardSummaryFrom, createCardSubscription, fixSubscriptionValue, type CardSubscriptionInput } from './asaasCartao'
import { valorPrimeiraCobranca } from './promoPrimeiraCobranca'

const CARD_NUMBER = '4111111111111111'
const CCV = '737'

function input(over: Partial<CardSubscriptionInput> = {}): CardSubscriptionInput {
  return {
    customerId: 'cus_1', clinicId: '11111111-1111-4111-8111-111111111111', value: 129.9, firstDueDate: '2027-01-15',
    description: 'MyClinica - Plano Completo',
    card: { holderName: 'FULANO DE TAL', number: CARD_NUMBER, expiryMonth: '12', expiryYear: '2030', ccv: CCV },
    holder: { name: 'Fulano de Tal', email: 'f@x.com', cpfCnpj: '52998224725', postalCode: '60000000', addressNumber: '100', phone: '85999998888' },
    remoteIp: '203.0.113.9',
    ...over,
  }
}

function mockApi(post: AsaasApi['post']): AsaasApi & { post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> } {
  return { post: vi.fn(post), get: vi.fn(), put: vi.fn(async () => ({})) } as never
}

describe('createCardSubscription', () => {
  it('envia o corpo certo: CREDIT_CARD, mensal, sem endDate, ip e holder', async () => {
    const api = mockApi(async () => ({ id: 'sub_9' }) as never)
    const out = await createCardSubscription(api, input())
    expect(out).toEqual({ id: 'sub_9', cardLast4: null, cardBrand: null })
    expect(api.post).toHaveBeenCalledTimes(1)
    const [path, body] = api.post.mock.calls[0]
    expect(path).toBe('/subscriptions')
    expect(body).toEqual({
      customer: 'cus_1',
      billingType: 'CREDIT_CARD',
      value: 129.9,
      nextDueDate: '2027-01-15',
      cycle: 'MONTHLY',
      description: 'MyClinica - Plano Completo',
      externalReference: '11111111-1111-4111-8111-111111111111',
      creditCard: { holderName: 'FULANO DE TAL', number: CARD_NUMBER, expiryMonth: '12', expiryYear: '2030', ccv: CCV },
      creditCardHolderInfo: {
        name: 'Fulano de Tal', email: 'f@x.com', cpfCnpj: '52998224725', postalCode: '60000000', addressNumber: '100',
        mobilePhone: '85999998888',
      },
      remoteIp: '203.0.113.9',
    })
    expect(body).not.toHaveProperty('endDate')
  })

  it('telefone fixo (10 dígitos) vai em phone, não em mobilePhone', async () => {
    const api = mockApi(async () => ({ id: 'sub_9' }) as never)
    await createCardSubscription(api, input({ holder: { ...input().holder, phone: '8532221111' } }))
    const holder = api.post.mock.calls[0][1].creditCardHolderInfo
    expect(holder.phone).toBe('8532221111')
    expect(holder).not.toHaveProperty('mobilePhone')
  })

  it('valor da primeira cobrança com 50% de desconto é o que vai no corpo', async () => {
    const api = mockApi(async () => ({ id: 'sub_9' }) as never)
    await createCardSubscription(api, input({ value: valorPrimeiraCobranca(129.9, true) }))
    expect(api.post.mock.calls[0][1].value).toBe(64.95)
  })

  it('cartão recusado: erro categorizado, sem número, CVV nem corpo cru na mensagem', async () => {
    const raw = `Asaas POST /subscriptions: {"errors":[{"code":"invalid_creditCard","description":"Transação não autorizada ${CARD_NUMBER} ccv ${CCV}"}]}`
    const api = mockApi(async () => { throw new Error(raw) })
    const err = await createCardSubscription(api, input()).catch(e => e)
    expect(err).toBeInstanceOf(AsaasCardError)
    expect(err.kind).toBe('recusado')
    expect(err.codes).toEqual(['invalid_creditCard'])
    for (const secret of [CARD_NUMBER, CCV, '2030', 'Transação', 'FULANO', '52998224725']) {
      expect(err.message).not.toContain(secret)
    }
    expect(JSON.stringify(err)).not.toContain(CARD_NUMBER)
  })

  it('outro código do Asaas: invalido; sem corpo reconhecível: indisponivel', async () => {
    const inv = mockApi(async () => { throw new Error('Asaas POST /subscriptions: {"errors":[{"code":"invalid_customer","description":"x"}]}') })
    const e1 = await createCardSubscription(inv, input()).catch(e => e)
    expect(e1.kind).toBe('invalido')
    const down = mockApi(async () => { throw new Error('fetch failed') })
    const e2 = await createCardSubscription(down, input()).catch(e => e)
    expect(e2.kind).toBe('indisponivel')
    expect(e2.message).not.toContain(CARD_NUMBER)
  })

  it.each([
    ['O CEP informado é inválido.', 'cep'],
    ['CPF/CNPJ inválido para o titular.', 'documento'],
    ['O cpf do titular não confere', 'documento'],
    ['Telefone informado é inválido.', 'telefone'],
    ['O celular do titular é inválido', 'telefone'],
  ])('invalid_creditCard citando dado do titular (%s) é invalido/%s, não recusado', async (description, field) => {
    const api = mockApi(async () => { throw new Error(`Asaas POST /subscriptions: ${JSON.stringify({ errors: [{ code: 'invalid_creditCard', description }] })}`) })
    const err = await createCardSubscription(api, input()).catch(e => e)
    expect(err).toBeInstanceOf(AsaasCardError)
    expect(err.kind).toBe('invalido')
    expect(err.field).toBe(field)
    expect(err.message).not.toContain(description)
  })

  it('invalid_creditCard sem dado do titular na description continua recusado (field nulo)', async () => {
    for (const description of ['Transação não autorizada.', 'Cartão inválido', undefined]) {
      const api = mockApi(async () => { throw new Error(`Asaas POST /subscriptions: ${JSON.stringify({ errors: [{ code: 'invalid_creditCard', description }] })}`) })
      const err = await createCardSubscription(api, input()).catch(e => e)
      expect(err.kind).toBe('recusado')
      expect(err.field).toBeNull()
    }
  })

  it('devolve 4 últimos dígitos e bandeira lidos da resposta do Asaas; sem creditCard vira null', async () => {
    const withCard = mockApi(async () => ({ id: 'sub_1', creditCard: { creditCardNumber: '8829', creditCardBrand: 'MASTERCARD', creditCardToken: 'tok' } }) as never)
    expect(await createCardSubscription(withCard, input())).toEqual({ id: 'sub_1', cardLast4: '8829', cardBrand: 'MASTERCARD' })
    const without = mockApi(async () => ({ id: 'sub_2' }) as never)
    expect(await createCardSubscription(without, input())).toEqual({ id: 'sub_2', cardLast4: null, cardBrand: null })
  })

  it('cardSummaryFrom só aceita 4 dígitos e bandeira simples; nunca usa o que o cliente enviou', () => {
    expect(cardSummaryFrom({ creditCardNumber: '411111111111', creditCardBrand: 'VISA' })).toEqual({ cardLast4: null, cardBrand: 'VISA' })
    expect(cardSummaryFrom({ creditCardNumber: 1234, creditCardBrand: '<b>x</b>' })).toEqual({ cardLast4: null, cardBrand: null })
    expect(cardSummaryFrom(null)).toEqual({ cardLast4: null, cardBrand: null })
    // o Asaas sem creditCard: o número enviado (CARD_NUMBER) não pode virar last4
    expect(JSON.stringify(cardSummaryFrom(undefined))).not.toContain(CARD_NUMBER.slice(-4))
  })

  it('resposta sem id vira erro', async () => {
    const api = mockApi(async () => ({}) as never)
    await expect(createCardSubscription(api, input())).rejects.toBeInstanceOf(AsaasCardError)
  })
})

describe('fixSubscriptionValue', () => {
  it('PUT /subscriptions/{id} com value e updatePendingPayments:true', async () => {
    const api = mockApi(async () => ({}) as never)
    await fixSubscriptionValue(api, 'sub_9', 129.9)
    expect(api.put).toHaveBeenCalledWith('/subscriptions/sub_9', { value: 129.9, updatePendingPayments: true })
  })

  it('propaga a falha do Asaas', async () => {
    const api = mockApi(async () => ({}) as never)
    api.put.mockRejectedValueOnce(new Error('Asaas PUT: 500'))
    await expect(fixSubscriptionValue(api, 'sub_9', 129.9)).rejects.toThrow('Asaas PUT')
  })
})
