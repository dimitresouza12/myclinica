import { describe, expect, it } from 'vitest'
import {
  DASS21, ESCALAS, LAWTON, ROTINA, SENSORIAL, WHO5, escalasParaAreas, faixaDe, formatarValor, opcoesCurtas, pontuar, respostasVazias,
  type EscalaDef, type Respostas, type SubescalaDef,
} from './escalas'
import { PROTOCOLOS, isProtocolo, isProtocoloId, protocolosParaAreas } from './protocolos'
import {
  FREQ_VA, FREQ_VO, audiogramaVazio, classificarMedia, mediaTonal, normalizarAudiograma, posicaoFrequencia, posicaoLimiar, tipoDaPerda,
  type AudiogramaDados, type OrelhaAudiograma,
} from './audiograma'
import { LIMITE_SZ, normalizarVoz, relacaoSZ, vozVazia, MODULO_VOZ } from './fichaVoz'
import { amostraCurta, calcularFluencia, faixaFluencia, fluenciaVazia, normalizarFluencia, MODULO_FLUENCIA } from './fichaFluencia'
import { MOF_GRUPOS, MODULO_MOF, contarMof, mofVazio, normalizarMof } from './fichaMof'
import { lerEntrada, lerProtocolo, montarEntrada, montarEntradaProtocolo, textoVisivel } from './registro'

const todas = (def: EscalaDef, v: number): Respostas => def.itens.map(() => v)
const subDe = (def: EscalaDef, id: string): SubescalaDef => def.subescalas!.find(s => s.id === id)!
const faixaSub = (sub: SubescalaDef, v: number) => sub.faixas.find(f => v >= f.de && v <= f.ate)

/** Respostas com `valor` só nos itens indicados; o resto recebe `resto`. */
function comItens(def: EscalaDef, itens: number[], valor: number, resto = 0): Respostas {
  const r = todas(def, resto)
  for (const i of itens) r[i] = valor
  return r
}

function semBuraco(faixas: { de: number; ate: number }[], de: number, ate: number) {
  for (let v = de; v <= ate; v++) expect(faixas.filter(f => v >= f.de && v <= f.ate)).toHaveLength(1)
}

describe('WHO-5', () => {
  it('5 itens, opções de 5 a 0, índice de 0 a 100 (soma x 4)', () => {
    expect(WHO5.itens).toHaveLength(5)
    expect(WHO5.opcoesComuns?.map(o => o.valor).sort()).toEqual([0, 1, 2, 3, 4, 5])
    expect(pontuar(WHO5, todas(WHO5, 0)).valor).toBe(0)
    expect(pontuar(WHO5, todas(WHO5, 5)).valor).toBe(100)
    expect(pontuar(WHO5, todas(WHO5, 3)).valor).toBe(60)
  })

  const casos: [number, number, string][] = [
    [7, 28, 'Bem-estar muito baixo'],
    [8, 32, 'Bem-estar baixo'],
    [12, 48, 'Bem-estar baixo'],
    [13, 52, 'Bem-estar adequado'],
    [25, 100, 'Bem-estar adequado'],
  ]
  it.each(casos)('soma bruta %i vira %i e cai em %s', (bruta, indice, rotulo) => {
    const r = respostasVazias(WHO5)
    let resto = bruta
    WHO5.itens.forEach((_, i) => { const v = Math.min(5, resto); r[i] = v; resto -= v })
    const res = pontuar(WHO5, r)
    expect(res.valor).toBe(indice)
    expect(res.faixa?.rotulo).toBe(rotulo)
  })

  it('faixas cobrem 0 a 100 sem buraco e o limite de 50 fica em "baixo"', () => {
    semBuraco(WHO5.faixas, 0, 100)
    expect(faixaDe(WHO5, 50)?.rotulo).toBe('Bem-estar baixo')
    expect(faixaDe(WHO5, 51)?.rotulo).toBe('Bem-estar adequado')
  })

  it('exige os 5 itens e formata o valor', () => {
    const r = todas(WHO5, 3)
    r[2] = null as unknown as number
    expect(pontuar(WHO5, r).completo).toBe(false)
    expect(formatarValor(WHO5, 52)).toBe('52 pontos')
  })

  it('só aparece em psicologia', () => {
    expect(WHO5.areas).toEqual(['psico'])
  })
})

describe('DASS-21', () => {
  it('21 itens; as três subescalas dividem os itens sem sobra nem repetição (7 cada)', () => {
    expect(DASS21.itens).toHaveLength(21)
    const todos = DASS21.subescalas!.flatMap(s => s.itens).sort((a, b) => a - b)
    expect(todos).toEqual(Array.from({ length: 21 }, (_, i) => i))
    for (const s of DASS21.subescalas!) expect(s.itens).toHaveLength(7)
  })

  it('itens de cada subescala seguem o manual (numeração de 1 a 21)', () => {
    const numeros = (id: string) => subDe(DASS21, id).itens.map(i => i + 1)
    expect(numeros('depressao')).toEqual([3, 5, 10, 13, 16, 17, 21])
    expect(numeros('ansiedade')).toEqual([2, 4, 7, 9, 15, 19, 20])
    expect(numeros('estresse')).toEqual([1, 6, 8, 11, 12, 14, 18])
  })

  it('a soma de cada subescala é dobrada e não existe total geral', () => {
    const res = pontuar(DASS21, todas(DASS21, 1))
    expect(res.completo).toBe(true)
    expect(res.valor).toBeNull()
    expect(res.faixa).toBeNull()
    expect(res.subescalas.map(s => s.valor)).toEqual([14, 14, 14])
    // 14: depressão moderado, ansiedade moderado, estresse ainda normal (até 14)
    expect(res.subescalas.map(s => s.faixa?.rotulo)).toEqual(['Moderado', 'Moderado', 'Normal'])
  })

  it('só os itens de uma subescala pontuam essa subescala', () => {
    const dep = subDe(DASS21, 'depressao').itens
    const res = pontuar(DASS21, comItens(DASS21, dep, 3))
    expect(res.subescalas[0].valor).toBe(42)
    expect(res.subescalas[0].faixa?.rotulo).toBe('Extremamente grave')
    expect(res.subescalas[1].valor).toBe(0)
    expect(res.subescalas[2].valor).toBe(0)
  })

  const cortes: [string, number, string][] = [
    ['depressao', 9, 'Normal'], ['depressao', 10, 'Leve'], ['depressao', 13, 'Leve'], ['depressao', 14, 'Moderado'],
    ['depressao', 20, 'Moderado'], ['depressao', 21, 'Grave'], ['depressao', 27, 'Grave'], ['depressao', 28, 'Extremamente grave'],
    ['ansiedade', 7, 'Normal'], ['ansiedade', 8, 'Leve'], ['ansiedade', 9, 'Leve'], ['ansiedade', 10, 'Moderado'],
    ['ansiedade', 14, 'Moderado'], ['ansiedade', 15, 'Grave'], ['ansiedade', 19, 'Grave'], ['ansiedade', 20, 'Extremamente grave'],
    ['estresse', 14, 'Normal'], ['estresse', 15, 'Leve'], ['estresse', 18, 'Leve'], ['estresse', 19, 'Moderado'],
    ['estresse', 25, 'Moderado'], ['estresse', 26, 'Grave'], ['estresse', 33, 'Grave'], ['estresse', 34, 'Extremamente grave'],
  ]
  it.each(cortes)('%s com %i (já dobrado) é %s', (id, valor, rotulo) => {
    expect(faixaSub(subDe(DASS21, id), valor)?.rotulo).toBe(rotulo)
  })

  it('faixas de cada subescala cobrem 0 a 42', () => {
    for (const s of DASS21.subescalas!) semBuraco(s.faixas, 0, 42)
  })

  it('um item em branco impede o resultado de todas as subescalas', () => {
    const r = todas(DASS21, 1)
    r[0] = null as unknown as number
    const res = pontuar(DASS21, r)
    expect(res.completo).toBe(false)
    expect(res.subescalas.every(s => s.valor === null)).toBe(true)
  })

  it('registro: resultado por subescala no texto e ida e volta', () => {
    const r = comItens(DASS21, subDe(DASS21, 'depressao').itens, 2)
    const { entry_text } = montarEntrada(DASS21, r)
    expect(entry_text).toContain('Escala DASS-21: Depressão 28 de 42 (extremamente grave); Ansiedade 0 de 42 (normal); Estresse 0 de 42 (normal).')
    expect(entry_text).toContain('3. Sem sentimentos positivos: Aplicou-se bastante (2)')
    const lida = lerEntrada(entry_text)
    expect(lida?.respostas).toEqual(r)
    expect(lida?.resultado.subescalas[0].valor).toBe(28)
    expect(textoVisivel(entry_text)).not.toContain('#escala')
  })

  it('não tem alerta de risco (a escala não traz item de ideação suicida)', () => {
    expect(pontuar(DASS21, todas(DASS21, 3)).alertaRisco).toBe(false)
  })
})

describe('Escala de Lawton (AIVD)', () => {
  it('8 atividades com 3 níveis (0, 1 e 2), total de 0 a 16', () => {
    expect(LAWTON.itens).toHaveLength(8)
    for (let i = 0; i < 8; i++) expect(LAWTON.itens[i].opcoes?.map(o => o.valor)).toEqual([0, 1, 2])
    expect(pontuar(LAWTON, todas(LAWTON, 2)).valor).toBe(16)
    expect(pontuar(LAWTON, todas(LAWTON, 0)).valor).toBe(0)
    expect(pontuar(LAWTON, todas(LAWTON, 1)).valor).toBe(8)
  })

  const casos: [number, string][] = [
    [0, 'Limitação importante'], [5, 'Limitação importante'],
    [6, 'Limitação moderada'], [11, 'Limitação moderada'],
    [12, 'Limitação leve'], [15, 'Limitação leve'],
    [16, 'Independente'],
  ]
  it.each(casos)('total %i cai em %s', (soma, rotulo) => {
    const r = respostasVazias(LAWTON)
    let resto = soma
    LAWTON.itens.forEach((_, i) => { const v = Math.min(2, resto); r[i] = v; resto -= v })
    const res = pontuar(LAWTON, r)
    expect(res.valor).toBe(soma)
    expect(res.faixa?.rotulo).toBe(rotulo)
  })

  it('faixas cobrem 0 a 16; opções são frases longas (em lista); exige as 8 atividades', () => {
    semBuraco(LAWTON.faixas, 0, 16)
    expect(opcoesCurtas(LAWTON, 0)).toBe(false)
    const r = todas(LAWTON, 2)
    r[7] = null as unknown as number
    expect(pontuar(LAWTON, r).completo).toBe(false)
  })

  it('texto do prontuário e ida e volta', () => {
    const r: Respostas = [2, 2, 1, 1, 0, 2, 2, 1]
    const { entry_text } = montarEntrada(LAWTON, r)
    expect(entry_text).toContain('Escala Lawton: 11 pontos de 16.')
    expect(entry_text).toContain('moderada')
    expect(lerEntrada(entry_text)?.respostas).toEqual(r)
  })
})

describe('Checklists próprios de TO (sensorial e rotina)', () => {
  it('sensorial: 24 itens em 6 sistemas de 4 itens seguidos, sem total geral', () => {
    expect(SENSORIAL.itens).toHaveLength(24)
    expect(SENSORIAL.subescalas).toHaveLength(6)
    SENSORIAL.subescalas!.forEach((s, k) => expect(s.itens).toEqual([k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 3]))
    const res = pontuar(SENSORIAL, todas(SENSORIAL, 1))
    expect(res.valor).toBeNull()
    expect(res.subescalas.map(s => s.valor)).toEqual([4, 4, 4, 4, 4, 4])
  })

  it('rotina: 20 itens em 5 áreas de 4 itens seguidos', () => {
    expect(ROTINA.itens).toHaveLength(20)
    expect(ROTINA.subescalas).toHaveLength(5)
    ROTINA.subescalas!.forEach((s, k) => expect(s.itens).toEqual([k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 3]))
  })

  const sens: [number, string][] = [[0, 'Pouco observado'], [3, 'Pouco observado'], [4, 'Observado com frequência'], [7, 'Observado com frequência'], [8, 'Observado com muita frequência'], [12, 'Observado com muita frequência']]
  it.each(sens)('sensorial: sistema com %i pontos é "%s"', (v, rotulo) => {
    expect(faixaSub(SENSORIAL.subescalas![0], v)?.rotulo).toBe(rotulo)
  })

  const rot: [number, string][] = [[0, 'Muito apoio na área'], [4, 'Muito apoio na área'], [5, 'Apoio parcial'], [8, 'Apoio parcial'], [9, 'Boa autonomia'], [12, 'Boa autonomia']]
  it.each(rot)('rotina: área com %i pontos é "%s"', (v, rotulo) => {
    expect(faixaSub(ROTINA.subescalas![0], v)?.rotulo).toBe(rotulo)
  })

  it('faixas de cada subescala cobrem 0 a 12', () => {
    for (const s of [...SENSORIAL.subescalas!, ...ROTINA.subescalas!]) semBuraco(s.faixas, 0, 12)
  })

  it('pontua cada sistema só com os próprios itens', () => {
    const res = pontuar(SENSORIAL, comItens(SENSORIAL, [8, 9, 10, 11], 3))
    expect(res.subescalas.map(s => s.valor)).toEqual([0, 0, 12, 0, 0, 0])
    expect(res.subescalas[2].faixa?.rotulo).toBe('Observado com muita frequência')
  })

  it('opções curtas lado a lado; ida e volta no prontuário', () => {
    expect(opcoesCurtas(SENSORIAL, 0)).toBe(true)
    expect(opcoesCurtas(ROTINA, 0)).toBe(true)
    const r = respostasVazias(ROTINA).map((_, i) => i % 4)
    const { entry_text } = montarEntrada(ROTINA, r)
    expect(entry_text).toContain('Escala Rotina: Sono e descanso 6 de 12 (apoio parcial)')
    const lida = lerEntrada(entry_text)
    expect(lida?.respostas).toEqual(r)
    expect(lida?.resultado.subescalas).toHaveLength(5)
  })

  it('não pretendem ser instrumentos licenciados (Perfil Sensorial, COPM)', () => {
    expect(SENSORIAL.fonte.nota).toMatch(/não reproduz nem substitui o Perfil Sensorial/)
    expect(ROTINA.fonte.original).toMatch(/Não reproduz a COPM/)
  })
})

describe('catálogo: nada de instrumento licenciado', () => {
  it('BDI, COPM, Perfil Sensorial, MoCA e os de licença duvidosa ficam de fora', () => {
    for (const id of ['bdi', 'copm', 'perfilsensorial', 'moca', 'isi', 'epds', 'audit', 'srq20']) expect(Object.keys(ESCALAS)).not.toContain(id)
  })

  it('toda escala nova cita a fonte original e o português', () => {
    for (const def of [WHO5, DASS21, LAWTON, SENSORIAL, ROTINA]) {
      expect(def.fonte.original.length).toBeGreaterThan(40)
      expect(def.fonte.portugues).toMatch(/portugu/i)
      expect(def.itens.every(i => i.texto.length > 3 && i.curto.length > 2)).toBe(true)
    }
  })
})

describe('Audiograma', () => {
  const orelha = (va: Record<number, number>, vo: Record<number, number> = {}): OrelhaAudiograma => ({
    va: FREQ_VA.map(f => va[f] ?? null),
    vo: FREQ_VO.map(f => vo[f] ?? null),
    lrf: null, iprf: null,
  })
  const tres = (a: number, b: number, c: number) => ({ 500: a, 1000: b, 2000: c })

  const graus: [number, string][] = [
    [-10, 'Audição normal'], [25, 'Audição normal'],
    [26, 'Perda auditiva de grau leve'], [40, 'Perda auditiva de grau leve'],
    [41, 'Perda auditiva de grau moderado'], [55, 'Perda auditiva de grau moderado'],
    [56, 'Perda auditiva de grau moderadamente severo'], [70, 'Perda auditiva de grau moderadamente severo'],
    [71, 'Perda auditiva de grau severo'], [90, 'Perda auditiva de grau severo'],
    [91, 'Perda auditiva de grau profundo'], [120, 'Perda auditiva de grau profundo'],
  ]
  it.each(graus)('média tonal de %i dB: %s (Lloyd e Kaplan, 1978)', (media, rotulo) => {
    expect(classificarMedia(media).rotulo).toBe(rotulo)
  })

  it('média tonal usa 500, 1000 e 2000 Hz e arredonda', () => {
    expect(mediaTonal(orelha(tres(20, 25, 30)))).toBe(25)
    expect(mediaTonal(orelha(tres(20, 20, 25)))).toBe(22) // 21,67
    // outras frequências não entram na conta
    expect(mediaTonal(orelha({ ...tres(10, 10, 10), 250: 90, 4000: 90 }))).toBe(10)
  })

  it('sem uma das três frequências não há média nem classificação', () => {
    expect(mediaTonal(orelha({ 500: 20, 2000: 30 }))).toBeNull()
    expect(mediaTonal(orelha({}))).toBeNull()
  })

  it('a classificação usa a média arredondada (25,33 vira 25, ainda normal)', () => {
    const m = mediaTonal(orelha(tres(25, 25, 26)))
    expect(m).toBe(25)
    expect(classificarMedia(m as number).rotulo).toBe('Audição normal')
  })

  it('tipo da perda pelo gap aéreo-ósseo de 15 dB', () => {
    expect(tipoDaPerda(orelha(tres(50, 50, 50), tres(10, 10, 10)))).toBe('condutiva')
    expect(tipoDaPerda(orelha(tres(50, 50, 50), tres(45, 45, 45)))).toBe('neurossensorial')
    expect(tipoDaPerda(orelha(tres(60, 60, 60), tres(35, 35, 35)))).toBe('mista')
    // limite do gap: 15 já conta
    expect(tipoDaPerda(orelha(tres(40, 40, 40), tres(25, 25, 25)))).toBe('condutiva')
    expect(tipoDaPerda(orelha(tres(40, 40, 40), tres(26, 26, 26)))).toBe('neurossensorial')
  })

  it('sem via óssea completa ou com audição normal não sugere tipo', () => {
    expect(tipoDaPerda(orelha(tres(50, 50, 50)))).toBeNull()
    expect(tipoDaPerda(orelha(tres(50, 50, 50), { 500: 10, 1000: 10 }))).toBeNull()
    expect(tipoDaPerda(orelha(tres(15, 15, 15), tres(10, 10, 10)))).toBeNull()
  })

  it('normalizar descarta valor fora de -10 a 120, decimal e lixo, e completa o tamanho', () => {
    const d = normalizarAudiograma({ od: { va: [15, -20, 130, 12.5, 'x', 120, -10], vo: [5], lrf: 25, iprf: 101 }, oe: null, obs: '  oi  \n  tudo ' })
    expect(d.od.va).toEqual([15, null, null, null, null, 120, -10, null])
    expect(d.od.vo).toEqual([5, null, null, null, null, null])
    expect(d.od.lrf).toBe(25)
    expect(d.od.iprf).toBeNull()
    expect(d.oe).toEqual(audiogramaVazio().oe)
    expect(d.obs).toBe('oi tudo')
  })

  it('posições do gráfico: frequência em escala logarítmica e 0 dB no alto', () => {
    expect(posicaoFrequencia(250)).toBe(0)
    expect(posicaoFrequencia(8000)).toBe(1)
    expect(posicaoFrequencia(1000)).toBeCloseTo(0.4, 10)
    expect(posicaoFrequencia(500)).toBeLessThan(posicaoFrequencia(3000))
    expect(posicaoLimiar(-10)).toBe(0)
    expect(posicaoLimiar(120)).toBe(1)
    expect(posicaoLimiar(500)).toBe(1)
  })

  it('ida e volta no prontuário com acentos; a linha técnica some em textoVisivel', () => {
    const dados: AudiogramaDados = {
      od: { ...orelha(tres(20, 25, 30), tres(15, 15, 20)), lrf: 25, iprf: 96 },
      oe: orelha({ 250: 40, 500: 45, 1000: 50, 2000: 55, 4000: 60, 8000: 70 }),
      obs: 'Sem resposta em 8 kHz na OE; paciente colaborativo — mascaramento não necessário.',
    }
    const def = PROTOCOLOS.audiograma
    const { entry_text, entry_type } = montarEntradaProtocolo(def, dados)
    expect(entry_type).toBe('escala')
    expect(entry_text).toContain('OD: média tonal de 25 dB NA')
    expect(entry_text).toContain('audição normal')
    expect(entry_text).toContain('OD logoaudiometria: LRF 25 dB NA; IPRF 96%.')
    expect(entry_text).toContain('#protocolo:v1:audiograma:')
    const lida = lerProtocolo(entry_text)
    expect(lida?.id).toBe('audiograma')
    expect(lida?.dados).toEqual(dados)
    expect(lida?.destaque?.rotulo).toContain('OD: normal')
    expect(lida?.indicadores).toEqual([25, 50]) // OE: (45 + 50 + 55) / 3
    expect(lida?.destaque?.rotulo).toContain('OE: perda de grau moderado')
    const visivel = textoVisivel(entry_text)
    expect(visivel).not.toContain('#protocolo')
    expect(visivel).toContain('mascaramento não necessário')
  })
})

describe('Ficha de voz', () => {
  it('GRBAS aceita só graus de 0 a 3; tempos com uma casa; frequência fundamental plausível', () => {
    const d = normalizarVoz({ grbas: { g: 2, r: 4, b: -1, a: 1.5, s: 0 }, tmf: { a: 12.34, i: 0, s: 100, z: 15 }, f0: 30, pitch: 'agudo', ressonancia: 'xx', sintomas: ['rouquidao', 'inventado'] })
    expect(d.grbas).toEqual({ g: 2, r: null, b: null, a: null, s: 0 })
    expect(d.tmf).toEqual({ a: 12.3, i: null, u: null, s: null, z: 15 })
    expect(d.f0).toBeNull()
    expect(d.pitch).toBe('agudo')
    expect(d.ressonancia).toBeNull()
    expect(d.sintomas).toEqual(['rouquidao'])
  })

  it('relação s/z: 1,4 é o limite (acima sugere avaliar a laringe)', () => {
    const d = vozVazia()
    expect(relacaoSZ(d)).toBeNull()
    d.tmf.s = 18
    d.tmf.z = 15
    expect(relacaoSZ(d)).toBe(1.2)
    d.tmf.s = 21
    d.tmf.z = 15
    expect(relacaoSZ(d)).toBe(1.4)
    expect(relacaoSZ(d)! > LIMITE_SZ).toBe(false)
    d.tmf.s = 22
    expect(relacaoSZ(d)! > LIMITE_SZ).toBe(true)
    expect(MODULO_VOZ.resumo(d).join(' ')).toContain('acima de 1,4')
  })

  it('destaque pelo grau geral; só a observação não deixa salvar', () => {
    const d = vozVazia()
    expect(MODULO_VOZ.destaque(d)).toBeNull()
    expect(MODULO_VOZ.pronto({ ...d, obs: 'só texto' })).toBe(false)
    d.grbas.g = 2
    expect(MODULO_VOZ.destaque(d)).toEqual({ rotulo: 'Grau geral: moderada', tom: 'wait' })
    expect(MODULO_VOZ.pronto(d)).toBe(true)
    d.grbas.g = 0
    expect(MODULO_VOZ.pronto(d)).toBe(true)
    expect(MODULO_VOZ.destaque(d)?.tom).toBe('ok')
  })

  it('ida e volta no prontuário', () => {
    const d = vozVazia()
    d.grbas = { g: 2, r: 2, b: 1, a: 0, s: 1 }
    d.tmf.a = 9.5
    d.habitos = ['grito', 'fumo']
    d.autoavaliacao = 7
    d.obs = 'Professora, 30 horas por semana.'
    const { entry_text } = montarEntradaProtocolo(PROTOCOLOS.voz, d)
    expect(entry_text).toContain('GRBAS: G 2 (moderada); R 2 (moderada); B 1 (leve); A 0 (sem alteração); S 1 (leve).')
    expect(entry_text).toContain('/a/ 9,5 s')
    const lida = lerProtocolo(entry_text)
    expect(lida?.dados).toEqual(d)
    expect(lida?.indicadores).toEqual([2, 9.5, 7])
  })
})

describe('Ficha de fluência', () => {
  const base = (total: number, contagens: Partial<Record<keyof ReturnType<typeof fluenciaVazia>['contagens'], number>>) => {
    const d = fluenciaVazia()
    d.total = total
    Object.assign(d.contagens, contagens)
    return d
  }

  it('porcentagens sobre o total da amostra, com uma casa', () => {
    const c = calcularFluencia(base(200, { rep_silaba: 4, bloqueio: 2, interjeicao: 10 }))
    expect(c.gagas).toBe(6)
    expect(c.comuns).toBe(10)
    expect(c.totalDisfluencias).toBe(16)
    expect(c.pctGagas).toBe(3)
    expect(c.pctComuns).toBe(5)
    expect(c.pctTotal).toBe(8)
    expect(calcularFluencia(base(150, { prolongamento: 1 })).pctGagas).toBe(0.7)
  })

  it('3% de disfluências gagas é o limite: 2,5% abaixo, 3% acima', () => {
    expect(faixaFluencia(2.9).tom).toBe('ok')
    expect(faixaFluencia(3).tom).toBe('warn')
    expect(faixaFluencia(calcularFluencia(base(200, { rep_silaba: 5 })).pctGagas as number).rotulo).toContain('abaixo de 3%')
    expect(faixaFluencia(calcularFluencia(base(200, { rep_silaba: 6 })).pctGagas as number).rotulo).toContain('3% ou mais')
  })

  it('as comuns não entram no limite das gagas', () => {
    const c = calcularFluencia(base(100, { interjeicao: 20, revisao: 10 }))
    expect(c.pctGagas).toBe(0)
    expect(c.pctTotal).toBe(30)
  })

  it('sem total não há porcentagem; velocidade por minuto quando há duração', () => {
    const sem = fluenciaVazia()
    sem.contagens.bloqueio = 3
    expect(calcularFluencia(sem).pctGagas).toBeNull()
    expect(MODULO_FLUENCIA.pronto(sem)).toBe(false)
    const d = base(180, {})
    d.segundos = 90
    expect(calcularFluencia(d).velocidade).toBe(120)
  })

  it('amostra curta: menos de 100 palavras ou 200 sílabas', () => {
    expect(amostraCurta({ ...fluenciaVazia(), total: 99 })).toBe(true)
    expect(amostraCurta({ ...fluenciaVazia(), total: 100 })).toBe(false)
    expect(amostraCurta({ ...fluenciaVazia(), total: 199, unidade: 'silabas' })).toBe(true)
    expect(amostraCurta({ ...fluenciaVazia(), total: 200, unidade: 'silabas' })).toBe(false)
  })

  it('zero disfluências é resultado válido e salva', () => {
    expect(MODULO_FLUENCIA.pronto(base(250, {}))).toBe(true)
    expect(MODULO_FLUENCIA.destaque(base(250, {}))).toEqual({ rotulo: '0% de disfluências gagas', tom: 'ok' })
  })

  it('normalizar limita contagens e descarta o que é inválido', () => {
    const d = normalizarFluencia({ total: 0, segundos: -3, unidade: 'letras', contagens: { bloqueio: 1000, rep_mono: -2, revisao: 4 }, concomitantes: ['piscar', 'x'], autopercepcao: 11 })
    expect(d.total).toBeNull()
    expect(d.segundos).toBeNull()
    expect(d.unidade).toBe('palavras')
    expect(d.contagens.bloqueio).toBe(0)
    expect(d.contagens.rep_mono).toBe(0)
    expect(d.contagens.revisao).toBe(4)
    expect(d.concomitantes).toEqual(['piscar'])
    expect(d.autopercepcao).toBeNull()
  })

  it('ida e volta no prontuário', () => {
    const d = base(220, { rep_silaba: 3, prolongamento: 2, interjeicao: 7 })
    d.tarefa = 'conversa'
    d.segundos = 110
    const { entry_text } = montarEntradaProtocolo(PROTOCOLOS.fluencia, d)
    expect(entry_text).toContain('Disfluências gagas: 5')
    expect(entry_text).toContain('gagas 2,3%')
    expect(entry_text).toContain('120 palavras por minuto')
    const lida = lerProtocolo(entry_text)
    expect(lida?.dados).toEqual(d)
    expect(lida?.indicadores).toEqual([2.3, 5.5])
  })
})

describe('Ficha de motricidade orofacial', () => {
  it('normalizar mantém só itens e escolhas do catálogo, com valores válidos', () => {
    const d = normalizarMof({ itens: { labios_repouso: 'alterado', face: 'adequado', inventado: 'alterado', fala: 'talvez' }, escolhas: { modo_respiratorio: 'oral', padrao_mastigatorio: 'xx' }, obs: 'x' })
    expect(d.itens).toEqual({ face: 'adequado', labios_repouso: 'alterado' })
    expect(d.escolhas).toEqual({ modo_respiratorio: 'oral' })
  })

  it('conta avaliados e alterados', () => {
    const d = mofVazio()
    d.itens = { face: 'adequado', labios_repouso: 'alterado', mob_lingua: 'alterado' }
    expect(contarMof(d)).toEqual({ avaliados: 3, alterados: 2 })
    expect(MODULO_MOF.destaque(d)).toEqual({ rotulo: '2 itens alterados de 3', tom: 'wait' })
    d.itens = { face: 'adequado' }
    expect(MODULO_MOF.destaque(d)).toEqual({ rotulo: 'Sem alterações em 1 itens', tom: 'ok' })
  })

  it('ids dos itens são únicos', () => {
    const ids = MOF_GRUPOS.flatMap(g => g.itens.map(i => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('só a observação não deixa salvar', () => {
    expect(MODULO_MOF.pronto({ ...mofVazio(), obs: 'texto' })).toBe(false)
    expect(MODULO_MOF.pronto({ ...mofVazio(), escolhas: { modo_respiratorio: 'oral' } })).toBe(true)
  })

  it('ida e volta no prontuário: lista só o que está alterado', () => {
    const d = mofVazio()
    d.itens = { labios_repouso: 'alterado', lingua_repouso: 'alterado', face: 'adequado', tonus_labios: 'adequado' }
    d.escolhas = { modo_respiratorio: 'mista' }
    d.obs = 'Respira pela boca desde a infância.'
    const { entry_text } = montarEntradaProtocolo(PROTOCOLOS.mof, d)
    expect(entry_text).toContain('Itens avaliados: 4; alterados: 2.')
    expect(entry_text).toContain('Aparência e postura em repouso: alterado em lábios, língua (3 itens avaliados).')
    expect(entry_text).toContain('Tonicidade: sem alterações (1 item avaliado).')
    expect(entry_text).toContain('Modo respiratório predominante: oronasal.')
    expect(lerProtocolo(entry_text)?.dados).toEqual(d)
    expect(lerProtocolo(entry_text)?.indicadores).toEqual([2])
  })
})

describe('registro das fichas', () => {
  it('registro quebrado ou de outro tipo não vira ficha', () => {
    expect(lerProtocolo(null)).toBeNull()
    expect(lerProtocolo('Paciente relata melhora.')).toBeNull()
    expect(lerProtocolo('#protocolo:v1:copm:e30=')).toBeNull()
    expect(lerProtocolo('#protocolo:v1:voz:%%%')).toBeNull()
    expect(lerProtocolo('#protocolo:v1:voz:e30')).toBeNull() // base64 que não é JSON
    expect(lerEntrada('#protocolo:v1:voz:e30')).toBeNull()
    expect(lerProtocolo('#escala:v1:phq9:1,1,1,1,1,1,1,1,1,0')).toBeNull()
  })

  it('ficha sem nada preenchido não é lida', () => {
    const vazio = montarEntradaProtocolo(PROTOCOLOS.audiograma, audiogramaVazio()).entry_text
    expect(lerProtocolo(vazio)).toBeNull()
  })

  it('dados de outra versão são normalizados na leitura', () => {
    const json = JSON.stringify({ grbas: { g: 9, r: 1 }, algoNovo: true })
    const b64 = Buffer.from(json, 'utf-8').toString('base64url')
    const lida = lerProtocolo(`#protocolo:v1:voz:${b64}`)
    expect(lida?.dados).toEqual({ ...vozVazia(), grbas: { g: null, r: 1, b: null, a: null, s: null } })
  })

  it('textoVisivel esconde as duas linhas técnicas e mantém o resto', () => {
    const f = montarEntradaProtocolo(PROTOCOLOS.mof, { ...mofVazio(), itens: { face: 'alterado' } }).entry_text
    expect(f).toContain('#protocolo:v1:mof:')
    expect(textoVisivel(f)).not.toContain('#protocolo')
    expect(textoVisivel(f)).toContain('Ficha Motricidade orofacial')
    expect(textoVisivel(f).endsWith('\n')).toBe(false)
    expect(textoVisivel(montarEntrada(WHO5, todas(WHO5, 3)).entry_text)).not.toContain('#escala')
  })

  it('catálogo de fichas: áreas e ids', () => {
    expect(protocolosParaAreas(['fono']).map(p => p.id)).toEqual(['audiograma', 'voz', 'fluencia', 'mof'])
    expect(protocolosParaAreas(['psico', 'to', 'fisio'])).toEqual([])
    expect(isProtocoloId('voz')).toBe(true)
    expect(isProtocoloId('phq9')).toBe(false)
    expect(isProtocoloId('toString')).toBe(false)
    const [fono] = escalasParaAreas(['fono'])
    expect(isProtocolo(fono)).toBe(true)
    expect(isProtocolo(ESCALAS.phq9)).toBe(false)
    for (const p of Object.values(PROTOCOLOS)) {
      expect(p.fonte.original.length).toBeGreaterThan(40)
      expect(p.fonte.nota.length).toBeGreaterThan(20)
    }
  })
})
