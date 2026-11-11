import { describe, expect, it } from 'vitest'
import {
  alimentoDaLinha, buscarAlimentos, carregarTaco, catalogoCom, nutrientesDaPorcao, substituicoesEquivalentes, tacoCarregada,
  GRUPO_INFO, MEDIDAS_PADRAO,
} from './alimentos'
import { TACO_LINHAS } from './taco-dados'
import {
  listaDeCompras, normalizarPlano, planoVazio, progressoDoDia, totaisDoPlano, formatarPeso, type PlanoDados,
} from './plano'

const ALIMENTOS_TACO = await carregarTaco()
const porId = (id: string) => ALIMENTOS_TACO.find(a => a.id === id)!

// ids que já existiam quando o banco tinha 169 alimentos: planos salvos apontam para eles e não podem mudar
const IDS_ORIGINAIS = [1, 3, 7, 8, 13, 25, 33, 35, 40, 43, 45, 48, 52, 53, 62, 63, 64, 70, 74, 75, 77, 78, 86, 88, 91, 95, 97, 100, 107, 109, 110, 112, 115, 116, 118, 119, 129, 140, 142, 144, 145, 147, 149, 152, 157, 162, 163, 164, 168, 169, 179, 182, 197, 200, 207, 208, 214, 221, 222, 225, 226, 228, 231, 232, 235, 236, 238, 239, 242, 244, 251, 256, 260, 261, 262, 263, 272, 276, 277, 278, 284, 294, 301, 307, 313, 315, 316, 317, 318, 319, 321, 326, 328, 337, 346, 349, 351, 356, 358, 363, 368, 370, 371, 377, 381, 383, 398, 403, 404, 406, 408, 409, 410, 413, 417, 420, 423, 425, 429, 432, 435, 439, 447, 448, 449, 456, 459, 461, 463, 464, 467, 468, 469, 471, 477, 478, 485, 486, 488, 489, 490, 491, 493, 494, 495, 498, 507, 521, 524, 533, 546, 551, 557, 560, 561, 563, 567, 575, 577, 579, 582, 584, 587, 588, 589, 590, 593, 594, 597]

// Fermento químico: o "carboidrato" da TACO inclui sais sem energia, então a conta 4/4/9 passa muito do kcal publicado
const FORA_DA_CONTA_4_4_9 = new Set([513])

describe('catálogo TACO', () => {
  it('tem os 591 alimentos da TACO com energia, ids únicos e grupo válido', () => {
    expect(ALIMENTOS_TACO.length).toBe(591)
    expect(new Set(ALIMENTOS_TACO.map(a => a.id)).size).toBe(ALIMENTOS_TACO.length)
    for (const a of ALIMENTOS_TACO) {
      expect(a.id).toMatch(/^taco-\d+$/)
      expect(a.kcal).toBeGreaterThan(0)
      expect(GRUPO_INFO[a.grupo]).toBeDefined()
      for (const v of [a.proteina, a.carboidrato, a.lipidio, a.fibra]) expect(Number.isFinite(v) && v >= 0).toBe(true)
    }
  })
  it('mantém os ids dos 169 alimentos antigos (planos salvos não quebram)', () => {
    expect(IDS_ORIGINAIS).toHaveLength(169)
    for (const n of IDS_ORIGINAIS) expect(ALIMENTOS_TACO.some(a => a.id === `taco-${n}`), `taco-${n}`).toBe(true)
  })
  it('os 6 alimentos sem energia na TACO ficam de fora', () => {
    for (const n of [450, 457, 458, 516, 517, 591]) expect(ALIMENTOS_TACO.some(a => a.id === `taco-${n}`), `taco-${n}`).toBe(false)
  })
  it('valores conferidos com a TACO 4ª edição', () => {
    const arrozIntegral = TACO_LINHAS.find(l => l[0] === 1)!
    expect(arrozIntegral.slice(1)).toEqual(['Arroz, integral, cozido', 'cereais', 124, 2.6, 25.8, 1, 2.7])
    const feijao = TACO_LINHAS.find(l => l[0] === 561)!
    expect(feijao.slice(1)).toEqual(['Feijão, carioca, cozido', 'leguminosas', 76, 4.8, 13.6, 0.5, 8.5])
    const ovo = TACO_LINHAS.find(l => l[0] === 488)!
    expect(ovo.slice(3)).toEqual([146, 13.3, 0.6, 9.5, null])
    // itens que só existem na edição completa
    expect(TACO_LINHAS.find(l => l[0] === 597)!.slice(1)).toEqual(['Noz, crua', 'oleaginosas', 620, 14, 18.4, 59.4, 7.2])
    expect(TACO_LINHAS.find(l => l[0] === 540)!.slice(1, 4)).toEqual(['Feijoada', 'preparados', 117])
  })
  it('"Tr" (traços) vira 0 e "NA" vira null; null conta como 0 no catálogo', () => {
    // batata inglesa cozida: lipídeo Tr; arroz integral cozido: colesterol/vitaminas NA não entram, fibra 2,7
    const batata = TACO_LINHAS.find(l => l[0] === 91)!
    expect(batata[6]).toBe(0)
    const ovo = TACO_LINHAS.find(l => l[0] === 488)!
    expect(ovo[7]).toBeNull()
    expect(alimentoDaLinha(ovo).fibra).toBe(0)
    // cana, aguardente: só energia na TACO (macros NA)
    const cachaca = alimentoDaLinha(TACO_LINHAS.find(l => l[0] === 472)!)
    expect([cachaca.nome, cachaca.kcal, cachaca.proteina, cachaca.carboidrato, cachaca.lipidio]).toEqual(['Cana, aguardente', 216, 0, 0, 0])
  })
  it('nomes sem lixo de extração: acentos, espaços duplos e notas de rodapé', () => {
    for (const a of ALIMENTOS_TACO) {
      expect(a.nome, a.id).toBe(a.nome.normalize('NFC').replace(/\s+/g, ' ').trim())
      expect(a.nome, a.id).not.toMatch(/[\uFFFD]|\d$/)
    }
    expect(porId('taco-69').nome).toBe('Abóbora, pescoço, crua')
    expect(porId('taco-474').nome).toBe('Cerveja, pilsen')
    expect(porId('taco-315').nome).toBe('Salmão, filé, com pele, fresco, grelhado')
  })
  it('as medidas padrão apontam para alimentos que existem', () => {
    for (const id of Object.keys(MEDIDAS_PADRAO)) expect(ALIMENTOS_TACO.some(a => a.id === id)).toBe(true)
  })
  it('as calorias batem com 4/4/9 dentro de uma folga razoável (pega erro de digitação)', () => {
    for (const a of ALIMENTOS_TACO) {
      if (FORA_DA_CONTA_4_4_9.has(Number(a.id.slice(5)))) continue
      if (a.proteina + a.carboidrato + a.lipidio === 0) continue // só a energia foi publicada (ex.: aguardente)
      const calc = a.proteina * 4 + a.carboidrato * 4 + a.lipidio * 9
      // fibra, álcool e unidades de energia não metabolizável explicam diferenças; erro grande indica dado trocado
      expect(Math.abs(calc - a.kcal), a.nome).toBeLessThanOrEqual(Math.max(40, a.kcal * 0.25))
    }
  })
})

describe('carregamento sob demanda', () => {
  it('carregarTaco reaproveita o mesmo resultado e tacoCarregada o expõe sem esperar', async () => {
    expect(await carregarTaco()).toBe(ALIMENTOS_TACO)
    expect(tacoCarregada()).toBe(ALIMENTOS_TACO)
  })
})

describe('busca e porções', () => {
  it('acha sem acento e em qualquer ordem', () => {
    expect(buscarAlimentos(ALIMENTOS_TACO, 'feijao carioca')[0].id).toBe('taco-561')
    expect(buscarAlimentos(ALIMENTOS_TACO, 'cozido arroz integral').map(a => a.id)).toContain('taco-1')
    expect(buscarAlimentos(ALIMENTOS_TACO, '')).toEqual([])
    expect(buscarAlimentos(ALIMENTOS_TACO, 'zzzzzz')).toEqual([])
  })
  it('ignora acento e caixa de qualquer lado, e trata hífen e barra como espaço', () => {
    expect(buscarAlimentos(ALIMENTOS_TACO, 'ABÓBORA pescoco')[0].id).toBe('taco-69')
    expect(buscarAlimentos(ALIMENTOS_TACO, 'abobora pescoço')[0].id).toBe('taco-69')
    expect(buscarAlimentos(ALIMENTOS_TACO, 'grao de bico')[0].id).toBe('taco-575')
    expect(buscarAlimentos(ALIMENTOS_TACO, 'Grão-de-bico')[0].id).toBe('taco-575')
    expect(buscarAlimentos(ALIMENTOS_TACO, 'castanha do brasil')[0].id).toBe('taco-589')
    expect(buscarAlimentos(ALIMENTOS_TACO, 'pe de moleque')[0].id).toBe('taco-580')
    expect(buscarAlimentos(ALIMENTOS_TACO, 'pao de queijo').map(a => a.id)).toEqual(expect.arrayContaining(['taco-140', 'taco-141']))
    expect(buscarAlimentos(ALIMENTOS_TACO, 'acai')[0].nome).toMatch(/^Açaí/)
    expect(buscarAlimentos(ALIMENTOS_TACO, 'cozido/10minutos').length).toBeGreaterThan(0)
  })
  it('versão preparada vem antes da crua, a menos que a busca peça cru', () => {
    expect(buscarAlimentos(ALIMENTOS_TACO, 'feijao preto')[0].id).toBe('taco-567') // cozido, não o cru
    expect(buscarAlimentos(ALIMENTOS_TACO, 'feijao preto cru')[0].id).toBe('taco-568')
    expect(buscarAlimentos(ALIMENTOS_TACO, 'arroz')[0].nome).toMatch(/^Arroz/)
  })
  it('acha alimentos que só existem na edição completa e respeita o limite', () => {
    expect(buscarAlimentos(ALIMENTOS_TACO, 'feijoada').map(a => a.id)).toContain('taco-540')
    expect(buscarAlimentos(ALIMENTOS_TACO, 'sardinha').length).toBeGreaterThan(0)
    expect(buscarAlimentos(ALIMENTOS_TACO, 'cru', 10)).toHaveLength(10)
  })
  it('calcula os nutrientes pela gramagem', () => {
    const n = nutrientesDaPorcao(porId('taco-1'), 150)
    expect(n.kcal).toBeCloseTo(186, 5)
    expect(n.proteina).toBeCloseTo(3.9, 5)
    expect(n.carboidrato).toBeCloseTo(38.7, 5)
  })
  it('inclui alimento personalizado antes da TACO', () => {
    const cat = catalogoCom([{ id: 'p-1', nome: 'Leite integral (rótulo)', grupo: 'leites', kcal: 61, proteina: 3, carboidrato: 4.7, lipidio: 3.3, fibra: 0 }], ALIMENTOS_TACO)
    expect(cat[0].origem).toBe('personalizado')
    expect(cat.length).toBe(ALIMENTOS_TACO.length + 1)
    expect(catalogoCom([], ALIMENTOS_TACO)).toBe(ALIMENTOS_TACO)
  })
})

describe('substituições equivalentes', () => {
  it('troca por alimentos do mesmo grupo com energia a no máximo 10%', () => {
    const arroz = porId('taco-3') // 128 kcal/100 g
    const subs = substituicoesEquivalentes(arroz, 150, ALIMENTOS_TACO)
    const alvo = 128 * 1.5
    expect(subs.length).toBeGreaterThan(3)
    for (const s of subs) {
      expect(GRUPO_INFO[s.alimento.grupo].pool).toBe('cereais')
      expect(s.alimento.id).not.toBe(arroz.id)
      expect(Math.abs(s.kcal - alvo) / alvo).toBeLessThanOrEqual(0.1 + 1e-9)
      expect(s.gramas % 5).toBe(0)
    }
  })
  it('proteínas animais trocam entre carne, peixe e ovo', () => {
    const frango = porId('taco-410')
    const grupos = new Set(substituicoesEquivalentes(frango, 120, ALIMENTOS_TACO, { max: 30 }).map(s => s.alimento.grupo))
    expect(grupos.has('carnes')).toBe(true)
    expect(grupos.has('pescados') || grupos.has('ovos')).toBe(true)
  })
  it('folhas e itens de até 15 kcal não geram troca', () => {
    expect(substituicoesEquivalentes(porId('taco-77'), 80, ALIMENTOS_TACO)).toEqual([])
  })
})

describe('plano alimentar', () => {
  const plano: PlanoDados = {
    ...planoVazio(),
    meta: { kcal: 400, proteinaG: 20, carboidratoG: 50, lipidioG: 10 },
    refeicoes: [
      { id: 'r1', nome: 'Café', horario: '07:00', itens: [{ id: 'i1', alimentoId: 'taco-53', gramas: 50 }, { id: 'i2', alimentoId: 'taco-488', gramas: 100 }] },
      { id: 'r2', nome: 'Almoço', horario: '12:00', itens: [{ id: 'i3', alimentoId: 'taco-3', gramas: 100 }, { id: 'i4', alimentoId: 'inexistente', gramas: 50 }] },
    ],
  }
  it('soma por refeição e por dia; item sem alimento conta zero', () => {
    const t = totaisDoPlano(plano, ALIMENTOS_TACO)
    expect(t.refeicoes[0].total.kcal).toBeCloseTo(150 + 146, 5)
    expect(t.refeicoes[1].total.kcal).toBeCloseTo(128, 5)
    expect(t.refeicoes[1].itens[1].alimento).toBeNull()
    expect(t.dia.kcal).toBeCloseTo(150 + 146 + 128, 5)
  })
  it('compara com a meta: abaixo, ok e acima', () => {
    const t = totaisDoPlano(plano, ALIMENTOS_TACO)
    const p = progressoDoDia(t.dia, plano.meta)
    expect(p[0].chave).toBe('kcal')
    expect(p[0].situacao).toBe('ok') // 424 / 400 = 106%
  })
  it('limites de 90% e 110%', () => {
    const base = { kcal: 0, proteina: 0, carboidrato: 0, lipidio: 0, fibra: 0 }
    const meta = { kcal: 1000, proteinaG: null, carboidratoG: null, lipidioG: null }
    expect(progressoDoDia({ ...base, kcal: 899 }, meta)[0].situacao).toBe('abaixo')
    expect(progressoDoDia({ ...base, kcal: 900 }, meta)[0].situacao).toBe('ok')
    expect(progressoDoDia({ ...base, kcal: 1100 }, meta)[0].situacao).toBe('ok')
    expect(progressoDoDia({ ...base, kcal: 1101 }, meta)[0].situacao).toBe('acima')
    expect(progressoDoDia({ ...base, kcal: 500 }, meta)[1].situacao).toBeNull()
  })
  it('lista de compras soma o dia, multiplica pelos dias e agrupa', () => {
    const lista = listaDeCompras({ ...plano, refeicoes: [...plano.refeicoes, { id: 'r3', nome: 'Jantar', horario: '', itens: [{ id: 'i5', alimentoId: 'taco-3', gramas: 150 }] }] }, ALIMENTOS_TACO, 7)
    const cereais = lista.find(g => g.grupo === 'cereais')!
    expect(cereais.itens.find(i => i.alimento.id === 'taco-3')!.gramasTotal).toBe(250 * 7)
    expect(lista.find(g => g.grupo === 'ovos')!.itens[0].gramasTotal).toBe(700)
    expect(lista.flatMap(g => g.itens).some(i => i.alimento.id === 'inexistente')).toBe(false)
  })
  it('formata peso', () => {
    expect(formatarPeso(350)).toBe('350 g')
    expect(formatarPeso(1750)).toBe('1,75 kg')
  })
  it('normaliza dado salvo incompleto ou corrompido', () => {
    expect(normalizarPlano(null).refeicoes).toEqual([])
    const n = normalizarPlano({ titulo: '', meta: { kcal: -5, proteinaG: 'x' }, refeicoes: [{ id: 'a', nome: 'X', itens: [{ id: 'i', alimentoId: 'taco-1', gramas: 'abc' }, { id: 'j', alimentoId: 'taco-1', gramas: 80 }] }, null] })
    expect(n.titulo).toBe('Plano alimentar')
    expect(n.meta).toEqual({ kcal: null, proteinaG: null, carboidratoG: null, lipidioG: null })
    expect(n.refeicoes).toHaveLength(1)
    expect(n.refeicoes[0].itens).toHaveLength(1)
  })
})
