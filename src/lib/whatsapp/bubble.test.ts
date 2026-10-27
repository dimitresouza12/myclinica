import { describe, it, expect } from 'vitest'
import { fileBadge, truncateMiddle, startsAuthorRun, avatarTone, AVATAR_TONES, RUN_GAP_MS, shortAppointmentLabel } from './bubble'

const TZ = 'America/Sao_Paulo'
const br = (iso: string) => new Date(`${iso}-03:00`).toISOString()

describe('fileBadge', () => {
  it.each([
    ['laudo.pdf', null, 'PDF', 'pdf'],
    ['Laudo.PDF', null, 'PDF', 'pdf'],
    ['contrato.docx', null, 'DOC', 'doc'],
    ['contrato.doc', null, 'DOC', 'doc'],
    ['exames.xlsx', null, 'XLS', 'xls'],
    ['lista.csv', null, 'XLS', 'xls'],
    ['aula.pptx', null, 'PPT', 'ppt'],
    ['nota.txt', null, 'TXT', 'other'],
    ['modelo3d.stlbin', null, 'STLB', 'other'],
    ['laudo.final.v2.pdf', null, 'PDF', 'pdf'],
  ])('%s', (name, mime, label, tone) => {
    expect(fileBadge(name, mime)).toEqual({ label, tone })
  })

  it('sem extensão: usa o tipo do arquivo quando é PDF, senão ARQ', () => {
    expect(fileBadge('exame', 'application/pdf')).toEqual({ label: 'PDF', tone: 'pdf' })
    expect(fileBadge('exame', null)).toEqual({ label: 'ARQ', tone: 'other' })
    expect(fileBadge('', undefined)).toEqual({ label: 'ARQ', tone: 'other' })
  })

  it('ponto no fim do nome não vira extensão vazia', () => {
    expect(fileBadge('arquivo.', null)).toEqual({ label: 'ARQ', tone: 'other' })
  })
})

describe('truncateMiddle', () => {
  it('nome curto não muda', () => {
    expect(truncateMiddle('laudo.pdf', 30)).toBe('laudo.pdf')
  })

  it('nome longo corta o meio e mantém a extensão', () => {
    const out = truncateMiddle('Exame_Hemograma_Completo_Maria_Silva.pdf', 24)
    expect(out.length).toBeLessThanOrEqual(24)
    expect(out.endsWith('.pdf')).toBe(true)
    expect(out.startsWith('Exame_')).toBe(true)
    expect(out).toContain('…')
  })

  it('mantém o final do nome antes da extensão', () => {
    const out = truncateMiddle('Exame_Hemograma_Completo_Maria_Silva.pdf', 24)
    expect(out).toMatch(/Silva\.pdf$/)
  })

  it('extensão maior que o limite não explode', () => {
    const out = truncateMiddle('a.extensaomuitolonga', 8)
    expect(out.length).toBeLessThanOrEqual(8)
    expect(out).toContain('…')
  })

  it('sem extensão corta o meio', () => {
    const out = truncateMiddle('abcdefghijklmnopqrstuvwxyz', 11)
    expect(out.length).toBe(11)
    expect(out).toContain('…')
    expect(out.startsWith('abcde')).toBe(true)
    expect(out.endsWith('z')).toBe(true)
  })

  it('limite muito pequeno devolve só o começo com reticências', () => {
    expect(truncateMiddle('abcdef', 1)).toBe('…')
  })
})

describe('startsAuthorRun', () => {
  const base = { direction: 'out' as const, author: 'Joao', created_at: br('2026-10-20T10:00:00') }

  it('primeira mensagem começa sequência', () => {
    expect(startsAuthorRun(null, base, TZ)).toBe(true)
  })

  it('mesma direção, mesmo autor e pouco tempo: continua a sequência', () => {
    const next = { ...base, created_at: br('2026-10-20T10:03:00') }
    expect(startsAuthorRun(base, next, TZ)).toBe(false)
  })

  it('muda a direção: nova sequência', () => {
    expect(startsAuthorRun(base, { ...base, direction: 'in', author: null }, TZ)).toBe(true)
  })

  it('muda o autor: nova sequência', () => {
    expect(startsAuthorRun(base, { ...base, author: 'Celular da clínica', created_at: br('2026-10-20T10:01:00') }, TZ)).toBe(true)
  })

  it('exatamente 10 minutos depois: nova sequência; 1 ms antes: continua', () => {
    const t0 = new Date(base.created_at).getTime()
    const at = (ms: number) => ({ ...base, created_at: new Date(t0 + ms).toISOString() })
    expect(startsAuthorRun(base, at(RUN_GAP_MS), TZ)).toBe(true)
    expect(startsAuthorRun(base, at(RUN_GAP_MS - 1), TZ)).toBe(false)
  })

  it('muda o dia no fuso da clínica: nova sequência, mesmo com poucos minutos de diferença', () => {
    // 23:58 e 00:02 em São Paulo (02:58Z e 03:02Z)
    const a = { ...base, created_at: br('2026-10-20T23:58:00') }
    const b = { ...base, created_at: br('2026-10-21T00:02:00') }
    expect(startsAuthorRun(a, b, TZ)).toBe(true)
  })

  it('mensagens recebidas seguidas (sem autor) continuam a sequência', () => {
    const a = { direction: 'in' as const, author: null, created_at: br('2026-10-20T10:00:00') }
    const b = { direction: 'in' as const, author: null, created_at: br('2026-10-20T10:01:00') }
    expect(startsAuthorRun(a, b, TZ)).toBe(false)
  })
})

describe('avatarTone', () => {
  it('é determinístico e fica entre 0 e o número de tons', () => {
    expect(avatarTone('Maria Silva')).toBe(avatarTone('Maria Silva'))
    for (const n of ['Maria Silva', 'João', '(88) 9762-3080', '', 'A', 'Ana Beatriz Souza Lima']) {
      const t = avatarTone(n)
      expect(Number.isInteger(t)).toBe(true)
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThan(AVATAR_TONES)
    }
  })

  it('ignora maiúsculas, acento e espaços nas pontas', () => {
    expect(avatarTone('  JOÃO  ')).toBe(avatarTone('joao'))
  })

  it('nomes diferentes usam mais de um tom', () => {
    const tones = new Set(['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi', 'Hugo'].map(avatarTone))
    expect(tones.size).toBeGreaterThan(2)
  })
})

describe('shortAppointmentLabel', () => {
  it('dia da semana, dia/mês e hora cheia', () => {
    expect(shortAppointmentLabel(new Date('2026-10-29T17:00:00Z'), TZ)).toBe('qui, 29/10, 14h')
  })

  it('hora com minutos', () => {
    expect(shortAppointmentLabel(new Date('2026-10-29T17:30:00Z'), TZ)).toBe('qui, 29/10, 14h30')
  })

  it('usa o fuso da clínica, não o do navegador (dia muda perto da meia-noite)', () => {
    // 02:30Z do dia 30 ainda é 23:30 do dia 29 em São Paulo
    expect(shortAppointmentLabel(new Date('2026-10-30T02:30:00Z'), TZ)).toBe('qui, 29/10, 23h30')
  })

  it('madrugada: 0h', () => {
    expect(shortAppointmentLabel(new Date('2026-10-29T03:00:00Z'), TZ)).toBe('qui, 29/10, 0h')
  })
})
