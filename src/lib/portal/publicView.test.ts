import { describe, expect, it } from 'vitest'
import { shapeAppointments, shapePlan, shapeVaccines, shapeWeights } from './publicView'

const now = new Date('2026-11-17T15:00:00Z')

describe('shapeAppointments', () => {
  const rows = [
    { scheduled_at: '2026-11-20T13:00:00Z', status: 'agendado', procedure_name: 'Retorno', professional_name: 'Dra. Ana' },
    { scheduled_at: '2026-11-18T13:00:00Z', status: 'confirmado', procedure_name: null, professional_name: null },
    { scheduled_at: '2026-11-10T13:00:00Z', status: 'agendado', procedure_name: 'Passada', professional_name: null },
    { scheduled_at: '2026-11-19T13:00:00Z', status: 'cancelado', procedure_name: 'Cancelada', professional_name: null },
    { scheduled_at: '2026-11-21T13:00:00Z', status: 'bloqueado', procedure_name: 'Bloqueio', professional_name: null },
  ]
  it('só futuras e ativas, em ordem, sem campos internos', () => {
    const out = shapeAppointments(rows, now)
    expect(out.map(o => o.whenIso)).toEqual(['2026-11-18T13:00:00Z', '2026-11-20T13:00:00Z'])
    expect(out[0].confirmed).toBe(true)
    expect(Object.keys(out[1]).sort()).toEqual(['confirmed', 'procedure', 'professional', 'whenIso'])
  })
  it('respeita o limite', () => {
    expect(shapeAppointments(rows, now, 1)).toHaveLength(1)
  })
})

describe('shapeVaccines', () => {
  const rows = [
    { kind: 'vacina', name: 'V10', batch: 'L1', manufacturer: 'Zoetis', applied_on: '2026-01-10', next_due_on: '2026-11-10' },
    { kind: 'vacina', name: 'V10', batch: 'L0', manufacturer: 'Zoetis', applied_on: '2025-01-10', next_due_on: '2025-12-10' },
    { kind: 'vermifugo', name: 'Drontal', batch: null, manufacturer: null, applied_on: '2026-10-20', next_due_on: '2026-12-01' },
    { kind: 'vacina', name: 'Raiva', batch: null, manufacturer: null, applied_on: '2026-09-01', next_due_on: '2027-09-01' },
  ]
  it('classifica o reforço mais recente de cada produto; os antigos não recebem estado', () => {
    const out = shapeVaccines(rows, now)
    const by = (n: string, d: string) => out.find(v => v.name === n && v.appliedOn === d)!
    expect(by('V10', '2026-01-10').dueState).toBe('atrasada')
    expect(by('V10', '2025-01-10').dueState).toBeNull()
    expect(by('Drontal', '2026-10-20').dueState).toBe('proxima')
    expect(by('Raiva', '2026-09-01').dueState).toBe('em_dia')
  })
  it('não vaza observações nem dados do profissional', () => {
    const out = shapeVaccines([{ ...rows[0], notes: 'segredo', professional_registration: 'CRMV' } as never], now)
    expect(Object.keys(out[0]).sort()).toEqual(['appliedOn', 'batch', 'dueState', 'kind', 'manufacturer', 'name', 'nextDueOn'])
  })
})

describe('shapeWeights', () => {
  it('ordena por data, converte para número e descarta inválidos', () => {
    const out = shapeWeights([
      { weighed_on: '2026-03-01', weight_kg: '10.500' },
      { weighed_on: '2026-01-01', weight_kg: 9 },
      { weighed_on: '2026-02-01', weight_kg: 'x' },
      { weighed_on: '2026-04-01', weight_kg: 0 },
    ])
    expect(out).toEqual([{ date: '2026-01-01', kg: 9 }, { date: '2026-03-01', kg: 10.5 }])
  })
})

describe('shapePlan', () => {
  const raw = {
    v: 1, titulo: 'Plano de novembro',
    meta: { kcal: 1800, proteinaG: 90, carboidratoG: 200, lipidioG: 60 },
    personalizados: [{ id: 'p1', nome: 'Pão da casa', grupo: 'cereais', kcal: 250, proteina: 8, carboidrato: 45, lipidio: 3, fibra: 2 }],
    refeicoes: [
      { id: 'r1', nome: 'Café da manhã', horario: '07:30', itens: [{ id: 'i1', alimentoId: 'p1', gramas: 50, medida: '1 fatia' }, { id: 'i2', alimentoId: 'inexistente', gramas: 10 }], obs: ' Sem açúcar ' },
    ],
    observacoes: 'Beber 2 L de água',
  }
  it('mostra refeições, alimentos e quantidades; descarta alimento desconhecido e não expõe metas', () => {
    const p = shapePlan(raw)
    expect(p.title).toBe('Plano de novembro')
    expect(p.meals[0].items).toEqual([{ food: 'Pão da casa', grams: 50, measure: '1 fatia' }])
    expect(p.meals[0].note).toBe('Sem açúcar')
    expect(p.notes).toBe('Beber 2 L de água')
    expect(JSON.stringify(p)).not.toContain('1800')
  })
  it('com o catálogo da TACO carregado, resolve os alimentos pelo id', async () => {
    const { carregarTaco } = await import('@/lib/nutri/alimentos')
    const taco = await carregarTaco()
    const p = shapePlan({ ...raw, refeicoes: [{ id: 'r1', nome: 'Almoço', horario: '12:00', itens: [{ id: 'i1', alimentoId: 'taco-561', gramas: 90 }, { id: 'i2', alimentoId: 'p1', gramas: 50 }] }] }, taco)
    expect(p.meals[0].items.map(i => i.food)).toEqual(['Feijão, carioca, cozido', 'Pão da casa'])
  })
  it('dado corrompido vira plano vazio, sem erro', () => {
    expect(shapePlan(null).meals).toEqual([])
    expect(shapePlan('lixo').title).toBe('Plano alimentar')
  })
})
