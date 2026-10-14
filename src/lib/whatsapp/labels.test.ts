import { describe, it, expect } from 'vitest'
import { confirmationLabel, pickLatest, type ConfirmationInfo } from './labels'

const base: ConfirmationInfo = { kind: 'confirmacao', status: 'enviado', sent_at: null, answered_at: null, error: null }

describe('confirmationLabel', () => {
  it.each([
    ['enviando', 'muted'], ['enviado', 'info'], ['confirmado', 'ok'],
    ['pediu_remarcacao', 'warn'], ['respondeu', 'info'], ['falhou', 'bad'],
  ] as const)('%s → tom %s', (status, tone) => {
    expect(confirmationLabel({ ...base, status }).tone).toBe(tone)
  })

  it('lembrete enviado não fica "aguardando resposta"', () => {
    const l = confirmationLabel({ ...base, kind: 'lembrete', status: 'enviado' })
    expect(l.short).toBe('Lembrete enviado')
    expect(l.tone).toBe('muted')
  })

  it('falha mostra o motivo conhecido e cai num texto genérico para o desconhecido', () => {
    expect(confirmationLabel({ ...base, status: 'falhou', error: 'sem_whatsapp' }).short).toBe('Número sem WhatsApp')
    expect(confirmationLabel({ ...base, status: 'falhou', error: 'telefone_invalido' }).text).toContain('Telefone inválido')
    expect(confirmationLabel({ ...base, status: 'falhou', error: 'Evolution respondeu 500' }).short).toBe('Não foi possível enviar')
    expect(confirmationLabel({ ...base, status: 'falhou', error: null }).short).toBe('Não foi possível enviar')
  })

  it('confirmou: o texto longo traz o horário quando existe', () => {
    const l = confirmationLabel({ ...base, status: 'confirmado', answered_at: '2026-10-13T18:32:00.000Z' })
    expect(l.text).toMatch(/Confirmou pelo WhatsApp às \d{2}:\d{2}/)
    expect(confirmationLabel({ ...base, status: 'confirmado' }).text).toBe('Confirmou pelo WhatsApp')
  })
})

describe('pickLatest', () => {
  it('escolhe a mais recente', () => {
    const r = pickLatest([{ id: 'a', created_at: '2026-10-01' }, { id: 'b', created_at: '2026-10-03' }, { id: 'c', created_at: '2026-10-02' }])
    expect(r?.id).toBe('b')
  })
  it('lista vazia → null', () => {
    expect(pickLatest([])).toBeNull()
  })
})
