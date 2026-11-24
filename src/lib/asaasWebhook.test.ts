import { describe, expect, it, vi } from 'vitest'
import type { AsaasApi } from '@/lib/asaas'
import { createFakeSupabase } from '@/test/fakeSupabase'
import { processAsaasEvent } from './asaasWebhook'

const CLINIC = '11111111-1111-4111-8111-111111111111'

function api(): AsaasApi & { put: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } {
  return { post: vi.fn(), get: vi.fn(), put: vi.fn(async () => ({})) } as never
}

const paid = (id = 'pay_1', event = 'PAYMENT_CONFIRMED') => ({
  event,
  payment: { id, externalReference: CLINIC, subscription: 'sub_1', value: 64.95, dueDate: '2027-01-15' },
})

function seed(over: Record<string, unknown> = {}) {
  return {
    clinics: [{ id: CLINIC, billing_paid: false, billing_overdue_since: null, asaas_subscription_id: 'sub_1', billing_promo_full_value: 129.9, ...over }],
  }
}

describe('webhook: valor cheio da assinatura depois da 1ª cobrança promocional', () => {
  it('promo pendente: troca o valor uma vez e só depois zera a coluna', async () => {
    const { db, tables } = createFakeSupabase(seed())
    const a = api()
    a.put.mockImplementation(async () => {
      // No momento do PUT a coluna ainda tem o valor cheio.
      expect(tables.clinics[0].billing_promo_full_value).toBe(129.9)
      return {}
    })
    await processAsaasEvent(db, paid(), new Date(), a)
    expect(a.put).toHaveBeenCalledTimes(1)
    expect(a.put).toHaveBeenCalledWith('/subscriptions/sub_1', { value: 129.9, updatePendingPayments: true })
    expect(tables.clinics[0].billing_promo_full_value).toBeNull()
    expect(tables.clinics[0].billing_paid).toBe(true)
  })

  it('PAYMENT_RECEIVED seguinte (outro evento do mesmo pagamento) não repete a troca', async () => {
    const { db } = createFakeSupabase(seed())
    const a = api()
    await processAsaasEvent(db, paid('pay_1', 'PAYMENT_CONFIRMED'), new Date(), a)
    await processAsaasEvent(db, paid('pay_1', 'PAYMENT_RECEIVED'), new Date(), a)
    expect(a.put).toHaveBeenCalledTimes(1)
  })

  it('sem promo pendente: não chama o Asaas', async () => {
    const { db, tables } = createFakeSupabase(seed({ billing_promo_full_value: null }))
    const a = api()
    await processAsaasEvent(db, paid(), new Date(), a)
    expect(a.put).not.toHaveBeenCalled()
    expect(tables.clinics[0].billing_paid).toBe(true)
  })

  it('pagamento sem assinatura: não chama o Asaas e mantém a promo', async () => {
    const { db, tables } = createFakeSupabase(seed())
    const a = api()
    await processAsaasEvent(db, { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_x', externalReference: CLINIC } }, new Date(), a)
    expect(a.put).not.toHaveBeenCalled()
    expect(tables.clinics[0].billing_promo_full_value).toBe(129.9)
  })

  it('pagamento de outra assinatura que não a da clínica: ignora a promo', async () => {
    const { db, tables } = createFakeSupabase(seed({ asaas_subscription_id: 'sub_outra' }))
    const a = api()
    await processAsaasEvent(db, paid(), new Date(), a)
    expect(a.put).not.toHaveBeenCalled()
    expect(tables.clinics[0].billing_promo_full_value).toBe(129.9)
    expect(tables.clinics[0].asaas_subscription_id).toBe('sub_outra') // não sobrescreve
  })

  it('clínica sem assinatura gravada: adota a do pagamento; com assinatura gravada: não troca', async () => {
    const semId = createFakeSupabase(seed({ asaas_subscription_id: null, billing_promo_full_value: null }))
    await processAsaasEvent(semId.db, paid(), new Date(), api())
    expect(semId.tables.clinics[0].asaas_subscription_id).toBe('sub_1')

    const comId = createFakeSupabase(seed({ asaas_subscription_id: 'sub_antiga', billing_promo_full_value: null }))
    await processAsaasEvent(comId.db, paid(), new Date(), api())
    expect(comId.tables.clinics[0].asaas_subscription_id).toBe('sub_antiga')
    expect(comId.tables.clinics[0].billing_paid).toBe(true)
  })

  it('promo gravada na reserva (clínica ainda sem asaas_subscription_id): troca o valor e adota o id', async () => {
    const { db, tables } = createFakeSupabase(seed({ asaas_subscription_id: null }))
    const a = api()
    await processAsaasEvent(db, paid(), new Date(), a)
    expect(a.put).toHaveBeenCalledWith('/subscriptions/sub_1', { value: 129.9, updatePendingPayments: true })
    expect(tables.clinics[0]).toMatchObject({ asaas_subscription_id: 'sub_1', billing_promo_full_value: null })
  })

  it('falha do PUT lança, não zera a coluna e libera o evento para o Asaas reenviar', async () => {
    const { db, tables } = createFakeSupabase(seed())
    const a = api()
    a.put.mockRejectedValueOnce(new Error('Asaas PUT: 500'))
    await expect(processAsaasEvent(db, paid(), new Date(), a)).rejects.toThrow('Asaas PUT')
    expect(tables.clinics[0].billing_promo_full_value).toBe(129.9)
    expect(tables.asaas_payment_events ?? []).toHaveLength(0)

    // O reenvio refaz e dessa vez conclui.
    await processAsaasEvent(db, paid(), new Date(), a)
    expect(a.put).toHaveBeenCalledTimes(2)
    expect(tables.clinics[0].billing_promo_full_value).toBeNull()
  })

  it('reenvio duplicado do mesmo evento não repete a troca', async () => {
    const { db } = createFakeSupabase(seed())
    const a = api()
    const first = await processAsaasEvent(db, paid(), new Date(), a)
    const again = await processAsaasEvent(db, paid(), new Date(), a)
    expect(first.handled).toBe(true)
    expect(again).toMatchObject({ handled: false, reason: 'duplicado' })
    expect(a.put).toHaveBeenCalledTimes(1)
  })

  it('coluna ainda inexistente (migração não aplicada): o webhook segue sem chamar o Asaas', async () => {
    const { db, tables } = createFakeSupabase(seed(), {
      failOn: (table, op) => (table === 'clinics' && op === 'select'
        ? { code: '42703', message: 'column clinics.billing_promo_full_value does not exist' }
        : undefined),
    })
    const a = api()
    await expect(processAsaasEvent(db, paid(), new Date(), a)).resolves.toMatchObject({ handled: true })
    expect(a.put).not.toHaveBeenCalled()
    expect(tables.clinics[0].billing_paid).toBe(true)
  })
})
