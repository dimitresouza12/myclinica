import { describe, expect, it } from 'vitest'
import {
  agoraBrasil, altaVazia, colunasDoItem, combinarDataHora, dataHoraBr, diasDeInternacao, evolucoesPorDia, htmlInternacao, internacaoAberta,
  itensDaInternacao, normalizarEvolucao, normalizarInternacao, normalizarPrescricao, resumoDaPrescricao, resumoDosSinais, separarDataHora, textoDias,
  turnoDaHora, turnoDoInstante, validarAlta, validarEntrada, validarEvolucao, validarPrescricao, type Internacao, type ItemInternacao,
} from './internacao'

const cab = {
  clinica: 'Clínica Pet & Cia', detalhe: 'Rua A, 10', pet: 'Thor <b>', tutor: 'Maria Silva', animal: 'Canino | SRD | Macho',
  data: '2026-11-16', profissional: { nome: 'Dra. Ana Lima', registro: 'CRMV-CE 1234', rqe: '' },
}
const agora = new Date('2026-11-16T15:00:00.000-03:00')

const item = (id: string, tipo: 'prescricao' | 'evolucao', iso: string, dados: unknown): ItemInternacao => ({
  id, internacao_id: 'i1', tipo, registrado_em: iso, turno: turnoDoInstante(iso), dados, created_at: iso,
})

describe('data e hora de Brasília', () => {
  it('combina e separa sem escorregar de dia', () => {
    const iso = combinarDataHora('2026-11-16', '22:30')
    expect(iso).toBe('2026-11-17T01:30:00.000Z')
    expect(separarDataHora(iso)).toEqual({ data: '2026-11-16', hora: '22:30' })
    expect(combinarDataHora('2026-02-30', '10:00')).toBeNull()
    expect(combinarDataHora('2026-11-16', '25:00')).toBeNull()
    expect(combinarDataHora('', '10:00')).toBeNull()
    expect(separarDataHora('lixo')).toEqual({ data: '', hora: '' })
    expect(agoraBrasil(agora)).toEqual({ data: '2026-11-16', hora: '15:00' })
    expect(dataHoraBr('2026-11-17T01:30:00.000Z')).toBe('16/11/2026 22:30')
  })

  it('turno pelo horário: manhã 07h, tarde 13h, noite 19h até 06h59', () => {
    expect(turnoDaHora('06:59')).toBe('noite')
    expect(turnoDaHora('07:00')).toBe('manha')
    expect(turnoDaHora('12:59')).toBe('manha')
    expect(turnoDaHora('13:00')).toBe('tarde')
    expect(turnoDaHora('18:59')).toBe('tarde')
    expect(turnoDaHora('19:00')).toBe('noite')
    expect(turnoDaHora('00:00')).toBe('noite')
    expect(turnoDoInstante('2026-11-17T01:30:00.000Z')).toBe('noite') // 22:30 em Brasília
    expect(turnoDaHora('xx')).toBe('manha')
  })

  it('dias de internação contam o dia da entrada como o primeiro', () => {
    const entrada = combinarDataHora('2026-11-14', '23:00')!
    expect(diasDeInternacao(entrada, null, agora)).toBe(3)
    expect(diasDeInternacao(entrada, combinarDataHora('2026-11-14', '23:50'), agora)).toBe(1)
    expect(diasDeInternacao(entrada, combinarDataHora('2026-11-16', '09:00'), agora)).toBe(3)
    expect(textoDias(1)).toBe('1 dia')
    expect(textoDias(3)).toBe('3 dias')
  })
})

describe('leitura do JSON gravado', () => {
  it('aceita lixo e limpa os campos', () => {
    expect(normalizarInternacao(null)).toEqual({ v: 1, diagnostico: '', alta: null })
    const d = normalizarInternacao({ diagnostico: '  Gastroenterite ', alta: { resumo: 'Boa evolução', retornoEm: '2026-02-30', profissional: { nome: 'Ana', registro: 'CRMV 1' } } })
    expect(d.diagnostico).toBe('Gastroenterite')
    expect(d.alta?.resumo).toBe('Boa evolução')
    expect(d.alta?.retornoEm).toBe('')
    expect(d.alta?.profissional).toEqual({ nome: 'Ana', registro: 'CRMV 1', rqe: '' })
    expect(normalizarPrescricao({ medicamento: 'Dipirona', suspensa: 'sim' }).suspensa).toBe(false)
    expect(normalizarPrescricao({ medicamento: 'Dipirona', suspensa: true }).suspensa).toBe(true)
    const e = normalizarEvolucao({ texto: 'Alerta', temperaturaC: '38,5', fc: 5, fr: 'x' })
    expect(e).toEqual({ v: 1, texto: 'Alerta', temperaturaC: 38.5, fc: null, fr: null })
  })
})

describe('validação', () => {
  const m = { data: '2026-11-16', hora: '10:00' }
  it('entrada: motivo e momento obrigatórios; futuro não vale', () => {
    expect(validarEntrada({ ...m, motivo: 'Vômito', leito: 'Baia 3', diagnostico: '' }, agora)).toEqual([])
    expect(validarEntrada({ ...m, motivo: ' ', leito: '', diagnostico: '' }, agora)).toEqual(['Informe o motivo da internação.'])
    expect(validarEntrada({ data: '', hora: '10:00', motivo: 'x', leito: '', diagnostico: '' }, agora)[0]).toContain('data de entrada')
    expect(validarEntrada({ data: '2026-11-16', hora: '9h', motivo: 'x', leito: '', diagnostico: '' }, agora)[0]).toContain('hora de entrada')
    expect(validarEntrada({ data: '2026-11-17', hora: '10:00', motivo: 'x', leito: '', diagnostico: '' }, agora)[0]).toContain('futuro')
    expect(validarEntrada({ ...m, motivo: 'x'.repeat(601), leito: '', diagnostico: '' }, agora)[0]).toContain('passa de 600')
  })
  it('prescrição: medicamento, dose e frequência', () => {
    expect(validarPrescricao({ ...m, medicamento: 'Dipirona', dose: '25 mg/kg', frequencia: 'A cada 8 horas', observacao: '' }, agora)).toEqual([])
    expect(validarPrescricao({ ...m, medicamento: '', dose: '', frequencia: '', observacao: '' }, agora)).toHaveLength(3)
  })
  it('evolução: texto e sinais dentro da faixa', () => {
    const base = { ...m, texto: 'Alimentou-se', temperatura: '', fc: '', fr: '' }
    expect(validarEvolucao(base, agora)).toEqual([])
    expect(validarEvolucao({ ...base, texto: '' }, agora)).toEqual(['Escreva a evolução do pet neste turno.'])
    expect(validarEvolucao({ ...base, temperatura: '38,5', fc: '120', fr: '28' }, agora)).toEqual([])
    expect(validarEvolucao({ ...base, temperatura: '50' }, agora)[0]).toContain('Temperatura fora do esperado')
    expect(validarEvolucao({ ...base, fc: 'abc' }, agora)).toEqual(['Frequência cardíaca: digite um número.'])
  })
  it('alta: não antes da entrada, resumo obrigatório', () => {
    const entradaEm = combinarDataHora('2026-11-14', '10:00')!
    expect(validarAlta({ data: '2026-11-16', hora: '09:00', resumo: 'Recuperado', entradaEm, retornoEm: '' }, agora)).toEqual([])
    expect(validarAlta({ data: '2026-11-13', hora: '09:00', resumo: 'x', entradaEm, retornoEm: '' }, agora)).toEqual(['A saída não pode ser antes da entrada.'])
    expect(validarAlta({ data: '2026-11-16', hora: '09:00', resumo: '', entradaEm, retornoEm: '' }, agora)).toEqual(['Escreva o resumo da internação.'])
  })
})

describe('listas', () => {
  const base: Internacao = { id: 'i1', status: 'alta', entrada_em: '2026-11-10T12:00:00.000Z', saida_em: '2026-11-12T12:00:00.000Z', leito: null, motivo: 'x', dados: {}, created_at: '2026-11-10T12:00:00.000Z' }
  it('acha a internação aberta', () => {
    expect(internacaoAberta([base])).toBeNull()
    expect(internacaoAberta([base, { ...base, id: 'i2', status: 'internado', saida_em: null }])?.id).toBe('i2')
  })
  it('evoluções por dia e turno, em ordem cronológica', () => {
    const e1 = item('e1', 'evolucao', combinarDataHora('2026-11-15', '20:00')!, { texto: 'Noite calma' })
    const e2 = item('e2', 'evolucao', combinarDataHora('2026-11-15', '08:00')!, { texto: 'Manhã' })
    const e3 = item('e3', 'evolucao', combinarDataHora('2026-11-16', '14:00')!, { texto: 'Tarde' })
    const asc = evolucoesPorDia([e1, e2, e3], 'asc')
    expect(asc.map(d => d.dia)).toEqual(['2026-11-15', '2026-11-16'])
    expect(asc[0].turnos.map(t => `${t.turno}:${t.itens[0].id}`)).toEqual(['manha:e2', 'noite:e1'])
    expect(evolucoesPorDia([e1, e2, e3], 'desc').map(d => d.dia)).toEqual(['2026-11-16', '2026-11-15'])
    expect(itensDaInternacao([e1, e2, item('p1', 'prescricao', e1.registrado_em, {})], 'i1', 'evolucao').map(i => i.id)).toEqual(['e2', 'e1'])
  })
  it('colunas do item: turno vem do horário', () => {
    expect(colunasDoItem({ data: '2026-11-16', hora: '14:10' })).toEqual({ registrado_em: '2026-11-16T17:10:00.000Z', turno: 'tarde' })
    expect(colunasDoItem({ data: '', hora: '14:10' })).toBeNull()
  })
  it('resumos', () => {
    expect(resumoDosSinais({ v: 1, texto: '', temperaturaC: 38.5, fc: 120, fr: null })).toBe('T 38,5 °C | FC 120 bpm')
    expect(resumoDosSinais({ v: 1, texto: '', temperaturaC: null, fc: null, fr: null })).toBe('')
    expect(resumoDaPrescricao({ ...normalizarPrescricao({}), medicamento: 'Meloxicam', dose: '0,1 mg/kg', via: 'Oral', frequencia: 'A cada 24 horas' })).toBe('Meloxicam 0,1 mg/kg, Oral, a cada 24 horas')
  })
})

describe('impresso da internação', () => {
  const entrada = combinarDataHora('2026-11-14', '10:00')!
  const saida = combinarDataHora('2026-11-16', '09:30')!
  const itens = [
    item('p1', 'prescricao', entrada, { medicamento: 'Ondansetrona <script>', dose: '0,5 mg/kg', via: 'Intravenosa', frequencia: 'A cada 12 horas', observacao: '' }),
    item('e1', 'evolucao', combinarDataHora('2026-11-15', '08:00')!, { texto: 'Sem vômitos, aceitou água.', temperaturaC: 38.4 }),
  ]
  const dadosAlta = { v: 1, diagnostico: 'Gastroenterite', alta: { ...altaVazia(), resumo: 'Boa resposta ao tratamento.', medicacaoPos: 'Probiótico por 5 dias', orientacoes: 'Dieta leve', retornoEm: '2026-11-23' } }

  it('alta: resumo, prescrições, evolução, orientações e escape de HTML', () => {
    const i: Internacao = { id: 'i1', status: 'alta', entrada_em: entrada, saida_em: saida, leito: 'Baia 3', motivo: 'Vômitos <b>', dados: dadosAlta, created_at: entrada }
    const html = htmlInternacao(cab, i, itens, agora)
    expect(html).toContain('RESUMO DE ALTA')
    expect(html).toContain('ALTA')
    expect(html).toContain('14/11/2026 10:00')
    expect(html).toContain('3 dias')
    expect(html).toContain('Baia 3')
    expect(html).toContain('Boa resposta ao tratamento.')
    expect(html).toContain('Probiótico por 5 dias')
    expect(html).toContain('23/11/2026')
    expect(html).toContain('Prescrições durante a internação')
    expect(html).toContain('Evolução por turno')
    expect(html).toContain('T 38,4 °C')
    expect(html).toContain('CRMV-CE 1234')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('Thor <b>')
    expect(html).toContain('Thor &lt;b&gt;')
    expect(html).not.toContain('NaN')
  })

  it('internação aberta imprime a ficha; óbito usa título próprio', () => {
    const aberta: Internacao = { id: 'i1', status: 'internado', entrada_em: entrada, saida_em: null, leito: null, motivo: 'Observação', dados: {}, created_at: entrada }
    const h1 = htmlInternacao(cab, aberta, [], agora)
    expect(h1).toContain('FICHA DE INTERNAÇÃO')
    expect(h1).toContain('INTERNADO')
    expect(h1).toContain('ainda internado')
    expect(h1).not.toContain('Prescrições durante a internação')
    const obito: Internacao = { ...aberta, status: 'obito', saida_em: saida, dados: dadosAlta }
    expect(htmlInternacao(cab, obito, [], agora)).toContain('RESUMO DA INTERNAÇÃO')
  })
})
