import { describe, expect, it } from 'vitest'
import {
  calcularComposicao, calcularImc, calcularRcq, classificarCintura, classificarImc, classificarRcq,
  densidadeCorporal, dobrasDoProtocolo, percentualGorduraSiri,
} from './antropometria'

describe('IMC e circunferências', () => {
  it('calcula o IMC com peso em kg e altura em cm', () => {
    expect(calcularImc(70, 170)).toBeCloseTo(24.22, 2)
    expect(calcularImc(null, 170)).toBeNull()
    expect(calcularImc(70, 0)).toBeNull()
  })
  it('classifica pelas faixas da OMS nos limites exatos', () => {
    expect(classificarImc(18.4)?.id).toBe('baixo_peso')
    expect(classificarImc(18.5)?.id).toBe('eutrofia')
    expect(classificarImc(24.9)?.id).toBe('eutrofia')
    expect(classificarImc(25)?.id).toBe('sobrepeso')
    expect(classificarImc(30)?.id).toBe('obesidade_1')
    expect(classificarImc(35)?.id).toBe('obesidade_2')
    expect(classificarImc(40)?.id).toBe('obesidade_3')
  })
  it('usa Lipschitz no idoso e não classifica menor de 19 anos', () => {
    expect(classificarImc(21.9, 65)?.id).toBe('baixo_peso')
    expect(classificarImc(25, 65)?.id).toBe('eutrofia')
    expect(classificarImc(27.1, 65)?.id).toBe('sobrepeso')
    expect(classificarImc(25, 12)?.id).toBe('pediatrico')
  })
  it('calcula e classifica a RCQ por sexo', () => {
    expect(calcularRcq(80, 100)).toBeCloseTo(0.8, 5)
    expect(classificarRcq(0.9, 'M')?.id).toBe('rcq_ok')
    expect(classificarRcq(0.91, 'M')?.id).toBe('rcq_risco')
    expect(classificarRcq(0.85, 'F')?.id).toBe('rcq_ok')
    expect(classificarRcq(0.86, 'F')?.id).toBe('rcq_risco')
    expect(classificarRcq(0.9, null)).toBeNull()
  })
  it('classifica a cintura pelos cortes da OMS', () => {
    expect(classificarCintura(93, 'M')?.id).toBe('cc_ok')
    expect(classificarCintura(94, 'M')?.id).toBe('cc_alto')
    expect(classificarCintura(102, 'M')?.id).toBe('cc_muito')
    expect(classificarCintura(80, 'F')?.id).toBe('cc_alto')
    expect(classificarCintura(88, 'F')?.id).toBe('cc_muito')
  })
})

describe('densidade corporal e % de gordura', () => {
  it('Siri converte densidade em % de gordura', () => {
    expect(percentualGorduraSiri(1.05)).toBeCloseTo(21.43, 2)
    expect(percentualGorduraSiri(1.0)).toBeCloseTo(45, 5)
    expect(percentualGorduraSiri(0)).toBeNull()
    expect(percentualGorduraSiri(1.2)).toBeNull() // < 0%
  })
  it('Jackson e Pollock 3 dobras, homem: peitoral + abdominal + coxa', () => {
    const r = densidadeCorporal({ protocolo: 'pollock3', sexo: 'M', idade: 30, dobras: { peitoral: 10, abdominal: 20, coxa: 15 } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.somatorio).toBe(45)
      expect(r.densidade).toBeCloseTo(1.0676965, 6)
      expect(percentualGorduraSiri(r.densidade)).toBeCloseTo(13.6, 1)
    }
  })
  it('Jackson e Pollock 3 dobras, mulher: tríceps + supra-ilíaca + coxa', () => {
    // 1,0994921 - 0,0009929*60 + 0,0000023*3600 - 0,0001392*28
    const r = densidadeCorporal({ protocolo: 'pollock3', sexo: 'F', idade: 28, dobras: { triceps: 20, suprailiaca: 15, coxa: 25 } })
    expect(r.ok && r.densidade).toBeCloseTo(1.0994921 - 0.0009929 * 60 + 0.0000023 * 3600 - 0.0001392 * 28, 8)
  })
  it('Jackson e Pollock 7 dobras', () => {
    const d = { peitoral: 8, axilar_media: 9, triceps: 10, subescapular: 12, abdominal: 20, suprailiaca: 14, coxa: 15 } // S = 88
    const h = densidadeCorporal({ protocolo: 'pollock7', sexo: 'M', idade: 35, dobras: d })
    expect(h.ok && h.densidade).toBeCloseTo(1.112 - 0.00043499 * 88 + 0.00000055 * 88 * 88 - 0.00028826 * 35, 8)
    const m = densidadeCorporal({ protocolo: 'pollock7', sexo: 'F', idade: 35, dobras: d })
    expect(m.ok && m.densidade).toBeCloseTo(1.097 - 0.00046971 * 88 + 0.00000056 * 88 * 88 - 0.00012828 * 35, 8)
  })
  it('Guedes usa log10 da soma e não precisa de idade', () => {
    const h = densidadeCorporal({ protocolo: 'guedes', sexo: 'M', idade: null, dobras: { triceps: 10, suprailiaca: 12, abdominal: 18 } })
    expect(h.ok && h.densidade).toBeCloseTo(1.1714 - 0.0671 * Math.log10(40), 8)
    const m = densidadeCorporal({ protocolo: 'guedes', sexo: 'F', idade: null, dobras: { coxa: 20, suprailiaca: 12, subescapular: 14 } })
    expect(m.ok && m.densidade).toBeCloseTo(1.1665 - 0.0706 * Math.log10(46), 8)
  })
  it('Petroski: homem 4 dobras; mulher usa também peso e altura', () => {
    const h = densidadeCorporal({ protocolo: 'petroski', sexo: 'M', idade: 40, dobras: { subescapular: 15, triceps: 10, suprailiaca: 18, panturrilha: 7 } })
    expect(h.ok && h.densidade).toBeCloseTo(1.10726863 - 0.00081201 * 50 + 0.00000212 * 2500 - 0.00041761 * 40, 8)
    const dm = { axilar_media: 10, suprailiaca: 15, coxa: 25, panturrilha: 12 }
    const m = densidadeCorporal({ protocolo: 'petroski', sexo: 'F', idade: 30, dobras: dm, pesoKg: 60, alturaCm: 165 })
    expect(m.ok && m.densidade).toBeCloseTo(1.0346585 - 0.00063129 * 62 + 0.00000187 * 62 * 62 - 0.00031165 * 30 - 0.0004889 * 60 + 0.00051345 * 165, 8)
    const semPeso = densidadeCorporal({ protocolo: 'petroski', sexo: 'F', idade: 30, dobras: dm })
    expect(semPeso).toEqual({ ok: false, faltam: ['Peso', 'Altura'] })
  })
  it('Durnin e Womersley escolhe a faixa de idade', () => {
    const dobras = { biceps: 5, triceps: 10, subescapular: 12, suprailiaca: 13 } // 40
    const a = densidadeCorporal({ protocolo: 'durnin', sexo: 'M', idade: 25, dobras })
    expect(a.ok && a.densidade).toBeCloseTo(1.1631 - 0.0632 * Math.log10(40), 8)
    const b = densidadeCorporal({ protocolo: 'durnin', sexo: 'F', idade: 35, dobras })
    expect(b.ok && b.densidade).toBeCloseTo(1.1423 - 0.0632 * Math.log10(40), 8)
    const c = densidadeCorporal({ protocolo: 'durnin', sexo: 'M', idade: 55, dobras })
    expect(c.ok && c.densidade).toBeCloseTo(1.1715 - 0.0779 * Math.log10(40), 8)
  })
  it('avisa quando a idade está fora da faixa da equação', () => {
    const r = densidadeCorporal({ protocolo: 'guedes', sexo: 'M', idade: 40, dobras: { triceps: 10, suprailiaca: 12, abdominal: 18 } })
    expect(r.ok && r.aviso).toMatch(/17 a 27/)
  })
  it('lista o que falta em vez de calcular com dado incompleto', () => {
    const r = densidadeCorporal({ protocolo: 'pollock3', sexo: 'M', idade: 30, dobras: { peitoral: 10 } })
    expect(r).toEqual({ ok: false, faltam: ['Abdominal', 'Coxa'] })
    const s = densidadeCorporal({ protocolo: 'pollock3', sexo: 'M', idade: null, dobras: { peitoral: 10, abdominal: 20, coxa: 15 } })
    expect(s).toEqual({ ok: false, faltam: ['Idade'] })
  })
  it('as dobras exigidas variam com o sexo só onde o protocolo manda', () => {
    expect(dobrasDoProtocolo('pollock3', 'M')).toEqual(['peitoral', 'abdominal', 'coxa'])
    expect(dobrasDoProtocolo('pollock3', 'F')).toEqual(['triceps', 'suprailiaca', 'coxa'])
    expect(dobrasDoProtocolo('durnin', 'M')).toEqual(dobrasDoProtocolo('durnin', 'F'))
  })
  it('massa gorda e magra a partir do peso e do % de gordura', () => {
    expect(calcularComposicao(80, 25)).toEqual({ pctGordura: 25, massaGordaKg: 20, massaMagraKg: 60 })
    expect(calcularComposicao(null, 25)).toBeNull()
    expect(calcularComposicao(80, null)).toBeNull()
  })
})
