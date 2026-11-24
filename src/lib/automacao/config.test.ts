import { describe, it, expect } from 'vitest'
import {
  parseAutomacaoConfig, isStopWord, normalizeStopText, PARAR_PALAVRAS_PADRAO, PARAR_CONFIRMACAO_TEXTO, DEFAULT_AUTOMACAO_CONFIG,
} from './config'

describe('parseAutomacaoConfig', () => {
  it('vazio, nulo ou lixo: padrão (função de fora do horário desligada, PARAR com as palavras padrão)', () => {
    for (const raw of [null, undefined, {}, 'x', 42, [], { foraDoHorario: 'sim' }]) {
      const c = parseAutomacaoConfig(raw)
      expect(c.foraDoHorario.ativa).toBe(false)
      expect(c.parar.palavras).toEqual([...PARAR_PALAVRAS_PADRAO])
    }
    expect(parseAutomacaoConfig(null)).toEqual(DEFAULT_AUTOMACAO_CONFIG)
  })

  it('lê o formato mínimo {foraDoHorario:{ativa,texto}, parar:{palavras}}', () => {
    const c = parseAutomacaoConfig({
      foraDoHorario: { ativa: true, texto: 'Estamos fechados.' },
      parar: { palavras: ['Parar', 'cancelar mensagens'] },
    })
    expect(c.foraDoHorario).toEqual({ ativa: true, texto: 'Estamos fechados.' })
    expect(c.parar.palavras).toEqual(['parar', 'cancelar mensagens'])
  })

  it('ativa sem texto utilizável fica desligada (nunca envia texto vazio)', () => {
    expect(parseAutomacaoConfig({ foraDoHorario: { ativa: true, texto: '   ' } }).foraDoHorario.ativa).toBe(false)
    expect(parseAutomacaoConfig({ foraDoHorario: { ativa: true } }).foraDoHorario.ativa).toBe(false)
  })

  it('ativa só vale com true booleano', () => {
    expect(parseAutomacaoConfig({ foraDoHorario: { ativa: 'true', texto: 'x' } }).foraDoHorario.ativa).toBe(false)
  })

  it('texto muito longo é cortado em 1000 caracteres', () => {
    const c = parseAutomacaoConfig({ foraDoHorario: { ativa: true, texto: 'a'.repeat(2000) } })
    expect(c.foraDoHorario.texto.length).toBe(1000)
  })

  it('palavras: ignora o que não é texto, vazias e repetidas; lista vazia volta ao padrão', () => {
    expect(parseAutomacaoConfig({ parar: { palavras: [1, '', '  ', 'SAIR', 'sair', null] } }).parar.palavras).toEqual(['sair'])
    expect(parseAutomacaoConfig({ parar: { palavras: [] } }).parar.palavras).toEqual([...PARAR_PALAVRAS_PADRAO])
    expect(parseAutomacaoConfig({ parar: { palavras: 'parar' } }).parar.palavras).toEqual([...PARAR_PALAVRAS_PADRAO])
  })

  it('dias sem conversar das boas-vindas: padrão 30, aceita inteiro de 1 a 365', () => {
    expect(parseAutomacaoConfig({}).boasVindas.diasSemConversar).toBe(30)
    expect(parseAutomacaoConfig({ boasVindas: { diasSemConversar: 7 } }).boasVindas.diasSemConversar).toBe(7)
    expect(parseAutomacaoConfig({ boasVindas: { diasSemConversar: 0 } }).boasVindas.diasSemConversar).toBe(30)
    expect(parseAutomacaoConfig({ boasVindas: { diasSemConversar: 9999 } }).boasVindas.diasSemConversar).toBe(30)
    expect(parseAutomacaoConfig({ boasVindas: { diasSemConversar: 1.5 } }).boasVindas.diasSemConversar).toBe(30)
  })
})

describe('isStopWord (texto exato, sem caixa nem acento)', () => {
  const p = [...PARAR_PALAVRAS_PADRAO]
  it.each(['parar', 'PARAR', 'Pare', 'pare', 'SAIR', 'sair', 'Stop', 'STOP', '  parar  ', 'Parar!', 'parar.', '"sair"'])('%s para', t => {
    expect(isStopWord(t, p)).toBe(true)
  })
  it.each(['quero parar', 'não pare', 'parar de fumar', 'stop it', 'paro', 'pará', 'saí', 'sim', '', 'pare de me ligar'])('%s NÃO para', t => {
    expect(isStopWord(t, p)).toBe(false)
  })
  it('acentos e maiúsculas também valem nas palavras configuradas', () => {
    expect(isStopWord('NÃO QUERO MAIS', ['não quero mais'])).toBe(true)
    expect(isStopWord('nao quero mais', ['Não quero mais'])).toBe(true)
  })
  it('normalizeStopText tira acento, pontuação e espaços repetidos', () => {
    expect(normalizeStopText('  Não   QUERO, mais!! ')).toBe('nao quero mais')
  })
  it('texto de confirmação é fixo, curto e sem emoji', () => {
    expect(PARAR_CONFIRMACAO_TEXTO.length).toBeLessThan(200)
    expect(/\p{Extended_Pictographic}/u.test(PARAR_CONFIRMACAO_TEXTO)).toBe(false)
  })
})
