import { describe, expect, it } from 'vitest'
import {
  ESCALAS, GAD7, ODI, PHQ9, escalasParaAreas, faixaDe, formatarValor, normalizarRespostas, pontuar, respostasVazias,
  type EscalaDef, type Respostas,
} from './escalas'
import { ENTRY_TYPE_ESCALA, lerEntrada, montarEntrada, textoVisivel } from './registro'

/** Respostas que somam exatamente `alvo`, espalhando de 0 a `teto` por item pontuável. */
function respostasComSoma(def: EscalaDef, alvo: number, teto: number): Respostas {
  const r = respostasVazias(def)
  let resto = alvo
  def.itens.forEach((item, i) => {
    if (item.pontua === false) return
    const v = Math.min(teto, resto)
    r[i] = v
    resto -= v
  })
  expect(resto).toBe(0)
  return r
}

describe('PHQ-9: faixas', () => {
  const casos: [number, string][] = [
    [0, 'Mínima'], [4, 'Mínima'],
    [5, 'Leve'], [9, 'Leve'],
    [10, 'Moderada'], [14, 'Moderada'],
    [15, 'Moderadamente grave'], [19, 'Moderadamente grave'],
    [20, 'Grave'], [27, 'Grave'],
  ]
  it.each(casos)('soma %i cai em %s', (soma, rotulo) => {
    const res = pontuar(PHQ9, respostasComSoma(PHQ9, soma, 3))
    expect(res.valor).toBe(soma)
    expect(res.faixa?.rotulo).toBe(rotulo)
  })

  it('cobre 0 a 27 sem buraco nem sobreposição', () => {
    for (let s = 0; s <= 27; s++) expect(PHQ9.faixas.filter(f => s >= f.de && s <= f.ate)).toHaveLength(1)
    expect(faixaDe(PHQ9, 28)).toBeNull()
  })

  it('só gera resultado com os 9 itens; a pergunta de dificuldade não entra na soma', () => {
    const r = respostasComSoma(PHQ9, 9, 1)
    expect(pontuar(PHQ9, r).completo).toBe(true)
    expect(pontuar(PHQ9, r).total).toBe(9)
    r[9] = 3
    expect(pontuar(PHQ9, r).valor).toBe(9)
    r[3] = null
    const incompleto = pontuar(PHQ9, r)
    expect(incompleto.completo).toBe(false)
    expect(incompleto.valor).toBeNull()
    expect(incompleto.faixa).toBeNull()
    expect(incompleto.respondidos).toBe(8)
  })

  it('máximo possível é 27', () => {
    expect(pontuar(PHQ9, respostasComSoma(PHQ9, 27, 3)).somaMaxima).toBe(27)
    expect(PHQ9.maximo).toBe(27)
  })
})

describe('PHQ-9: item 9 (ideação suicida)', () => {
  it('qualquer resposta acima de "nenhuma vez" liga o alerta, mesmo com pontuação baixa', () => {
    for (const v of [1, 2, 3]) {
      const r = respostasVazias(PHQ9)
      r[8] = v
      expect(pontuar(PHQ9, r).alertaRisco).toBe(true)
    }
    const baixo = respostasComSoma(PHQ9, 0, 3)
    baixo[8] = 1
    const res = pontuar(PHQ9, baixo)
    expect(res.valor).toBe(1)
    expect(res.faixa?.rotulo).toBe('Mínima')
    expect(res.alertaRisco).toBe(true)
  })

  it('item 9 zerado ou em branco não liga o alerta', () => {
    const r = respostasComSoma(PHQ9, 20, 3)
    r[8] = 0
    expect(pontuar(PHQ9, r).alertaRisco).toBe(false)
    expect(pontuar(PHQ9, respostasVazias(PHQ9)).alertaRisco).toBe(false)
  })

  it('a posição 9 do GAD-7 não é tratada como risco', () => {
    expect(pontuar(GAD7, respostasComSoma(GAD7, 21, 3)).alertaRisco).toBe(false)
  })
})

describe('GAD-7: faixas', () => {
  const casos: [number, string][] = [
    [0, 'Mínima'], [4, 'Mínima'],
    [5, 'Leve'], [9, 'Leve'],
    [10, 'Moderada'], [14, 'Moderada'],
    [15, 'Grave'], [21, 'Grave'],
  ]
  it.each(casos)('soma %i cai em %s', (soma, rotulo) => {
    const res = pontuar(GAD7, respostasComSoma(GAD7, soma, 3))
    expect(res.valor).toBe(soma)
    expect(res.faixa?.rotulo).toBe(rotulo)
  })

  it('cobre 0 a 21 sem buraco nem sobreposição', () => {
    for (let s = 0; s <= 21; s++) expect(GAD7.faixas.filter(f => s >= f.de && s <= f.ate)).toHaveLength(1)
    expect(faixaDe(GAD7, 22)).toBeNull()
  })

  it('exige os 7 itens', () => {
    const r = respostasComSoma(GAD7, 7, 1)
    r[6] = null
    expect(pontuar(GAD7, r).completo).toBe(false)
  })
})

describe('Oswestry', () => {
  const todas = (v: number): Respostas => ODI.itens.map(() => v)

  it('tem 10 seções com 6 opções (0 a 5) cada', () => {
    expect(ODI.itens).toHaveLength(10)
    for (const item of ODI.itens) expect(item.opcoes?.map(o => o.valor)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('calcula o percentual sobre o máximo das seções respondidas', () => {
    expect(pontuar(ODI, todas(0)).valor).toBe(0)
    expect(pontuar(ODI, todas(5)).valor).toBe(100)
    expect(pontuar(ODI, todas(1)).valor).toBe(20)
  })

  it('uma seção em branco reduz o denominador (9 x 5 = 45)', () => {
    const r = todas(1)
    r[7] = null
    const res = pontuar(ODI, r)
    expect(res.completo).toBe(true)
    expect(res.soma).toBe(9)
    expect(res.somaMaxima).toBe(45)
    expect(res.valor).toBe(20)
  })

  it('duas seções em branco não geram resultado', () => {
    const r = todas(1)
    r[7] = null
    r[3] = null
    expect(pontuar(ODI, r).completo).toBe(false)
    expect(pontuar(ODI, r).valor).toBeNull()
  })

  const limites: [number, string][] = [
    [0, 'Incapacidade mínima'], [20, 'Incapacidade mínima'],
    [21, 'Incapacidade moderada'], [40, 'Incapacidade moderada'],
    [41, 'Incapacidade intensa'], [60, 'Incapacidade intensa'],
    [61, 'Incapacidade grave'], [80, 'Incapacidade grave'],
    [81, 'Restrito ao leito ou exagero dos sintomas'], [100, 'Restrito ao leito ou exagero dos sintomas'],
  ]
  it.each(limites)('%i%% cai em %s', (pct, rotulo) => {
    expect(faixaDe(ODI, pct)?.rotulo).toBe(rotulo)
  })

  it('percentual por soma bruta (10 seções, máximo 50) respeita os limites das faixas', () => {
    const porSoma = (soma: number) => pontuar(ODI, respostasComSoma(ODI, soma, 5))
    expect(porSoma(10).faixa?.rotulo).toBe('Incapacidade mínima') // 20%
    expect(porSoma(11).faixa?.rotulo).toBe('Incapacidade moderada') // 22%
    expect(porSoma(20).faixa?.rotulo).toBe('Incapacidade moderada') // 40%
    expect(porSoma(21).faixa?.rotulo).toBe('Incapacidade intensa') // 42%
    expect(porSoma(30).faixa?.rotulo).toBe('Incapacidade intensa') // 60%
    expect(porSoma(31).faixa?.rotulo).toBe('Incapacidade grave') // 62%
    expect(porSoma(40).faixa?.rotulo).toBe('Incapacidade grave') // 80%
    expect(porSoma(41).faixa?.rotulo).toBe('Restrito ao leito ou exagero dos sintomas') // 82%
  })

  it('cobre 0 a 100 sem buraco nem sobreposição', () => {
    for (let p = 0; p <= 100; p++) expect(ODI.faixas.filter(f => p >= f.de && p <= f.ate)).toHaveLength(1)
  })
})

describe('respostas', () => {
  it('normalizar descarta valor fora das opções e completa o tamanho', () => {
    const r = normalizarRespostas(GAD7, [0, 3, 4, -1, 1.5, 'x'])
    expect(r).toEqual([0, 3, null, null, null, null, null])
  })

  it('formatarValor', () => {
    expect(formatarValor(PHQ9, 1)).toBe('1 ponto')
    expect(formatarValor(PHQ9, 12)).toBe('12 pontos')
    expect(formatarValor(ODI, 34)).toBe('34%')
  })

  it('escalasParaAreas: PHQ-9 e GAD-7 em psico, medicina e nutrição; Oswestry só em fisio', () => {
    const ids = (areas: string[]) => escalasParaAreas(areas).map(e => e.id)
    expect(ids(['psico'])).toEqual(['phq9', 'gad7'])
    expect(ids(['medico'])).toEqual(['phq9', 'gad7'])
    expect(ids(['nutri'])).toEqual(['phq9', 'gad7'])
    expect(ids(['fisio'])).toEqual(['odi'])
    expect(ids(['fisio', 'psico'])).toEqual(['phq9', 'gad7', 'odi'])
    expect(ids(['odonto', 'estetica', 'vet', 'fono', 'to'])).toEqual([])
  })

  it('toda escala cita fonte original e versão em português', () => {
    for (const def of Object.values(ESCALAS)) {
      expect(def.fonte.original.length).toBeGreaterThan(20)
      expect(def.fonte.portugues).toMatch(/portugu/i)
    }
  })
})

describe('registro no prontuário', () => {
  it('ida e volta: respostas e resultado voltam iguais', () => {
    const r = respostasComSoma(PHQ9, 12, 2)
    r[9] = 1
    const e = montarEntrada(PHQ9, r)
    expect(e.entry_type).toBe(ENTRY_TYPE_ESCALA)
    const lida = lerEntrada(e.entry_text)
    expect(lida?.id).toBe('phq9')
    expect(lida?.respostas).toEqual(r)
    expect(lida?.resultado.valor).toBe(12)
    expect(lida?.resultado.faixa?.rotulo).toBe('Moderada')
  })

  it('Oswestry com seção em branco mantém o branco', () => {
    const r: Respostas = ODI.itens.map(() => 2)
    r[7] = null
    const lida = lerEntrada(montarEntrada(ODI, r).entry_text)
    expect(lida?.respostas[7]).toBeNull()
    expect(lida?.resultado.valor).toBe(40)
  })

  it('texto legível traz resultado, faixa e alerta; a linha técnica some em textoVisivel', () => {
    const r = respostasComSoma(PHQ9, 2, 1)
    r[8] = 1
    const { entry_text } = montarEntrada(PHQ9, r)
    expect(entry_text).toContain('Escala PHQ-9: 3 pontos de 27')
    expect(entry_text).toContain('mínima')
    expect(entry_text).toContain('ATENÇÃO CLÍNICA')
    expect(entry_text).toContain('#escala:v1:phq9:')
    const visivel = textoVisivel(entry_text)
    expect(visivel).not.toContain('#escala')
    expect(visivel).toContain('Escala PHQ-9')
    expect(visivel.endsWith('\n')).toBe(false)
  })

  it('sem item 9 positivo o texto não traz alerta', () => {
    expect(montarEntrada(PHQ9, respostasComSoma(PHQ9, 5, 1)).entry_text).not.toContain('ATENÇÃO')
  })

  it('evolução comum e formato quebrado não viram escala', () => {
    expect(lerEntrada('Paciente relata melhora do sono.')).toBeNull()
    expect(lerEntrada(null)).toBeNull()
    expect(lerEntrada('#escala:v1:xyz:1,2,3')).toBeNull()
    expect(lerEntrada('#escala:v1:gad7:1,2,3')).toBeNull()
    expect(lerEntrada('#escala:v1:gad7:9,9,9,9,9,9,9')).toBeNull()
    expect(textoVisivel('Paciente relata melhora do sono.')).toBe('Paciente relata melhora do sono.')
  })
})
