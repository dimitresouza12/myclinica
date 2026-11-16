import { describe, expect, it } from 'vitest'
import { avaliarRegistro, medidaDoForm, medidasDeLinhas, normalizarMedida, pontosDoIndicador, validarFormMedida } from './medidas'

const form = (over: Partial<Parameters<typeof validarFormMedida>[0]> = {}) => ({ data: '2026-03-10', peso: '', estatura: '', pc: '', observacao: '', ...over })

describe('medidas de crescimento', () => {
  it('normaliza JSON gravado e descarta lixo', () => {
    expect(normalizarMedida(null)).toEqual({ v: 1, pesoKg: null, estaturaCm: null, pcCm: null, observacao: '' })
    expect(normalizarMedida({ pesoKg: 9.5, estaturaCm: -3, pcCm: 'x', observacao: '  jejum ' })).toEqual({ v: 1, pesoKg: 9.5, estaturaCm: null, pcCm: null, observacao: 'jejum' })
  })

  it('linhas viram medidas em ordem cronológica e sem linhas vazias', () => {
    const m = medidasDeLinhas([
      { id: 'b', data: '2026-06-01', dados: { pesoKg: 7 } },
      { id: 'a', data: '2026-03-01', dados: { pesoKg: 5 } },
      { id: 'c', data: '2026-04-01', dados: {} },
    ])
    expect(m.map(x => x.id)).toEqual(['a', 'b'])
  })

  it('valida o formulário', () => {
    const nasc = '2026-01-01'
    expect(validarFormMedida(form({ peso: '5,2' }), nasc, '2026-11-15')).toEqual([])
    expect(validarFormMedida(form(), nasc, '2026-11-15')).toContain('Informe pelo menos uma medida (peso, estatura ou perímetro cefálico).')
    expect(validarFormMedida(form({ data: '2027-01-01', peso: '5' }), nasc, '2026-11-15')[0]).toContain('futuro')
    expect(validarFormMedida(form({ data: '2025-12-31', peso: '5' }), nasc, '2026-11-15')[0]).toContain('anterior ao nascimento')
    expect(validarFormMedida(form({ data: '2026-11-01', peso: '5' }), '2020-01-01', '2026-11-15')[0]).toContain('5 anos')
    expect(validarFormMedida(form({ peso: 'dez' }), nasc, '2026-11-15')[0]).toContain('número')
    expect(validarFormMedida(form({ data: '', peso: '5' }), nasc, '2026-11-15')[0]).toContain('data')
  })

  it('converte o formulário em dados', () => {
    expect(medidaDoForm(form({ peso: '5,25', estatura: '60', pc: '', observacao: ' ok ' }))).toEqual({ v: 1, pesoKg: 5.25, estaturaCm: 60, pcCm: null, observacao: 'ok' })
  })

  it('plota só o que tem valor e idade dentro da faixa, com IMC quando há peso e estatura', () => {
    const medidas = medidasDeLinhas([
      { id: 'a', data: '2026-03-01', dados: { pesoKg: 5, estaturaCm: 58 } },
      { id: 'b', data: '2026-06-01', dados: { pesoKg: 6.5 } },
      { id: 'c', data: '2031-06-01', dados: { pesoKg: 20 } }, // depois dos 5 anos
    ])
    expect(pontosDoIndicador('meninos', '2026-01-01', medidas, 'peso').map(p => p.id)).toEqual(['a', 'b'])
    expect(pontosDoIndicador('meninos', '2026-01-01', medidas, 'estatura').map(p => p.id)).toEqual(['a'])
    expect(pontosDoIndicador('meninos', '2026-01-01', medidas, 'imc').map(p => p.id)).toEqual(['a'])
    expect(pontosDoIndicador('meninos', '2026-01-01', medidas, 'pc')).toEqual([])
    expect(pontosDoIndicador('meninos', null, medidas, 'peso')).toEqual([])
    const p = pontosDoIndicador('meninos', '2026-01-01', medidas, 'peso')[0]
    expect(p.dias).toBe(59)
  })

  it('avalia um registro', () => {
    const [m] = medidasDeLinhas([{ id: 'a', data: '2026-03-01', dados: { pesoKg: 5, estaturaCm: 58, pcCm: 39 } }])
    const r = avaliarRegistro('meninas', '2026-01-01', m)
    expect(r.map(x => x.indicador)).toEqual(['peso', 'estatura', 'pc', 'imc'])
  })
})
