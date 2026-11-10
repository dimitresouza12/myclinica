import { describe, it, expect } from 'vitest'
import { scheduleReminder } from './reminder'

const none = { enabled: true, pattern: [], days: [] }
const ok = { enabled: true, pattern: [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, windows: [{ start: '08:00', end: '12:00' }] })), days: [] }

describe('scheduleReminder', () => {
  const now = new Date(2026, 10, 4)
  const byId = (id: string) => (id === 'a' ? none : id === 'b' ? ok : undefined)
  it('conta só quem tem escala ligada e dia por definir', () => {
    // a: 4 dias por definir (hoje + 3), b: tudo definido pela rotina, c: sem escala
    expect(scheduleReminder(['a', 'b', 'c'], byId, now, 3)).toEqual({ professionals: 1, days: 4 })
  })
  it('nulo quando tudo está definido ou o lembrete está desligado', () => {
    expect(scheduleReminder(['b', 'c'], byId, now, 3)).toBeNull()
    expect(scheduleReminder(['a'], byId, now, 3, false)).toBeNull()
  })
})
