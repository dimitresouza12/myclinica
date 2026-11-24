// Assinatura no cartão: auth, validação, duplicidade, caminho feliz (com e sem promoção) e rollback no Asaas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { createFakeSupabase } from '@/test/fakeSupabase'
import { deveLimparCartao } from '@/lib/cartaoCheckout'

const CLINIC = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CARD_NUMBER = '4111111111111111'
const CCV = '737'

const h = vi.hoisted(() => ({
  session: null as unknown,
  fake: null as unknown,
  asaas: null as unknown,
}))

vi.mock('@/lib/sessionAuth', () => ({ requireSession: vi.fn(async () => h.session) }))
vi.mock('@/lib/supabaseAdmin', () => ({ getAdminClient: () => (h.fake as { db: unknown }).db }))
vi.mock('@/lib/asaas', () => ({ get realAsaas() { return h.asaas } }))

import { POST } from './route'

type Mock = { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
const asaas = () => h.asaas as Mock
const fake = () => h.fake as ReturnType<typeof createFakeSupabase>

function body(over: Record<string, unknown> = {}) {
  return {
    clinicId: CLINIC, plan: 'completo', aceite: true, expectedFullValue: 129.9,
    card: { holderName: 'FULANO DE TAL', number: CARD_NUMBER, expiryMonth: '12', expiryYear: '2030', ccv: CCV },
    holder: { name: 'Fulano de Tal', email: 'f@x.com', cpfCnpj: '52998224725', postalCode: '60000000', addressNumber: '100', phone: '85999998888' },
    ...over,
  }
}
const req = (b: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/asaas/assinatura-cartao', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.99, 203.0.113.9', ...headers },
    body: typeof b === 'string' ? b : JSON.stringify(b),
  })

function seed(over: Record<string, unknown> = {}) {
  return {
    clinics: [{
      id: CLINIC, name: 'Clinica X', plan: 'completo', created_at: '2026-11-25T13:00:00Z', trial_ends_at: '2026-12-08T13:00:00Z',
      billing_paid: false, asaas_subscription_id: null, billing_first_due: null,
      billing_promo_full_value: null, custom_monthly_price: null, ...over,
    }],
  }
}

let logs: string[]
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-26T12:00:00Z'))
  vi.stubEnv('ASAAS_ENV', 'sandbox')
  h.session = { userId: 'u1', clinicId: CLINIC, role: 'admin', isSuperadmin: false, displayName: null, email: null }
  h.fake = createFakeSupabase(seed())
  h.asaas = {
    get: vi.fn(async () => ({ data: [] })),
    post: vi.fn(async (path: string) => (path === '/customers' ? { id: 'cus_1' } : { id: 'sub_1' })),
    put: vi.fn(),
    delete: vi.fn(async () => ({ deleted: true })),
  }
  logs = []
  for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

const clinicRow = () => fake().tables.clinics[0]
const subscriptionCall = () => asaas().post.mock.calls.find(c => c[0] === '/subscriptions')

describe('POST /api/asaas/assinatura-cartao', () => {
  it('401 sem sessão', async () => {
    h.session = NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    expect((await POST(req(body()))).status).toBe(401)
    expect(asaas().post).not.toHaveBeenCalled()
  })

  it('503 sem chamar nada quando não é produção e o Asaas não está em sandbox', async () => {
    vi.stubEnv('ASAAS_ENV', '')
    const res = await POST(req(body()))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('Asaas sandbox não configurado')
    expect(asaas().get).not.toHaveBeenCalled()
    expect(asaas().post).not.toHaveBeenCalled()
    expect(clinicRow().billing_first_due).toBeNull()
    vi.stubEnv('ASAAS_ENV', 'production')
    expect((await POST(req(body()))).status).toBe(503)
  })

  it('403 para clínica de outra pessoa; superadmin passa da checagem', async () => {
    expect((await POST(req(body({ clinicId: OTHER })))).status).toBe(403)
    h.session = { ...(h.session as object), isSuperadmin: true }
    expect((await POST(req(body({ clinicId: OTHER })))).status).toBe(404) // passou o 403, clínica não existe
  })

  it.each([
    ['aceite ausente', { aceite: false }],
    ['cartão sem Luhn', { card: { holderName: 'F', number: '4111111111111112', expiryMonth: '12', expiryYear: '2030', ccv: CCV } }],
    ['cartão vencido', { card: { holderName: 'F', number: CARD_NUMBER, expiryMonth: '01', expiryYear: '2026', ccv: CCV } }],
    ['plano inválido', { plan: 'xyz' }],
    ['sem expectedFullValue', { expectedFullValue: undefined }],
  ])('400 de validação: %s', async (_n, over) => {
    const res = await POST(req(body(over)))
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(JSON.stringify(j)).not.toContain(CARD_NUMBER)
    expect(asaas().post).not.toHaveBeenCalled()
  })

  it('400 para JSON inválido', async () => {
    expect((await POST(req('{nao-json'))).status).toBe(400)
  })

  it('400 para plano fora da venda pública que não é o da clínica', async () => {
    expect((await POST(req(body({ plan: 'completo_plus' })))).status).toBe(400)
  })

  it('409 se a clínica já está paga ou já tem assinatura', async () => {
    for (const over of [{ billing_paid: true }, { asaas_subscription_id: 'sub_antiga' }]) {
      h.fake = createFakeSupabase(seed(over))
      const res = await POST(req(body()))
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBeTruthy()
    }
    expect(asaas().post).not.toHaveBeenCalled()
  })

  it('caminho feliz COM promoção (cadastro em 25/11): metade na 1ª cobrança, 15/01/2027, guarda o valor cheio', async () => {
    const res = await POST(req(body()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, firstDueDate: '2027-01-15', firstValue: 64.95, fullValue: 129.9, promo: true, cardLast4: null, cardBrand: null })

    const [, sent] = subscriptionCall()!
    expect(sent).toMatchObject({
      customer: 'cus_1', billingType: 'CREDIT_CARD', value: 64.95, nextDueDate: '2027-01-15', cycle: 'MONTHLY',
      externalReference: CLINIC, remoteIp: '203.0.113.9',
    })
    // a description aparece para o cliente: só o plano, sem IP, data nem aceite
    expect(sent.description).toBe('MyClinica - Plano Completo')
    expect(logs.join('\n')).toContain(`aceite registrado ${CLINIC}`)
    expect(logs.join('\n')).not.toContain('203.0.113.9')
    expect(sent).not.toHaveProperty('endDate')
    expect(clinicRow()).toMatchObject({
      asaas_subscription_id: 'sub_1', billing_first_due: '2027-01-15',
      billing_promo_full_value: 129.9, plan: 'completo',
    })
  })

  it('caminho feliz SEM promoção (cadastro fora da janela): valor cheio e coluna nula', async () => {
    h.fake = createFakeSupabase(seed({ created_at: '2026-11-10T13:00:00Z' }))
    const res = await POST(req(body()))
    expect(await res.json()).toEqual({ ok: true, firstDueDate: '2027-01-15', firstValue: 129.9, fullValue: 129.9, promo: false, cardLast4: null, cardBrand: null })
    expect(subscriptionCall()![1].value).toBe(129.9)
    expect(clinicRow().billing_promo_full_value).toBeNull()
  })

  it('preço congelado da clínica só vale para o plano atual dela', async () => {
    h.fake = createFakeSupabase(seed({ custom_monthly_price: 79.9, created_at: '2026-11-10T13:00:00Z' }))
    expect((await (await POST(req(body({ plan: 'completo', expectedFullValue: 79.9 })))).json()).fullValue).toBe(79.9)

    h.fake = createFakeSupabase(seed({ custom_monthly_price: 79.9, created_at: '2026-11-10T13:00:00Z' }))
    expect((await (await POST(req(body({ plan: 'essencial', expectedFullValue: 99.9 })))).json()).fullValue).toBe(99.9)
  })

  it('reaproveita o customer achado pelo externalReference (sem coluna) e o IP vem do x-real-ip', async () => {
    asaas().get.mockResolvedValueOnce({ data: [{ id: 'cus_old' }] })
    const r = new Request('http://localhost/x', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.7' }, body: JSON.stringify(body()),
    })
    expect((await POST(r)).status).toBe(200)
    expect(asaas().get.mock.calls[0][0]).toContain(`externalReference=${CLINIC}`)
    expect(asaas().post.mock.calls.some(c => c[0] === '/customers')).toBe(false)
    expect(subscriptionCall()![1]).toMatchObject({ customer: 'cus_old', remoteIp: '198.51.100.7' })
    expect(clinicRow()).not.toHaveProperty('asaas_customer_real_id')
  })

  it('cartão recusado: 422 com mensagem curta, reserva liberada, nada do Asaas cru na resposta nem de cartão no log', async () => {
    asaas().post.mockImplementation(async (path: string) => {
      if (path === '/customers') return { id: 'cus_1' }
      throw new Error(`Asaas POST /subscriptions: {"errors":[{"code":"invalid_creditCard","description":"Recusado ${CARD_NUMBER} ${CCV}"}]}`)
    })
    const res = await POST(req(body()))
    expect(res.status).toBe(422)
    const text = JSON.stringify(await res.json())
    expect(text).toContain('Cartão recusado')
    expect(text).not.toMatch(/invalid_creditCard|Recusado|4111/)
    expect(clinicRow().billing_first_due).toBeNull()
    expect(clinicRow().asaas_subscription_id).toBeNull()
    const all = logs.join('\n')
    for (const secret of [CARD_NUMBER, CCV, '2030', 'FULANO', '52998224725', 'f@x.com', '60000000']) expect(all).not.toContain(secret)
  })

  it.each([
    ['O CEP informado é inválido.', 'CEP não encontrado. Confira o CEP do titular.', 'cep'],
    ['CPF ou CNPJ inválido.', 'CPF ou CNPJ do titular inválido.', 'documento'],
    ['O telefone informado é inválido.', 'Telefone do titular inválido.', 'telefone'],
  ])('invalid_creditCard por dado do titular (%s): 422 com mensagem específica, sem limpar o cartão no front', async (description, mensagem, field) => {
    asaas().post.mockImplementation(async (path: string) => {
      if (path === '/customers') return { id: 'cus_1' }
      throw new Error(`Asaas POST /subscriptions: ${JSON.stringify({ errors: [{ code: 'invalid_creditCard', description }] })}`)
    })
    const res = await POST(req(body()))
    expect(res.status).toBe(422)
    const j = await res.json()
    expect(j).toEqual({ error: mensagem, code: 'titular_invalido', field })
    expect(deveLimparCartao(res.status, j.code, j.error)).toBe(false)
    expect(clinicRow()).toMatchObject({ billing_first_due: null, billing_promo_full_value: null, asaas_subscription_id: null })
  })

  it('cartão recusado de verdade devolve code cartao_recusado e o front limpa o cartão', async () => {
    asaas().post.mockImplementation(async (path: string) => {
      if (path === '/customers') return { id: 'cus_1' }
      throw new Error('Asaas POST /subscriptions: {"errors":[{"code":"invalid_creditCard","description":"Transação não autorizada."}]}')
    })
    const res = await POST(req(body()))
    const j = await res.json()
    expect(j.code).toBe('cartao_recusado')
    expect(deveLimparCartao(res.status, j.code, j.error)).toBe(true)
  })

  it('outro erro de dados (não invalid_creditCard): 422 genérico com code dados_invalidos, sem limpar o cartão', async () => {
    asaas().post.mockImplementation(async (path: string) => {
      if (path === '/customers') return { id: 'cus_1' }
      throw new Error('Asaas POST /subscriptions: {"errors":[{"code":"invalid_action","description":"x"}]}')
    })
    const res = await POST(req(body()))
    const j = await res.json()
    expect(res.status).toBe(422)
    expect(j).toEqual({ error: 'Dados inválidos. Confira os dados do cartão e do titular.', code: 'dados_invalidos' })
    expect(deveLimparCartao(res.status, j.code, j.error)).toBe(false)
  })

  it('banco falha depois de criar a assinatura: cancela no Asaas (DELETE), libera a reserva e devolve erro', async () => {
    h.fake = createFakeSupabase(seed(), {
      failOn: (table, op, payload) => (table === 'clinics' && op === 'update' && payload && 'asaas_subscription_id' in payload
        ? { code: 'XX000', message: 'boom' }
        : undefined),
    })
    const res = await POST(req(body()))
    expect(res.status).toBe(500)
    expect(asaas().delete).toHaveBeenCalledWith('/subscriptions/sub_1')
    expect(clinicRow().billing_first_due).toBeNull()
    expect(clinicRow().asaas_subscription_id).toBeNull()
    const all = logs.join('\n')
    for (const secret of [CARD_NUMBER, CCV, '52998224725']) expect(all).not.toContain(secret)
  })

  it('banco falha e o cancelamento também: mantém a reserva (sem 2ª assinatura) e registra ATENCAO', async () => {
    h.fake = createFakeSupabase(seed(), {
      failOn: (table, op, payload) => (table === 'clinics' && op === 'update' && payload && 'asaas_subscription_id' in payload
        ? { code: 'XX000', message: 'boom' }
        : undefined),
    })
    asaas().delete.mockRejectedValueOnce(new Error('rede'))
    expect((await POST(req(body()))).status).toBe(500)
    expect(clinicRow().billing_first_due).toBe('2027-01-15')
    expect(logs.join('\n')).toContain('ATENCAO assinatura criada no Asaas e nao cancelada')
  })

  it('dois pedidos em sequência: o segundo bate na reserva e recebe 409 sem criar outra assinatura', async () => {
    expect((await POST(req(body()))).status).toBe(200)
    expect((await POST(req(body()))).status).toBe(409)
    expect(asaas().post.mock.calls.filter(c => c[0] === '/subscriptions')).toHaveLength(1)
  })

  it('200 traz cardLast4 e cardBrand do que o Asaas devolveu, e o número nunca vai ao banco nem ao log', async () => {
    asaas().post.mockImplementation(async (path: string) => (path === '/customers'
      ? { id: 'cus_1' }
      : { id: 'sub_1', creditCard: { creditCardNumber: '8829', creditCardBrand: 'VISA' } }))
    const j = await (await POST(req(body()))).json()
    expect(j).toMatchObject({ ok: true, cardLast4: '8829', cardBrand: 'VISA' })
    expect(JSON.stringify(clinicRow())).not.toContain('VISA')
    expect(logs.join('\n')).not.toMatch(/8829|VISA/)
  })

  it('assinatura adotada: cardLast4/cardBrand vêm do creditCard da assinatura achada, ou null', async () => {
    h.fake = createFakeSupabase(seed({ billing_first_due: '2027-01-15', billing_promo_full_value: 129.9 }))
    asaas().get.mockImplementation(async (path: string) => (path.startsWith('/subscriptions')
      ? { data: [{ id: 'sub_achada', status: 'ACTIVE', billingType: 'CREDIT_CARD', value: 64.95, creditCard: { creditCardNumber: '8829', creditCardBrand: 'MASTERCARD' } }] }
      : { data: [] }))
    expect(await (await POST(req(body()))).json()).toMatchObject({ ok: true, cardLast4: '8829', cardBrand: 'MASTERCARD' })
  })

  it('IP: cf-connecting-ip vence x-real-ip, que vence o último item de x-forwarded-for; valor inválido é ignorado', async () => {
    const ips: string[] = []
    const cases: Record<string, string>[] = [
      { 'cf-connecting-ip': '192.0.2.1', 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
      { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
      { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
      { 'cf-connecting-ip': 'lixo<script>', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' },
    ]
    for (const headers of cases) {
      h.fake = createFakeSupabase(seed())
      asaas().post.mockClear()
      const r = new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body()) })
      expect((await POST(r)).status).toBe(200)
      ips.push(subscriptionCall()![1].remoteIp)
    }
    expect(ips).toEqual(['192.0.2.1', '198.51.100.7', '2.2.2.2', '2.2.2.2'])
  })

  it('promo só vale com a campanha ativa: cadastro na janela, mas assinatura depois de 15/12, cobra o valor cheio', async () => {
    vi.setSystemTime(new Date('2026-12-20T12:00:00Z'))
    const res = await POST(req(body()))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, firstValue: 129.9, fullValue: 129.9, promo: false })
    expect(subscriptionCall()![1].value).toBe(129.9)
    expect(clinicRow().billing_promo_full_value).toBeNull()
  })

  it('valor diferente do mostrado: 409 valor_diferente, sem tocar no Asaas nem na reserva', async () => {
    const res = await POST(req(body({ expectedFullValue: 99.9 })))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'valor_diferente', fullValue: 129.9, firstValue: 64.95, promo: true })
    expect(asaas().get).not.toHaveBeenCalled()
    expect(asaas().post).not.toHaveBeenCalled()
    expect(clinicRow().billing_first_due).toBeNull()
    expect(clinicRow().billing_promo_full_value).toBeNull()
  })

  it('a reserva grava billing_first_due e billing_promo_full_value no MESMO update, antes de chamar o Asaas', async () => {
    h.fake = createFakeSupabase(seed())
    await POST(req(body()))
    const claim = fake().calls.find(c => c.table === 'clinics' && c.op === 'update')!
    expect(claim.payload).toEqual({ billing_first_due: '2027-01-15', billing_promo_full_value: 129.9 })
    const final = fake().calls.filter(c => c.table === 'clinics' && c.op === 'update')[1]
    expect(final.payload).toEqual({ asaas_subscription_id: 'sub_1', plan: 'completo' })
  })

  it('falha de cartão libera os DOIS campos da reserva', async () => {
    asaas().post.mockImplementation(async (path: string) => {
      if (path === '/customers') return { id: 'cus_1' }
      throw new Error('Asaas POST /subscriptions: {"errors":[{"code":"invalid_creditCard"}]}')
    })
    expect((await POST(req(body()))).status).toBe(422)
    expect(clinicRow()).toMatchObject({ billing_first_due: null, billing_promo_full_value: null, asaas_subscription_id: null })
  })

  describe('reserva presa (billing_first_due preenchido, sem asaas_subscription_id)', () => {
    const stuck = (over: Record<string, unknown> = {}) =>
      createFakeSupabase(seed({ billing_first_due: '2027-01-15', billing_promo_full_value: 129.9, ...over }))
    const getBy = (subs: unknown[]) => asaas().get.mockImplementation(async (path: string) => (path.startsWith('/subscriptions') ? { data: subs } : { data: [] }))

    it('assinatura ativa de cartão no Asaas: adota o id e responde ok com os valores, sem criar outra', async () => {
      h.fake = stuck()
      getBy([{ id: 'sub_achada', status: 'ACTIVE', billingType: 'CREDIT_CARD', externalReference: CLINIC, value: 64.95 }])
      const res = await POST(req(body()))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, firstDueDate: '2027-01-15', firstValue: 64.95, fullValue: 129.9, promo: true, cardLast4: null, cardBrand: null })
      expect(asaas().get.mock.calls[0][0]).toBe(`/subscriptions?externalReference=${CLINIC}&limit=20`)
      expect(asaas().post).not.toHaveBeenCalled()
      expect(clinicRow()).toMatchObject({ asaas_subscription_id: 'sub_achada', plan: 'completo', billing_promo_full_value: 129.9 })
    })

    it('ignora assinatura apagada, inativa ou de boleto: retoma a reserva e cria a assinatura', async () => {
      h.fake = stuck()
      getBy([
        { id: 'a', status: 'INACTIVE', billingType: 'CREDIT_CARD' },
        { id: 'b', status: 'ACTIVE', billingType: 'BOLETO' },
        { id: 'c', status: 'ACTIVE', billingType: 'CREDIT_CARD', deleted: true },
      ])
      const res = await POST(req(body()))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ok: true, firstValue: 64.95, promo: true })
      expect(asaas().post.mock.calls.filter(c => c[0] === '/subscriptions')).toHaveLength(1)
      expect(clinicRow()).toMatchObject({ asaas_subscription_id: 'sub_1', billing_first_due: '2027-01-15', billing_promo_full_value: 129.9 })
    })

    it('nada no Asaas: retoma a reserva com os valores recalculados', async () => {
      h.fake = stuck({ billing_promo_full_value: null })
      const res = await POST(req(body()))
      expect(res.status).toBe(200)
      expect(clinicRow()).toMatchObject({ asaas_subscription_id: 'sub_1', billing_promo_full_value: 129.9 })
    })

    it('consulta ao Asaas falhou: 502 e a reserva fica como estava', async () => {
      h.fake = stuck()
      asaas().get.mockRejectedValue(new Error('rede'))
      expect((await POST(req(body()))).status).toBe(502)
      expect(asaas().post).not.toHaveBeenCalled()
      expect(clinicRow()).toMatchObject({ billing_first_due: '2027-01-15', billing_promo_full_value: 129.9, asaas_subscription_id: null })
    })

    it('valor diferente do mostrado vale também aqui: 409 sem consultar o Asaas', async () => {
      h.fake = stuck()
      const res = await POST(req(body({ expectedFullValue: 1 })))
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('valor_diferente')
      expect(asaas().get).not.toHaveBeenCalled()
    })
  })

  it('corrida: outra assinatura gravada enquanto esta era criada. A duplicada é cancelada no Asaas e a gravada permanece', async () => {
    asaas().post.mockImplementation(async (path: string) => {
      if (path === '/customers') return { id: 'cus_1' }
      clinicRow().asaas_subscription_id = 'sub_do_outro_pedido' // o outro pedido termina no meio do nosso
      return { id: 'sub_1' }
    })
    const res = await POST(req(body()))
    expect(res.status).toBe(409)
    expect(asaas().delete).toHaveBeenCalledWith('/subscriptions/sub_1')
    expect(clinicRow().asaas_subscription_id).toBe('sub_do_outro_pedido')
    expect(clinicRow().billing_first_due).toBe('2027-01-15')
  })
})
