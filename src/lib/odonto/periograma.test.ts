import { describe, expect, it } from 'vitest'
import {
  ausentesDoOdontograma, campoCompleto, compararPerio, comDente, comMarcaNoSitio, comValorNoSitio, denteVazio, faixaSangramento, fmtDelta, fmtNum,
  lerMm, marcarAusentes, nic, normalizarPerio, ordemNaTela, perioTemConteudo, perioVazio, resumoDente, resumoPerio, rotuloSitio,
  serializarPerio, sitiosDoDente, temFurca, type PerioDados,
} from './periograma'

/** Exame com ps/rec/sang digitados por sítio do dente, na ordem [d, c, m] de cada face. */
function exame(spec: Record<number, { vps?: (number | null)[]; vrec?: (number | null)[]; lps?: (number | null)[]; vsang?: boolean[]; lsang?: boolean[]; sup?: boolean[] }>): PerioDados {
  let d = perioVazio()
  for (const [n, s] of Object.entries(spec)) {
    d = comDente(d, Number(n), t => {
      let x = t
      s.vps?.forEach((v, i) => { x = comValorNoSitio(x, 'v', 'ps', i, v) })
      s.vrec?.forEach((v, i) => { x = comValorNoSitio(x, 'v', 'rec', i, v) })
      s.lps?.forEach((v, i) => { x = comValorNoSitio(x, 'l', 'ps', i, v) })
      s.vsang?.forEach((v, i) => { x = comMarcaNoSitio(x, 'v', 'sang', i, v) })
      s.lsang?.forEach((v, i) => { x = comMarcaNoSitio(x, 'l', 'sang', i, v) })
      s.sup?.forEach((v, i) => { x = comMarcaNoSitio(x, 'v', 'sup', i, v) })
      return x
    })
  }
  return d
}

describe('nível de inserção clínica', () => {
  it('soma a profundidade de sondagem e a recessão', () => {
    expect(nic(3, 2)).toBe(5)
    expect(nic(4, 0)).toBe(4)
  })
  it('recessão vazia vale 0 e sem profundidade não há NIC', () => {
    expect(nic(3, null)).toBe(3)
    expect(nic(null, 2)).toBeNull()
    expect(nic(null, null)).toBeNull()
  })
})

describe('sítios do dente', () => {
  it('devolve os 6 sítios com o NIC de cada um', () => {
    const d = exame({ 16: { vps: [3, 4, 5], vrec: [1, null, 2], lps: [2, 2, 2] } })
    const s = sitiosDoDente(d.dentes[16])
    expect(s).toHaveLength(6)
    expect(s.map(x => x.nic)).toEqual([4, 4, 7, 2, 2, 2])
    expect(s.slice(0, 3).map(x => x.sitio)).toEqual(['d', 'c', 'm'])
    expect(s.slice(3).every(x => x.face === 'l')).toBe(true)
  })
})

describe('resumo por dente', () => {
  it('calcula média e máximo da profundidade e do NIC', () => {
    const d = exame({ 11: { vps: [2, 4, 6], vrec: [0, 1, 2], lps: [3, 3, 3] } })
    const r = resumoDente(d.dentes[11])
    expect(r.sitiosRegistrados).toBe(6)
    expect(r.psMedia).toBeCloseTo(21 / 6)
    expect(r.psMax).toBe(6)
    expect(r.nicMax).toBe(8)
    expect(r.nicMedia).toBeCloseTo((2 + 5 + 8 + 9) / 6)
  })
  it('dente ausente não entra nas contas', () => {
    let d = exame({ 18: { vps: [5, 5, 5] } })
    d = marcarAusentes(d, [18])
    expect(resumoDente(d.dentes[18]).sitiosRegistrados).toBe(0)
    expect(resumoPerio(d).sitiosRegistrados).toBe(0)
    expect(resumoPerio(d).dentesAusentes).toBe(1)
  })
})

describe('resumo do exame', () => {
  it('percentual de sangramento = sítios com sangramento / sítios registrados', () => {
    // 2 dentes com 6 sítios medidos cada = 12 sítios; 3 sangrando = 25%
    const d = exame({
      11: { vps: [2, 2, 2], lps: [2, 2, 2], vsang: [true, false, false], lsang: [false, true, false] },
      21: { vps: [3, 3, 3], lps: [3, 3, 3], vsang: [false, false, true] },
    })
    const r = resumoPerio(d)
    expect(r.sitiosRegistrados).toBe(12)
    expect(r.sitiosSangrando).toBe(3)
    expect(r.pctSangramento).toBeCloseTo(25)
    expect(r.faixaSangramento).toBe('moderado')
    expect(r.dentesAvaliados).toBe(2)
  })
  it('conta sítios com 4 mm ou mais e 6 mm ou mais', () => {
    const d = exame({ 26: { vps: [3, 4, 6], lps: [7, 2, 5] } })
    const r = resumoPerio(d)
    expect(r.sitiosPs4).toBe(4)
    expect(r.sitiosPs6).toBe(2)
    expect(r.pctPs4).toBeCloseTo((4 / 6) * 100)
    expect(r.psMax).toBe(7)
  })
  it('sítio com sangramento mas sem profundidade entra no denominador', () => {
    const d = exame({ 31: { vsang: [true, false, false] } })
    const r = resumoPerio(d)
    expect(r.sitiosRegistrados).toBe(1)
    expect(r.pctSangramento).toBe(100)
    expect(r.sitiosComPs).toBe(0)
    expect(r.psMedia).toBeNull()
  })
  it('exame vazio não tem percentuais', () => {
    const r = resumoPerio(perioVazio())
    expect(r.pctSangramento).toBeNull()
    expect(r.faixaSangramento).toBeNull()
    expect(r.psMedia).toBeNull()
    expect(r.nicMedia).toBeNull()
  })
  it('conta mobilidade e furca (furca só em dente com mais de uma raiz)', () => {
    let d = perioVazio()
    d = comDente(d, 16, t => ({ ...t, mob: 2, furca: 2 }))
    d = comDente(d, 11, t => ({ ...t, mob: 0, furca: 3 })) // incisivo não tem furca: ignorada
    d = comDente(d, 46, t => ({ ...t, mob: 1, furca: 0 }))
    const r = resumoPerio(d)
    expect(r.dentesComMobilidade).toBe(2)
    expect(r.dentesComFurca).toBe(1)
  })
})

describe('faixa de sangramento', () => {
  it('separa abaixo de 10%, de 10% a 30% e acima de 30%', () => {
    expect(faixaSangramento(null)).toBeNull()
    expect(faixaSangramento(0)).toBe('baixo')
    expect(faixaSangramento(9.9)).toBe('baixo')
    expect(faixaSangramento(10)).toBe('moderado')
    expect(faixaSangramento(30)).toBe('moderado')
    expect(faixaSangramento(30.1)).toBe('alto')
  })
})

describe('geometria reaproveitada do odontograma', () => {
  it('o mesial fica voltado para a linha média nos dois lados da tela', () => {
    expect(ordemNaTela(16)).toEqual(['d', 'c', 'm'])
    expect(ordemNaTela(26)).toEqual(['m', 'c', 'd'])
    expect(ordemNaTela(46)).toEqual(['d', 'c', 'm'])
    expect(ordemNaTela(36)).toEqual(['m', 'c', 'd'])
  })
  it('rótulo do sítio usa palatina em cima e lingual embaixo', () => {
    expect(rotuloSitio(16, 'v', 'm')).toBe('Mesial, vestibular')
    expect(rotuloSitio(16, 'l', 'd')).toBe('Distal, palatina')
    expect(rotuloSitio(36, 'l', 'c')).toBe('Central, lingual')
  })
  it('furca só nos dentes de duas ou mais raízes', () => {
    expect(temFurca(16)).toBe(true)
    expect(temFurca(36)).toBe(true)
    expect(temFurca(14)).toBe(true) // 1º pré-molar superior tem duas raízes
    expect(temFurca(34)).toBe(false)
    expect(temFurca(11)).toBe(false)
    expect(temFurca(13)).toBe(false)
  })
})

describe('leitura do JSON salvo', () => {
  it('lixo vira exame vazio', () => {
    expect(normalizarPerio(null)).toEqual(perioVazio())
    expect(normalizarPerio('x')).toEqual(perioVazio())
    expect(normalizarPerio({ dentes: 5 })).toEqual(perioVazio())
  })
  it('descarta valores fora da faixa e dentes inexistentes', () => {
    const d = normalizarPerio({
      v: 1, obs: 'ok',
      dentes: { 16: { ps: 1, v: { ps: [3, 99, '4'], rec: [-1, 2, null], sang: [true, 'x', true] }, mob: 7, furca: 2 }, 19: { ausente: true } },
    })
    expect(d.dentes[19]).toBeUndefined()
    expect(d.dentes[16].v.ps).toEqual([3, null, 4])
    expect(d.dentes[16].v.rec).toEqual([null, 2, null])
    expect(d.dentes[16].v.sang).toEqual([true, false, true])
    expect(d.dentes[16].mob).toBeNull()
    expect(d.dentes[16].furca).toBe(2)
    expect(d.obs).toBe('ok')
  })
  it('serializar guarda só dentes com informação e a leitura devolve o mesmo exame', () => {
    const d = exame({ 11: { vps: [2, 3, 2], vsang: [false, true, false] } })
    const salvo = serializarPerio(comDente(d, 21, t => ({ ...t })))
    expect(Object.keys(salvo.dentes)).toEqual(['11'])
    const ida = JSON.parse(JSON.stringify(salvo))
    expect(serializarPerio(normalizarPerio(ida))).toEqual(salvo)
  })
  it('sabe se tem conteúdo', () => {
    expect(perioTemConteudo(perioVazio())).toBe(false)
    expect(perioTemConteudo({ ...perioVazio(), obs: 'x' })).toBe(true)
    expect(perioTemConteudo(comDente(perioVazio(), 11, () => denteVazio()))).toBe(false)
    expect(perioTemConteudo(marcarAusentes(perioVazio(), [18]))).toBe(true)
  })
})

describe('ausentes do odontograma', () => {
  it('pega só o dente inteiro ausente, não o implante', () => {
    const raw = { 18: { status: 'ausente', surfaces: {} }, 28: { status: 'implante', surfaces: {} }, 38: 'ausente', 16: { status: 'cariado', surfaces: {} } }
    expect(ausentesDoOdontograma(raw)).toEqual([18, 38])
    expect(ausentesDoOdontograma(null)).toEqual([])
  })
})

describe('digitação rápida', () => {
  it('lê milímetros e respeita o máximo', () => {
    expect(lerMm('', 15)).toBeNull()
    expect(lerMm('abc', 15)).toBeNull()
    expect(lerMm('3', 15)).toBe(3)
    expect(lerMm('12', 15)).toBe(12)
    expect(lerMm('16', 15)).toBe(6)
    expect(lerMm('123', 15)).toBe(12)
  })
  it('o foco avança quando o número já não pode crescer', () => {
    expect(campoCompleto('', 15)).toBe(false)
    expect(campoCompleto('1', 15)).toBe(false)
    expect(campoCompleto('0', 15)).toBe(false)
    expect(campoCompleto('2', 15)).toBe(true)
    expect(campoCompleto('9', 15)).toBe(true)
    expect(campoCompleto('12', 15)).toBe(true)
  })
})

describe('comparação entre duas datas', () => {
  const antes = exame({
    16: { vps: [5, 6, 5], lps: [4, 4, 4], vsang: [true, true, false], lsang: [false, false, false] },
    11: { vps: [3, 3, 3], vsang: [false, false, false] },
  })
  const depois = exame({
    16: { vps: [3, 3, 3], lps: [4, 4, 6], vsang: [false, false, false], lsang: [false, false, true] },
    11: { vps: [3, 3, 3], vsang: [false, false, true] },
  })
  const c = compararPerio(antes, depois)

  it('mostra a variação dos índices gerais (B menos A)', () => {
    expect(c.a.psMedia).toBeCloseTo((5 + 6 + 5 + 4 + 4 + 4 + 9) / 9)
    expect(c.delta.psMedia).toBeCloseTo((3 + 3 + 3 + 4 + 4 + 6 + 9) / 9 - c.a.psMedia!)
    expect(c.delta.sitiosSangrando).toBe(c.b.sitiosSangrando - c.a.sitiosSangrando)
    expect(c.a.sitiosSangrando).toBe(2)
    expect(c.b.sitiosSangrando).toBe(2)
  })
  it('conta sítios que mudaram 2 mm ou mais', () => {
    // 16 vestibular: 5->3 (melhorou), 6->3 (melhorou), 5->3 (melhorou); palatina: 4->6 (piorou) no mesial
    expect(c.sitios.psMelhorou).toBe(3)
    expect(c.sitios.psPiorou).toBe(1)
    expect(c.sitios.nicMelhorou).toBe(3)
    expect(c.sitios.nicPiorou).toBe(1)
  })
  it('conta sangramento que cessou e que apareceu', () => {
    expect(c.sitios.sangramentoCessou).toBe(2)
    expect(c.sitios.sangramentoNovo).toBe(2)
  })
  it('lista os dentes avaliados com a variação de cada um', () => {
    expect(c.dentes.map(d => d.dente)).toEqual([16, 11])
    const d16 = c.dentes.find(d => d.dente === 16)!
    expect(d16.dPsMedia).toBeLessThan(0)
    expect(d16.dSangrando).toBe(-1)
  })
  it('dente ausente na segunda data entra como perdido e não é comparado sítio a sítio', () => {
    const c2 = compararPerio(antes, marcarAusentes(depois, [16]))
    expect(c2.perdidos).toEqual([16])
    expect(c2.sitios.comparados).toBe(3)
  })
  it('sem dados nas duas datas, a variação fica vazia', () => {
    const v = compararPerio(perioVazio(), perioVazio())
    expect(v.delta.psMedia).toBeNull()
    expect(v.dentes).toHaveLength(0)
  })
})

describe('formatação', () => {
  it('usa vírgula e traço para vazio', () => {
    expect(fmtNum(3.456)).toBe('3,5')
    expect(fmtNum(null)).toBe('-')
    expect(fmtDelta(0.5)).toBe('+0,5')
    expect(fmtDelta(-1.25)).toBe('-1,3')
    expect(fmtDelta(0.01)).toBe('0,0')
    expect(fmtDelta(null)).toBe('-')
  })
})
