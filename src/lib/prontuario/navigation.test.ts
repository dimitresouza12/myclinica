import { describe, expect, it } from 'vitest'
import { LIST_STATE_KEY, loadListFilter, patientHref, resolveTab, saveListState, withTab } from './navigation'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v } }
}

describe('patientHref', () => {
  it('monta a rota do prontuário e escapa o id', () => {
    expect(patientHref('abc-123')).toBe('/pacientes/abc-123')
    expect(patientHref('a/b')).toBe('/pacientes/a%2Fb')
  })
  it('a Ficha é a aba padrão e não vai na URL', () => {
    expect(patientHref('p1', 'ficha')).toBe('/pacientes/p1')
    expect(patientHref('p1', 'odontograma')).toBe('/pacientes/p1?aba=odontograma')
  })
})

describe('resolveTab', () => {
  const available = ['ficha', 'odontograma', 'timeline']
  it('aceita só abas que existem para a clínica', () => {
    expect(resolveTab('odontograma', available)).toBe('odontograma')
    expect(resolveTab('corpograma', available)).toBe('ficha')
  })
  it('sem parâmetro ou com lixo cai na Ficha', () => {
    expect(resolveTab(null, available)).toBe('ficha')
    expect(resolveTab('', available)).toBe('ficha')
    expect(resolveTab('__proto__', available)).toBe('ficha')
  })
})

describe('withTab', () => {
  it('põe e tira ?aba= preservando o resto da URL', () => {
    expect(withTab('/pacientes/p1', '', '', 'timeline')).toBe('/pacientes/p1?aba=timeline')
    expect(withTab('/pacientes/p1', '?aba=timeline&x=1', '#topo', 'odontograma')).toBe('/pacientes/p1?aba=odontograma&x=1#topo')
    expect(withTab('/pacientes/p1', '?aba=timeline', '', 'ficha')).toBe('/pacientes/p1')
  })
})

describe('estado da lista de pacientes', () => {
  it('guarda e devolve o filtro', () => {
    const s = memoryStorage()
    saveListState('sem_retorno', s)
    expect(s.data[LIST_STATE_KEY]).toBeDefined()
    expect(loadListFilter(s)).toBe('sem_retorno')
  })
  it('ignora valor inválido, JSON quebrado e storage ausente', () => {
    expect(loadListFilter(memoryStorage({ [LIST_STATE_KEY]: '{"filter":"hack"}' }))).toBeNull()
    expect(loadListFilter(memoryStorage({ [LIST_STATE_KEY]: 'não é json' }))).toBeNull()
    expect(loadListFilter(null)).toBeNull()
    expect(() => saveListState('todos', null)).not.toThrow()
  })
  it('não lança quando o storage recusa a gravação', () => {
    const broken = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('cheio') } }
    expect(() => saveListState('todos', broken)).not.toThrow()
    expect(loadListFilter(broken)).toBeNull()
  })
})
