import { describe, expect, it } from 'vitest'
import {
  attachmentPreview, audioLimitLabel, baseMime, buildStoragePath, daysUntilExpiry, expiryNote, extForMime, isAllowedMime, isAttachmentExpired, maxAudioMsForMime, thumbBox,
} from './attachments'

const now = new Date('2026-12-01T12:00:00Z')
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString()

describe('mime e caminho', () => {
  it('tira os parâmetros do tipo', () => {
    expect(baseMime('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(baseMime('Audio/OGG; codecs=opus')).toBe('audio/ogg')
  })
  it('só aceita os tipos do bucket', () => {
    expect(isAllowedMime('audio/webm;codecs=opus')).toBe(true)
    expect(isAllowedMime('image/png')).toBe(false)
    expect(extForMime('image/png')).toBeNull()
    expect(extForMime('audio/mp4')).toBe('m4a')
  })
  it('monta <clinica>/<canal>/<uuid>.<ext>', () => {
    expect(buildStoragePath('c1', 'ch1', 'u1', 'image/webp')).toBe('c1/ch1/u1.webp')
    expect(buildStoragePath('c1', 'ch1', 'u1', 'audio/webm;codecs=opus')).toBe('c1/ch1/u1.webm')
    expect(buildStoragePath('c1', 'ch1', 'u1', 'image/gif')).toBeNull()
  })
})

describe('validade', () => {
  it('expired_at preenchido = expirado', () => {
    expect(isAttachmentExpired({ expires_at: inDays(10), expired_at: now.toISOString() }, now)).toBe(true)
  })
  it('expires_at no passado = expirado', () => {
    expect(isAttachmentExpired({ expires_at: inDays(-1), expired_at: null }, now)).toBe(true)
  })
  it('dentro do prazo = não expirado', () => {
    expect(isAttachmentExpired({ expires_at: inDays(5), expired_at: null }, now)).toBe(false)
  })
  it('avisa só a partir de 3 dias', () => {
    expect(daysUntilExpiry({ expires_at: inDays(10), expired_at: null }, now)).toBeNull()
    expect(daysUntilExpiry({ expires_at: inDays(3), expired_at: null }, now)).toBe(3)
    expect(daysUntilExpiry({ expires_at: inDays(2.2), expired_at: null }, now)).toBe(3)
    expect(daysUntilExpiry({ expires_at: inDays(0.2), expired_at: null }, now)).toBe(1)
    expect(daysUntilExpiry({ expires_at: inDays(-1), expired_at: null }, now)).toBeNull()
  })
  it('texto no singular e no plural', () => {
    expect(expiryNote({ expires_at: inDays(0.5), expired_at: null }, now)).toBe('some em 1 dia')
    expect(expiryNote({ expires_at: inDays(2), expired_at: null }, now)).toBe('some em 2 dias')
    expect(expiryNote({ expires_at: inDays(9), expired_at: null }, now)).toBeNull()
  })
})

describe('prévia e miniatura', () => {
  it('nunca vazia', () => {
    expect(attachmentPreview('image')).toBe('Foto')
    expect(attachmentPreview('audio')).toBe('Áudio')
    expect(attachmentPreview(undefined)).toBe('Anexo')
  })
  it('thumbBox mantém a proporção e cabe no limite', () => {
    expect(thumbBox(1280, 960)).toEqual({ width: 260, height: 195 })
    const tall = thumbBox(720, 1280)
    expect(tall.height).toBe(320)
    expect(tall.width).toBeCloseTo(180, 0)
  })
  it('sem medidas usa 4:3', () => {
    expect(thumbBox(null, null)).toEqual({ width: 260, height: 195 })
  })
})

describe('limite de gravação por formato', () => {
  it('audio/mp4 (Safari) limita a 90 s, com ou sem parâmetros', () => {
    expect(maxAudioMsForMime('audio/mp4')).toBe(90_000)
    expect(maxAudioMsForMime('Audio/MP4;codecs=mp4a.40.2')).toBe(90_000)
  })
  it('webm e ogg mantêm 5 minutos', () => {
    expect(maxAudioMsForMime('audio/webm;codecs=opus')).toBe(300_000)
    expect(maxAudioMsForMime('audio/ogg')).toBe(300_000)
  })
  it('texto do limite', () => {
    expect(audioLimitLabel(300_000)).toBe('5 minutos')
    expect(audioLimitLabel(90_000)).toBe('1 minuto e 30 segundos')
    expect(audioLimitLabel(60_000)).toBe('1 minuto')
  })
})
