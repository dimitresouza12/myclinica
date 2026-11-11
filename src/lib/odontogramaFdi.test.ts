import { describe, expect, it } from 'vitest'
import {
  ALL_DECIDUOUS, ALL_TEETH, EVERY_TOOTH, LOWER_DECIDUOUS, UPPER_DECIDUOUS,
  ageInYears, emptyTooth, hasDeciduousData, isDeciduous, isEmptyTooth, isPermanentTooth, isUpperTooth, isValidTooth,
  plannedMarks, quadrantName, quadrantOf, readOdontogram, serializeOdontogram, successorOf, suggestDentition,
  teethFor, toothPositionName, visibleTeeth, withPlanned,
} from './odontograma'

describe('numeração FDI da dentição decídua', () => {
  it('tem 20 dentes, 5 por quadrante, 51-55, 61-65, 71-75 e 81-85', () => {
    expect(ALL_DECIDUOUS).toHaveLength(20)
    expect([...UPPER_DECIDUOUS].sort()).toEqual([51, 52, 53, 54, 55, 61, 62, 63, 64, 65])
    expect([...LOWER_DECIDUOUS].sort()).toEqual([71, 72, 73, 74, 75, 81, 82, 83, 84, 85])
  })
  it('lê a arcada como o dentista: direito do paciente à esquerda da tela', () => {
    expect(UPPER_DECIDUOUS.slice(0, 5)).toEqual([55, 54, 53, 52, 51])
    expect(UPPER_DECIDUOUS.slice(5)).toEqual([61, 62, 63, 64, 65])
    expect(LOWER_DECIDUOUS.slice(0, 5)).toEqual([85, 84, 83, 82, 81])
    expect(LOWER_DECIDUOUS.slice(5)).toEqual([71, 72, 73, 74, 75])
  })
  it('não repete número nem colide com os permanentes', () => {
    expect(new Set(EVERY_TOOTH).size).toBe(52)
    expect(ALL_TEETH).toHaveLength(32)
    expect(ALL_DECIDUOUS.some(n => ALL_TEETH.includes(n))).toBe(false)
  })
  it('classifica o dente', () => {
    expect(isDeciduous(55)).toBe(true)
    expect(isDeciduous(16)).toBe(false)
    expect(isPermanentTooth(16)).toBe(true)
    expect(isValidTooth(56)).toBe(false)
    expect(isValidTooth(19)).toBe(false)
    expect(isValidTooth(75)).toBe(true)
  })
  it('acha o quadrante e a arcada', () => {
    expect(quadrantOf(83)).toBe(8)
    expect(isUpperTooth(54)).toBe(true)
    expect(isUpperTooth(62)).toBe(true)
    expect(isUpperTooth(71)).toBe(false)
    expect(isUpperTooth(48)).toBe(false)
    expect(quadrantName(55)).toBe('Superior direito')
    expect(quadrantName(71)).toBe('Inferior esquerdo')
    expect(quadrantName(36)).toBe('Inferior esquerdo')
  })
  it('liga o decíduo ao permanente que o substitui', () => {
    expect(successorOf(51)).toBe(11)
    expect(successorOf(65)).toBe(25)
    expect(successorOf(74)).toBe(34)
    expect(successorOf(85)).toBe(45)
    expect(successorOf(16)).toBeNull()
    expect(ALL_DECIDUOUS.every(n => isPermanentTooth(successorOf(n)!))).toBe(true)
  })
  it('nomeia a posição: decíduo tem molares no lugar dos pré-molares', () => {
    expect(toothPositionName(54)).toBe('1º molar')
    expect(toothPositionName(85)).toBe('2º molar')
    expect(toothPositionName(54)).not.toBe(toothPositionName(14))
    expect(toothPositionName(14)).toBe('1º pré-molar')
    expect(toothPositionName(53)).toBe('Canino')
  })
})

describe('arcadas por dentição', () => {
  it('permanente e decídua mostram só o seu conjunto; mista mostra os dois', () => {
    expect(visibleTeeth('permanente')).toHaveLength(32)
    expect(visibleTeeth('decidua')).toHaveLength(20)
    expect(visibleTeeth('mista')).toHaveLength(52)
    expect(teethFor('decidua').upper).toEqual(UPPER_DECIDUOUS)
    expect(new Set(visibleTeeth('mista'))).toEqual(new Set(EVERY_TOOTH))
  })
})

describe('dentição sugerida', () => {
  it('calcula a idade em anos completos', () => {
    const now = new Date(2026, 10, 10)
    expect(ageInYears('2020-11-10', now)).toBe(6)
    expect(ageInYears('2020-11-11', now)).toBe(5)
    expect(ageInYears('1990-01-01', now)).toBe(36)
    expect(ageInYears(null, now)).toBeNull()
    expect(ageInYears('lixo', now)).toBeNull()
    expect(ageInYears('2030-01-01', now)).toBeNull()
  })
  it('vai pela idade quando não há dente decíduo registrado', () => {
    expect(suggestDentition(null, false)).toBe('permanente')
    expect(suggestDentition(3, false)).toBe('decidua')
    expect(suggestDentition(5, false)).toBe('decidua')
    expect(suggestDentition(6, false)).toBe('mista')
    expect(suggestDentition(12, false)).toBe('mista')
    expect(suggestDentition(13, false)).toBe('permanente')
    expect(suggestDentition(40, false)).toBe('permanente')
  })
  it('dente decíduo registrado manda: adulto com decíduo retido vê a mista', () => {
    expect(suggestDentition(4, true)).toBe('decidua')
    expect(suggestDentition(9, true)).toBe('mista')
    expect(suggestDentition(35, true)).toBe('mista')
    expect(suggestDentition(null, true)).toBe('mista')
  })
})

describe('leitura e gravação do jsonb do odontograma', () => {
  const rawOld = {
    16: { status: 'cariado', surfaces: { o: 'cariado' }, note: 'sensível' },
    26: 'ausente',
    _history: [{ at: '2026-01-01T00:00:00Z', tooth: 16, status: 'cariado', by: 'Ana' }],
  }

  it('lê dado antigo (só permanentes, dente como string) sem perder nada', () => {
    const t = readOdontogram(rawOld)
    expect(t[16].status).toBe('cariado')
    expect(t[16].surfaces.o).toBe('cariado')
    expect(t[16].surfaces.v).toBe('higido')
    expect(t[16].note).toBe('sensível')
    expect(t[26].status).toBe('ausente')
    expect(t[11]).toEqual(emptyTooth())
    expect(Object.keys(t)).toHaveLength(52)
    expect(hasDeciduousData(rawOld)).toBe(false)
  })

  it('para quem nunca usou decíduos, o que se grava tem as mesmas chaves de antes (32 + _history)', () => {
    const out = serializeOdontogram(readOdontogram(rawOld), rawOld._history)
    expect(Object.keys(out).sort()).toEqual([...ALL_TEETH.map(String), '_history'].sort())
    expect(out[16]).toEqual({ ...emptyTooth(), status: 'cariado', surfaces: { ...emptyTooth().surfaces, o: 'cariado' }, note: 'sensível' })
    expect(out._history).toBe(rawOld._history)
  })

  it('grava o decíduo só quando tem informação, e lê de volta igual', () => {
    const t = readOdontogram(rawOld)
    t[54] = withPlanned({ ...emptyTooth(), status: 'cariado' }, 'all', true)
    t[75] = { ...emptyTooth(), note: 'esfoliação próxima' }
    const out = serializeOdontogram(t, [])
    expect(Object.keys(out).filter(k => isDeciduous(Number(k))).sort()).toEqual(['54', '75'])
    expect(hasDeciduousData(out)).toBe(true)
    const back = readOdontogram(out)
    expect(back[54].status).toBe('cariado')
    expect(back[54].planned).toEqual({ all: true })
    expect(back[75].note).toBe('esfoliação próxima')
    expect(back[55]).toEqual(emptyTooth())
  })

  it('decíduo limpo de volta ao hígido deixa de ser gravado', () => {
    const t = readOdontogram({})
    t[61] = { ...emptyTooth(), status: 'restaurado' }
    expect('61' in serializeOdontogram(t, [])).toBe(true)
    t[61] = emptyTooth()
    expect('61' in serializeOdontogram(t, [])).toBe(false)
  })

  it('isEmptyTooth ignora observação em branco e flag de plano falsa', () => {
    expect(isEmptyTooth(undefined)).toBe(true)
    expect(isEmptyTooth({ ...emptyTooth(), note: '   ' })).toBe(true)
    expect(isEmptyTooth({ ...emptyTooth(), planned: { all: false } })).toBe(true)
    expect(isEmptyTooth({ ...emptyTooth(), surfaces: { ...emptyTooth().surfaces, d: 'cariado' } })).toBe(false)
  })
})

describe('plano de tratamento com dentição mista', () => {
  it('inclui marcações a realizar dos decíduos depois das dos permanentes', () => {
    const t = readOdontogram({})
    t[85] = withPlanned({ ...emptyTooth(), status: 'extracao' }, 'all', true)
    t[36] = withPlanned({ ...emptyTooth(), status: 'restaurado' }, 'all', true)
    t[52] = { ...emptyTooth(), status: 'cariado' } // existente, fora do plano
    expect(plannedMarks(t).map(m => m.tooth)).toEqual([36, 85])
  })
})

describe('readOdontogram valida as condições', () => {
  it('condição desconhecida (dente, face ou formato antigo) vira hígido; as conhecidas ficam', () => {
    const t = readOdontogram({
      16: { status: 'inventado', surfaces: { o: 'cariado', v: 'xyz', z: 'cariado' } },
      26: 'qualquer-coisa',
      36: 'ausente',
      46: { status: 42, surfaces: { m: null } },
      11: { status: 'endodontia' },
    })
    expect(t[16].status).toBe('higido')
    expect(t[16].surfaces).toEqual({ v: 'higido', l: 'higido', m: 'higido', d: 'higido', o: 'cariado' })
    expect(t[26].status).toBe('higido')
    expect(t[36].status).toBe('ausente')
    expect(t[46].status).toBe('higido')
    expect(t[46].surfaces.m).toBe('higido')
    expect(t[11].status).toBe('endodontia')
  })
})
