import { describe, expect, it } from 'vitest'
import { buildReceitaSaude, isValidCpf, receitaSaudeParaCsv, resumirReceitaSaude } from './receitaSaude'
import type { ConvenioPatient, ConvenioRecord } from './types'

const VALIDO = '529.982.247-25'
const VALIDO2 = '111.444.777-35'

const pats: ConvenioPatient[] = [
  { id: 'a', name: 'Ana', cpf: VALIDO, convenio: null, convenio_carteirinha: null },
  { id: 'k', name: 'Kid', cpf: null, convenio: null, convenio_carteirinha: null, payer_name: 'Mãe da Kid', payer_cpf: VALIDO2 },
  { id: 'z', name: 'Zé', cpf: '123.456.789-00', convenio: null, convenio_carteirinha: null },
]
const rec = (over: Partial<ConvenioRecord>): ConvenioRecord => ({
  id: 'r1', appointment_id: null, patient_id: 'a', type: 'receita', total_amount: 200, payment_method: 'pix', convenio: null, created_at: '2026-11-10T15:00:00Z', ...over,
})
const prof = [{ id: 'pr', name: 'Dra. Lia', registration_number: 'CRP 11/1234' }]
const input = (records: ConvenioRecord[]) => ({ records, patients: pats, professionals: prof, professionalByRecord: { r1: 'pr' }, mes: '2026-11' })

describe('isValidCpf', () => {
  it('confere dígitos verificadores', () => {
    expect(isValidCpf(VALIDO)).toBe(true)
    expect(isValidCpf('52998224725')).toBe(true)
    expect(isValidCpf('529.982.247-26')).toBe(false)
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCpf('123')).toBe(false)
    expect(isValidCpf(null)).toBe(false)
  })
})

describe('buildReceitaSaude', () => {
  it('paciente com CPF válido: pagador e beneficiário iguais, sem pendência', () => {
    const [r] = buildReceitaSaude(input([rec({})]))
    expect(r).toMatchObject({ pagadorCpf: VALIDO, beneficiarioCpf: VALIDO, valor: 200, profissional: 'Dra. Lia', registro: 'CRP 11/1234', pendencias: [] })
  })
  it('criança com responsável: pagador do cadastro, beneficiário sem CPF vira pendência', () => {
    const [r] = buildReceitaSaude(input([rec({ patient_id: 'k' })]))
    expect(r.pagadorNome).toBe('Mãe da Kid')
    expect(r.pagadorCpf).toBe(VALIDO2)
    expect(r.pendencias).toEqual(['CPF do beneficiário em branco'])
  })
  it('CPF inválido é apontado', () => {
    const [r] = buildReceitaSaude(input([rec({ patient_id: 'z' })]))
    expect(r.pendencias).toEqual(['CPF do pagador inválido', 'CPF do beneficiário inválido'])
  })
  it('deixa de fora convênio, despesa, valor zero, outro mês e paciente desconhecido', () => {
    const rows = buildReceitaSaude(input([
      rec({ id: 'a1', payment_method: 'convenio' }),
      rec({ id: 'a2', type: 'despesa' }),
      rec({ id: 'a3', total_amount: 0 }),
      rec({ id: 'a4', created_at: '2026-10-31T12:00:00Z' }),
      rec({ id: 'a5', patient_id: 'nao-existe' }),
      rec({ id: 'a6', patient_id: null }),
    ]))
    expect(rows).toEqual([])
  })
  it('mês é o de Brasília: 01/11 às 01h em UTC ainda é outubro', () => {
    expect(buildReceitaSaude(input([rec({ created_at: '2026-11-01T01:00:00Z' })]))).toHaveLength(0)
    expect(buildReceitaSaude(input([rec({ created_at: '2026-11-01T04:00:00Z' })]))).toHaveLength(1)
  })
  it('resumo e CSV', () => {
    const rows = buildReceitaSaude(input([rec({}), rec({ id: 'r2', patient_id: 'z', total_amount: 50.5 })]))
    expect(resumirReceitaSaude(rows)).toEqual({ total: 250.5, lancamentos: 2, comPendencia: 1 })
    const csv = receitaSaudeParaCsv(rows).slice(1).split('\r\n')
    expect(csv[0]).toBe('Data do pagamento;CPF do pagador;Nome do pagador;CPF do beneficiário;Nome do beneficiário;Valor;Forma de pagamento;Profissional;Registro no conselho;Pendências')
    expect(csv[1]).toBe(`10/11/2026;${VALIDO};Ana;${VALIDO};Ana;200,00;PIX;Dra. Lia;CRP 11/1234;`)
  })
})
