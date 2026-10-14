// Matriz de formatos de telefone. O objetivo é provar que o MESMO número, escrito de qualquer jeito
// (com/sem 55, com/sem "+", com/sem o nono dígito, com zero na frente, com pontuação, vindo do WhatsApp),
// vira sempre a MESMA chave — e que números diferentes nunca viram a mesma.

import { describe, it, expect } from 'vitest'
import { phoneKey, phoneKeyFromJid, normalizeBrPhone, whatsappCandidates, phoneKeys } from './phone'

interface Base { name: string; ddd: string; local: string /* 8 dígitos sem o 9 */; mobile: boolean }

const BASES: Base[] = [
  { name: 'celular Fortaleza',          ddd: '85', local: '99998888', mobile: true },
  { name: 'celular São Paulo',          ddd: '11', local: '98765432', mobile: true },
  { name: 'celular DDD 55 (RS)',        ddd: '55', local: '99887766', mobile: true },
  { name: 'celular DDD 51',             ddd: '51', local: '81234567', mobile: true },
  { name: 'fixo Fortaleza',             ddd: '85', local: '32221111', mobile: false },
  { name: 'fixo DDD 55 (RS)',           ddd: '55', local: '32215566', mobile: false },
  { name: 'fixo São Paulo',             ddd: '11', local: '45678901', mobile: false },
]

/** Todas as formas razoáveis de alguém escrever o mesmo número. */
function variants(b: Base): string[] {
  const { ddd, local } = b
  const withNine = b.mobile ? `${ddd}9${local}` : `${ddd}${local}`
  const noNine = `${ddd}${local}`
  const forms = (n: string) => {
    const d = n.slice(0, 2), r = n.slice(2)
    const split = r.length === 9 ? `${r.slice(0, 5)}-${r.slice(5)}` : `${r.slice(0, 4)}-${r.slice(4)}`
    const splitDot = r.length === 9 ? `${r.slice(0, 5)}.${r.slice(5)}` : `${r.slice(0, 4)}.${r.slice(4)}`
    return [
      n, `55${n}`, `+55${n}`, `+55 ${d} ${split}`, `55 ${d} ${split}`, `(${d}) ${split}`, `(${d})${split}`,
      `${d} ${split}`, `${d}-${split}`, `0${n}`, `0${d} ${split}`, `(0${d}) ${split}`, `+55 (${d}) ${splitDot}`,
      ` ${n} `, `${n}\n`, `55${d} ${r}`,
    ]
  }
  // mobile: com e sem o nono dígito; fixo: só uma forma
  return b.mobile ? [...forms(withNine), ...forms(noNine)] : forms(noNine)
}

describe('o mesmo número, escrito de qualquer jeito, dá sempre a mesma chave', () => {
  for (const b of BASES) {
    it(b.name, () => {
      const all = variants(b)
      const keys = new Set(all.map(v => phoneKey(v)))
      expect([...keys], `variantes: ${all.join(' | ')}`).toHaveLength(1)
      expect([...keys][0]).not.toBe('')
    })
    it(`${b.name}: o que vem do WhatsApp (jid) bate com o que a clínica digitou`, () => {
      const typedKey = phoneKey(variants(b)[0])
      const national = b.mobile ? `${b.ddd}9${b.local}` : `${b.ddd}${b.local}`
      const noNine = `${b.ddd}${b.local}`
      expect(phoneKeyFromJid(`55${national}@s.whatsapp.net`)).toBe(typedKey)
      expect(phoneKeyFromJid(`55${noNine}@s.whatsapp.net`)).toBe(typedKey) // conta antiga, sem o 9
    })
    it(`${b.name}: normalizeBrPhone entrega sempre o formato nacional canônico`, () => {
      const outs = new Set(variants(b).map(v => normalizeBrPhone(v)))
      expect(outs.size, `${[...outs].join(' | ')}`).toBe(1)
    })
  }
})

describe('números diferentes nunca viram a mesma chave', () => {
  it('chaves distintas para todas as bases', () => {
    const keys = BASES.map(b => phoneKey(variants(b)[0]))
    expect(new Set(keys).size).toBe(BASES.length)
  })
  it('mesmo número em DDDs diferentes', () => {
    expect(phoneKey('85999998888')).not.toBe(phoneKey('86999998888'))
    expect(phoneKey('55999998888')).not.toBe(phoneKey('51999998888'))
  })
  it('um dígito diferente no meio muda a chave', () => {
    expect(phoneKey('85999998888')).not.toBe(phoneKey('85999908888'))
  })
})

describe('DDD 55 (Rio Grande do Sul) não se confunde com o código do país', () => {
  it('"55" no começo de um número de 11 dígitos é o DDD, não o DDI', () => {
    expect(normalizeBrPhone('55999887766')).toBe('55999887766')
    expect(normalizeBrPhone('5555999887766')).toBe('55999887766')
    expect(normalizeBrPhone('+55 55 99988-7766')).toBe('55999887766')
  })
  it('candidatos para o WhatsApp usam o DDI uma vez só', () => {
    expect(whatsappCandidates('55999887766')).toEqual(['5555999887766', '555599887766'])
  })
})

describe('número do exterior nunca vira número brasileiro', () => {
  it.each([
    ['fixo da Espanha (34 9…) — 34 é um DDD válido do Brasil', '34912345678'],
    ['celular da Espanha', '34612345678'],
    ['EUA', '14155551234'],
    ['EUA com dígito 9 na posição do nono', '12195551234'],
    ['Portugal', '351912345678'],
    ['Argentina', '5491123456789'],
    ['México', '525512345678'],
  ])('%s', (_nome, digits) => {
    expect(phoneKeyFromJid(`${digits}@s.whatsapp.net`)).toBe('')
  })
  it('brasileiro continua sendo brasileiro pelo jid', () => {
    expect(phoneKeyFromJid('5534991234567@s.whatsapp.net')).toBe('3491234567')
  })
})

describe('campo de telefone com mais de um número', () => {
  it('encontra cada número separadamente', () => {
    expect(phoneKeys('(85) 99999-8888 / (85) 3222-1111').sort()).toEqual(['8532221111', '8599998888'])
    expect(phoneKeys('85999998888; 85988887777').sort()).toEqual(['8588887777', '8599998888'])
    expect(phoneKeys('(85) 99999-8888 ou 3222-1111')).toEqual(['8599998888'])
    expect(phoneKeys('85 99999-8888, 11 98765-4321 (Maria)').sort()).toEqual(['1187654321', '8599998888'])
  })
  it('um número só continua dando uma chave só', () => {
    expect(phoneKeys('(85) 99999-8888')).toEqual(['8599998888'])
  })
  it('lixo e vazio não geram chave', () => {
    expect(phoneKeys('')).toEqual([])
    expect(phoneKeys(null)).toEqual([])
    expect(phoneKeys('sem telefone')).toEqual([])
  })
})

describe('serviços e lixo não viram telefone', () => {
  it.each(['0800 123 4567', '08001234567', '0300 313 1111', '4004-0000', '190', '12345678', '99999-8888', '(85) 9999'])(
    '%s', (raw) => { expect(phoneKey(raw)).toBe('') })
})

describe('campo com dois números escolhe o celular para falar no WhatsApp', () => {
  it('celular vence o fixo, em qualquer ordem', () => {
    expect(normalizeBrPhone('(85) 3222-1111 / (85) 99999-8888')).toBe('85999998888')
    expect(normalizeBrPhone('(85) 99999-8888 / (85) 3222-1111')).toBe('85999998888')
  })
  it('só fixo: usa o fixo', () => {
    expect(normalizeBrPhone('(85) 3222-1111 / (85) 3222-2222')).toBe('8532221111')
  })
  it('vírgula usada como separador de milhar por engano não quebra o número', () => {
    expect(normalizeBrPhone('85.99999,8888')).toBe('85999998888')
  })
})
