import { describe, it, expect } from 'vitest'
import { parseReply, normalizeReply } from './reply'

describe('parseReply — SIM', () => {
  it.each([
    'sim', 'Sim', 'SIM', 'sim.', 'Sim!', 'simmm', 'SIMMMM!!!', 's', 'S',
    'confirmo', 'Confirmo!', 'confirmado', 'Confirmada', 'confirmadíssimo',
    'pode confirmar', 'ok', 'Ok!', 'okk', 'okay', 'blz', 'beleza', 'certo', 'combinado',
    'vou sim', 'sim vou', 'sim, confirmo', 'estarei lá', 'até lá', 'claro', 'com certeza',
    '👍', '✅', '👍🏽', '👍👍', 'sim sim', 'Sim, obrigada!', 'Bom dia, confirmo', 'boa tarde! sim, obrigado',
    'Confirmo, obrigada Dra.', '  sim  ',
  ])('"%s" → sim', (txt) => {
    expect(parseReply(txt)).toBe('sim')
  })
})

describe('parseReply — NÃO', () => {
  it.each([
    'não', 'Não', 'NÃO', 'nao', 'nãooo', 'n', 'não.', 'Não!',
    'não posso', 'não vou', 'não consigo', 'não vou conseguir', 'não vou poder', 'não poderei ir',
    'infelizmente não', 'preciso remarcar', 'quero remarcar', 'remarcar', 'desmarcar', 'cancelar',
    'pode cancelar', 'pode remarcar', 'não confirmo', '👎', '❌', 'não, obrigada', 'Bom dia, preciso remarcar',
  ])('"%s" → nao', (txt) => {
    expect(parseReply(txt)).toBe('nao')
  })
})

describe('parseReply — ambígua: na dúvida, não decide', () => {
  it.each([
    '', '   ', '🙂', '😂😂', 'oi', 'obrigada', 'bom dia',
    'sim, mas posso chegar 15 min atrasada?',
    'sim mas queria remarcar',
    'não sei ainda, te aviso',
    'não sei',
    'talvez',
    'posso ir às 15h?',
    'que horas mesmo?',
    'sim?',
    'não?',
    'sim não',
    'não sim',
    '👍 mas preciso remarcar',
    'quanto custa a consulta',
    'Dra, minha filha está com febre, pode antecipar?',
    'Pode ser outro dia?',
    'ok mas só consigo depois das 17h',
    'a'.repeat(200),
  ])('"%s" → ambigua', (txt) => {
    expect(parseReply(txt)).toBe('ambigua')
  })

  it('entrada nula/indefinida não quebra', () => {
    expect(parseReply(null)).toBe('ambigua')
    expect(parseReply(undefined)).toBe('ambigua')
  })
})

describe('normalizeReply', () => {
  it('tira acento, pontuação, maiúscula e letra repetida', () => {
    expect(normalizeReply('  NÃOOOO!!!  ')).toBe('nao')
    expect(normalizeReply('Sim, confirmo.')).toBe('sim confirmo')
  })

  it('emoji vira palavra', () => {
    expect(normalizeReply('👍')).toBe('sim')
    expect(normalizeReply('👎')).toBe('nao')
  })
})
