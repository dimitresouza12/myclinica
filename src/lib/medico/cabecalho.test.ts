import { describe, expect, it } from 'vitest'
import { montarCabecalho, profissionalParaImpresso } from './cabecalho'

describe('cabeçalho dos impressos da Medicina', () => {
  it('profissional: sigla CRM no número solto, RQE com prefixo e nome de quem está logado como alternativa', () => {
    expect(profissionalParaImpresso({ name: 'Ana Lima', specialty_type: 'medico', registration_number: '12345', rqe: '678' })).toEqual({ nome: 'Ana Lima', registro: 'CRM 12345', rqe: 'RQE 678' })
    expect(profissionalParaImpresso({ name: 'Ana Lima', registration_number: 'CRM-CE 999' }).registro).toBe('CRM-CE 999')
    expect(profissionalParaImpresso(null, ' Dr. Paulo ')).toEqual({ nome: 'Dr. Paulo', registro: '', rqe: '' })
    expect(profissionalParaImpresso(undefined)).toEqual({ nome: '', registro: '', rqe: '' })
  })

  it('paciente com CPF, nascimento e idade; clínica com endereço e telefone', () => {
    const c = montarCabecalho({
      clinica: { name: 'Clínica X', address: 'Rua A, 10', phone: '85999998888' },
      paciente: { name: 'Bia', cpf: '11144477735', birth_date: '2025-03-10' },
      data: '2026-05-10',
      profissional: { nome: 'Ana', registro: 'CRM 1', rqe: '' },
    })
    expect(c.clinica).toBe('Clínica X')
    expect(c.detalhe).toContain('Rua A, 10')
    expect(c.detalhe).toContain('99999')
    expect(c.pacienteDetalhe).toBe('CPF 111.444.777-35 | Nascimento 10/03/2025 (1 ano e 2 meses)')
    expect(c.data).toBe('2026-05-10')
  })

  it('sem CPF, nascimento, endereço nem telefone, não inventa nada', () => {
    const c = montarCabecalho({ clinica: { name: 'Clínica X' }, paciente: { name: 'Bia' }, data: '2026-05-10', profissional: { nome: '', registro: '', rqe: '' } })
    expect(c.detalhe).toBeUndefined()
    expect(c.pacienteDetalhe).toBeUndefined()
  })
})
