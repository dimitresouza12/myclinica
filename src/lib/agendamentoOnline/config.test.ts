import { describe, expect, it } from 'vitest'
import {
  BOOKING_ERRORS, contrastText, isBookingErrorCode, parseAvailability, parseOnlineSettings, parsePublicContext, safeColor, safeImageUrl, scheduleProblem,
  settingsToRow, validateOnlineSettings, DEFAULT_ONLINE_SETTINGS,
} from './config'

describe('parseOnlineSettings / settingsToRow', () => {
  it('sem linha vale o padrão: desligado, pendente, 4 h, 30 dias', () => {
    expect(parseOnlineSettings(null)).toEqual(DEFAULT_ONLINE_SETTINGS)
    expect(DEFAULT_ONLINE_SETTINGS).toMatchObject({ enabled: false, confirmMode: 'pendente', minNoticeHours: 4, maxDaysAhead: 30 })
  })
  it('lê a linha do banco e ignora valor fora do que a tabela aceita', () => {
    const s = parseOnlineSettings({ enabled: true, slug: 'minha-clinica', confirm_mode: 'confirmado', min_notice_hours: 999, max_days_ahead: 0, timezone: 'Mars/Base' })
    expect(s).toEqual({ enabled: true, slug: 'minha-clinica', confirmMode: 'confirmado', minNoticeHours: 4, maxDaysAhead: 30, timezone: 'America/Sao_Paulo' })
  })
  it('slug vazio vira null ao gravar', () => {
    expect(settingsToRow({ ...DEFAULT_ONLINE_SETTINGS, slug: '  ' }).slug).toBeNull()
    expect(settingsToRow({ ...DEFAULT_ONLINE_SETTINGS, slug: ' abc ' }).slug).toBe('abc')
  })
})

describe('validateOnlineSettings', () => {
  const on = { ...DEFAULT_ONLINE_SETTINGS, enabled: true, slug: 'abc' }
  it('ligar exige profissional e endereço', () => {
    expect(validateOnlineSettings(on, { professionals: 0 })).toMatch(/profissional/)
    expect(validateOnlineSettings({ ...on, slug: '' }, { professionals: 1 })).toMatch(/endereço/)
    expect(validateOnlineSettings(on, { professionals: 1 })).toBeNull()
  })
  it('desligado salva mesmo incompleto', () => {
    expect(validateOnlineSettings(DEFAULT_ONLINE_SETTINGS, { professionals: 0 })).toBeNull()
  })
  it('confere os limites de antecedência e janela', () => {
    expect(validateOnlineSettings({ ...on, minNoticeHours: -1 }, { professionals: 1 })).toMatch(/antecedência/)
    expect(validateOnlineSettings({ ...on, maxDaysAhead: 181 }, { professionals: 1 })).toMatch(/janela/)
    expect(validateOnlineSettings({ ...on, maxDaysAhead: 1.5 }, { professionals: 1 })).toMatch(/janela/)
  })
})

describe('parsePublicContext', () => {
  const raw = {
    clinic: { name: 'Clínica X', logo_url: 'https://cdn.exemplo.com/l.png', address: 'Rua A, 1', phone: '(85) 3222-1111', primary_color: '#7C3AED' },
    config: { confirm_mode: 'confirmado', min_notice_hours: 2, max_days_ahead: 14, timezone: 'America/Fortaleza' },
    professionals: [{ id: 'p1', name: 'Dra. Ana', specialty: 'Ortodontia', duration_minutes: 40 }, { id: 5, name: 'inválido' }],
    procedures: [{ id: 's1', name: 'Limpeza', category: null }],
  }
  it('converte e descarta item malformado', () => {
    const c = parsePublicContext(raw)!
    expect(c.clinic).toMatchObject({ name: 'Clínica X', primaryColor: '#7C3AED', logoUrl: 'https://cdn.exemplo.com/l.png' })
    expect(c.config).toEqual({ confirmMode: 'confirmado', minNoticeHours: 2, maxDaysAhead: 14, timezone: 'America/Fortaleza' })
    expect(c.professionals).toEqual([{ id: 'p1', name: 'Dra. Ana', specialty: 'Ortodontia', durationMinutes: 40 }])
    expect(c.procedures).toEqual([{ id: 's1', name: 'Limpeza', category: null }])
  })
  it('resposta nula ou torta não vira página', () => {
    expect(parsePublicContext(null)).toBeNull()
    expect(parsePublicContext('x')).toBeNull()
    expect(parsePublicContext({ clinic: {}, config: {} })).toBeNull()
  })
  it('cor e logo vindos do banco só passam se seguros', () => {
    expect(safeColor('#7C3AED')).toBe('#7C3AED')
    for (const bad of ['red', '#fff', 'url(javascript:1)', '#7C3AED; background:url(x)', null, 5]) expect(safeColor(bad)).toBeNull()
    expect(safeImageUrl('https://a.b/c.png')).toBe('https://a.b/c.png')
    for (const bad of ['http://a.b/c.png', 'javascript:alert(1)', 'data:image/png;base64,AAA', 'não é url', null]) expect(safeImageUrl(bad)).toBeNull()
  })
  it('a resposta pública nunca carrega campo além do esperado (sem vazar coluna extra)', () => {
    const c = parsePublicContext({ ...raw, clinic: { ...raw.clinic, billing_phone: '000', stripe_customer_id: 'cus_1' } })!
    expect(JSON.stringify(c)).not.toMatch(/billing|stripe|cus_1/)
  })
})

describe('parseAvailability', () => {
  const raw = {
    config: { timezone: 'America/Fortaleza', min_notice_hours: 4, max_days_ahead: 30, step_minutes: 30, opening: { start: '08:00', end: '18:00' } },
    duration_minutes: 40,
    schedule: {
      enabled: true,
      pattern: [{ weekday: 3, windows: [{ start: '09:00', end: '12:00' }] }],
      days: [{ date: '2026-12-02', works: false, windows: [] }],
    },
    busy: [[1000, 2000], ['3000', '4000'], [1], 'x'],
  }
  it('converte para o que a conta de horários usa', () => {
    const a = parseAvailability(raw)!
    expect(a.rules).toEqual({ timezone: 'America/Fortaleza', minNoticeHours: 4, maxDaysAhead: 30, stepMinutes: 30, opening: { start: '08:00', end: '18:00' } })
    expect(a.durationMin).toBe(40)
    expect(a.schedule.enabled).toBe(true)
    expect(a.schedule.pattern).toEqual([{ weekday: 3, windows: [{ start: '09:00', end: '12:00', shift_id: null }] }])
    expect(a.schedule.days).toEqual([{ date: '2026-12-02', works: false, windows: [] }])
    expect(a.busy).toEqual([{ startMs: 1000, endMs: 2000 }, { startMs: 3000, endMs: 4000 }])
  })
  it('valor fora do aceito cai no padrão seguro', () => {
    const a = parseAvailability({ ...raw, config: { timezone: 'X', step_minutes: 7, opening: { start: '18:00', end: '08:00' } } })!
    expect(a.rules.timezone).toBe('America/Sao_Paulo')
    expect(a.rules.stepMinutes).toBe(30)
    expect(a.rules.opening).toEqual({ start: '07:00', end: '19:30' })
  })
  it('null (profissional não liberado) continua null', () => {
    expect(parseAvailability(null)).toBeNull()
    expect(parseAvailability({})).toBeNull()
  })
})

describe('erros da reserva', () => {
  it('todo código tem mensagem em português e status; o texto cru do banco nunca é repassado', () => {
    for (const [code, e] of Object.entries(BOOKING_ERRORS)) {
      expect(isBookingErrorCode(code)).toBe(true)
      expect(e.message.length).toBeGreaterThan(10)
      expect(e.status).toBeGreaterThanOrEqual(400)
    }
    expect(isBookingErrorCode('syntax error at or near')).toBe(false)
    expect(isBookingErrorCode(undefined)).toBe(false)
  })
  it('conflito de horário é 409 e limite é 429', () => {
    expect(BOOKING_ERRORS.horario_ocupado.status).toBe(409)
    expect(BOOKING_ERRORS.limite.status).toBe(429)
  })
})

describe('contrastText', () => {
  it('texto escuro em fundo claro e claro em fundo escuro', () => {
    expect(contrastText('#FFFFFF')).toBe('#0D2421')
    expect(contrastText('#4DD9C0')).toBe('#0D2421')
    expect(contrastText('#000000')).toBe('#FFFFFF')
    expect(contrastText('#1E3A8A')).toBe('#FFFFFF')
  })
})

describe('scheduleProblem (profissional só entra no link com a escala ligada)', () => {
  const pros = [
    { id: 'a', name: 'Dra. Ana', schedule_enabled: true },
    { id: 'b', name: 'Dr. Bruno', schedule_enabled: false },
    { id: 'c', name: 'Dra. Carla', schedule_enabled: null },
    { id: 'd', name: 'Dr. Davi' },
  ]
  it('sem selecionado sem escala não há problema', () => {
    expect(scheduleProblem([], pros)).toBeNull()
    expect(scheduleProblem(['a'], pros)).toBeNull()
  })
  it('nomeia quem está sem escala (desligada, nula ou ausente) no singular e no plural', () => {
    expect(scheduleProblem(['a', 'b'], pros)).toMatch(/^Dr\. Bruno não tem escala ligada\./)
    const many = scheduleProblem(['b', 'c', 'd'], pros)
    expect(many).toMatch(/^Dr\. Bruno, Dra\. Carla, Dr\. Davi não têm escala ligada\./)
    expect(many).toMatch(/almoço e folgas/)
  })
  it('profissional desconhecido na seleção é ignorado (o banco confere)', () => {
    expect(scheduleProblem(['zzz'], pros)).toBeNull()
  })
})
