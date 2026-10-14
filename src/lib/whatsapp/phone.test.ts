import { describe, it, expect } from 'vitest'
import {
  normalizeBrPhone, isValidBrPhone, whatsappCandidates, phoneKey,
  isLidJid, isIndividualJid, phoneKeyFromJid,
} from './phone'

describe('normalizeBrPhone', () => {
  it.each([
    ['(85) 99999-8888', '85999998888'],
    ['85 99999 8888', '85999998888'],
    ['+55 85 99999-8888', '85999998888'],
    ['5585999998888', '85999998888'],
    ['5585999998888@s.whatsapp.net', '85999998888'],
    ['85999998888', '85999998888'],
    ['(85) 3222-1111', '8532221111'],          // fixo fica com 10 dígitos
  ])('%s → %s', (raw, esperado) => {
    expect(normalizeBrPhone(raw)).toBe(esperado)
  })

  it('celular antigo de 8 dígitos ganha o 9 (regra do cleanPhone)', () => {
    expect(normalizeBrPhone('(85) 9999-8888')).toBe('85999998888')
  })

  it.each([null, undefined, '', 'abc', '123', '0800 123 456', '(00) 99999-8888', '8588888888888'])(
    'inválido %s → vazio', (raw) => {
      expect(normalizeBrPhone(raw as string)).toBe('')
    })
})

describe('isValidBrPhone', () => {
  it('aceita fixo e celular, rejeita o resto', () => {
    expect(isValidBrPhone('8532221111')).toBe(true)
    expect(isValidBrPhone('85999998888')).toBe(true)
    expect(isValidBrPhone('85899998888')).toBe(false)   // 11 dígitos mas sem o 9
    expect(isValidBrPhone('0599998888')).toBe(false)    // DDD < 11
    expect(isValidBrPhone('859999')).toBe(false)
    expect(isValidBrPhone('85a99998888')).toBe(false)
  })
})

describe('whatsappCandidates', () => {
  it('celular: com o 9 primeiro, depois sem o 9, sempre com 55', () => {
    expect(whatsappCandidates('(85) 99999-8888')).toEqual(['5585999998888', '558599998888'])
  })

  it('o mesmo número em formatos diferentes dá os mesmos candidatos', () => {
    const esperado = ['5585999998888', '558599998888']
    for (const raw of ['85999998888', '+55 85 99999 8888', '5585999998888', '558599998888']) {
      expect(whatsappCandidates(raw)).toEqual(esperado)
    }
  })

  it('fixo tem um candidato só', () => {
    expect(whatsappCandidates('(85) 3222-1111')).toEqual(['558532221111'])
  })

  it('inválido não gera candidato', () => {
    expect(whatsappCandidates('')).toEqual([])
    expect(whatsappCandidates('12345')).toEqual([])
  })
})

describe('phoneKey — ignora DDI e o nono dígito', () => {
  it('todas as variações do mesmo número convergem', () => {
    const k = '8599998888'
    for (const raw of ['85999998888', '(85) 99999-8888', '5585999998888', '558599998888', '+55 85 9999-8888', '5585999998888@s.whatsapp.net']) {
      expect(phoneKey(raw)).toBe(k)
    }
  })

  it('números diferentes não colidem', () => {
    expect(phoneKey('85999998888')).not.toBe(phoneKey('85999997777'))
    expect(phoneKey('85999998888')).not.toBe(phoneKey('11999998888'))
  })

  it('inválido → vazio', () => {
    expect(phoneKey('')).toBe('')
    expect(phoneKey('xyz')).toBe('')
  })
})

describe('jid', () => {
  it('reconhece @lid e grupo', () => {
    expect(isLidJid('1234567890@lid')).toBe(true)
    expect(isLidJid('5585999998888@s.whatsapp.net')).toBe(false)
    expect(isIndividualJid('5585999998888@s.whatsapp.net')).toBe(true)
    expect(isIndividualJid('1234567890@lid')).toBe(true)
    expect(isIndividualJid('120363025@g.us')).toBe(false)
    expect(isIndividualJid('status@broadcast')).toBe(false)
    expect(isIndividualJid(null)).toBe(false)
  })

  it('phoneKeyFromJid: telefone sai do jid comum; @lid e grupo não têm telefone', () => {
    expect(phoneKeyFromJid('5585999998888@s.whatsapp.net')).toBe('8599998888')
    expect(phoneKeyFromJid('1234567890@lid')).toBe('')
    expect(phoneKeyFromJid('120363025@g.us')).toBe('')
  })
})
