import { describe, expect, it } from 'vitest'
import {
  ARTICULACOES, agruparSeries, chaveDaSerie, evolucaoDaSerie, lerAdm, lerAngulo, movimentoPorChave, referencia, rotuloDaSerie, rotuloMovimento,
  textoGraus, validarMedida, type Medida, type RascunhoMedida,
} from './goniometria'

const hoje = '2026-11-30'
const m = (o: Partial<Medida>): Medida => ({
  id: Math.random().toString(36).slice(2), measured_on: '2026-11-01', joint: 'ombro', movement: 'flexao', side: 'direito', mode: 'ativo',
  angle_deg: 90, reference_deg: 180, note: null, created_at: '2026-11-01T10:00:00Z', ...o,
})

describe('catálogo', () => {
  it('toda articulação tem movimentos com chave única e referência plausível', () => {
    for (const a of ARTICULACOES) {
      const chaves = a.movimentos.map(x => x.key)
      expect(new Set(chaves).size).toBe(chaves.length)
      for (const mv of a.movimentos) expect(mv.ref).toBeGreaterThanOrEqual(0)
    }
  })
  it('coluna não tem lado; membros têm', () => {
    expect(ARTICULACOES.find(a => a.key === 'cervical')?.lateral).toBe(false)
    expect(ARTICULACOES.find(a => a.key === 'joelho')?.lateral).toBe(true)
  })
  it('referências conhecidas e rótulos', () => {
    expect(referencia('ombro', 'flexao')).toBe(180)
    expect(referencia('joelho', 'flexao')).toBe(135)
    expect(referencia('joelho', 'extensao')).toBe(0)
    expect(referencia('ombro', 'inexistente')).toBeNull()
    expect(movimentoPorChave('x', 'y')).toBeNull()
    expect(rotuloMovimento('ombro', 'abducao')).toBe('Ombro · Abdução')
  })
})

describe('lerAngulo e validarMedida', () => {
  const base: RascunhoMedida = { data: '2026-11-20', joint: 'ombro', movement: 'flexao', side: 'direito', mode: 'ativo', angulo: '95,5', referencia: '180', nota: '' }
  it('lê vírgula e arredonda a uma casa', () => {
    expect(lerAngulo('95,55')).toBe(95.6)
    expect(lerAngulo('')).toBeNull()
    expect(lerAngulo('abc')).toBeNull()
  })
  it('medida válida', () => {
    expect(validarMedida(base, hoje)).toEqual({
      ok: true,
      dados: { measured_on: '2026-11-20', joint: 'ombro', movement: 'flexao', side: 'direito', mode: 'ativo', angle_deg: 95.5, reference_deg: 180, note: null },
    })
  })
  it('exige articulação, movimento, lado nos membros e ângulo', () => {
    expect(validarMedida({ ...base, joint: '' }, hoje).ok).toBe(false)
    expect(validarMedida({ ...base, movement: 'nada' }, hoje).ok).toBe(false)
    expect(validarMedida({ ...base, side: 'nao_se_aplica' }, hoje).ok).toBe(false)
    expect(validarMedida({ ...base, angulo: '' }, hoje).ok).toBe(false)
    expect(validarMedida({ ...base, angulo: '361' }, hoje).ok).toBe(false)
    expect(validarMedida({ ...base, angulo: '-5' }, hoje).ok).toBe(false)
  })
  it('coluna grava sem lado, mesmo que o rascunho traga um', () => {
    const r = validarMedida({ ...base, joint: 'cervical', movement: 'rotacao', side: 'direito', referencia: '' }, hoje)
    expect(r.ok && r.dados.side).toBe('nao_se_aplica')
    expect(r.ok && r.dados.reference_deg).toBeNull()
  })
  it('recusa data futura ou inválida e referência fora da faixa', () => {
    expect(validarMedida({ ...base, data: '2026-12-01' }, hoje).ok).toBe(false)
    expect(validarMedida({ ...base, data: '2026-02-30' }, hoje).ok).toBe(false)
    expect(validarMedida({ ...base, referencia: '400' }, hoje).ok).toBe(false)
  })
})

describe('lerAdm', () => {
  it('compara com a referência em faixas', () => {
    expect(lerAdm(175, 180)).toMatchObject({ nivel: 'esperado', pct: 97, desvio: -5 })
    expect(lerAdm(150, 180)?.nivel).toBe('leve')
    expect(lerAdm(120, 180)?.nivel).toBe('moderado')
    expect(lerAdm(60, 180)?.nivel).toBe('importante')
    expect(lerAdm(200, 180)?.nivel).toBe('acima')
  })
  it('referência 0 é déficit de extensão em graus', () => {
    expect(lerAdm(0, 0)).toMatchObject({ nivel: 'esperado', pct: null })
    expect(lerAdm(10, 0)?.nivel).toBe('leve')
    expect(lerAdm(25, 0)?.nivel).toBe('moderado')
    expect(lerAdm(40, 0)?.nivel).toBe('importante')
  })
  it('sem referência ou número inválido: null', () => {
    expect(lerAdm(90, null)).toBeNull()
    expect(lerAdm(NaN, 90)).toBeNull()
  })
})

describe('séries e evolução', () => {
  const medidas = [
    m({ id: 'a', measured_on: '2026-11-10', angle_deg: 80 }),
    m({ id: 'b', measured_on: '2026-11-01', angle_deg: 60 }),
    m({ id: 'c', measured_on: '2026-11-20', angle_deg: 110 }),
    m({ id: 'd', measured_on: '2026-11-15', side: 'esquerdo', angle_deg: 150 }),
    m({ id: 'e', measured_on: '2026-11-05', mode: 'passivo', angle_deg: 100 }),
  ]
  it('agrupa por articulação, movimento, lado e modo, em ordem cronológica', () => {
    const s = agruparSeries(medidas)
    expect(s).toHaveLength(3)
    const dir = s.find(x => x.side === 'direito' && x.mode === 'ativo')!
    expect(dir.pontos.map(p => p.id)).toEqual(['b', 'a', 'c'])
    expect(dir.chave).toBe(chaveDaSerie(medidas[0]))
    expect(dir.referencia).toBe(180)
  })
  it('a série com medida mais recente vem primeiro', () => {
    expect(agruparSeries(medidas)[0].pontos.at(-1)!.id).toBe('c')
  })
  it('referência da série cai no catálogo quando a medida não guardou', () => {
    const s = agruparSeries([m({ reference_deg: null })])
    expect(s[0].referencia).toBe(180)
    const outra = agruparSeries([m({ joint: 'ombro', movement: 'xx', reference_deg: null })])
    expect(outra[0].referencia).toBeNull()
  })
  it('evolução: melhora quando o ângulo se aproxima da referência', () => {
    const dir = agruparSeries(medidas).find(x => x.side === 'direito' && x.mode === 'ativo')!
    const ev = evolucaoDaSerie(dir)!
    expect(ev).toMatchObject({ deltaGraus: 50, dias: 19, tendencia: 'melhora' })
  })
  it('evolução: piora, estável e série de 1 medida', () => {
    const piora = agruparSeries([m({ measured_on: '2026-11-01', angle_deg: 150 }), m({ measured_on: '2026-11-10', angle_deg: 100 })])[0]
    expect(evolucaoDaSerie(piora)?.tendencia).toBe('piora')
    const estavel = agruparSeries([m({ measured_on: '2026-11-01', angle_deg: 100 }), m({ measured_on: '2026-11-10', angle_deg: 102 })])[0]
    expect(evolucaoDaSerie(estavel)?.tendencia).toBe('estavel')
    expect(evolucaoDaSerie(agruparSeries([m({})])[0])).toBeNull()
  })
  it('evolução com referência 0: diminuir o déficit é melhora', () => {
    const s = agruparSeries([
      m({ joint: 'joelho', movement: 'extensao', reference_deg: 0, measured_on: '2026-11-01', angle_deg: 20 }),
      m({ joint: 'joelho', movement: 'extensao', reference_deg: 0, measured_on: '2026-11-15', angle_deg: 5 }),
    ])[0]
    expect(evolucaoDaSerie(s)).toMatchObject({ deltaGraus: -15, tendencia: 'melhora' })
  })
  it('rótulos', () => {
    expect(rotuloDaSerie({ joint: 'ombro', movement: 'flexao', side: 'direito', mode: 'ativo' })).toBe('Ombro · Flexão, direito, ativo')
    expect(rotuloDaSerie({ joint: 'cervical', movement: 'rotacao', side: 'nao_se_aplica', mode: 'passivo' })).toBe('Coluna cervical · Rotação, passivo')
    expect(textoGraus(12.5, true)).toBe('+12,5°')
    expect(textoGraus(-10, true)).toBe('-10°')
    expect(textoGraus(0)).toBe('0°')
  })
})
