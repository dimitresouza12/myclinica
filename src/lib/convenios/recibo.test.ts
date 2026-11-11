import { describe, expect, it } from 'vitest'
import { montarRecibo, reciboParaHtml, valorPorExtenso } from './recibo'
import type { ConvenioPatient, ConvenioProfessional } from './types'

describe('valorPorExtenso', () => {
  it.each([
    [0, 'zero reais'],
    [1, 'um real'],
    [0.01, 'um centavo'],
    [0.5, 'cinquenta centavos'],
    [21, 'vinte e um reais'],
    [100, 'cem reais'],
    [101, 'cento e um reais'],
    [150, 'cento e cinquenta reais'],
    [200.5, 'duzentos reais e cinquenta centavos'],
    [1000, 'mil reais'],
    [1100, 'mil e cem reais'],
    [1250, 'mil duzentos e cinquenta reais'],
    [2500, 'dois mil e quinhentos reais'],
    [12345.67, 'doze mil trezentos e quarenta e cinco reais e sessenta e sete centavos'],
    [1_000_000, 'um milhão de reais'],
    [2_000_000, 'dois milhões de reais'],
    [1_000_050, 'um milhão e cinquenta reais'],
  ])('%s', (v, txt) => expect(valorPorExtenso(v)).toBe(txt))
  it('fora do alcance devolve vazio', () => {
    expect(valorPorExtenso(-1)).toBe('')
    expect(valorPorExtenso(Number.NaN)).toBe('')
  })
})

const paciente: ConvenioPatient = { id: 'p', name: 'Ana <b>', cpf: '52998224725', convenio: null, convenio_carteirinha: null }
const medica: ConvenioProfessional = { id: 'm', name: 'Dra. Lia', specialty: 'Clínica', specialty_type: 'medico', registration_number: '12345', rqe: '987' }
const entrada = { clinic: { name: 'Clínica & Cia', address: 'Rua A', phone: '85999998888' }, clinicType: 'medico' as const, patient: paciente, professional: medica, descricao: 'Consulta', dia: '2026-11-05', valor: 250 }

describe('montarRecibo', () => {
  it('traz conselho com sigla, RQE e CPF do paciente; pagador padrão é o próprio paciente', () => {
    const d = montarRecibo(entrada)
    expect(d).toMatchObject({ registro: 'CRM 12345', rqe: 'RQE 987', pacienteCpf: '529.982.247-25', pagadorCpf: '529.982.247-25', mesmoPagador: true, valor: expect.stringContaining('250,00'), valorExtenso: 'duzentos e cinquenta reais' })
  })
  it('usa o pagador do cadastro e o informado por cima', () => {
    expect(montarRecibo({ ...entrada, patient: { ...paciente, payer_name: 'Mãe', payer_cpf: '11144477735' } })).toMatchObject({ pagadorNome: 'Mãe', pagadorCpf: '111.444.777-35', mesmoPagador: false })
    expect(montarRecibo({ ...entrada, pagadorNome: 'Pai', pagadorCpf: '' })).toMatchObject({ pagadorNome: 'Pai' })
  })
  it('sem profissional: campos vazios, nada inventado', () => {
    expect(montarRecibo({ ...entrada, professional: null })).toMatchObject({ profissionalNome: '', registro: '', rqe: '' })
  })
})

describe('reciboParaHtml', () => {
  it('escapa texto digitado e deixa CPF/CNPJ do prestador em branco', () => {
    const html = reciboParaHtml(montarRecibo(entrada), entrada.clinic, '10/11/2026')
    expect(html).toContain('Ana &lt;b&gt;')
    expect(html).not.toContain('Ana <b>')
    expect(html).toContain('Clínica &amp; Cia')
    expect(html).toContain('CPF ou CNPJ do prestador')
    expect(html).toContain('05/11/2026')
  })
})
