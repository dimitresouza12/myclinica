import { describe, expect, it } from 'vitest'
import {
  CODE_TTL_MS, MAX_CODE_ATTEMPTS, SEND_LIMITS, canSendCode, checkCode, codeMessage, codeSecret, generateCode,
  hashCode, hashDestination, isWellFormedCode, maskPhone,
} from './codigo'

const SECRET = 'segredo-de-teste-com-mais-de-16'
const ID = '11111111-1111-4111-8111-111111111111'
const now = new Date('2026-11-23T12:00:00Z')
const state = (code: string, over: Partial<{ expiresAt: string; attempts: number }> = {}) => ({
  codeHash: hashCode(SECRET, ID, code),
  expiresAt: over.expiresAt ?? new Date(now.getTime() + CODE_TTL_MS).toISOString(),
  attempts: over.attempts ?? 1,
})

describe('código de confirmação', () => {
  it('tem 6 dígitos', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/)
    expect(isWellFormedCode('123456')).toBe(true)
    expect(isWellFormedCode('12345')).toBe(false)
    expect(isWellFormedCode('12345a')).toBe(false)
    expect(isWellFormedCode(123456)).toBe(false)
  })

  it('o hash é HMAC amarrado ao contrato e ao segredo', () => {
    const h = hashCode(SECRET, ID, '123456')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain('123456')
    expect(hashCode(SECRET, ID, '123456')).toBe(h)
    expect(hashCode(SECRET, ID, '123457')).not.toBe(h)
    expect(hashCode(SECRET, '22222222-2222-4222-8222-222222222222', '123456')).not.toBe(h)
    expect(hashCode(`${SECRET}x`, ID, '123456')).not.toBe(h)
  })

  it('aceita o código certo', () => {
    expect(checkCode({ state: state('424242'), input: '424242', secret: SECRET, agreementId: ID, now })).toEqual({ ok: true })
  })

  it('recusa código errado, mal formado e ausente', () => {
    const c = (input: unknown, st = state('424242')) => checkCode({ state: st, input, secret: SECRET, agreementId: ID, now })
    expect(c('424243')).toEqual({ ok: false, reason: 'incorreto' })
    expect(c('42424')).toEqual({ ok: false, reason: 'formato' })
    expect(c(undefined)).toEqual({ ok: false, reason: 'formato' })
    expect(c('424242', { codeHash: null, expiresAt: null, attempts: 1 })).toEqual({ ok: false, reason: 'sem_codigo' })
  })

  it('expira em 10 minutos', () => {
    const st = state('424242', { expiresAt: new Date(now.getTime() - 1).toISOString() })
    expect(checkCode({ state: st, input: '424242', secret: SECRET, agreementId: ID, now })).toEqual({ ok: false, reason: 'expirado' })
    const exato = state('424242', { expiresAt: now.toISOString() })
    expect(checkCode({ state: exato, input: '424242', secret: SECRET, agreementId: ID, now }).ok).toBe(false)
    expect(CODE_TTL_MS).toBe(600_000)
  })

  it('a quinta tentativa vale e a sexta não, mesmo com o código certo', () => {
    const at = (attempts: number) => checkCode({ state: state('424242', { attempts }), input: '424242', secret: SECRET, agreementId: ID, now })
    expect(MAX_CODE_ATTEMPTS).toBe(5)
    expect(at(5).ok).toBe(true)
    expect(at(6)).toEqual({ ok: false, reason: 'tentativas' })
  })

  it('o segredo vem do ambiente e cai para um derivado da chave de serviço', () => {
    expect(codeSecret({ CONTRACT_CODE_SECRET: SECRET })).toBe(SECRET)
    expect(codeSecret({ CONTRACT_CODE_SECRET: 'curto', SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico' })).toMatch(/^[0-9a-f]{64}$/)
    expect(codeSecret({})).toBeNull()
  })

  it('máscara do telefone e hash do destino', () => {
    expect(maskPhone('85999991234')).toBe('(85) *****-1234')
    expect(maskPhone('123')).toBe('*****')
    expect(hashDestination(SECRET, '85999991234')).not.toContain('99999')
  })

  it('a mensagem leva o código, sem emoji', () => {
    const m = codeMessage('424242')
    expect(m).toContain('424242')
    expect(m).toContain('10 minutos')
    expect(/\p{Extended_Pictographic}/u.test(m)).toBe(false)
  })
})

describe('limite de reenvio', () => {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

  it('libera o primeiro envio', () => {
    expect(canSendCode({ agreementSentAt: [], clinicSentAt: [], now })).toEqual({ ok: true })
  })

  it('exige intervalo de 60 segundos', () => {
    const r = canSendCode({ agreementSentAt: [ago(20_000)], clinicSentAt: [ago(20_000)], now })
    expect(r).toMatchObject({ ok: false, reason: 'aguarde', retryAfterSeconds: 40 })
    expect(canSendCode({ agreementSentAt: [ago(SEND_LIMITS.cooldownMs)], clinicSentAt: [], now }).ok).toBe(true)
  })

  it('limita por contrato na hora', () => {
    const sent = [2, 3, 4, 5].map(m => ago(m * 60_000))
    const r = canSendCode({ agreementSentAt: sent, clinicSentAt: sent, now })
    expect(r).toMatchObject({ ok: false, reason: 'limite_contrato' })
    if (!r.ok) expect(r.retryAfterSeconds).toBeGreaterThan(0)
    // três envios na hora ainda deixam enviar
    expect(canSendCode({ agreementSentAt: sent.slice(0, 3), clinicSentAt: [], now }).ok).toBe(true)
  })

  it('limita por clínica em 24h', () => {
    const sent = Array.from({ length: SEND_LIMITS.perClinicPerDay }, (_, i) => ago((2 + i) * 60 * 60_000))
    const r = canSendCode({ agreementSentAt: [], clinicSentAt: sent, now })
    expect(r).toMatchObject({ ok: false, reason: 'limite_clinica' })
  })

  it('envio com mais de 24h não conta', () => {
    const sent = Array.from({ length: 12 }, () => ago(25 * 60 * 60_000))
    expect(canSendCode({ agreementSentAt: [], clinicSentAt: sent, now }).ok).toBe(true)
  })
})
