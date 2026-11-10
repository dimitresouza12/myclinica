import { describe, it, expect } from 'vitest'
import { hasLegacyTrialParams, isLegacyTrialLogin } from './legacyTrialLink'

describe('isLegacyTrialLogin', () => {
  it('quiz=true', () => expect(isLegacyTrialLogin('/login?quiz=true')).toBe(true))
  it('mode=register', () => expect(isLegacyTrialLogin('/login?mode=register')).toBe(true))
  it('plan=essencial', () => expect(isLegacyTrialLogin('/login?plan=essencial')).toBe(true))
  it('plan=completo e ilimitado', () => {
    expect(isLegacyTrialLogin('/login?plan=completo')).toBe(true)
    expect(isLegacyTrialLogin('/login?plan=ilimitado')).toBe(true)
  })
  it('plan vazio não conta', () => expect(isLegacyTrialLogin('/login?plan=')).toBe(false))
  it('quiz diferente de true não conta', () => expect(isLegacyTrialLogin('/login?quiz=false')).toBe(false))
  it('/login puro', () => expect(isLegacyTrialLogin('/login')).toBe(false))
  it('/login?redirect=x', () => expect(isLegacyTrialLogin('/login?redirect=x')).toBe(false))
  it('combina com outros parâmetros', () => expect(isLegacyTrialLogin('/login?utm_source=ads&plan=completo')).toBe(true))
  it('outro path', () => {
    expect(isLegacyTrialLogin('/experimentar?quiz=true')).toBe(false)
    expect(isLegacyTrialLogin('/dashboard?plan=completo')).toBe(false)
    expect(isLegacyTrialLogin('/login/outro?quiz=true')).toBe(false)
  })
  it('aceita URL', () => expect(isLegacyTrialLogin(new URL('https://app.myclinica.online/login?quiz=true'))).toBe(true))
})

describe('hasLegacyTrialParams', () => {
  it('lê de URLSearchParams', () => {
    expect(hasLegacyTrialParams(new URLSearchParams('quiz=true'))).toBe(true)
    expect(hasLegacyTrialParams(new URLSearchParams(''))).toBe(false)
  })
})
