import { describe, it, expect } from 'vitest'
import {
  warmupStart, warmupDailyLimit, isPaused, isRetryable, countsTowardPause, sendGapMs,
  WARMUP_DAILY_LIMITS, MIN_GAP_MS, MAX_GAP_MS, RETRYABLE_ERROR,
} from './safety'
import { startOfLocalDay } from './window'

const HOUR = 60 * 60_000
const DAY = 24 * HOUR
const now = new Date('2026-10-20T15:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)

describe('aquecimento', () => {
  it('número sem nenhum envio começa no primeiro dia', () => {
    const start = warmupStart([], now)
    expect(start).toEqual(now)
    expect(warmupDailyLimit(start, now)).toBe(WARMUP_DAILY_LIMITS[0])
  })

  it('sobe o limite conforme os dias de atividade contínua', () => {
    const outgoing = [ago(1 * HOUR), ago(1 * DAY), ago(2 * DAY + 2 * HOUR)]
    const start = warmupStart(outgoing, now)
    expect(start).toEqual(ago(2 * DAY + 2 * HOUR))
    expect(warmupDailyLimit(start, now)).toBe(WARMUP_DAILY_LIMITS[2])
  })

  it('atividade contínua por mais que o aquecimento: sem limite', () => {
    const outgoing = Array.from({ length: 7 }, (_, i) => ago(i * DAY + HOUR))
    expect(warmupStart(outgoing, now)).toBeNull()
    expect(warmupDailyLimit(null, now)).toBeNull()
  })

  it('3 dias parado volta para o aquecimento', () => {
    // muito ativo antes, mas nada nos últimos 3 dias
    const outgoing = Array.from({ length: 10 }, (_, i) => ago(3 * DAY + i * HOUR * 5))
    const start = warmupStart(outgoing, now)
    expect(start).toEqual(now)
    expect(warmupDailyLimit(start, now)).toBe(WARMUP_DAILY_LIMITS[0])
  })

  it('um buraco de 3 dias no meio reinicia a contagem a partir da volta', () => {
    const outgoing = [ago(2 * HOUR), ago(20 * HOUR), ago(5 * DAY), ago(6 * DAY)]
    const start = warmupStart(outgoing, now)
    expect(start).toEqual(ago(20 * HOUR))
    expect(warmupDailyLimit(start, now)).toBe(WARMUP_DAILY_LIMITS[0])
  })

  it('queda curta da conexão não reinicia (atividade antes e depois)', () => {
    const outgoing = [ago(HOUR), ago(30 * HOUR), ago(50 * HOUR), ago(70 * HOUR), ago(95 * HOUR), ago(110 * HOUR)]
    expect(warmupStart(outgoing, now)).toBeNull()
  })

  it('busca que bateu no limite conta como número aquecido', () => {
    expect(warmupStart([ago(HOUR)], now, true)).toBeNull()
  })

  it('ignora horários no futuro', () => {
    expect(warmupStart([new Date(now.getTime() + DAY)], now)).toEqual(now)
  })
})

describe('pausa por falhas', () => {
  const f = (error: string | null, minutesAgo: number) => ({ error, updated_at: ago(minutesAgo * 60_000).toISOString() })

  it('pausa com 3 falhas de envio em 30 minutos', () => {
    expect(isPaused([f(RETRYABLE_ERROR, 1), f('Evolution respondeu 400', 5), f(null, 20)], now)).toBe(true)
  })

  it('não pausa com menos de 3 ou com falhas antigas', () => {
    expect(isPaused([f(RETRYABLE_ERROR, 1), f(RETRYABLE_ERROR, 2)], now)).toBe(false)
    expect(isPaused([f(RETRYABLE_ERROR, 1), f(RETRYABLE_ERROR, 2), f(RETRYABLE_ERROR, 45)], now)).toBe(false)
  })

  it('problemas do telefone do paciente não pausam', () => {
    expect(countsTowardPause('sem_whatsapp')).toBe(false)
    expect(countsTowardPause('telefone_invalido')).toBe(false)
    expect(countsTowardPause('whatsapp_desconectado')).toBe(false)
    expect(countsTowardPause('interrompido')).toBe(false)
    expect(isPaused([f('sem_whatsapp', 1), f('sem_whatsapp', 2), f('telefone_invalido', 3)], now)).toBe(false)
  })
})

describe('nova tentativa', () => {
  const row = (error: string | null, minutesAgo: number, status = 'falhou') =>
    ({ status, error, updated_at: ago(minutesAgo * 60_000).toISOString() })

  it('só erro passageiro e depois da espera', () => {
    expect(isRetryable(row(RETRYABLE_ERROR, 20), now)).toBe(true)
    expect(isRetryable(row(RETRYABLE_ERROR, 5), now)).toBe(false)
    expect(isRetryable(row('sem_whatsapp', 60), now)).toBe(false)
    expect(isRetryable(row(null, 60, 'enviado'), now)).toBe(false)
  })
})

describe('intervalo entre envios', () => {
  it('fica entre o mínimo e o máximo', () => {
    expect(sendGapMs(() => 0)).toBe(MIN_GAP_MS)
    expect(sendGapMs(() => 1)).toBe(MAX_GAP_MS)
    for (let i = 0; i < 200; i++) {
      const g = sendGapMs()
      expect(g).toBeGreaterThanOrEqual(MIN_GAP_MS)
      expect(g).toBeLessThanOrEqual(MAX_GAP_MS)
    }
  })
})

describe('início do dia no fuso', () => {
  it('meia-noite de São Paulo', () => {
    expect(startOfLocalDay(new Date('2026-10-20T02:00:00Z'), 'America/Sao_Paulo').toISOString()).toBe('2026-10-19T03:00:00.000Z')
    expect(startOfLocalDay(new Date('2026-10-20T15:00:00Z'), 'America/Sao_Paulo').toISOString()).toBe('2026-10-20T03:00:00.000Z')
  })
})
