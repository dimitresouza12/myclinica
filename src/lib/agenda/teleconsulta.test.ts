import { describe, it, expect } from 'vitest'
import { normalizeMeetingUrl, safeMeetingHref, generateMeetingRoomUrl, randomRoomId, buildMeetingMessage, buildMeetingWhatsAppLink, formatMeetingWhen } from './teleconsulta'

describe('normalizeMeetingUrl', () => {
  it('vazio vira sem link', () => {
    expect(normalizeMeetingUrl('')).toEqual({ ok: true, url: null })
    expect(normalizeMeetingUrl('   ')).toEqual({ ok: true, url: null })
    expect(normalizeMeetingUrl(null)).toEqual({ ok: true, url: null })
  })
  it('aceita http e https', () => {
    expect(normalizeMeetingUrl('https://meet.jit.si/sala-1')).toEqual({ ok: true, url: 'https://meet.jit.si/sala-1' })
    expect(normalizeMeetingUrl(' http://meet.google.com/abc-defg-hij ')).toEqual({ ok: true, url: 'http://meet.google.com/abc-defg-hij' })
  })
  it('completa com https:// quando falta o prefixo', () => {
    expect(normalizeMeetingUrl('meet.google.com/abc-defg-hij')).toEqual({ ok: true, url: 'https://meet.google.com/abc-defg-hij' })
  })
  it('rejeita outros esquemas, espaços e texto solto', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.com/a', 'mailto:a@b.com', 'sala de reuniao', 'https://', 'localhost', 'https://user:pw@meet.com/x']) {
      expect(normalizeMeetingUrl(bad).ok).toBe(false)
    }
    expect(normalizeMeetingUrl(`https://a.com/${'x'.repeat(600)}`).ok).toBe(false)
  })
})

describe('safeMeetingHref', () => {
  it('só devolve link http(s)', () => {
    expect(safeMeetingHref('https://meet.jit.si/a')).toBe('https://meet.jit.si/a')
    expect(safeMeetingHref('javascript:alert(1)')).toBeNull()
    expect(safeMeetingHref(null)).toBeNull()
  })
})

describe('sala Jitsi', () => {
  it('gera https://meet.jit.si/myclinica-<id>', () => {
    expect(generateMeetingRoomUrl()).toMatch(/^https:\/\/meet\.jit\.si\/myclinica-[a-z2-9]{10}$/)
  })
  it('é determinístico com random injetado e diferente entre chamadas reais', () => {
    expect(randomRoomId(4, () => 0)).toBe('aaaa')
    expect(generateMeetingRoomUrl()).not.toBe(generateMeetingRoomUrl())
  })
})

describe('mensagem de WhatsApp', () => {
  const tz = 'America/Sao_Paulo'
  const now = new Date('2026-11-11T12:00:00Z')
  // 2026-11-17 17:30Z = 14:30 em São Paulo (UTC-3)
  const iso = '2026-11-17T17:30:00Z'
  it('formata data e hora', () => {
    expect(formatMeetingWhen(iso, now, tz)).toBe('terça-feira, 17/11, às 14:30')
    expect(formatMeetingWhen('2027-01-05T13:00:00Z', now, tz)).toBe('terça-feira, 05/01/2027, às 10:00')
  })
  it('traz nome, data/hora e link', () => {
    const msg = buildMeetingMessage({ patientName: 'Maria da Silva', scheduledAt: iso, url: 'https://meet.jit.si/myclinica-abc', now, timeZone: tz })
    expect(msg).toBe('Olá, Maria! Sua teleconsulta está marcada para terça-feira, 17/11, às 14:30. Para entrar, acesse o link: https://meet.jit.si/myclinica-abc')
  })
  it('sem nome usa saudação simples', () => {
    expect(buildMeetingMessage({ patientName: null, scheduledAt: iso, url: 'https://a.com/x', now, timeZone: tz })).toMatch(/^Olá! Sua teleconsulta/)
  })
  it('monta o wa.me codificado ou nulo sem telefone', () => {
    expect(buildMeetingWhatsAppLink('5585999998888', 'Olá, Ana! https://a.com/x?y=1')).toBe('https://wa.me/5585999998888?text=Ol%C3%A1%2C%20Ana!%20https%3A%2F%2Fa.com%2Fx%3Fy%3D1')
    expect(buildMeetingWhatsAppLink('', 'x')).toBeNull()
  })
})
