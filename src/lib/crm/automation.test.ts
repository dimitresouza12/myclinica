import { describe, it, expect } from 'vitest'
import { stageOnMessage, stageFromAppointments, idleToLost, hasUpcomingAppointment, type ApptFact } from './automation'
import type { Stage } from './model'

const NOW = new Date('2026-10-15T12:00:00Z')
const iso = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

const lead = (over: Partial<{ stage: Stage; stage_changed_at: string; stage_source: 'manual' | 'auto'; next_contact_at: string | null }> = {}) => ({
  stage: 'novo' as Stage, stage_changed_at: iso(-5), stage_source: 'auto' as const, next_contact_at: null, ...over,
})
const appt = (over: Partial<ApptFact> = {}): ApptFact => ({ status: 'agendado', scheduled_at: iso(3), created_at: iso(-1), ...over })

describe('stageOnMessage', () => {
  it('a clínica responde um lead Novo → Em conversa', () => {
    expect(stageOnMessage('novo', 'out')).toMatchObject({ stage: 'em_conversa' })
  })
  it('a clínica retoma um lead Perdido → Em conversa', () => {
    expect(stageOnMessage('perdido', 'out')).toMatchObject({ stage: 'em_conversa' })
  })
  it('o contato volta a escrever depois de Perdido → Novo', () => {
    expect(stageOnMessage('perdido', 'in')).toMatchObject({ stage: 'novo' })
  })
  it('não mexe no meio do funil nem em quem já foi atendido', () => {
    for (const s of ['em_conversa', 'agendado', 'compareceu'] as Stage[]) {
      expect(stageOnMessage(s, 'in')).toBeNull()
      expect(stageOnMessage(s, 'out')).toBeNull()
    }
    expect(stageOnMessage('novo', 'in')).toBeNull()
  })
})

describe('stageFromAppointments', () => {
  it('consulta futura marcada → Agendado', () => {
    expect(stageFromAppointments(lead({ stage: 'em_conversa' }), [appt()], NOW)).toMatchObject({ stage: 'agendado' })
  })
  it('consulta confirmada também conta', () => {
    expect(stageFromAppointments(lead(), [appt({ status: 'confirmado' })], NOW)).toMatchObject({ stage: 'agendado' })
  })
  it('já Agendado e com consulta futura: nada a fazer', () => {
    expect(stageFromAppointments(lead({ stage: 'agendado' }), [appt()], NOW)).toBeNull()
  })
  it('consulta passada que ficou como "agendado" não conta como futura', () => {
    expect(stageFromAppointments(lead(), [appt({ scheduled_at: iso(-2) })], NOW)).toBeNull()
  })
  it('consulta concluída → Compareceu, mesmo vindo de Perdido', () => {
    expect(stageFromAppointments(lead({ stage: 'perdido' }), [appt({ status: 'concluido', scheduled_at: iso(-1) })], NOW)).toMatchObject({ stage: 'compareceu' })
  })
  it('Compareceu nunca volta, mesmo com retorno marcado', () => {
    expect(stageFromAppointments(lead({ stage: 'compareceu' }), [appt()], NOW)).toBeNull()
  })
  it('Agendado e a consulta foi cancelada → Em conversa', () => {
    const r = stageFromAppointments(lead({ stage: 'agendado' }), [appt({ status: 'cancelado' })], NOW)
    expect(r).toMatchObject({ stage: 'em_conversa', note: 'A consulta foi cancelada' })
  })
  it('Agendado e faltou → Em conversa, com o motivo certo', () => {
    const r = stageFromAppointments(lead({ stage: 'agendado' }), [appt({ status: 'faltou', scheduled_at: iso(-1) })], NOW)
    expect(r).toMatchObject({ stage: 'em_conversa', note: 'Faltou à consulta' })
  })
  it('cancelou uma e remarcou outra: continua Agendado', () => {
    const r = stageFromAppointments(lead({ stage: 'agendado' }), [appt({ status: 'cancelado', scheduled_at: iso(1) }), appt({ scheduled_at: iso(7) })], NOW)
    expect(r).toBeNull()
  })

  describe('escolha manual da equipe', () => {
    const manual = (over = {}) => lead({ stage_source: 'manual', stage_changed_at: iso(-1), ...over })
    it('consulta criada ANTES da escolha manual não a desfaz', () => {
      expect(stageFromAppointments(manual({ stage: 'perdido' }), [appt({ created_at: iso(-3) })], NOW)).toBeNull()
    })
    it('consulta criada DEPOIS da escolha manual vale', () => {
      expect(stageFromAppointments(manual({ stage: 'perdido' }), [appt({ created_at: iso(0) })], NOW)).toMatchObject({ stage: 'agendado' })
    })
    it('lead posto à mão em Agendado, sem consulta nenhuma, fica como está', () => {
      expect(stageFromAppointments(manual({ stage: 'agendado' }), [], NOW)).toBeNull()
    })
    it('cancelamento antigo não derruba um Agendado manual', () => {
      expect(stageFromAppointments(manual({ stage: 'agendado' }), [appt({ status: 'cancelado', scheduled_at: iso(-10) })], NOW)).toBeNull()
    })
  })
})

describe('hasUpcomingAppointment', () => {
  it('só consulta futura marcada ou confirmada', () => {
    expect(hasUpcomingAppointment([appt()], NOW)).toBe(true)
    expect(hasUpcomingAppointment([appt({ status: 'cancelado' })], NOW)).toBe(false)
    expect(hasUpcomingAppointment([appt({ scheduled_at: iso(-1) })], NOW)).toBe(false)
    expect(hasUpcomingAppointment([], NOW)).toBe(false)
  })
})

describe('idleToLost', () => {
  it('30 dias sem sinal → Perdido, "Sem retorno"', () => {
    const r = idleToLost(lead({ stage: 'em_conversa', stage_changed_at: iso(-31) }), iso(-31), false, NOW)
    expect(r).toMatchObject({ stage: 'perdido', lostReason: 'Sem retorno' })
  })
  it('mensagem recente do contato segura o lead', () => {
    expect(idleToLost(lead({ stage: 'em_conversa', stage_changed_at: iso(-40) }), iso(-2), false, NOW)).toBeNull()
  })
  it('movimento recente no funil segura o lead', () => {
    expect(idleToLost(lead({ stage: 'em_conversa', stage_changed_at: iso(-5) }), iso(-60), false, NOW)).toBeNull()
  })
  it('consulta marcada ou "retomar em" no futuro seguram o lead', () => {
    expect(idleToLost(lead({ stage_changed_at: iso(-60) }), null, true, NOW)).toBeNull()
    expect(idleToLost(lead({ stage_changed_at: iso(-60), next_contact_at: iso(2) }), null, false, NOW)).toBeNull()
  })
  it('"retomar em" já vencido não segura', () => {
    expect(idleToLost(lead({ stage_changed_at: iso(-60), next_contact_at: iso(-3) }), null, false, NOW)).toMatchObject({ stage: 'perdido' })
  })
  it('só Novo e Em conversa; Agendado, Compareceu e Perdido ficam', () => {
    for (const s of ['agendado', 'compareceu', 'perdido'] as Stage[]) {
      expect(idleToLost(lead({ stage: s, stage_changed_at: iso(-90) }), null, false, NOW)).toBeNull()
    }
  })
  it('lead sem conversa (cadastrado à mão) conta pelo último movimento', () => {
    expect(idleToLost(lead({ stage_changed_at: iso(-45) }), null, false, NOW)).toMatchObject({ stage: 'perdido' })
  })
})
