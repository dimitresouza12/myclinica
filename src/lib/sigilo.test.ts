import { describe, it, expect } from 'vitest'
import { SIGILO_ATIVO, canMarkConfidential, stripConfidentialForPrint, visibleEntries } from './sigilo'

describe('sigilo', () => {
  it('está ligado porque as policies e o gatilho existem no banco', () => {
    expect(SIGILO_ATIVO).toBe(true)
  })

  it('só psicologia pode marcar nota sigilosa', () => {
    expect(canMarkConfidential('psico')).toBe(true)
    for (const a of ['odonto', 'medico', 'estetica', 'vet', 'fisio', 'nutri', 'fono', 'to'] as const) {
      expect(canMarkConfidential(a)).toBe(false)
    }
    expect(canMarkConfidential(null)).toBe(false)
    expect(canMarkConfidential(undefined)).toBe(false)
  })

  it('remove entradas sigilosas e mantém as demais (inclusive sem o campo)', () => {
    const entries = [
      { id: 'a' },
      { id: 'b', is_confidential: false },
      { id: 'c', is_confidential: true },
      { id: 'd', is_confidential: null },
    ]
    expect(stripConfidentialForPrint(entries).map(e => e.id)).toEqual(['a', 'b', 'd'])
    expect(visibleEntries(entries)).toEqual(stripConfidentialForPrint(entries))
  })

  it('não muta o array original e aceita lista vazia', () => {
    const entries = [{ id: 'x', is_confidential: true }]
    stripConfidentialForPrint(entries)
    expect(entries).toHaveLength(1)
    expect(stripConfidentialForPrint([])).toEqual([])
  })
})
