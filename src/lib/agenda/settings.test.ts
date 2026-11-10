import { describe, it, expect } from 'vitest'
import { buildSlots, canExtraSlot, DEFAULT_SETTINGS, parseSettings, validateSettings } from './settings'

describe('buildSlots', () => {
  it('o padrão reproduz a grade antiga de 07:00 a 19:00', () => {
    const s = buildSlots(DEFAULT_SETTINGS.opening)
    expect(s[0]).toBe('07:00')
    expect(s[s.length - 1]).toBe('19:00')
    expect(s).toHaveLength(25)
  })
  it('respeita início e fim configurados', () => {
    expect(buildSlots({ start: '08:00', end: '10:00' })).toEqual(['08:00', '08:30', '09:00', '09:30'])
  })
})

describe('parseSettings', () => {
  it('sem linha: padrões', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
  })
  it('lê as colunas e ignora valores inválidos', () => {
    const s = parseSettings({
      extra_slot_policy: 'admin', extra_slot_require_reason: false, reminder_enabled: false, reminder_days_before: 7,
      opening_hours: { start: '09:00', end: '18:00' },
      shifts: [{ id: 'x', name: 'Único', start: '09:00', end: '17:00' }],
    })
    expect(s).toMatchObject({ extraSlotPolicy: 'admin', extraSlotRequireReason: false, reminderEnabled: false, reminderDaysBefore: 7 })
    expect(s.opening).toEqual({ start: '09:00', end: '18:00' })
    expect(s.shifts).toHaveLength(1)
    const bad = parseSettings({ extra_slot_policy: 'qualquer', reminder_days_before: 99, opening_hours: { start: '18:00', end: '09:00' }, shifts: [{ id: 'a' }] })
    expect(bad).toEqual(DEFAULT_SETTINGS)
  })
})

describe('canExtraSlot', () => {
  const rec = { isAdmin: false, isAdminOrRecepcao: true }
  const adm = { isAdmin: true, isAdminOrRecepcao: true }
  it('segue a política', () => {
    expect(canExtraSlot('none', adm)).toBe(false)
    expect(canExtraSlot('admin', rec)).toBe(false)
    expect(canExtraSlot('admin', adm)).toBe(true)
    expect(canExtraSlot('admin_recepcao', rec)).toBe(true)
    expect(canExtraSlot('admin_recepcao', { isAdmin: false, isAdminOrRecepcao: false })).toBe(false)
  })
})

describe('validateSettings', () => {
  it('aceita os padrões e recusa turno invertido, nome repetido e grade invertida', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toBeNull()
    const sh = (over: object) => ({ ...DEFAULT_SETTINGS, shifts: [{ id: 'a', name: 'Manhã', start: '08:00', end: '12:00', ...over }] })
    expect(validateSettings(sh({ end: '07:00' }))).toMatch(/terminar depois/)
    expect(validateSettings(sh({ name: ' ' }))).toMatch(/nome/)
    expect(validateSettings({ ...DEFAULT_SETTINGS, shifts: [DEFAULT_SETTINGS.shifts[0], { ...DEFAULT_SETTINGS.shifts[1], name: 'manhã' }] })).toMatch(/dois turnos/)
    expect(validateSettings({ ...DEFAULT_SETTINGS, opening: { start: '19:00', end: '07:00' } })).toMatch(/funcionamento/)
  })
})
