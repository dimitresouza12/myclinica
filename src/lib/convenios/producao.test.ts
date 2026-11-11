import { describe, expect, it } from 'vitest'
import { buildProducao, conveniosNasLinhas, filtrarPorConvenio, producaoParaCsv, resumirPorConvenio } from './producao'
import type { ConvenioAppointment, ConvenioPatient, ConvenioRecord, InsurancePlan } from './types'

const plan: InsurancePlan = { id: 'pl1', clinic_id: 'c', name: 'Unimed', ans_registry: '393321', procedure_prices: { consulta: 90 }, notes: null, is_active: true }
const patients: ConvenioPatient[] = [
  { id: 'a', name: 'Ana', cpf: null, convenio: 'Unimed', convenio_carteirinha: '0001' },
  { id: 'b', name: 'Bruno', cpf: null, convenio: null, convenio_carteirinha: null },
]
const appt = (over: Partial<ConvenioAppointment>): ConvenioAppointment => ({
  id: 'x', patient_id: 'a', professional_id: null, procedure_id: 'consulta', procedure_name: 'Consulta', procedure_price: 150, status: 'concluido', scheduled_at: '2026-11-05T15:00:00Z', ...over,
})
const rec = (over: Partial<ConvenioRecord>): ConvenioRecord => ({
  id: 'r', appointment_id: 'x', patient_id: 'a', type: 'receita', total_amount: 80, payment_method: 'convenio', convenio: null, created_at: '2026-11-05T16:00:00Z', ...over,
})
const base = { patients, plans: [plan], procedures: [{ id: 'consulta', name: 'Consulta', price: 200 }], records: [] as ConvenioRecord[] }

describe('buildProducao', () => {
  it('convênio usa a tabela do convênio antes do preço do agendamento', () => {
    const [r] = buildProducao({ ...base, appointments: [appt({})] })
    expect(r).toMatchObject({ paciente: 'Ana', convenio: 'Unimed', carteirinha: '0001', valor: 90, valorOrigem: 'tabela_convenio', statusLabel: 'Concluído', dia: '2026-11-05' })
  })
  it('sem tabela, cai no valor do agendamento, depois no preço do procedimento, depois sem valor', () => {
    const semTabela = { ...base, plans: [] }
    expect(buildProducao({ ...semTabela, appointments: [appt({})] })[0]).toMatchObject({ valor: 150, valorOrigem: 'agendamento' })
    expect(buildProducao({ ...semTabela, appointments: [appt({ procedure_price: null })] })[0]).toMatchObject({ valor: 200, valorOrigem: 'procedimento' })
    expect(buildProducao({ ...semTabela, procedures: [], appointments: [appt({ procedure_price: null })] })[0]).toMatchObject({ valor: null, valorOrigem: 'sem_valor' })
  })
  it('receita lançada manda no valor', () => {
    const [r] = buildProducao({ ...base, records: [rec({})], appointments: [appt({})] })
    expect(r).toMatchObject({ valor: 80, valorOrigem: 'lancamento', lancado: true, convenio: 'Unimed' })
  })
  it('receita lançada por outra forma de pagamento = particular', () => {
    const [r] = buildProducao({ ...base, records: [rec({ payment_method: 'pix', total_amount: 150 })], appointments: [appt({})] })
    expect(r).toMatchObject({ convenio: 'Particular', carteirinha: '', valor: 150 })
  })
  it('paciente sem convênio é Particular; bloqueio e agendamento sem paciente ficam de fora', () => {
    const rows = buildProducao({ ...base, appointments: [appt({ id: '1', patient_id: 'b' }), appt({ id: '2', status: 'bloqueado' }), appt({ id: '3', patient_id: null }), appt({ id: '4', patient_id: 'zz' })] })
    expect(rows).toHaveLength(1)
    expect(rows[0].convenio).toBe('Particular')
  })
  it('o dia é o de Brasília (21h de dia 5 em UTC ainda é dia 5; 02h UTC do dia 6 é dia 5)', () => {
    const [r] = buildProducao({ ...base, appointments: [appt({ scheduled_at: '2026-11-06T02:30:00Z' })] })
    expect(r.dia).toBe('2026-11-05')
  })
  it('ordena por data e nome', () => {
    const rows = buildProducao({ ...base, appointments: [appt({ id: '2', scheduled_at: '2026-11-07T15:00:00Z' }), appt({ id: '1', scheduled_at: '2026-11-03T15:00:00Z', patient_id: 'b' })] })
    expect(rows.map(r => r.appointmentId)).toEqual(['1', '2'])
  })
})

describe('filtros e resumo', () => {
  const rows = buildProducao({
    ...base,
    appointments: [
      appt({ id: '1' }),
      appt({ id: '2', status: 'agendado' }),
      appt({ id: '3', status: 'cancelado' }),
      appt({ id: '4', patient_id: 'b', status: 'concluido' }),
    ],
  })
  it('lista os convênios com Particular por último e filtra', () => {
    expect(conveniosNasLinhas(rows)).toEqual(['Unimed', 'Particular'])
    expect(filtrarPorConvenio(rows, 'unimed')).toHaveLength(3)
    expect(filtrarPorConvenio(rows, 'Particular')).toHaveLength(1)
    expect(filtrarPorConvenio(rows, '')).toHaveLength(4)
  })
  it('resumo separa realizado e previsto e ignora cancelado', () => {
    const resumo = resumirPorConvenio(rows)
    const unimed = resumo.find(r => r.convenio === 'Unimed')!
    expect(unimed).toMatchObject({ atendimentos: 2, realizados: 1, valorRealizado: 90, valorPrevisto: 90 })
    expect(resumo[resumo.length - 1].convenio).toBe('Particular')
  })
})

describe('CSV', () => {
  it('tem BOM, ponto e vírgula, valor com vírgula e neutraliza fórmula', () => {
    const rows = buildProducao({ ...base, patients: [{ ...patients[0], name: '=SOMA(A1)' }], appointments: [appt({})] })
    const csv = producaoParaCsv(rows)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const [head, linha] = csv.slice(1).split('\r\n')
    expect(head).toBe('Data;Paciente;Convênio;Carteirinha;Procedimento;Valor;Origem do valor;Status;Lançado no financeiro')
    expect(linha).toBe("05/11/2026;'=SOMA(A1);Unimed;0001;Consulta;90,00;Tabela do convênio;Concluído;Não")
  })
})
