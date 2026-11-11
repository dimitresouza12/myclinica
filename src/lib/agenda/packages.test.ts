import { describe, it, expect } from 'vitest'
import {
  canConsumeSession, canLinkAppointments, freeSessions, lowBalanceMessage, packageUsage, pricePerSession,
  sessionLabel, sessionNumber, suggestPackage, type LinkedAppt, type PackageLike,
} from './packages'

const pkg = (over: Partial<PackageLike> = {}): PackageLike => ({ id: 'p1', total_sessions: 5, status: 'ativo', procedure_id: 'proc', created_at: '2026-10-01', ...over })
let n = 0
const ap = (status: string, day: number, package_id: string | null = 'p1'): LinkedAppt => ({ id: `a${++n}`, package_id, status, scheduled_at: new Date(2026, 10, day, 9).toISOString() })
const TODAY = '2026-11-10'

describe('packageUsage', () => {
  it('conta só concluídas como usadas; marcadas ficam à parte', () => {
    const linked = [ap('concluido', 2), ap('concluido', 3), ap('agendado', 12), ap('confirmado', 13), ap('cancelado', 14), ap('faltou', 5)]
    const u = packageUsage(pkg(), linked, TODAY)
    expect(u).toMatchObject({ total: 5, used: 2, scheduled: 2, remaining: 3, unscheduled: 1, state: 'ativo', low: false })
  })
  it('ignora consultas de outro pacote', () => {
    expect(packageUsage(pkg(), [ap('concluido', 2, 'outro'), ap('concluido', 3, null)], TODAY).used).toBe(0)
  })
  it('avisa quando restam 1 ou 2', () => {
    const linked = [ap('concluido', 1), ap('concluido', 2), ap('concluido', 3)]
    expect(packageUsage(pkg(), linked, TODAY)).toMatchObject({ remaining: 2, low: true })
    expect(packageUsage(pkg(), [...linked, ap('concluido', 4)], TODAY)).toMatchObject({ remaining: 1, low: true })
  })
  it('esgotado, cancelado e expirado', () => {
    const all5 = [1, 2, 3, 4, 5].map(d => ap('concluido', d))
    expect(packageUsage(pkg(), all5, TODAY)).toMatchObject({ remaining: 0, state: 'esgotado', low: false })
    expect(packageUsage(pkg({ status: 'cancelado' }), [], TODAY).state).toBe('cancelado')
    expect(packageUsage(pkg({ expires_at: '2026-11-09' }), [], TODAY).state).toBe('expirado')
    expect(packageUsage(pkg({ expires_at: '2026-11-10' }), [], TODAY).state).toBe('ativo')
    expect(packageUsage(pkg({ expires_at: '2026-01-01' }), []).state).toBe('ativo') // sem "hoje" não julga validade
  })
  it('desfazer a conclusão devolve a sessão sem nenhum decremento', () => {
    const a = ap('concluido', 2)
    expect(packageUsage(pkg(), [a], TODAY).remaining).toBe(4)
    expect(packageUsage(pkg(), [{ ...a, status: 'agendado' }], TODAY).remaining).toBe(5)
  })
})

describe('sessionNumber', () => {
  it('numera por data entre as que valem, pulando cancelada e falta', () => {
    const a1 = ap('concluido', 2)
    const faltou = ap('faltou', 4)
    const a2 = ap('concluido', 6)
    const cancelada = ap('cancelado', 8)
    const a3 = ap('agendado', 12)
    const linked = [a3, cancelada, a2, faltou, a1] // fora de ordem de propósito
    expect(sessionNumber(a1.id, linked)).toBe(1)
    expect(sessionNumber(a2.id, linked)).toBe(2)
    expect(sessionNumber(a3.id, linked)).toBe(3)
    expect(sessionNumber(faltou.id, linked)).toBeNull()
    expect(sessionNumber(cancelada.id, linked)).toBeNull()
  })
  it('cancelar uma do meio renumera as seguintes', () => {
    const a1 = ap('concluido', 2), a2 = ap('agendado', 9), a3 = ap('agendado', 16)
    expect(sessionNumber(a3.id, [a1, a2, a3])).toBe(3)
    expect(sessionNumber(a3.id, [a1, { ...a2, status: 'cancelado' }, a3])).toBe(2)
  })
  it('consulta fora de pacote ou desconhecida não tem número', () => {
    const solo = ap('agendado', 2, null)
    expect(sessionNumber(solo.id, [solo])).toBeNull()
    expect(sessionNumber('nao-existe', [])).toBeNull()
  })
  it('rótulo', () => { expect(sessionLabel(3, 10)).toBe('Sessão 3/10') })
})

describe('lowBalanceMessage', () => {
  it('só avisa com 1 ou 2', () => {
    expect(lowBalanceMessage(0)).toBeNull()
    expect(lowBalanceMessage(1)).toBe('Resta 1 sessão no pacote')
    expect(lowBalanceMessage(2)).toBe('Restam 2 sessões no pacote')
    expect(lowBalanceMessage(3)).toBeNull()
  })
})

describe('canConsumeSession', () => {
  it('permite enquanto houver sessão', () => {
    const linked = [1, 2, 3, 4].map(d => ap('concluido', d))
    expect(canConsumeSession(pkg(), linked, 'nova')).toEqual({ ok: true })
  })
  it('bloqueia quando as N já foram usadas por outras consultas', () => {
    const linked = [1, 2, 3, 4, 5].map(d => ap('concluido', d))
    expect(canConsumeSession(pkg(), linked, 'nova')).toEqual({ ok: false, reason: 'esgotado' })
  })
  it('a própria consulta não conta contra si (concluir duas vezes é idempotente)', () => {
    const linked = [1, 2, 3, 4, 5].map(d => ap('concluido', d))
    expect(canConsumeSession(pkg(), linked, linked[4].id)).toEqual({ ok: true })
  })
  it('pacote cancelado não consome', () => {
    expect(canConsumeSession(pkg({ status: 'cancelado' }), [], 'x')).toEqual({ ok: false, reason: 'cancelado' })
  })
  it('validade vencida não impede concluir o que já estava marcado', () => {
    expect(canConsumeSession(pkg({ expires_at: '2020-01-01' }), [], 'x')).toEqual({ ok: true })
  })
})

describe('canLinkAppointments / freeSessions', () => {
  it('limita pelas sessões ainda sem horário', () => {
    const linked = [ap('concluido', 1), ap('concluido', 2), ap('agendado', 12), ap('confirmado', 13)] // 5 - 2 usadas - 2 marcadas = 1
    expect(freeSessions(pkg(), linked, TODAY)).toBe(1)
    expect(canLinkAppointments(pkg(), linked, 1, TODAY)).toEqual({ ok: true })
    expect(canLinkAppointments(pkg(), linked, 2, TODAY)).toEqual({ ok: false, reason: 'sem_sessao_livre' })
  })
  it('editar a própria consulta não consome uma sessão a mais', () => {
    const mine = ap('agendado', 12)
    const linked = [1, 2, 3, 4].map(d => ap('concluido', d)).concat(mine) // 4 usadas + esta marcada = lotado
    expect(canLinkAppointments(pkg(), linked, 1, TODAY)).toEqual({ ok: false, reason: 'sem_sessao_livre' })
    expect(canLinkAppointments(pkg(), linked, 1, TODAY, mine.id)).toEqual({ ok: true })
  })
  it('recusa pacote cancelado, esgotado e expirado', () => {
    expect(canLinkAppointments(pkg({ status: 'cancelado' }), [], 1, TODAY)).toEqual({ ok: false, reason: 'cancelado' })
    expect(canLinkAppointments(pkg(), [1, 2, 3, 4, 5].map(d => ap('concluido', d)), 1, TODAY)).toEqual({ ok: false, reason: 'esgotado' })
    expect(canLinkAppointments(pkg({ expires_at: '2026-01-01' }), [], 1, TODAY)).toEqual({ ok: false, reason: 'expirado' })
    expect(freeSessions(pkg({ expires_at: '2026-01-01' }), [], TODAY)).toBe(0)
  })
})

describe('suggestPackage', () => {
  it('prefere o que vence antes e respeita o procedimento', () => {
    const a = pkg({ id: 'a', procedure_id: 'x', expires_at: '2027-03-01' })
    const b = pkg({ id: 'b', procedure_id: 'x', expires_at: '2026-12-01' })
    const c = pkg({ id: 'c', procedure_id: 'y' })
    expect(suggestPackage([a, b, c], [], 'x', TODAY)?.id).toBe('b')
    expect(suggestPackage([a, b, c], [], 'y', TODAY)?.id).toBe('c')
  })
  it('pacote sem procedimento vale para qualquer um; sem procedimento escolhido vale qualquer pacote', () => {
    expect(suggestPackage([pkg({ procedure_id: null })], [], 'z', TODAY)?.id).toBe('p1')
    expect(suggestPackage([pkg()], [], null, TODAY)?.id).toBe('p1')
  })
  it('não sugere esgotado, cancelado ou sem sessão livre', () => {
    const cheio = [1, 2, 3, 4, 5].map(d => ap('concluido', d))
    expect(suggestPackage([pkg()], cheio, 'proc', TODAY)).toBeNull()
    expect(suggestPackage([pkg({ status: 'cancelado' })], [], 'proc', TODAY)).toBeNull()
    expect(suggestPackage([pkg()], [1, 2, 3, 4, 5].map(d => ap('agendado', d + 10)), 'proc', TODAY)).toBeNull()
  })
})

describe('pricePerSession', () => {
  it('divide e arredonda em centavos', () => {
    expect(pricePerSession(1000, 10)).toBe(100)
    expect(pricePerSession(100, 3)).toBe(33.33)
    expect(pricePerSession(100, 0)).toBe(0)
  })
})
