import { describe, expect, it } from 'vitest'
import { hasScope, normalizeScopes, scopesForAreas } from './scopes'

describe('escopos do link', () => {
  it('nutrição ganha plano alimentar e veterinária ganha vacinas; as demais áreas não', () => {
    expect(scopesForAreas(['nutri'])).toEqual(['plano_alimentar', 'proximas_consultas', 'orientacoes', 'assinatura'])
    expect(scopesForAreas(['vet'])).toEqual(['vacinas_peso', 'proximas_consultas', 'orientacoes', 'assinatura'])
    expect(scopesForAreas(['odonto'])).toEqual(['proximas_consultas', 'orientacoes', 'assinatura'])
    expect(scopesForAreas(['nutri', 'vet'])).toHaveLength(5)
  })

  it('normaliza: ordem canônica, sem repetição', () => {
    expect(normalizeScopes(['assinatura', 'proximas_consultas', 'assinatura'])).toEqual(['proximas_consultas', 'assinatura'])
  })

  it('rejeita qualquer valor desconhecido ou formato errado (lista vazia)', () => {
    expect(normalizeScopes(['proximas_consultas', 'admin'])).toEqual([])
    expect(normalizeScopes('assinatura')).toEqual([])
    expect(normalizeScopes(null)).toEqual([])
    expect(normalizeScopes([1])).toEqual([])
  })

  it('hasScope', () => {
    expect(hasScope(['assinatura'], 'assinatura')).toBe(true)
    expect(hasScope(['assinatura'], 'plano_alimentar')).toBe(false)
  })
})
