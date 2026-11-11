import { describe, expect, it } from 'vitest'
import { clientIpFrom, generateToken, hashIp, hashToken, ipHashSecret, isWellFormedToken, sha256Hex } from './token'

describe('token do link', () => {
  it('tem 32 bytes aleatórios em base64url (43 caracteres) e nunca repete', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(a, 'base64url').length).toBe(32)
    expect(a).not.toBe(b)
  })

  it('só aceita token bem formado', () => {
    expect(isWellFormedToken(generateToken())).toBe(true)
    for (const bad of ['', 'abc', 'x'.repeat(42), 'x'.repeat(44), `${'a'.repeat(42)}=`, `${'a'.repeat(42)}/`, null, undefined, 123]) {
      expect(isWellFormedToken(bad)).toBe(false)
    }
  })

  it('o banco recebe o SHA-256 (64 hex), diferente do token', () => {
    const t = generateToken()
    const h = hashToken(t)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(t)
    expect(hashToken(t)).toBe(h)
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('hash de IP', () => {
  it('é estável com o mesmo segredo e muda com outro segredo ou outro IP', () => {
    const s1 = 'segredo-de-teste-1234567890'
    expect(hashIp('1.2.3.4', s1)).toBe(hashIp('1.2.3.4', s1))
    expect(hashIp('1.2.3.4', s1)).not.toBe(hashIp('1.2.3.5', s1))
    expect(hashIp('1.2.3.4', s1)).not.toBe(hashIp('1.2.3.4', 'outro-segredo-1234567890'))
    expect(hashIp('1.2.3.4', s1)).not.toContain('1.2.3.4')
  })

  it('segredo: variável própria (16+ caracteres) ou derivado da chave de serviço sem repeti-la', () => {
    expect(ipHashSecret({ PORTAL_HASH_SALT: 'um-segredo-bem-longo-123' })).toBe('um-segredo-bem-longo-123')
    const derived = ipHashSecret({ SUPABASE_SERVICE_ROLE_KEY: 'chave-secreta' })
    expect(derived).toMatch(/^[0-9a-f]{64}$/)
    expect(derived).not.toContain('chave-secreta')
    expect(ipHashSecret({ PORTAL_HASH_SALT: 'curto', SUPABASE_SERVICE_ROLE_KEY: 'x' })).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('clientIpFrom', () => {
  const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null })
  it('usa o último salto (padrão 1) do x-forwarded-for, nunca o primeiro forjável; depois x-real-ip, senão unknown', () => {
    expect(clientIpFrom(h({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('10.0.0.1')
    expect(clientIpFrom(h({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8')
    expect(clientIpFrom(h({}))).toBe('unknown')
  })
})
