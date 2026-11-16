import { describe, expect, it } from 'vitest'
import { hasScope, normalizeScopes, scopesForAreas } from './scopes'

describe('escopos do link', () => {
  it('nutrição ganha plano alimentar e veterinária ganha vacinas; as demais áreas não', () => {
    expect(scopesForAreas(['nutri'])).toEqual(['plano_alimentar', 'diario', 'proximas_consultas', 'orientacoes', 'assinatura'])
    expect(scopesForAreas(['vet'])).toEqual(['vacinas_peso', 'proximas_consultas', 'orientacoes', 'assinatura'])
    expect(scopesForAreas(['odonto'])).toEqual(['proximas_consultas', 'orientacoes', 'assinatura'])
    expect(scopesForAreas(['nutri', 'vet'])).toHaveLength(6)
  })

  it('programa de exercícios só é oferecido para fisioterapia', () => {
    expect(scopesForAreas(['fisio'])).toEqual(['exercicios', 'proximas_consultas', 'orientacoes', 'assinatura'])
    expect(scopesForAreas(['odonto', 'nutri'])).not.toContain('exercicios')
    expect(scopesForAreas(['estetica', 'fisio'])).toContain('exercicios')
  })

  it('diário alimentar só é oferecido para nutrição e é aceito vindo do corpo da requisição', () => {
    expect(scopesForAreas(['nutri'])).toContain('diario')
    for (const areas of [['fisio'], ['vet'], ['odonto'], ['estetica', 'fisio']] as const) expect(scopesForAreas(areas)).not.toContain('diario')
    expect(normalizeScopes(['assinatura', 'diario', 'plano_alimentar'])).toEqual(['plano_alimentar', 'diario', 'assinatura'])
  })

  it('aceita o escopo exercicios vindo do corpo da requisição', () => {
    expect(normalizeScopes(['assinatura', 'exercicios'])).toEqual(['exercicios', 'assinatura'])
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
