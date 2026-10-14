import { describe, it, expect } from 'vitest'
import { validateSettings, DEFAULT_SETTINGS, unknownVariables, rowToSettings, settingsToRow, MAX_TEMPLATE } from './settings'

const ok = (over: Record<string, unknown> = {}) => validateSettings({ ...DEFAULT_SETTINGS, ...over })

describe('validateSettings', () => {
  it('as configurações padrão são válidas', () => {
    const r = validateSettings(DEFAULT_SETTINGS)
    expect(r.ok).toBe(true)
  })

  it('aceita os 3 modos e as 2 políticas', () => {
    for (const confirmMode of ['vespera', 'no_dia', 'ambos']) expect(ok({ confirmMode }).ok).toBe(true)
    for (const lateBookingPolicy of ['enviar_agora', 'nao_enviar']) expect(ok({ lateBookingPolicy }).ok).toBe(true)
  })

  it.each([
    ['modo inválido', { confirmMode: 'sempre' }],
    ['política inválida', { lateBookingPolicy: 'talvez' }],
    ['confirmEnabled não booleano', { confirmEnabled: 'sim' }],
    ['horário da véspera mal formado', { vesperaSendTime: '6pm' }],
    ['hora 24', { vesperaSendTime: '24:00' }],
    ['minuto 60', { windowStart: '08:60' }],
    ['janela invertida', { windowStart: '20:00', windowEnd: '08:00' }],
    ['janela de tamanho zero', { windowStart: '08:00', windowEnd: '08:00' }],
    ['horas 0', { noDiaHoursBefore: 0 }],
    ['horas 13', { noDiaHoursBefore: 13 }],
    ['horas decimal', { noDiaHoursBefore: 2.5 }],
    ['horas como texto', { noDiaHoursBefore: '2' }],
    ['fuso inexistente', { timezone: 'Marte/Olimpo' }],
    ['fuso vazio', { timezone: '' }],
    ['texto vazio', { messageTemplate: '   ' }],
    ['texto com caractere de controle', { messageTemplate: 'Oi\u0000 {paciente}' }],
    ['texto longo demais', { messageTemplate: 'a'.repeat(MAX_TEMPLATE + 1) }],
    ['variável inexistente', { messageTemplate: 'Oi {paciente}, seu {tipo_consulta}' }],
    ['resposta "sim" vazia', { replyYesText: '' }],
    ['resposta "não" longa demais', { replyNoText: 'a'.repeat(301) }],
  ])('rejeita %s', (_nome, over) => {
    const r = ok(over)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThan(5)
  })

  it('corpo nulo ou de outro tipo não quebra', () => {
    expect(validateSettings(null).ok).toBe(false)
    expect(validateSettings('x').ok).toBe(false)
    expect(validateSettings(undefined).ok).toBe(false)
  })

  it('apara espaços e normaliza quebras de linha do texto', () => {
    const r = ok({ messageTemplate: '  Oi {paciente}\r\nAté lá  ' })
    expect(r.ok && r.value.messageTemplate).toBe('Oi {paciente}\nAté lá')
  })

  it('aceita todas as variáveis conhecidas', () => {
    expect(ok({ messageTemplate: '{paciente} {clinica} {data} {hora} {profissional}{com_profissional}' }).ok).toBe(true)
  })

  it('mensagem de erro de variável aponta qual foi', () => {
    const r = ok({ messageTemplate: 'Oi {nome}' })
    expect(!r.ok && r.error).toContain('{nome}')
  })
})

describe('unknownVariables', () => {
  it('lista só as desconhecidas, sem repetir', () => {
    expect(unknownVariables('{paciente} {x} {x} {y}')).toEqual(['x', 'y'])
    expect(unknownVariables('sem variável')).toEqual([])
  })
})

describe('rowToSettings / settingsToRow', () => {
  it('ida e volta preserva tudo e corta os segundos do horário do Postgres', () => {
    const row = { ...settingsToRow(DEFAULT_SETTINGS), vespera_send_time: '18:00:00', send_window_start: '08:00:00', send_window_end: '20:00:00' }
    expect(rowToSettings(row)).toEqual(DEFAULT_SETTINGS)
    expect(settingsToRow(rowToSettings(row)).vespera_send_time).toBe('18:00')
  })
})
