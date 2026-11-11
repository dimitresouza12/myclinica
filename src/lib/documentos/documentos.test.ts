import { describe, expect, it } from 'vitest'
import { addDaysIso, addMonthsIso, formatCpf, formatDateBr, formatDateExtenso, numeroPorExtenso, parseIsoDay, resolveDocFields } from './campos'
import { fillTemplate, listTokens, unknownTokens } from './modelo'
import { buildDocText, defaultDocForm, diasTexto, modeloKey, textToBodyHtml, validateDocForm, type DocForm } from './atestado'
import { getFieldCatalog } from '@/lib/documentFieldCatalog'
import { councilForType } from '@/lib/professionalCouncil'

const council = councilForType('medico')
const fields = resolveDocFields({
  patientName: ' Maria Souza ', patientCpf: '12345678901', clinicName: 'Clínica Sol',
  professionalName: 'Ana Lima', registrationNumber: '12345', rqe: '678', council, today: '2026-11-10',
})

describe('campos', () => {
  it('valida e formata datas de calendário', () => {
    expect(parseIsoDay('2026-02-30')).toBeNull()
    expect(parseIsoDay('abc')).toBeNull()
    expect(formatDateBr('2026-11-10')).toBe('10/11/2026')
    expect(formatDateExtenso('2026-03-01')).toBe('1 de março de 2026')
    expect(formatDateBr('')).toBe('')
  })
  it('soma dias e meses sem estourar o mês', () => {
    expect(addDaysIso('2026-11-30', 2)).toBe('2026-12-02')
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsIso('2026-11-10', 12)).toBe('2027-11-10')
  })
  it('máscara de CPF só com 11 dígitos', () => {
    expect(formatCpf('12345678901')).toBe('123.456.789-01')
    expect(formatCpf('123')).toBe('123')
    expect(formatCpf(null)).toBe('')
  })
  it('número por extenso', () => {
    expect([0, 1, 15, 21, 30, 100, 101, 120, 999].map(numeroPorExtenso)).toEqual(['zero', 'um', 'quinze', 'vinte e um', 'trinta', 'cem', 'cento e um', 'cento e vinte', 'novecentos e noventa e nove'])
    expect(numeroPorExtenso(1000)).toBe('1000')
    expect(diasTexto(1)).toBe('1 (um) dia')
    expect(diasTexto(3)).toBe('3 (três) dias')
  })
  it('resolve nome, CPF, data, profissional, registro e RQE', () => {
    expect(fields.paciente).toBe('Maria Souza')
    expect(fields.cpf).toBe('123.456.789-01')
    expect(fields.data).toBe('10/11/2026')
    expect(fields.medico).toBe('Ana Lima')
    expect(fields.registro).toBe('CRM 12345')
    expect(fields.rqe).toBe('RQE 678')
    expect(fields.profissionalIdent).toBe('Ana Lima, CRM 12345, RQE 678')
    expect(fields.pacienteIdent).toBe('Maria Souza, CPF 123.456.789-01')
  })
  it('todo campo de texto do catálogo (exceto os da receita especial) tem valor resolvido', () => {
    const keys = getFieldCatalog('atestado', council).filter(e => e.kind === 'text').map(e => e.key)
    const map: Record<string, string> = { paciente: fields.paciente, data: fields.data, medico: fields.medico, registro: fields.registro, rqe: fields.rqe }
    for (const k of keys) expect(map[k], k).toBeTruthy()
  })
  it('sem CPF ou registro, o texto não fica com vírgula sobrando', () => {
    const f = resolveDocFields({ patientName: 'João', patientCpf: null, professionalName: 'Rui', council: councilForType('estetica'), today: '2026-11-10' })
    expect(f.pacienteIdent).toBe('João')
    expect(f.profissionalIdent).toBe('Rui')
  })
})

describe('fillTemplate', () => {
  it('troca campos e marca o que falta entre colchetes', () => {
    const r = fillTemplate('Olá {{nome}}, valor {{ valor }} e {{forma_pagamento}}.', { nome: 'Ana', valor: '', forma_pagamento: undefined }, { valor: 'o valor' })
    expect(r.text).toBe('Olá Ana, valor [o valor] e [forma pagamento].')
    expect(r.missing).toEqual(['o valor', 'forma pagamento'])
  })
  it('lista campos e acusa os desconhecidos', () => {
    expect(listTokens('{{a}} {{B}} {{a}}')).toEqual(['a', 'b'])
    expect(unknownTokens('{{a}} {{x}}', ['a'])).toEqual(['x'])
  })
})

describe('documento estruturado', () => {
  const base = (patch: Partial<DocForm>): DocForm => ({ ...defaultDocForm('atestado', '2026-11-10'), ...patch })

  it('atestado de afastamento por dias', () => {
    const f = base({ finalidade: 'afastamento', dias: '3' })
    expect(validateDocForm(f, fields)).toEqual([])
    const t = buildDocText(f, fields)
    expect(t).toContain('Eu, Ana Lima, CRM 12345, RQE 678, atesto')
    expect(t).toContain('Maria Souza, CPF 123.456.789-01')
    expect(t).toContain('3 (três) dias, no período de 10/11/2026 a 12/11/2026.')
    expect(t).not.toContain('CID')
  })
  it('afastamento de um dia', () => {
    expect(buildDocText(base({ finalidade: 'afastamento', dias: '1' }), fields)).toContain('1 (um) dia, somente em 10/11/2026.')
  })
  it('comparecimento exige horário coerente', () => {
    const f = base({ finalidade: 'comparecimento' })
    expect(validateDocForm(f, fields)).toContain('Informe o horário de início e de fim.')
    expect(validateDocForm({ ...f, inicio: '15:00', fim: '14:00' }, fields)).toContain('O horário de fim precisa ser depois do início.')
    const ok = { ...f, inicio: '14:00', fim: '15:30' }
    expect(validateDocForm(ok, fields)).toEqual([])
    expect(buildDocText(ok, fields)).toContain('compareceu a atendimento em 10/11/2026, no período das 14:00 às 15:30.')
  })
  it('declaração de comparecimento nunca leva CID nem "atesto"', () => {
    const f = { ...defaultDocForm('declaracao_comparecimento', '2026-11-10'), inicio: '08:00', fim: '09:00', cid: 'J11', cidAutorizado: true }
    const t = buildDocText(f, fields)
    expect(t.startsWith('Declaro, para os devidos fins')).toBe(true)
    expect(t).not.toContain('J11')
    expect(validateDocForm(f, fields)).toEqual([])
  })
  it('CID só com autorização do paciente', () => {
    const f = base({ finalidade: 'afastamento', dias: '2', cid: 'J11' })
    expect(validateDocForm(f, fields)).toContain('Para incluir o CID, marque que o paciente autorizou. Sem autorização, apague o CID.')
    expect(buildDocText(f, fields)).not.toContain('J11')
    const t = buildDocText({ ...f, cidAutorizado: true }, fields)
    expect(t).toContain('CID-10: J11, informado com a autorização expressa do paciente.')
  })
  it('acompanhante pede o nome e aptidão usa a atividade escolhida', () => {
    const a = base({ finalidade: 'acompanhante', inicio: '08:00', fim: '09:00' })
    expect(validateDocForm(a, fields)).toContain('Informe o nome do acompanhante.')
    expect(buildDocText({ ...a, acompanhante: 'Carlos Souza' }, fields)).toContain('Carlos Souza acompanhou Maria Souza')
    expect(buildDocText(base({ finalidade: 'aptidao', aptidaoPara: 'atividade_escolar' }), fields)).toContain('apto(a) para a participação em atividades escolares.')
  })
  it('laudo simples usa finalidade, resultado e observação', () => {
    const f = { ...defaultDocForm('laudo', '2026-11-10'), laudoFinalidade: 'escola' as const, laudoResultado: 'com_alteracoes' as const, observacao: 'Ver exame anexo.' }
    expect(modeloKey(f)).toBe('laudo')
    const t = buildDocText(f, fields)
    expect(t).toContain('para fins de apresentação à escola')
    expect(t).toContain('com alterações, descritas na observação abaixo')
    expect(t.endsWith('Observação: Ver exame anexo.')).toBe(true)
  })
  it('exige profissional e dias válidos', () => {
    expect(validateDocForm(base({ finalidade: 'afastamento', dias: '0' }), fields)).toHaveLength(1)
    expect(validateDocForm(base({ finalidade: 'afastamento', dias: '2' }), { paciente: 'X', medico: '' })).toHaveLength(1)
  })
  it('modelo da clínica substitui o padrão', () => {
    const t = buildDocText(base({ finalidade: 'afastamento', dias: '2' }), fields, { 'atestado.afastamento': 'Afastado por {{dias_texto}}.' })
    expect(t).toBe('Afastado por 2 (dois) dias.')
  })
  it('prévia vira HTML escapado, sem tag injetada', () => {
    const h = textToBodyHtml('Linha <b>1</b>\nLinha 2\n\nSegundo & último')
    expect(h).toContain('&lt;b&gt;1&lt;/b&gt;<br>Linha 2')
    expect(h.match(/<p /g)).toHaveLength(2)
    expect(h).toContain('Segundo &amp; último')
  })
})
