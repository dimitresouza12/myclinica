import { describe, it, expect } from 'vitest'
import {
  previewFor, formatJidPhone, contactDisplayName, initialsOf, listTimeLabel, dayLabel, clockLabel, withDaySeparators,
} from './inbox'

const TZ = 'America/Sao_Paulo'
const br = (iso: string) => new Date(`${iso}-03:00`)

describe('previewFor', () => {
  it('texto: uma linha, cortado se longo', () => {
    expect(previewFor('text', 'Olá\n  tudo bem?')).toBe('Olá tudo bem?')
    expect(previewFor('text', 'a'.repeat(200)).length).toBe(90)
  })
  it('mídia: rótulo, com a legenda quando há', () => {
    expect(previewFor('image', '')).toBe('Imagem')
    expect(previewFor('image', 'meu exame')).toBe('Imagem: meu exame')
    expect(previewFor('audio', null)).toBe('Áudio')
    expect(previewFor('document', undefined)).toBe('Documento')
    expect(previewFor('sticker', '')).toBe('Figurinha')
    expect(previewFor('other', '')).toBe('Mensagem')
  })
})

describe('formatJidPhone', () => {
  it.each([
    ['5585999998888@s.whatsapp.net', '(85) 99999-8888'],
    ['558532221111@s.whatsapp.net', '(85) 3222-1111'],
    ['85999998888', '(85) 99999-8888'],
    ['14155550123@s.whatsapp.net', '+14155550123'],
    ['351912345678@s.whatsapp.net', '+351912345678'],
  ])('%s → %s', (jid, esperado) => expect(formatJidPhone(jid)).toBe(esperado))
  it('@lid e vazio não mostram número inventado', () => {
    expect(formatJidPhone('123@lid')).toBe('Número oculto pelo WhatsApp')
    expect(formatJidPhone('lid:123')).toBe('Número oculto pelo WhatsApp')
    expect(formatJidPhone(null)).toBe('Número oculto pelo WhatsApp')
  })
})

describe('contactDisplayName / initialsOf', () => {
  const jid = '5585999998888@s.whatsapp.net'
  it('paciente primeiro, depois o nome no WhatsApp, depois o telefone', () => {
    expect(contactDisplayName({ patientName: 'Maria da Silva', contactName: 'Mari', jid })).toBe('Maria da Silva')
    expect(contactDisplayName({ patientName: null, contactName: 'Mari', jid })).toBe('Mari')
    expect(contactDisplayName({ patientName: ' ', contactName: '', jid })).toBe('(85) 99999-8888')
  })
  it('iniciais', () => {
    expect(initialsOf('Maria da Silva')).toBe('MD')
    expect(initialsOf('camila')).toBe('C')
    expect(initialsOf('(85) 99999-8888')).toBe('#')
    expect(initialsOf('')).toBe('#')
  })
})

describe('datas no fuso da clínica', () => {
  const now = br('2026-10-14T10:00:00') // quarta

  it('lista: hoje = hora; ontem; dia da semana; data', () => {
    expect(listTimeLabel(br('2026-10-14T09:41:00'), now, TZ)).toBe('09:41')
    expect(listTimeLabel(br('2026-10-13T23:50:00'), now, TZ)).toBe('Ontem')
    expect(listTimeLabel(br('2026-10-12T08:00:00'), now, TZ)).toBe('seg')
    expect(listTimeLabel(br('2026-10-05T08:00:00'), now, TZ)).toBe('05/10')
  })

  it('usa o dia local, não o UTC: 22h de ontem em Brasília já é hoje em UTC', () => {
    expect(listTimeLabel(br('2026-10-13T22:30:00'), now, TZ)).toBe('Ontem')
    expect(dayLabel(br('2026-10-13T22:30:00'), now, TZ)).toBe('Ontem')
  })

  it('separador: Hoje, Ontem, dia da semana por extenso, data completa', () => {
    expect(dayLabel(br('2026-10-14T00:05:00'), now, TZ)).toBe('Hoje')
    expect(dayLabel(br('2026-10-13T12:00:00'), now, TZ)).toBe('Ontem')
    expect(dayLabel(br('2026-10-12T12:00:00'), now, TZ)).toBe('segunda-feira')
    expect(dayLabel(br('2026-09-30T12:00:00'), now, TZ)).toBe('30/09/2026')
  })

  it('virada de ano', () => {
    expect(dayLabel(br('2025-12-31T12:00:00'), br('2026-01-01T09:00:00'), TZ)).toBe('Ontem')
    expect(listTimeLabel(br('2025-12-20T12:00:00'), br('2026-01-01T09:00:00'), TZ)).toBe('20/12')
  })

  it('relógio da mensagem', () => {
    expect(clockLabel(br('2026-10-14T08:05:00'), TZ)).toBe('08:05')
  })
})

describe('withDaySeparators', () => {
  const now = br('2026-10-14T10:00:00')
  it('insere um separador por dia, na ordem', () => {
    const msgs = [
      { id: 1, created_at: br('2026-10-13T09:00:00').toISOString() },
      { id: 2, created_at: br('2026-10-13T09:05:00').toISOString() },
      { id: 3, created_at: br('2026-10-14T08:00:00').toISOString() },
    ]
    const out = withDaySeparators(msgs, now, TZ)
    expect(out.map(i => (i.type === 'day' ? `dia:${i.label}` : `msg:${i.msg.id}`))).toEqual(['dia:Ontem', 'msg:1', 'msg:2', 'dia:Hoje', 'msg:3'])
  })
  it('lista vazia', () => expect(withDaySeparators([], now, TZ)).toEqual([]))
})
