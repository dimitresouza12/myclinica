import { describe, expect, it } from 'vitest'
import lms from './oms-lms.json'
import {
  avaliarMedidas, classificar, curvaDoEscore, DIAS_MAX, diasDeVida, erroDaMedida, escoreTexto, escoreZ, idadeTexto, imcDe, implausivel,
  INDICADORES, normalCdf, parametrosLms, percentilDoEscore, percentilTexto, sexoDoCadastro, valorNoEscore, type Sexo,
} from './oms'

// Valores de referência: colunas SD0/SD2/SD3 das tabelas "expanded" da OMS (3 casas), usadas só para conferir os LMS embutidos.
describe('dados LMS da OMS embutidos', () => {
  it('tem um ponto por dia (0 a 1856) para os 4 indicadores, nos dois sexos', () => {
    for (const sexo of ['meninos', 'meninas'] as Sexo[]) {
      for (const ind of INDICADORES) {
        const t = (lms as Record<string, Record<string, { L: number[]; M: number[]; S: number[] }>>)[sexo][ind]
        expect(t.L).toHaveLength(DIAS_MAX + 1)
        expect(t.M).toHaveLength(DIAS_MAX + 1)
        expect(t.S).toHaveLength(DIAS_MAX + 1)
        expect([...t.L, ...t.M, ...t.S].every(n => Number.isFinite(n))).toBe(true)
      }
    }
  })

  it('conserva os valores oficiais de alguns dias', () => {
    expect(parametrosLms('meninos', 'peso', 0)).toEqual({ L: 0.3487, M: 3.3464, S: 0.14602 })
    expect(parametrosLms('meninas', 'estatura', 0)).toEqual({ L: 1, M: 49.1477, S: 0.0379 })
    expect(parametrosLms('meninos', 'pc', 0)).toEqual({ L: 1, M: 34.4618, S: 0.03686 })
    expect(parametrosLms('meninas', 'imc', DIAS_MAX)).toEqual({ L: -0.5684, M: 15.2798, S: 0.09825 })
  })

  it('as curvas de escore Z reproduzem as colunas SD da tabela da OMS', () => {
    const casos: [Sexo, 'peso' | 'estatura' | 'pc' | 'imc', number, number, number][] = [
      // sexo, indicador, dia, z, valor da OMS
      ['meninos', 'peso', 0, -3, 2.08],
      ['meninos', 'peso', 0, -2, 2.459],
      ['meninos', 'peso', 0, 2, 4.419],
      ['meninos', 'peso', 0, 3, 5.031],
      ['meninos', 'peso', 1856, 0, 18.497],
      ['meninas', 'estatura', 0, -2, 45.422],
      ['meninas', 'estatura', 0, 3, 54.736],
      ['meninas', 'estatura', 1856, 2, 119.517],
      ['meninos', 'pc', 0, -2, 31.921],
      ['meninos', 'pc', 0, 2, 37.002],
      ['meninas', 'imc', 0, -3, 10.122],
      ['meninas', 'imc', 0, 3, 17.657],
      ['meninas', 'imc', 1856, 1, 16.905],
    ]
    for (const [sexo, ind, dia, z, esperado] of casos) {
      const p = parametrosLms(sexo, ind, dia)!
      expect(Math.abs(valorNoEscore(p, z) - esperado)).toBeLessThan(0.002)
    }
  })

  it('fora de 0 a 1856 dias não há parâmetro; entre dois dias interpola', () => {
    expect(parametrosLms('meninos', 'peso', -1)).toBeNull()
    expect(parametrosLms('meninos', 'peso', DIAS_MAX + 1)).toBeNull()
    const a = parametrosLms('meninos', 'peso', 100)!
    const b = parametrosLms('meninos', 'peso', 101)!
    const meio = parametrosLms('meninos', 'peso', 100.5)!
    expect(meio.M).toBeCloseTo((a.M + b.M) / 2, 8)
  })
})

describe('escore Z', () => {
  it('a mediana tem escore 0 e as curvas de escore Z devolvem o escore que as originou', () => {
    for (const sexo of ['meninos', 'meninas'] as Sexo[]) {
      for (const ind of INDICADORES) {
        for (const dia of [0, 30, 365, 1000, 1856]) {
          const p = parametrosLms(sexo, ind, dia)!
          expect(escoreZ(sexo, ind, dia, p.M)).toBeCloseTo(0, 8)
          for (const z of [-2, -1, 1, 2]) expect(escoreZ(sexo, ind, dia, valorNoEscore(p, z))).toBeCloseTo(z, 6)
        }
      }
    }
  })

  it('menino de 1 ano (365 dias) com peso na mediana está no P50', () => {
    const p = parametrosLms('meninos', 'peso', 365)!
    const z = escoreZ('meninos', 'peso', 365, p.M)!
    expect(percentilDoEscore(z)).toBeCloseTo(50, 5)
    expect(percentilTexto(z)).toBe('P50')
    expect(p.M).toBeGreaterThan(9)
    expect(p.M).toBeLessThan(10.5)
  })

  it('peso e IMC usam o ajuste da OMS fora de ±3; estatura e perímetro cefálico não', () => {
    // IMC de menina ao nascer: SD3 = 17,657 e SD2 = 16,071. Um ponto 1 intervalo (SD3-SD2) acima do SD3 vale z = 4 com o ajuste.
    const p = parametrosLms('meninas', 'imc', 0)!
    const sd3 = valorNoEscore(p, 3)
    const sd2 = valorNoEscore(p, 2)
    expect(escoreZ('meninas', 'imc', 0, sd3 + (sd3 - sd2))).toBeCloseTo(4, 6)
    const sd3n = valorNoEscore(p, -3)
    const sd2n = valorNoEscore(p, -2)
    expect(escoreZ('meninas', 'imc', 0, sd3n - (sd2n - sd3n))).toBeCloseTo(-4, 6)
    // estatura: sem ajuste, o escore é o da fórmula direta
    const pe = parametrosLms('meninas', 'estatura', 0)!
    expect(escoreZ('meninas', 'estatura', 0, valorNoEscore(pe, 4))).toBeCloseTo(4, 6)
    expect(escoreZ('meninas', 'estatura', 0, valorNoEscore(pe, -4.5))).toBeCloseTo(-4.5, 6)
  })

  it('medida inválida ou idade fora da tabela: null', () => {
    expect(escoreZ('meninos', 'peso', 100, 0)).toBeNull()
    expect(escoreZ('meninos', 'peso', 100, -3)).toBeNull()
    expect(escoreZ('meninos', 'peso', 100, Number.NaN)).toBeNull()
    expect(escoreZ('meninos', 'peso', 2000, 10)).toBeNull()
  })
})

describe('percentil', () => {
  it('curva normal padrão', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-2)).toBeCloseTo(0.02275, 4)
    expect(percentilDoEscore(1)).toBeCloseTo(84.13, 1)
    expect(percentilDoEscore(-1)).toBeCloseTo(15.87, 1)
  })
  it('texto do percentil e do escore', () => {
    expect(percentilTexto(0)).toBe('P50')
    expect(percentilTexto(-2)).toBe('P2')
    expect(percentilTexto(-2.5)).toBe('P0,6')
    expect(percentilTexto(-4)).toBe('< P0,1')
    expect(percentilTexto(4)).toBe('> P99,9')
    expect(percentilTexto(2.5)).toBe('P99,4')
    expect(escoreTexto(1.256)).toBe('+1,26')
    expect(escoreTexto(-2.034)).toBe('-2,03')
    expect(escoreTexto(0.001)).toBe('0')
  })
})

describe('classificação', () => {
  it('peso para a idade: limites -3, -2 e +2', () => {
    expect(classificar('peso', -3.01).rotulo).toBe('Muito baixo peso para a idade')
    expect(classificar('peso', -3).rotulo).toBe('Baixo peso para a idade')
    expect(classificar('peso', -2).rotulo).toBe('Peso adequado para a idade')
    expect(classificar('peso', 2).rotulo).toBe('Peso adequado para a idade')
    expect(classificar('peso', 2.01).rotulo).toBe('Peso elevado para a idade')
  })
  it('estatura, perímetro cefálico e IMC', () => {
    expect(classificar('estatura', -2.5).gravidade).toBe('atencao')
    expect(classificar('estatura', 2.5).gravidade).toBe('ok')
    expect(classificar('pc', -2.1).gravidade).toBe('alerta')
    expect(classificar('pc', 0).gravidade).toBe('ok')
    expect(classificar('imc', 0.9).rotulo).toBe('IMC adequado para a idade')
    expect(classificar('imc', 1.5).rotulo).toBe('Risco de sobrepeso')
    expect(classificar('imc', 2.5).rotulo).toBe('Sobrepeso')
    expect(classificar('imc', 3.1).rotulo).toBe('Obesidade')
    expect(classificar('imc', -2.5).rotulo).toBe('Magreza')
  })
  it('valores biologicamente implausíveis pelos limites da OMS', () => {
    expect(implausivel('peso', 5.1)).toBe(true)
    expect(implausivel('peso', -6.1)).toBe(true)
    expect(implausivel('peso', 4)).toBe(false)
    expect(implausivel('estatura', 6.1)).toBe(true)
    expect(implausivel('pc', -5.1)).toBe(true)
    expect(implausivel('imc', 5.1)).toBe(true)
  })
})

describe('idade e medidas', () => {
  it('dias de vida por calendário', () => {
    expect(diasDeVida('2025-01-01', '2025-01-01')).toBe(0)
    expect(diasDeVida('2025-01-01', '2026-01-01')).toBe(365)
    expect(diasDeVida('2024-02-28', '2024-03-01')).toBe(2)
    expect(diasDeVida('2025-01-02', '2025-01-01')).toBeNull()
    expect(diasDeVida(null, '2025-01-01')).toBeNull()
    expect(diasDeVida('2025-01-01T03:00:00Z', '2025-01-11')).toBe(10)
  })
  it('idade por extenso', () => {
    expect(idadeTexto('2026-03-10', '2026-03-18')).toBe('8 dias')
    expect(idadeTexto('2026-03-10', '2026-06-22')).toBe('3 meses e 12 dias')
    expect(idadeTexto('2025-03-10', '2026-05-10')).toBe('1 ano e 2 meses')
    expect(idadeTexto('2024-03-10', '2026-03-10')).toBe('2 anos')
    expect(idadeTexto('2026-01-31', '2026-03-01')).toBe('1 mês e 1 dia')
    expect(idadeTexto('2026-03-10', '2026-03-09')).toBe('')
  })
  it('sexo do cadastro', () => {
    expect(sexoDoCadastro('Masculino')).toBe('meninos')
    expect(sexoDoCadastro(' feminino ')).toBe('meninas')
    expect(sexoDoCadastro('Prefiro não informar')).toBeNull()
    expect(sexoDoCadastro(null)).toBeNull()
  })
  it('IMC a partir de peso e estatura', () => {
    expect(imcDe(10, 80)).toBeCloseTo(15.625, 6)
    expect(imcDe(null, 80)).toBeNull()
    expect(imcDe(10, 0)).toBeNull()
  })
  it('avalia as medidas informadas e calcula o IMC quando há peso e estatura', () => {
    const r = avaliarMedidas('meninas', '2025-01-01', '2026-01-01', { pesoKg: 8.9, estaturaCm: 74, pcCm: null })
    expect(r.map(x => x.indicador)).toEqual(['peso', 'estatura', 'imc'])
    // menina de 12 meses com 8,9 kg e 74 cm: perto da mediana da OMS (8,9 kg e 74,0 cm aos 12 meses)
    expect(Math.abs(r[0].z)).toBeLessThan(0.1)
    expect(Math.abs(r[1].z)).toBeLessThan(0.1)
    expect(r.every(x => !x.implausivel)).toBe(true)
  })
  it('idade fora de 0 a 5 anos ou sem nascimento: nada a avaliar', () => {
    expect(avaliarMedidas('meninos', '2015-01-01', '2026-01-01', { pesoKg: 30 })).toEqual([])
    expect(avaliarMedidas('meninos', null, '2026-01-01', { pesoKg: 10 })).toEqual([])
    expect(avaliarMedidas('meninos', '2026-02-01', '2026-01-01', { pesoKg: 10 })).toEqual([])
  })
})

describe('entrada de medidas e curvas', () => {
  it('valida faixa e formato (vazio é válido)', () => {
    expect(erroDaMedida('pesoKg', '')).toBeNull()
    expect(erroDaMedida('pesoKg', '12,5')).toBeNull()
    expect(erroDaMedida('pesoKg', 'abc')).toContain('número')
    expect(erroDaMedida('pesoKg', '0,1')).toContain('entre')
    expect(erroDaMedida('estaturaCm', '300')).toContain('entre')
    expect(erroDaMedida('pcCm', '45')).toBeNull()
  })
  it('curva do escore Z: pontos crescentes de 0 ao último dia, com a mediana entre -2 e +2', () => {
    const med = curvaDoEscore('meninos', 'peso', 0, 0, 730)
    const baixo = curvaDoEscore('meninos', 'peso', -2, 0, 730)
    const alto = curvaDoEscore('meninos', 'peso', 2, 0, 730)
    expect(med[0].dias).toBe(0)
    expect(med[med.length - 1].dias).toBe(730)
    for (let i = 0; i < med.length; i++) {
      expect(baixo[i].valor).toBeLessThan(med[i].valor)
      expect(alto[i].valor).toBeGreaterThan(med[i].valor)
    }
  })
})
