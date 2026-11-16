import { describe, expect, it } from 'vitest'
import {
  BARTHEL, BERG, ESCALAS, GAD7, ODI, PHQ9, ROLAND, escalasParaAreas, faixaDe, formatarValor, isEscalaId, normalizarRespostas,
  opcoesCurtas, pontuar, respostasVazias,
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

  it('escalasParaAreas: cada área recebe as suas escalas e fichas, na ordem fixa', () => {
    const ids = (areas: string[]) => escalasParaAreas(areas).map(e => e.id)
    expect(ids(['psico'])).toEqual(['phq9', 'gad7', 'who5', 'dass21'])
    expect(ids(['medico'])).toEqual(['phq9', 'gad7'])
    expect(ids(['nutri'])).toEqual(['phq9', 'gad7'])
    expect(ids(['fisio'])).toEqual(['odi', 'roland', 'berg', 'barthel'])
    expect(ids(['fisio', 'psico'])).toEqual(['phq9', 'gad7', 'who5', 'dass21', 'odi', 'roland', 'berg', 'barthel'])
    expect(ids(['to'])).toEqual(['barthel', 'lawton', 'sensorial', 'rotina'])
    expect(ids(['fono'])).toEqual(['audiograma', 'voz', 'fluencia', 'mof'])
    expect(ids(['odonto', 'estetica', 'vet'])).toEqual([])
  })

  it('toda escala cita fonte original e versão em português', () => {
    for (const def of Object.values(ESCALAS)) {
      expect(def.fonte.original.length).toBeGreaterThan(20)
      expect(def.fonte.portugues).toMatch(/portugu/i)
    }
  })
})

describe('Barthel', () => {
  /** Melhor nível de cada atividade (0/5, 0/5/10 ou 0/5/10/15). */
  const maximos = BARTHEL.itens.map(item => Math.max(...(item.opcoes ?? []).map(op => op.valor)))
  const nivel = (porItem: (max: number, i: number) => number): Respostas => maximos.map(porItem)

  it('tem as 10 atividades do índice original, com os níveis e pontos de cada uma', () => {
    expect(BARTHEL.itens).toHaveLength(10)
    expect(BARTHEL.itens.map(i => i.opcoes?.map(o => o.valor))).toEqual([
      [0, 5, 10], // alimentação
      [0, 5], // banho
      [0, 5], // higiene pessoal
      [0, 5, 10], // vaso sanitário
      [0, 5, 10], // escadas
      [0, 5, 10], // vestir-se
      [0, 5, 10], // intestino
      [0, 5, 10], // bexiga
      [0, 5, 10, 15], // deambulação
      [0, 5, 10, 15], // transferência
    ])
    expect(maximos.reduce((a, b) => a + b, 0)).toBe(100)
    expect(BARTHEL.maximo).toBe(100)
  })

  it('soma bruta de 0 a 100', () => {
    expect(pontuar(BARTHEL, nivel(() => 0)).valor).toBe(0)
    const total = pontuar(BARTHEL, nivel(max => max))
    expect(total.valor).toBe(100)
    expect(total.somaMaxima).toBe(100)
    expect(total.faixa?.rotulo).toBe('Independente')
  })

  it('soma os pontos reais de cada nível escolhido', () => {
    // alimentação 5, banho 5, higiene 0, vaso 10, escadas 5, vestir 5, intestino 10, bexiga 5, deambulação 10, transferência 15
    expect(pontuar(BARTHEL, [5, 5, 0, 10, 5, 5, 10, 5, 10, 15]).valor).toBe(70)
  })

  it('exige as 10 atividades', () => {
    const r = nivel(max => max)
    r[3] = null
    const res = pontuar(BARTHEL, r)
    expect(res.completo).toBe(false)
    expect(res.valor).toBeNull()
  })

  it('rejeita nível que não existe na atividade (ex.: 15 em alimentação, 10 em banho)', () => {
    const r = normalizarRespostas(BARTHEL, [15, 10, 5, 5, 5, 5, 5, 5, 5, 5])
    expect(r[0]).toBeNull()
    expect(r[1]).toBeNull()
    expect(r[2]).toBe(5)
  })

  const limites: [number, string][] = [
    [0, 'Dependência total'], [20, 'Dependência total'],
    [21, 'Dependência grave'], [60, 'Dependência grave'],
    [61, 'Dependência moderada'], [90, 'Dependência moderada'],
    [91, 'Dependência leve'], [99, 'Dependência leve'],
    [100, 'Independente'],
  ]
  it.each(limites)('%i pontos cai em %s', (pts, rotulo) => {
    expect(faixaDe(BARTHEL, pts)?.rotulo).toBe(rotulo)
  })

  it('cobre 0 a 100 sem buraco nem sobreposição', () => {
    for (let p = 0; p <= 100; p++) expect(BARTHEL.faixas.filter(f => p >= f.de && p <= f.ate)).toHaveLength(1)
  })

  it('pontuações de 5 em 5 caem na faixa certa', () => {
    expect(pontuar(BARTHEL, [10, 5, 5, 10, 10, 10, 10, 10, 15, 15]).faixa?.rotulo).toBe('Independente')
    expect(pontuar(BARTHEL, [10, 5, 5, 10, 10, 10, 10, 10, 15, 10]).faixa?.rotulo).toBe('Dependência leve') // 95
    expect(pontuar(BARTHEL, [0, 0, 0, 0, 0, 0, 0, 0, 0, 15]).faixa?.rotulo).toBe('Dependência total') // 15
  })

  it('só aparece para TO e fisioterapia', () => {
    expect([...BARTHEL.areas].sort()).toEqual(['fisio', 'to'])
  })
})

describe('Roland-Morris', () => {
  const sim = (n: number): Respostas => ROLAND.itens.map((_, i) => (i < n ? 1 : 0))

  it('tem 24 frases sim/não', () => {
    expect(ROLAND.itens).toHaveLength(24)
    expect(ROLAND.opcoesComuns?.map(o => o.valor)).toEqual([0, 1])
    expect(ROLAND.maximo).toBe(24)
  })

  it('cada "Sim" vale 1 ponto, de 0 a 24', () => {
    expect(pontuar(ROLAND, sim(0)).valor).toBe(0)
    expect(pontuar(ROLAND, sim(1)).valor).toBe(1)
    expect(pontuar(ROLAND, sim(13)).valor).toBe(13)
    expect(pontuar(ROLAND, sim(24)).valor).toBe(24)
    expect(pontuar(ROLAND, sim(24)).somaMaxima).toBe(24)
  })

  it('exige as 24 respostas (frase em branco não vale "Não")', () => {
    const r = sim(5)
    r[10] = null
    const res = pontuar(ROLAND, r)
    expect(res.completo).toBe(false)
    expect(res.valor).toBeNull()
    expect(res.respondidos).toBe(23)
  })

  const casos: [number, string][] = [
    [0, 'Sem incapacidade'], [1, 'Incapacidade leve a moderada'], [13, 'Incapacidade leve a moderada'],
    [14, 'Incapacidade importante'], [24, 'Incapacidade importante'],
  ]
  it.each(casos)('%i pontos cai em %s (corte de 14)', (pts, rotulo) => {
    expect(pontuar(ROLAND, sim(pts)).faixa?.rotulo).toBe(rotulo)
  })

  it('cobre 0 a 24 sem buraco nem sobreposição', () => {
    for (let p = 0; p <= 24; p++) expect(ROLAND.faixas.filter(f => p >= f.de && p <= f.ate)).toHaveLength(1)
    expect(faixaDe(ROLAND, 25)).toBeNull()
  })

  it('só aparece para fisioterapia', () => {
    expect(ROLAND.areas).toEqual(['fisio'])
  })
})

describe('Berg', () => {
  const todas = (v: number): Respostas => BERG.itens.map(() => v)

  it('tem 14 itens com notas de 0 a 4', () => {
    expect(BERG.itens).toHaveLength(14)
    for (const item of BERG.itens) expect(item.opcoes?.map(o => o.valor)).toEqual([0, 1, 2, 3, 4])
    expect(BERG.maximo).toBe(56)
  })

  it('soma de 0 a 56', () => {
    expect(pontuar(BERG, todas(0)).valor).toBe(0)
    expect(pontuar(BERG, todas(4)).valor).toBe(56)
    expect(pontuar(BERG, todas(4)).somaMaxima).toBe(56)
    expect(pontuar(BERG, todas(2)).valor).toBe(28)
  })

  it('exige os 14 itens', () => {
    const r = todas(3)
    r[13] = null
    expect(pontuar(BERG, r).completo).toBe(false)
    expect(pontuar(BERG, r).valor).toBeNull()
  })

  const limites: [number, string][] = [
    [0, 'Alto risco de queda'], [20, 'Alto risco de queda'],
    [21, 'Médio risco de queda'], [40, 'Médio risco de queda'],
    [41, 'Baixo risco de queda'], [56, 'Baixo risco de queda'],
  ]
  it.each(limites)('%i pontos cai em %s', (pts, rotulo) => {
    expect(faixaDe(BERG, pts)?.rotulo).toBe(rotulo)
  })

  it('cobre 0 a 56 sem buraco nem sobreposição', () => {
    for (let p = 0; p <= 56; p++) expect(BERG.faixas.filter(f => p >= f.de && p <= f.ate)).toHaveLength(1)
    expect(faixaDe(BERG, 57)).toBeNull()
  })

  it('resultado completo cai na faixa pela soma (3 x 14 = 42 baixo; 2 x 14 = 28 médio; 1 x 14 = 14 alto)', () => {
    expect(pontuar(BERG, todas(3)).faixa?.rotulo).toBe('Baixo risco de queda')
    expect(pontuar(BERG, todas(2)).faixa?.rotulo).toBe('Médio risco de queda')
    expect(pontuar(BERG, todas(1)).faixa?.rotulo).toBe('Alto risco de queda')
  })

  it('só aparece para fisioterapia', () => {
    expect(BERG.areas).toEqual(['fisio'])
  })
})

describe('escalas novas: definição', () => {
  it('ids reconhecidos e fora do catálogo rejeitados', () => {
    for (const id of ['phq9', 'gad7', 'who5', 'dass21', 'odi', 'roland', 'berg', 'barthel', 'lawton', 'sensorial', 'rotina']) expect(isEscalaId(id)).toBe(true)
    for (const id of ['copm', 'bdi', 'moca', 'perfilsensorial', 'isi', 'epds', 'audit', 'srq20', 'toString', '', null, 3]) expect(isEscalaId(id)).toBe(false)
  })

  it('opções curtas lado a lado; frases longas em lista', () => {
    expect(opcoesCurtas(PHQ9, 0)).toBe(true)
    expect(opcoesCurtas(ROLAND, 0)).toBe(true)
    expect(opcoesCurtas(ODI, 0)).toBe(false)
    expect(opcoesCurtas(BERG, 0)).toBe(false)
    expect(opcoesCurtas(BARTHEL, 1)).toBe(false) // só 2 opções, mas frases longas
  })

  it('itens de cada escala têm enunciado e título curto', () => {
    for (const def of [ROLAND, BERG, BARTHEL]) {
      for (const item of def.itens) {
        expect(item.texto.length).toBeGreaterThan(3)
        expect(item.curto.length).toBeGreaterThan(2)
      }
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

  it('Barthel, Roland-Morris e Berg: ida e volta com o resultado e a faixa', () => {
    const rb: Respostas = [5, 5, 0, 10, 5, 5, 10, 5, 10, 15]
    const b = lerEntrada(montarEntrada(BARTHEL, rb).entry_text)
    expect(b?.id).toBe('barthel')
    expect(b?.respostas).toEqual(rb)
    expect(b?.resultado.valor).toBe(70)
    expect(b?.resultado.faixa?.rotulo).toBe('Dependência moderada')

    const rr: Respostas = ROLAND.itens.map((_, i) => (i % 2 === 0 ? 1 : 0))
    const r = lerEntrada(montarEntrada(ROLAND, rr).entry_text)
    expect(r?.id).toBe('roland')
    expect(r?.resultado.valor).toBe(12)
    expect(r?.resultado.faixa?.rotulo).toBe('Incapacidade leve a moderada')

    const rg: Respostas = BERG.itens.map((_, i) => (i < 7 ? 4 : 2))
    const g = lerEntrada(montarEntrada(BERG, rg).entry_text)
    expect(g?.id).toBe('berg')
    expect(g?.resultado.valor).toBe(42)
    expect(g?.resultado.faixa?.rotulo).toBe('Baixo risco de queda')
  })

  it('texto legível das escalas novas: resultado, faixa e itens sem frase longa', () => {
    const { entry_text } = montarEntrada(BERG, BERG.itens.map(() => 3))
    expect(entry_text).toContain('Escala Berg: 42 pontos de 56.')
    expect(entry_text).toContain('baixo risco de queda')
    expect(entry_text).toContain('1. Sentado para em pé: 3 de 4')
    expect(entry_text).not.toContain('ATENÇÃO')
    const barthel = montarEntrada(BARTHEL, [10, 5, 5, 10, 10, 10, 10, 10, 15, 15]).entry_text
    expect(barthel).toContain('Escala Barthel: 100 pontos de 100.')
    expect(barthel).toContain('1. Alimentação: 10 de 10')
    const roland = montarEntrada(ROLAND, ROLAND.itens.map(() => 1)).entry_text
    expect(roland).toContain('1. Fica em casa: Sim (1)')
  })

  it('registro com número de respostas diferente do da escala não é lido', () => {
    expect(lerEntrada('#escala:v1:berg:4,4,4')).toBeNull()
    expect(lerEntrada('#escala:v1:copm:1,2,3')).toBeNull()
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
