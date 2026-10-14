import { describe, it, expect } from 'vitest'
import {
  zonedTimeToUtc, isInsideWindow, adjustToWindow, plannedSends, decideSend,
  MIN_LEAD_MINUTES, type SendSettings,
} from './window'

const TZ = 'America/Sao_Paulo' // UTC-3 o ano todo (sem horário de verão desde 2019)

const base: SendSettings = {
  mode: 'vespera',
  vesperaSendTime: '18:00',
  noDiaHoursBefore: 2,
  windowStart: '08:00',
  windowEnd: '20:00',
  lateBookingPolicy: 'enviar_agora',
  timezone: TZ,
}

// horário de Brasília → Date (UTC-3)
const br = (iso: string) => new Date(`${iso}-03:00`)

describe('zonedTimeToUtc', () => {
  it('São Paulo é UTC-3', () => {
    expect(zonedTimeToUtc(2026, 10, 14, 14, 0, TZ).toISOString()).toBe('2026-10-14T17:00:00.000Z')
  })

  it('funciona em fuso com horário de verão (Nova York, antes e depois da virada)', () => {
    // 2026: DST começa 8/mar (EST -5 → EDT -4)
    expect(zonedTimeToUtc(2026, 3, 7, 12, 0, 'America/New_York').toISOString()).toBe('2026-03-07T17:00:00.000Z')
    expect(zonedTimeToUtc(2026, 3, 9, 12, 0, 'America/New_York').toISOString()).toBe('2026-03-09T16:00:00.000Z')
  })
})

describe('isInsideWindow', () => {
  it('dentro, nas bordas e fora', () => {
    expect(isInsideWindow(br('2026-10-13T08:00:00'), base)).toBe(true)
    expect(isInsideWindow(br('2026-10-13T20:00:00'), base)).toBe(true)
    expect(isInsideWindow(br('2026-10-13T12:00:00'), base)).toBe(true)
    expect(isInsideWindow(br('2026-10-13T07:59:00'), base)).toBe(false)
    expect(isInsideWindow(br('2026-10-13T20:01:00'), base)).toBe(false)
    expect(isInsideWindow(br('2026-10-13T03:00:00'), base)).toBe(false)
  })
})

describe('plannedSends — véspera', () => {
  it('consulta quarta 14h → confirmação terça 18h', () => {
    const p = plannedSends(br('2026-10-14T14:00:00'), base)
    expect(p).toHaveLength(1)
    expect(p[0].kind).toBe('confirmacao')
    expect(p[0].at.toISOString()).toBe(br('2026-10-13T18:00:00').toISOString())
  })

  it('consulta cedo (7h) também recebe na véspera às 18h', () => {
    const p = plannedSends(br('2026-10-14T07:00:00'), base)
    expect(p[0].at.toISOString()).toBe(br('2026-10-13T18:00:00').toISOString())
  })

  it('virada de mês: consulta dia 1º → véspera é dia 30/31 do mês anterior', () => {
    const p = plannedSends(br('2026-11-01T10:00:00'), base)
    expect(p[0].at.toISOString()).toBe(br('2026-10-31T18:00:00').toISOString())
  })

  it('virada de ano: consulta 1º de janeiro → véspera 31/12', () => {
    const p = plannedSends(br('2027-01-01T10:00:00'), base)
    expect(p[0].at.toISOString()).toBe(br('2026-12-31T18:00:00').toISOString())
  })

  it('horário da véspera fora da janela é puxado para o fechamento', () => {
    const s = { ...base, vesperaSendTime: '22:00' }
    const p = plannedSends(br('2026-10-14T14:00:00'), s)
    expect(p[0].at.toISOString()).toBe(br('2026-10-13T20:00:00').toISOString())
  })
})

describe('plannedSends — no dia', () => {
  it('consulta 14h, 2h antes → 12h', () => {
    const p = plannedSends(br('2026-10-14T14:00:00'), { ...base, mode: 'no_dia' })
    expect(p[0].kind).toBe('confirmacao')
    expect(p[0].at.toISOString()).toBe(br('2026-10-14T12:00:00').toISOString())
  })

  it('consulta 9h, 2h antes seria 7h (antes da janela) → abertura 8h, ainda antes da consulta', () => {
    const p = plannedSends(br('2026-10-14T09:00:00'), { ...base, mode: 'no_dia' })
    expect(p[0].at.toISOString()).toBe(br('2026-10-14T08:00:00').toISOString())
  })

  it('consulta 7h30: abertura 8h é depois da consulta → fecha no dia anterior às 20h', () => {
    const p = plannedSends(br('2026-10-14T07:30:00'), { ...base, mode: 'no_dia' })
    expect(p[0].at.toISOString()).toBe(br('2026-10-13T20:00:00').toISOString())
  })

  it('consulta 21h30, 2h antes seria 19h30 → dentro da janela, mantém', () => {
    const p = plannedSends(br('2026-10-14T21:30:00'), { ...base, mode: 'no_dia' })
    expect(p[0].at.toISOString()).toBe(br('2026-10-14T19:30:00').toISOString())
  })
})

describe('plannedSends — ambos', () => {
  it('confirmação na véspera + lembrete no dia', () => {
    const p = plannedSends(br('2026-10-14T14:00:00'), { ...base, mode: 'ambos' })
    expect(p.map(x => x.kind)).toEqual(['confirmacao', 'lembrete'])
    expect(p[0].at.toISOString()).toBe(br('2026-10-13T18:00:00').toISOString())
    expect(p[1].at.toISOString()).toBe(br('2026-10-14T12:00:00').toISOString())
  })
})

describe('decideSend', () => {
  const appt = br('2026-10-14T14:00:00')
  const created = br('2026-10-01T10:00:00')
  const planned = { kind: 'confirmacao' as const, at: br('2026-10-13T18:00:00') }

  it('antes do horário planejado → aguardando', () => {
    const r = decideSend({ appointmentAt: appt, createdAt: created, now: br('2026-10-13T17:55:00'), planned }, base)
    expect(r).toEqual({ send: false, reason: 'aguardando' })
  })

  it('no horário planejado, dentro da janela → envia', () => {
    const r = decideSend({ appointmentAt: appt, createdAt: created, now: br('2026-10-13T18:03:00'), planned }, base)
    expect(r).toEqual({ send: true })
  })

  it('passou do planejado mas ainda na janela (rotina atrasou) → envia', () => {
    const r = decideSend({ appointmentAt: appt, createdAt: created, now: br('2026-10-13T19:30:00'), planned }, base)
    expect(r.send).toBe(true)
  })

  it('passou do planejado e saiu da janela → fora_da_janela (espera o dia seguinte)', () => {
    const r = decideSend({ appointmentAt: appt, createdAt: created, now: br('2026-10-13T21:00:00'), planned }, base)
    expect(r).toEqual({ send: false, reason: 'fora_da_janela' })
  })

  it('o dia seguinte de manhã retoma, se ainda falta tempo', () => {
    const r = decideSend({ appointmentAt: appt, createdAt: created, now: br('2026-10-14T08:05:00'), planned }, base)
    expect(r.send).toBe(true)
  })

  it(`faltando menos de ${MIN_LEAD_MINUTES} min para a consulta → muito_perto`, () => {
    const r = decideSend({ appointmentAt: appt, createdAt: created, now: br('2026-10-14T13:40:00'), planned }, base)
    expect(r).toEqual({ send: false, reason: 'muito_perto' })
  })

  it('consulta já passou → muito_perto (nunca confirma consulta que já aconteceu)', () => {
    const r = decideSend({ appointmentAt: appt, createdAt: created, now: br('2026-10-14T15:00:00'), planned }, base)
    expect(r.send).toBe(false)
  })

  describe('consulta marcada depois do horário ideal de envio', () => {
    const lateCreated = br('2026-10-13T19:00:00') // marcada às 19h, ideal era 18h
    const now = br('2026-10-13T19:05:00')

    it('política enviar_agora → envia', () => {
      const r = decideSend({ appointmentAt: appt, createdAt: lateCreated, now, planned }, base)
      expect(r.send).toBe(true)
    })

    it('política nao_enviar → agendada_em_cima_da_hora', () => {
      const r = decideSend({ appointmentAt: appt, createdAt: lateCreated, now, planned }, { ...base, lateBookingPolicy: 'nao_enviar' })
      expect(r).toEqual({ send: false, reason: 'agendada_em_cima_da_hora' })
    })

    it('política nao_enviar não afeta consulta marcada ANTES do horário ideal', () => {
      const r = decideSend({ appointmentAt: appt, createdAt: created, now: br('2026-10-13T18:03:00'), planned }, { ...base, lateBookingPolicy: 'nao_enviar' })
      expect(r.send).toBe(true)
    })
  })
})

describe('adjustToWindow', () => {
  it('dentro da janela não mexe', () => {
    const ideal = br('2026-10-13T12:00:00')
    expect(adjustToWindow(ideal, br('2026-10-13T16:00:00'), base).getTime()).toBe(ideal.getTime())
  })
})
