import { describe, expect, it } from 'vitest'
import { countByStatus, daysUntil, effectiveStatus, filterContracts, isExpiringSoon, vigenciaInfo, vigenciaTexto, type ListFilterItem } from './status'
import {
  CONTRACT_TOKEN_KEYS, DEFAULT_TEMPLATE_BODY, describeObject, renderContract, suggestAmount, validateContractDraft, validateTemplateInput,
  type ContractContext,
} from './modelo'
import { listTokens } from '@/lib/documentos/modelo'
import { findPlaceholders, validateDocDraft } from '@/lib/assinatura/texto'

const TODAY = '2026-11-10'

describe('status do contrato', () => {
  it('rascunho, enviado e cancelado seguem o gravado', () => {
    expect(effectiveStatus({ status: 'rascunho', validUntil: null, signed: false }, TODAY)).toBe('rascunho')
    expect(effectiveStatus({ status: 'enviado', validUntil: '2020-01-01', signed: false }, TODAY)).toBe('enviado')
    expect(effectiveStatus({ status: 'cancelado', validUntil: null, signed: true }, TODAY)).toBe('cancelado')
  })
  it('enviado já assinado pelo paciente aparece como assinado', () => {
    expect(effectiveStatus({ status: 'enviado', validUntil: null, signed: true }, TODAY)).toBe('assinado')
  })
  it('vencido é calculado da vigência: o dia do término ainda vale', () => {
    expect(effectiveStatus({ status: 'assinado', validUntil: '2026-11-10', signed: true }, TODAY)).toBe('assinado')
    expect(effectiveStatus({ status: 'assinado', validUntil: '2026-11-09', signed: true }, TODAY)).toBe('vencido')
    expect(effectiveStatus({ status: 'assinado', validUntil: null, signed: true }, TODAY)).toBe('assinado')
  })
  it('dias e frases de vencimento', () => {
    expect(daysUntil('2026-11-20', TODAY)).toBe(10)
    expect(daysUntil('x', TODAY)).toBeNull()
    expect(vigenciaTexto('2026-11-10', TODAY)).toBe('vence hoje')
    expect(vigenciaTexto('2026-11-11', TODAY)).toBe('vence amanhã')
    expect(vigenciaTexto('2026-11-22', TODAY)).toBe('vence em 12 dias')
    expect(vigenciaTexto('2026-11-07', TODAY)).toBe('venceu há 3 dias')
    expect(vigenciaTexto(null, TODAY)).toBe('')
  })
  it('vencendo: de hoje a 30 dias, só para assinado', () => {
    expect(vigenciaInfo('2026-12-10', TODAY).state).toBe('vencendo')
    expect(vigenciaInfo('2026-12-11', TODAY).state).toBe('vigente')
    expect(vigenciaInfo('2026-11-09', TODAY).state).toBe('vencido')
    expect(isExpiringSoon({ status: 'assinado', validUntil: '2026-11-25' }, TODAY)).toBe(true)
    expect(isExpiringSoon({ status: 'vencido', validUntil: '2026-11-01' }, TODAY)).toBe(false)
    expect(isExpiringSoon({ status: 'rascunho', validUntil: '2026-11-25' }, TODAY)).toBe(false)
  })
  const items: ListFilterItem[] = [
    { status: 'assinado', validUntil: '2026-11-25', patientName: 'João da Conceição', title: 'Contrato A' },
    { status: 'assinado', validUntil: '2027-06-01', patientName: 'Maria Souza', title: 'Pacote 10 sessões' },
    { status: 'rascunho', validUntil: null, patientName: 'Ana', title: 'Contrato B' },
    { status: 'vencido', validUntil: '2026-01-01', patientName: 'Pedro', title: 'Contrato C' },
  ]
  it('filtra por estado, busca sem acento e vencendo', () => {
    expect(filterContracts(items, { status: 'todos', query: '', vencendo: false }, TODAY)).toHaveLength(4)
    expect(filterContracts(items, { status: 'assinado', query: '', vencendo: false }, TODAY)).toHaveLength(2)
    expect(filterContracts(items, { status: 'todos', query: 'conceicao', vencendo: false }, TODAY).map(i => i.title)).toEqual(['Contrato A'])
    expect(filterContracts(items, { status: 'todos', query: 'PACOTE', vencendo: false }, TODAY)).toHaveLength(1)
    expect(filterContracts(items, { status: 'todos', query: '', vencendo: true }, TODAY).map(i => i.title)).toEqual(['Contrato A'])
    expect(countByStatus(items)).toEqual({ rascunho: 1, enviado: 0, assinado: 2, vencido: 1, cancelado: 0 })
  })
})

const ctx: ContractContext = {
  patientName: 'Maria Souza', patientCpf: '12345678901', patientAddress: 'Rua A, 1', clinicName: 'Clínica Sol', clinicAddress: 'Rua B, 2',
  professionalName: 'Ana Lima', professionalRegistration: 'CRM 12345', amount: 1500, paymentMethod: 'Pix',
  validFrom: '2026-11-10', validUntil: '2027-11-10', packageName: null, packageSessions: null,
  planItems: [{ description: 'Limpeza', value: 200 }, { description: 'Clareamento', value: 800.5 }], today: TODAY,
}

describe('modelo de contrato', () => {
  it('o texto padrão só usa campos conhecidos', () => {
    for (const k of listTokens(DEFAULT_TEMPLATE_BODY)) expect(CONTRACT_TOKEN_KEYS).toContain(k)
    expect(DEFAULT_TEMPLATE_BODY).toContain('CONTRATADA')
    expect(DEFAULT_TEMPLATE_BODY).toContain('CONTRATANTE')
  })
  it('preenche paciente, CPF, valor, pagamento, vigência e profissional sem sobrar pendência', () => {
    const r = renderContract(DEFAULT_TEMPLATE_BODY, ctx)
    expect(r.missing).toEqual([])
    expect(r.text).toContain('CONTRATANTE: Maria Souza, CPF 123.456.789-01')
    expect(r.text).toContain('R$ 1.500,00, por Pix')
    expect(r.text).toContain('de 10/11/2026 até 10/11/2027')
    expect(r.text).toContain('Ana Lima, CRM 12345')
    expect(r.text).toContain('Limpeza (R$ 200,00); Clareamento (R$ 800,50)')
    expect(r.text).toContain('10 de novembro de 2026')
    expect(findPlaceholders(r.text)).toEqual([])
    expect(validateDocDraft({ docType: 'contrato', title: 'Contrato', contentText: r.text }).ok).toBe(true)
  })
  it('dado que falta vira [pendência] e bloqueia o envio para assinatura', () => {
    const r = renderContract(DEFAULT_TEMPLATE_BODY, { ...ctx, amount: null, planItems: [], validUntil: '' })
    expect(r.missing).toEqual(expect.arrayContaining(['serviço (pacote ou orçamento)', 'valor', 'término da vigência']))
    expect(r.text).toContain('R$ [valor]')
    expect(validateDocDraft({ docType: 'contrato', title: 'Contrato', contentText: r.text }).ok).toBe(false)
  })
  it('pacote tem prioridade sobre o orçamento', () => {
    expect(describeObject({ packageName: 'Pacote pilates', packageSessions: 10, planItems: [{ description: 'X', value: 1 }] })).toBe('Pacote pilates (10 sessões)')
    expect(describeObject({ packageName: 'P', packageSessions: 1 })).toBe('P (1 sessão)')
    expect(describeObject({ planItems: [] })).toBe('')
    expect(suggestAmount({ packagePrice: 900, planItems: [{ description: 'a', value: 5 }] })).toBe(900)
    expect(suggestAmount({ planItems: [{ description: 'a', value: 10.1 }, { description: 'b', value: 20.2 }, { description: 'c', value: null }] })).toBe(30.3)
    expect(suggestAmount({ planItems: [] })).toBeNull()
  })
  it('valida o modelo: nome, tamanho e campo desconhecido', () => {
    expect(validateTemplateInput({ name: '', body: DEFAULT_TEMPLATE_BODY }).ok).toBe(false)
    expect(validateTemplateInput({ name: 'X', body: 'curto' }).ok).toBe(false)
    const bad = validateTemplateInput({ name: 'X', body: `${DEFAULT_TEMPLATE_BODY}\n{{valorr}}` })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.error).toContain('{{valorr}}')
    expect(validateTemplateInput({ name: ' Meu ', body: DEFAULT_TEMPLATE_BODY })).toMatchObject({ ok: true, value: { name: 'Meu' } })
  })
  it('valida o rascunho: vigência coerente, valor e datas reais', () => {
    const text = renderContract(DEFAULT_TEMPLATE_BODY, ctx).text
    const base = { title: 'Contrato', contentText: text, validFrom: '2026-11-10', validUntil: '2027-11-10', amount: '1500.456', paymentMethod: 'Pix' }
    expect(validateContractDraft(base)).toMatchObject({ ok: true, value: { amount: 1500.46, paymentMethod: 'Pix' } })
    expect(validateContractDraft({ ...base, validUntil: '2026-11-09' }).ok).toBe(false)
    expect(validateContractDraft({ ...base, validUntil: '2027-02-30' }).ok).toBe(false)
    expect(validateContractDraft({ ...base, amount: -1 }).ok).toBe(false)
    expect(validateContractDraft({ ...base, title: '  ' }).ok).toBe(false)
    expect(validateContractDraft({ ...base, validFrom: '', validUntil: '', amount: '' })).toMatchObject({ ok: true, value: { validFrom: null, validUntil: null, amount: null } })
  })
  it('rascunho aceita texto com pendência (só o envio bloqueia)', () => {
    const r = renderContract(DEFAULT_TEMPLATE_BODY, { ...ctx, amount: null })
    expect(validateContractDraft({ title: 'C', contentText: r.text, validFrom: '', validUntil: '', amount: null, paymentMethod: '' }).ok).toBe(true)
  })
})
