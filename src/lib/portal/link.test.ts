import { describe, expect, it } from 'vitest'
import { buildPortalMessage, clampTtlDays, computeExpiry, linkState, portalUrl, publicOrigin, whatsappLink } from './link'

const now = new Date('2026-11-17T12:00:00Z')

describe('validade', () => {
  it('limita a 30 dias e cai em 7 quando o valor é inválido', () => {
    expect(clampTtlDays(15)).toBe(15)
    expect(clampTtlDays(999)).toBe(30)
    expect(clampTtlDays(0)).toBe(7)
    expect(clampTtlDays('10')).toBe(7)
    expect(clampTtlDays(NaN)).toBe(7)
    expect(clampTtlDays(2.9)).toBe(2)
  })
  it('computeExpiry soma dias', () => {
    expect(computeExpiry(now, 7).toISOString()).toBe('2026-11-24T12:00:00.000Z')
  })
})

describe('linkState', () => {
  it('revogado vence expirado e ativo', () => {
    expect(linkState({ expires_at: '2026-12-01T00:00:00Z', revoked_at: '2026-11-10T00:00:00Z' }, now)).toBe('revoked')
    expect(linkState({ expires_at: '2026-11-01T00:00:00Z', revoked_at: null }, now)).toBe('expired')
    expect(linkState({ expires_at: '2026-11-17T12:00:00Z', revoked_at: null }, now)).toBe('expired')
    expect(linkState({ expires_at: '2026-12-01T00:00:00Z', revoked_at: null }, now)).toBe('active')
  })
})

describe('url e mensagem', () => {
  it('origem: variável de ambiente (http/https) ou a da requisição, sem barra final', () => {
    expect(publicOrigin('http://localhost:3000', { NEXT_PUBLIC_APP_URL: 'https://app.exemplo.com/' })).toBe('https://app.exemplo.com')
    expect(publicOrigin('http://localhost:3000/', {})).toBe('http://localhost:3000')
    expect(publicOrigin('http://localhost:3000', { NEXT_PUBLIC_APP_URL: 'javascript:alert(1)' })).toBe('http://localhost:3000')
  })
  it('portalUrl', () => {
    expect(portalUrl('https://x.com/', 'tok')).toBe('https://x.com/p/tok')
  })
  it('mensagem lista os escopos e a validade, sem emoji', () => {
    const m = buildPortalMessage({ patientName: 'Maria da Silva', clinicName: 'Clínica Sol', url: 'https://x.com/p/abc', scopes: ['plano_alimentar', 'assinatura'], expiresAt: new Date('2026-11-24T15:00:00Z') })
    expect(m).toContain('Olá, Maria!')
    expect(m).toContain('Clínica Sol')
    expect(m).toContain('- Plano alimentar')
    expect(m).toContain('- Assinar termos e contratos')
    expect(m).toContain('https://x.com/p/abc')
    expect(m).toContain('24/11/2026')
    expect(m).not.toMatch(/\p{Extended_Pictographic}/u)
  })
  it('wa.me com texto codificado; sem telefone válido devolve null', () => {
    const href = whatsappLink('(85) 99999-1234', 'olá & tchau')
    expect(href).toBe('https://wa.me/5585999991234?text=ol%C3%A1%20%26%20tchau')
    expect(whatsappLink('', 'x')).toBeNull()
    expect(whatsappLink(null, 'x')).toBeNull()
  })
})
