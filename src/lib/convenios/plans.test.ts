import { describe, expect, it } from 'vitest'
import {
  ansRegistryError, carteirinhaStatus, findPlan, maskAnsRegistry, normalizePrices, planDraftToColumns, planPrice, toInsurancePlan, validatePlanDraft,
} from './plans'
import type { InsurancePlan } from './types'

const plan = (over: Partial<InsurancePlan> = {}): InsurancePlan => ({
  id: 'p1', clinic_id: 'c1', name: 'Unimed Fortaleza', ans_registry: '393321', procedure_prices: { proc1: 120 }, notes: null, is_active: true, ...over,
})

describe('registro ANS', () => {
  it('máscara deixa só até 6 números', () => {
    expect(maskAnsRegistry('39-33.21x99')).toBe('393321')
  })
  it('vazio vale; diferente de 6 números não', () => {
    expect(ansRegistryError('')).toBeNull()
    expect(ansRegistryError('393321')).toBeNull()
    expect(ansRegistryError('1234')).toMatch(/6 números/)
  })
})

describe('tabela de valores', () => {
  it('só mantém valores numéricos não negativos', () => {
    expect(normalizePrices({ a: 10, b: '25,5', c: -1, d: 'x', e: null, '': 3 })).toEqual({ a: 10, b: 25.5 })
    expect(normalizePrices(null)).toEqual({})
    expect(normalizePrices([1, 2])).toEqual({})
  })
  it('planPrice devolve null sem plano, sem procedimento ou sem valor', () => {
    expect(planPrice(plan(), 'proc1')).toBe(120)
    expect(planPrice(plan(), 'proc2')).toBeNull()
    expect(planPrice(null, 'proc1')).toBeNull()
    expect(planPrice(plan(), null)).toBeNull()
  })
  it('rascunho vira colunas: campo vazio fica de fora, ANS vazio vira null', () => {
    const cols = planDraftToColumns({ name: '  Amil ', ans_registry: '', notes: ' ', prices: { a: '150.00', b: '' } })
    expect(cols).toEqual({ name: 'Amil', ans_registry: null, notes: null, procedure_prices: { a: 150 } })
  })
  it('valida nome e ANS', () => {
    expect(validatePlanDraft({ name: 'A', ans_registry: '', notes: '', prices: {} })).toMatch(/nome/i)
    expect(validatePlanDraft({ name: 'Amil', ans_registry: '12', notes: '', prices: {} })).toMatch(/6 números/)
    expect(validatePlanDraft({ name: 'Amil', ans_registry: '326305', notes: '', prices: {} })).toBeNull()
  })
  it('toInsurancePlan tolera linha incompleta', () => {
    const p = toInsurancePlan({ id: 'x', clinic_id: 'c', name: 'Cassi', procedure_prices: { a: '9' } })
    expect(p).toMatchObject({ id: 'x', ans_registry: null, is_active: true, procedure_prices: { a: 9 } })
  })
})

describe('findPlan', () => {
  const plans = [plan(), plan({ id: 'p2', name: 'Amil', ans_registry: null })]
  it('acha pelo vínculo e, sem ele, pelo nome sem diferenciar maiúscula', () => {
    expect(findPlan(plans, { insurance_plan_id: 'p2' })?.name).toBe('Amil')
    expect(findPlan(plans, { convenio: ' unimed fortaleza ' })?.id).toBe('p1')
    expect(findPlan(plans, { convenio: 'Outro' })).toBeNull()
    expect(findPlan(plans, {})).toBeNull()
  })
  it('vínculo que não existe mais cai para o nome', () => {
    expect(findPlan(plans, { insurance_plan_id: 'zzz', convenio: 'Amil' })?.id).toBe('p2')
  })
})

describe('carteirinhaStatus', () => {
  it('sem validade, ok e vencida', () => {
    expect(carteirinhaStatus(null, '2026-11-10')).toBe('sem_validade')
    expect(carteirinhaStatus('2026-11-10', '2026-11-10')).toBe('ok')
    expect(carteirinhaStatus('2026-11-09', '2026-11-10')).toBe('vencida')
  })
})
