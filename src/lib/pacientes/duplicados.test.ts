import { describe, it, expect } from 'vitest'
import {
  buildDuplicateQuery, duplicateQueryKey, parseDuplicateRows, hasCpfConflict, duplicateMatchesKey,
  isUniqueViolation, uniqueViolationMessage, CPF_DUPLICATE_MESSAGE,
} from './duplicados'

describe('buildDuplicateQuery', () => {
  it('sem critério suficiente não consulta', () => {
    expect(buildDuplicateQuery({})).toBeNull()
    expect(buildDuplicateQuery({ cpf: '123.456.789-0' })).toBeNull()
    expect(buildDuplicateQuery({ phone: '(85) 9999-88' })).toBeNull()
    expect(buildDuplicateQuery({ name: 'Maria', birthISO: '1990-01-02' })).toBeNull()
    expect(buildDuplicateQuery({ name: 'Maria Silva' })).toBeNull()
    expect(buildDuplicateQuery({ name: 'Maria Silva', birthISO: '' })).toBeNull()
  })
  it('CPF completo consulta só por CPF', () => {
    expect(buildDuplicateQuery({ cpf: '123.456.789-09' })).toEqual({ p_name: null, p_birth: null, p_phone: null, p_cpf: '12345678909' })
  })
  it('telefone com 10+ dígitos consulta por telefone', () => {
    expect(buildDuplicateQuery({ phone: '(85) 3222-1111' })?.p_phone).toBe('8532221111')
    expect(buildDuplicateQuery({ phone: '(85) 99999-8888' })?.p_phone).toBe('85999998888')
  })
  it('nome com 2+ palavras e nascimento consulta por nome', () => {
    expect(buildDuplicateQuery({ name: '  Maria   Silva ', birthISO: '1990-01-02' }))
      .toEqual({ p_name: 'Maria Silva', p_birth: '1990-01-02', p_phone: null, p_cpf: null })
  })
  it('só manda os critérios que se sustentam', () => {
    const q = buildDuplicateQuery({ name: 'Maria', birthISO: '1990-01-02', phone: '(85) 99999-8888', cpf: '123' })
    expect(q).toEqual({ p_name: null, p_birth: null, p_phone: '85999998888', p_cpf: null })
  })
  it('data fora do padrão ISO é ignorada', () => {
    expect(buildDuplicateQuery({ name: 'Maria Silva', birthISO: '02/01/1990' })).toBeNull()
  })
})

describe('duplicateQueryKey', () => {
  it('muda com a pergunta e é vazia sem pergunta', () => {
    expect(duplicateQueryKey(null)).toBe('')
    const a = buildDuplicateQuery({ phone: '(85) 99999-8888' })
    const b = buildDuplicateQuery({ phone: '(85) 99999-8887' })
    expect(duplicateQueryKey(a)).not.toBe(duplicateQueryKey(b))
    expect(duplicateQueryKey(a)).toBe(duplicateQueryKey(buildDuplicateQuery({ phone: '85999998888' })))
  })
})

describe('parseDuplicateRows', () => {
  const row = (over: Record<string, unknown> = {}) => ({ id: 'a', name: 'Maria Silva', phone_masked: '(85) *****-8888', birth_date: '1990-01-02', match_reason: 'telefone', ...over })
  it('converte linhas válidas e ordena CPF primeiro', () => {
    const r = parseDuplicateRows([row(), row({ id: 'b', match_reason: 'cpf' })])
    expect(r.map(x => x.id)).toEqual(['b', 'a'])
    expect(r[1]).toEqual({ id: 'a', name: 'Maria Silva', phoneMasked: '(85) *****-8888', birthDate: '1990-01-02', reason: 'telefone' })
  })
  it('descarta lixo, motivo desconhecido e id repetido', () => {
    expect(parseDuplicateRows(null)).toEqual([])
    expect(parseDuplicateRows({})).toEqual([])
    expect(parseDuplicateRows([null, 3, row({ id: '' }), row({ name: ' ' }), row({ match_reason: 'x' }), row(), row()])).toHaveLength(1)
  })
  it('campos opcionais ausentes viram vazio', () => {
    const [m] = parseDuplicateRows([row({ phone_masked: null, birth_date: null })])
    expect(m.phoneMasked).toBe('')
    expect(m.birthDate).toBeNull()
  })
})

describe('hasCpfConflict e chave', () => {
  it('só o motivo cpf conflita', () => {
    expect(hasCpfConflict(parseDuplicateRows([{ id: 'a', name: 'A B', match_reason: 'telefone' }]))).toBe(false)
    expect(hasCpfConflict(parseDuplicateRows([{ id: 'a', name: 'A B', match_reason: 'cpf' }]))).toBe(true)
  })
  it('chave não depende da ordem', () => {
    const x = parseDuplicateRows([{ id: 'a', name: 'A B', match_reason: 'telefone' }, { id: 'b', name: 'C D', match_reason: 'nome_nascimento' }])
    expect(duplicateMatchesKey(x)).toBe(duplicateMatchesKey([...x].reverse()))
  })
})

describe('violação de unicidade', () => {
  it('reconhece 23505 e mensagem do Postgres', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint "x"' })).toBe(true)
    expect(isUniqueViolation({ code: '42703', message: 'column' })).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
  it('mensagem clara por constraint', () => {
    expect(uniqueViolationMessage({ code: '23505', message: 'duplicate key value violates unique constraint "patients_clinic_cpf_key"' })).toBe(CPF_DUPLICATE_MESSAGE)
    expect(uniqueViolationMessage({ code: '23505', message: 'x', details: 'Key (clinic_id, phone)=(1, 2) already exists.' })).toMatch(/telefone/)
    expect(uniqueViolationMessage({ code: '23505', message: 'x' })).toMatch(/Já existe/)
    expect(uniqueViolationMessage({ code: '500', message: 'x' })).toBeNull()
  })
})
