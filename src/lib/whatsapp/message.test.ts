import { describe, it, expect } from 'vitest'
import { renderMessage, formatDateLabel, formatTimeLabel, REPLY_INSTRUCTION } from './message'

const TZ = 'America/Sao_Paulo'
const br = (iso: string) => new Date(`${iso}-03:00`)

describe('formatDateLabel', () => {
  const now = br('2026-10-13T18:00:00') // terça

  it('mesmo dia → hoje', () => {
    expect(formatDateLabel(br('2026-10-13T20:00:00'), now, TZ)).toBe('hoje')
  })

  it('dia seguinte → amanhã (dd/mm)', () => {
    expect(formatDateLabel(br('2026-10-14T14:00:00'), now, TZ)).toBe('amanhã (14/10)')
  })

  it('mais de um dia → dia da semana (dd/mm)', () => {
    expect(formatDateLabel(br('2026-10-16T09:00:00'), now, TZ)).toBe('sexta-feira (16/10)')
  })

  it('usa o dia local da clínica, não o UTC: 22h em Brasília já é 01h UTC do dia seguinte', () => {
    expect(formatDateLabel(br('2026-10-14T22:00:00'), br('2026-10-14T08:00:00'), TZ)).toBe('hoje')
  })

  it('virada de mês', () => {
    expect(formatDateLabel(br('2026-11-01T10:00:00'), br('2026-10-31T18:00:00'), TZ)).toBe('amanhã (01/11)')
  })
})

describe('formatTimeLabel', () => {
  it('hora cheia e com minutos', () => {
    expect(formatTimeLabel(br('2026-10-14T14:00:00'), TZ)).toBe('14h')
    expect(formatTimeLabel(br('2026-10-14T14:30:00'), TZ)).toBe('14h30')
    expect(formatTimeLabel(br('2026-10-14T08:05:00'), TZ)).toBe('8h05')
  })
})

describe('renderMessage', () => {
  const v = {
    paciente: 'Maria da Silva Souza',
    clinica: 'Clínica Sorriso',
    profissional: 'Dra. Ana',
    appointmentAt: br('2026-10-14T14:00:00'),
    now: br('2026-10-13T18:00:00'),
    timezone: TZ,
  }
  const tpl = 'Olá, {paciente}! Sua consulta na {clinica} está marcada para {data} às {hora}{com_profissional}.'

  it('monta o texto com a instrução fixa de resposta', () => {
    const txt = renderMessage(tpl, v, { askReply: true })
    expect(txt).toBe(
      `Olá, Maria! Sua consulta na Clínica Sorriso está marcada para amanhã (14/10) às 14h com Dra. Ana.\n\n${REPLY_INSTRUCTION}`,
    )
  })

  it('lembrete (sem pedir resposta) não leva a instrução', () => {
    const txt = renderMessage(tpl, v, { askReply: false })
    expect(txt).not.toContain('SIM')
  })

  it('sem profissional, a frase não fica com "com" sobrando', () => {
    const txt = renderMessage(tpl, { ...v, profissional: null }, { askReply: false })
    expect(txt).toBe('Olá, Maria! Sua consulta na Clínica Sorriso está marcada para amanhã (14/10) às 14h.')
  })

  it('variável desconhecida fica visível para a clínica corrigir', () => {
    const txt = renderMessage('Oi {paciente}, {tipo_consulta}', v, { askReply: false })
    expect(txt).toBe('Oi Maria, {tipo_consulta}')
  })

  it('a instrução fixa vem mesmo se a clínica apagar tudo do modelo', () => {
    const txt = renderMessage('', v, { askReply: true })
    expect(txt.endsWith(REPLY_INSTRUCTION)).toBe(true)
  })
})
