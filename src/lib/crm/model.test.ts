import { describe, it, expect } from 'vitest'
import {
  groupByStage, stageTotals, openLeadCount, elapsedLabel, isStale, isFollowUpDue, parseMoney,
  leadPhoneFromInput, validateLeadForm, stagePatch, leadTitle, leadPhoneLabel, formatMoney, isStage, STAGES,
  dateInputToIso, isoToDateInput, followUpLabel,
  type Lead, type LeadFormInput,
} from './model'

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'l1', clinic_id: 'c1', name: 'Camila', phone: '85999998888', phone_key: '8599998888',
    stage: 'novo', stage_changed_at: '2026-10-10T12:00:00Z', stage_source: 'auto', stage_note: null, lost_reason: null, source: 'whatsapp',
    interest: null, estimated_value: null, notes: null, next_contact_at: null, assigned_to: null,
    patient_id: null, created_by: null, created_at: '2026-10-10T12:00:00Z', updated_at: '2026-10-10T12:00:00Z',
    ...over,
  }
}

const form = (over: Partial<LeadFormInput> = {}): LeadFormInput => ({
  name: '', phone: '', source: 'outro', interest: '', value: '', notes: '', assignedTo: '', ...over,
})

describe('etapas', () => {
  it('são cinco, na ordem do funil', () => {
    expect(STAGES.map(s => s.key)).toEqual(['novo', 'em_conversa', 'agendado', 'compareceu', 'perdido'])
  })
  it('isStage reconhece só etapas válidas', () => {
    expect(isStage('agendado')).toBe(true)
    expect(isStage('virou_paciente')).toBe(false)
    expect(isStage(null)).toBe(false)
  })
})

describe('groupByStage / totais', () => {
  it('agrupa por etapa e põe o mais recente primeiro', () => {
    const g = groupByStage([
      lead({ id: 'a', stage_changed_at: '2026-10-01T00:00:00Z' }),
      lead({ id: 'b', stage_changed_at: '2026-10-05T00:00:00Z' }),
      lead({ id: 'c', stage: 'perdido' }),
    ])
    expect(g.novo.map(l => l.id)).toEqual(['b', 'a'])
    expect(g.perdido.map(l => l.id)).toEqual(['c'])
    expect(g.agendado).toEqual([])
  })
  it('soma o valor estimado ignorando vazios', () => {
    expect(stageTotals([lead({ estimated_value: 900 }), lead({ estimated_value: null }), lead({ estimated_value: 1800.5 })]))
      .toEqual({ count: 3, value: 2700.5 })
  })
  it('em andamento exclui compareceu e perdido', () => {
    expect(openLeadCount([lead(), lead({ stage: 'em_conversa' }), lead({ stage: 'agendado' }), lead({ stage: 'compareceu' }), lead({ stage: 'perdido' })])).toBe(3)
  })
  it('formata moeda sem centavos quando é inteiro', () => {
    expect(formatMoney(900).replace(/\s/g, ' ')).toBe('R$ 900')
    expect(formatMoney(1800.5).replace(/\s/g, ' ')).toBe('R$ 1.800,50')
  })
})

describe('tempo', () => {
  const now = new Date('2026-10-15T12:00:00Z')
  it('rótulos de duração', () => {
    expect(elapsedLabel('2026-10-15T11:59:30Z', now)).toBe('agora')
    expect(elapsedLabel('2026-10-15T11:30:00Z', now)).toBe('30 min')
    expect(elapsedLabel('2026-10-15T11:00:00Z', now)).toBe('1 hora')
    expect(elapsedLabel('2026-10-15T09:00:00Z', now)).toBe('3 horas')
    expect(elapsedLabel('2026-10-14T12:00:00Z', now)).toBe('1 dia')
    expect(elapsedLabel('2026-10-10T12:00:00Z', now)).toBe('5 dias')
    expect(elapsedLabel('2026-09-24T12:00:00Z', now)).toBe('3 semanas')
    expect(elapsedLabel('2026-07-15T12:00:00Z', now)).toBe('3 meses')
  })
  it('data no futuro (relógio diferente) vira "agora", não negativo', () => {
    expect(elapsedLabel('2026-10-16T12:00:00Z', now)).toBe('agora')
  })
  it('parado: só novo/em conversa há mais de 3 dias', () => {
    expect(isStale(lead({ stage_changed_at: '2026-10-10T12:00:00Z' }), now)).toBe(true)
    expect(isStale(lead({ stage_changed_at: '2026-10-14T12:00:00Z' }), now)).toBe(false)
    expect(isStale(lead({ stage: 'agendado', stage_changed_at: '2026-09-01T00:00:00Z' }), now)).toBe(false)
  })
  it('retomar vencido: só em aberto', () => {
    expect(isFollowUpDue(lead({ next_contact_at: '2026-10-14T12:00:00Z' }), now)).toBe(true)
    expect(isFollowUpDue(lead({ next_contact_at: '2026-10-16T12:00:00Z' }), now)).toBe(false)
    expect(isFollowUpDue(lead({ next_contact_at: '2026-10-14T12:00:00Z', stage: 'perdido' }), now)).toBe(false)
    expect(isFollowUpDue(lead({ next_contact_at: null }), now)).toBe(false)
  })
})

describe('parseMoney', () => {
  it('aceita formatos comuns', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('900')).toBe(900)
    expect(parseMoney('1.800,50')).toBe(1800.5)
    expect(parseMoney('R$ 1.800')).toBe(1800)
    expect(parseMoney('1800.5')).toBe(1800.5)
    expect(parseMoney('0,5')).toBe(0.5)
  })
  it('recusa lixo e negativo', () => {
    expect(parseMoney('abc')).toBeNaN()
    expect(parseMoney('-10')).toBeNaN()
    expect(parseMoney('1,234,5')).toBeNaN()
  })
})

describe('telefone digitado', () => {
  it('brasileiro completo vira chave DDD + 8 dígitos', () => {
    expect(leadPhoneFromInput('(85) 99999-8888')).toEqual({ phone: '85999998888', phoneKey: '8599998888' })
    expect(leadPhoneFromInput('(85) 3222-1111')).toEqual({ phone: '8532221111', phoneKey: '8532221111' })
  })
  it('vazio é permitido', () => {
    expect(leadPhoneFromInput('   ')).toBe('vazio')
  })
  it('incompleto, sem DDD e fora do padrão são recusados', () => {
    for (const bad of ['9999-88', '(85) 99999-888', '99999-8888', '(85) 9999-8888', 'abc', '(85) 8888-7777']) {
      expect(leadPhoneFromInput(bad), bad).toBeNull()
    }
  })
  it('número do exterior não pode ser digitado à mão', () => {
    expect(leadPhoneFromInput('+351 912 345 678')).toBeNull()
    expect(leadPhoneFromInput('351912345678')).toBeNull()
  })
})

describe('validateLeadForm', () => {
  it('exige nome ou telefone', () => {
    const r = validateLeadForm(form())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.name).toBeTruthy()
  })
  it('só nome já basta (lead do Instagram sem telefone)', () => {
    const r = validateLeadForm(form({ name: '  Camila  ', source: 'instagram' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toMatchObject({ name: 'Camila', phone: null, phone_key: null, source: 'instagram' })
  })
  it('só telefone também basta', () => {
    const r = validateLeadForm(form({ phone: '85999998888' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toMatchObject({ name: null, phone_key: '8599998888' })
  })
  it('com conversa no WhatsApp o telefone fica travado: nem é conferido nem exige nome', () => {
    const r = validateLeadForm(form({ name: '', phone: 'qualquer coisa' }), { phoneLocked: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toMatchObject({ name: null, phone: null, phone_key: null })
  })
  it('telefone inválido e valor inválido são apontados', () => {
    const r = validateLeadForm(form({ name: 'X', phone: '123', value: 'abc' }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.phone).toBeTruthy()
      expect(r.errors.value).toBeTruthy()
    }
  })
  it('normaliza campos opcionais vazios para null e converte o valor', () => {
    const r = validateLeadForm(form({ name: 'A', interest: '  Clareamento ', value: '900', notes: ' ', assignedTo: '' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toMatchObject({ interest: 'Clareamento', estimated_value: 900, notes: null, assigned_to: null })
  })
})

describe('stagePatch', () => {
  it('sair de perdido apaga o motivo', () => {
    expect(stagePatch('em_conversa', { lost_reason: 'Achou caro' })).toMatchObject({ stage: 'em_conversa', lost_reason: null })
  })
  it('entrar em perdido guarda o motivo informado ou o que já havia', () => {
    expect(stagePatch('perdido', { lost_reason: null }, ' Sem retorno ')).toMatchObject({ stage: 'perdido', lost_reason: 'Sem retorno' })
    expect(stagePatch('perdido', { lost_reason: 'Achou caro' })).toMatchObject({ stage: 'perdido', lost_reason: 'Achou caro' })
    expect(stagePatch('perdido', { lost_reason: null })).toMatchObject({ stage: 'perdido', lost_reason: null })
  })
  it('movimento de uma pessoa é manual e apaga o motivo automático', () => {
    expect(stagePatch('agendado', { lost_reason: null })).toMatchObject({ stage_source: 'manual', stage_note: null })
  })
})

describe('exibição', () => {
  it('nome, senão telefone, senão texto neutro', () => {
    expect(leadTitle(lead())).toBe('Camila')
    expect(leadTitle(lead({ name: null }))).toBe('(85) 99999-8888')
    expect(leadTitle(lead({ name: null, phone: null, phone_key: 'lid:123' }))).toBe('Contato sem número')
    expect(leadTitle(lead({ name: null, phone: null, phone_key: null }))).toBe('Contato sem nome')
  })
  it('telefone com 55 (vindo do WhatsApp) e sem 55 (cadastro manual) aparecem iguais', () => {
    expect(leadPhoneLabel(lead({ phone: '5585988880001', phone_key: '8588880001' }))).toBe('(85) 98888-0001')
    expect(leadPhoneLabel(lead({ phone: '85988880001', phone_key: '8588880001' }))).toBe('(85) 98888-0001')
    expect(leadPhoneLabel(lead({ phone: '558533334444', phone_key: '8533334444' }))).toBe('(85) 3333-4444')
  })
  it('telefone do exterior (vindo do WhatsApp) aparece com +', () => {
    expect(leadPhoneLabel(lead({ phone: '351912345678', phone_key: 'raw:351912345678' }))).toBe('+351912345678')
  })
})

describe('retomar em', () => {
  it('data do campo vira 9h no fuso da clínica (UTC-3)', () => {
    expect(dateInputToIso('2026-10-20')).toBe('2026-10-20T12:00:00.000Z')
  })
  it('recusa vazio e data impossível', () => {
    expect(dateInputToIso('')).toBeNull()
    expect(dateInputToIso('2026-02-30')).toBeNull()
    expect(dateInputToIso('20/10/2026')).toBeNull()
  })
  it('volta ao mesmo dia no campo, independente do fuso do computador', () => {
    expect(isoToDateInput('2026-10-20T12:00:00.000Z')).toBe('2026-10-20')
    // 23h do dia 19 em São Paulo ainda é dia 19, embora em UTC já seja dia 20
    expect(isoToDateInput('2026-10-20T02:00:00.000Z')).toBe('2026-10-19')
    expect(isoToDateInput(null)).toBe('')
    expect(isoToDateInput('lixo')).toBe('')
  })
  it('rótulos relativos ao dia de hoje na clínica', () => {
    const now = new Date('2026-10-15T15:00:00Z') // 12h em São Paulo
    expect(followUpLabel('2026-10-15T12:00:00Z', now)).toBe('Retomar hoje')
    expect(followUpLabel('2026-10-16T12:00:00Z', now)).toBe('Retomar amanhã')
    expect(followUpLabel('2026-10-20T12:00:00Z', now)).toBe('Retomar 20/10')
    expect(followUpLabel('2026-10-14T12:00:00Z', now)).toBe('Retomar atrasado há 1 dia')
    expect(followUpLabel('2026-10-10T12:00:00Z', now)).toBe('Retomar atrasado há 5 dias')
    expect(followUpLabel('lixo', now)).toBe('')
  })
})
