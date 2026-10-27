import { describe, expect, it } from 'vitest'
import { exportRows, filterPatients, NO_RETURN_DAYS, summarizePatients, toCsv } from './summary'

const NOW = new Date(2026, 9, 27, 12, 0) // terça, 27/10/2026
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString()
const appt = (patient_id: string | null, status: string, scheduled_at: string, procedure_name: string | null = null) =>
  ({ patient_id, status, scheduled_at, procedure_name })

describe('summarizePatients', () => {
  it('pega última consulta concluída e próxima marcada', () => {
    const s = summarizePatients([
      appt('a', 'concluido', at(2026, 10, 1), 'Limpeza'),
      appt('a', 'concluido', at(2026, 10, 20), 'Limpeza'),
      appt('a', 'confirmado', at(2026, 10, 30), 'Retorno'),
      appt('a', 'agendado', at(2026, 11, 10), 'Retorno'),
    ], NOW)
    expect(s.get('a')).toMatchObject({ lastAt: at(2026, 10, 20), nextAt: at(2026, 10, 30), mainProcedure: 'Limpeza', noReturn: false })
  })

  it('ignora cancelada, falta, bloqueio e consulta sem paciente', () => {
    const s = summarizePatients([
      appt('a', 'cancelado', at(2026, 10, 30)),
      appt('a', 'faltou', at(2026, 10, 1)),
      appt('a', 'bloqueado', at(2026, 10, 29)),
      appt(null, 'agendado', at(2026, 10, 29)),
    ], NOW)
    expect(s.get('a')).toMatchObject({ lastAt: null, nextAt: null, noReturn: false })
    expect(s.size).toBe(1)
  })

  it('sem retorno: último atendimento há 45 dias ou mais e nada marcado', () => {
    const old = new Date(NOW.getTime() - NO_RETURN_DAYS * 86400000 - 3600000).toISOString()
    const recent = new Date(NOW.getTime() - 10 * 86400000).toISOString()
    const s = summarizePatients([
      appt('velho', 'concluido', old),
      appt('velho-marcado', 'concluido', old),
      appt('velho-marcado', 'agendado', at(2026, 11, 3)),
      appt('recente', 'concluido', recent),
    ], NOW)
    expect(s.get('velho')?.noReturn).toBe(true)
    expect(s.get('velho-marcado')?.noReturn).toBe(false)
    expect(s.get('recente')?.noReturn).toBe(false)
  })

  it('procedimento principal é o mais frequente; empate fica com o mais recente', () => {
    const s = summarizePatients([
      appt('a', 'concluido', at(2026, 9, 1), 'Clareamento'),
      appt('a', 'concluido', at(2026, 9, 10), 'Limpeza'),
      appt('a', 'concluido', at(2026, 9, 20), 'Limpeza'),
      appt('b', 'concluido', at(2026, 9, 1), 'X'),
      appt('b', 'concluido', at(2026, 9, 2), 'Y'),
    ], NOW)
    expect(s.get('a')?.mainProcedure).toBe('Limpeza')
    expect(s.get('b')?.mainProcedure).toBe('Y')
  })

  it('consulta de hoje já passada não é "próxima"', () => {
    const s = summarizePatients([appt('a', 'agendado', at(2026, 10, 27, 8))], NOW)
    expect(s.get('a')?.nextAt).toBeNull()
  })
})

describe('filterPatients', () => {
  const patients = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const summary = summarizePatients([
    appt('a', 'agendado', at(2026, 10, 30)),
    appt('b', 'concluido', at(2026, 8, 1)),
  ], NOW)
  const credits = new Map([['c', 120]])

  it('todos devolve a lista inteira', () => {
    expect(filterPatients(patients, 'todos', summary, credits).map(p => p.id)).toEqual(['a', 'b', 'c'])
  })
  it('cada filtro separa o seu grupo', () => {
    expect(filterPatients(patients, 'agendados', summary, credits).map(p => p.id)).toEqual(['a'])
    expect(filterPatients(patients, 'sem_retorno', summary, credits).map(p => p.id)).toEqual(['b'])
    expect(filterPatients(patients, 'com_saldo', summary, credits).map(p => p.id)).toEqual(['c'])
  })
})

describe('csv', () => {
  it('escapa aspas, ponto e vírgula e quebra de linha', () => {
    expect(toCsv([['Nome', 'Obs'], ['Ana; "A"', 'linha1\nlinha2']])).toBe('Nome;Obs\r\n"Ana; ""A""";"linha1\nlinha2"')
  })

  it('exportRows monta cabeçalho e linhas', () => {
    const rows = exportRows(
      [{ id: 'a', name: 'Ana', phone: '11999990000', email: 'a@x.com', created_at: at(2026, 1, 5) }],
      summarizePatients([appt('a', 'concluido', at(2026, 10, 1))], NOW),
      new Map([['a', 50]]),
    )
    expect(rows[0]).toEqual(['Nome', 'Telefone', 'E-mail', 'Cadastro', 'Última consulta', 'Próxima consulta', 'Saldo de pacote'])
    expect(rows[1][0]).toBe('Ana')
    expect(rows[1][6]).toBe('50,00')
  })
})
