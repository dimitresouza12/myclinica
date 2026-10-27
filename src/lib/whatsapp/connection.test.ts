// Testes da máquina de estado pura de conexão WhatsApp.
// Cobre computeHeal (auto-cura getConnection) e computeCloseDecision (carência no webhook).
// Não depende de rede, banco, nem processo — funções puras exportadas de connection.ts.
import { describe, it, expect } from 'vitest'
import {
  computeHeal,
  computeCloseDecision,
  HEAL_COOLDOWN_MS,
} from './connection'

// ── computeHeal: auto-cura para rows com status === 'desconectado' ────────────

describe('computeHeal', () => {
  const now = new Date('2026-10-19T12:00:00.000Z')

  /** status_changed_at dentro do cooldown */
  const recentlyChanged = new Date(now.getTime() - HEAL_COOLDOWN_MS + 1_000).toISOString()
  /** status_changed_at além do cooldown */
  const oldChange = new Date(now.getTime() - HEAL_COOLDOWN_MS - 1_000).toISOString()

  it('dentro do cooldown → skip sem chamar Evolution', () => {
    expect(computeHeal(recentlyChanged, 'open', now).action).toBe('skip')
    expect(computeHeal(recentlyChanged, 'close', now).action).toBe('skip')
    expect(computeHeal(recentlyChanged, null, now).action).toBe('skip')
  })

  it('sem status_changed_at (linha antiga) trata como mínimo possível → não é skip', () => {
    // changedAt = 0 → elapsed é enorme → deve decidir algo
    const d = computeHeal(null, 'open', now)
    expect(d.action).toBe('heal')
  })

  it('após cooldown + Evolution open → heal', () => {
    const d = computeHeal(oldChange, 'open', now)
    expect(d.action).toBe('heal')
    if (d.action === 'heal') {
      expect(d.connectedAt).toBe(now.toISOString())
      expect(d.phone).toBeNull() // caller vai buscar connectedNumber
    }
  })

  it('após cooldown + Evolution close → confirm_disconnect', () => {
    expect(computeHeal(oldChange, 'close', now).action).toBe('confirm_disconnect')
  })

  it('após cooldown + Evolution connecting → confirm_disconnect', () => {
    expect(computeHeal(oldChange, 'connecting', now).action).toBe('confirm_disconnect')
  })

  it('após cooldown + Evolution null (instância sumiu) → confirm_disconnect', () => {
    expect(computeHeal(oldChange, null, now).action).toBe('confirm_disconnect')
  })

  it('exatamente no limite do cooldown → skip', () => {
    const exact = new Date(now.getTime() - HEAL_COOLDOWN_MS).toISOString()
    // elapsed === HEAL_COOLDOWN_MS → < é false → NÃO é skip (usa heal ou confirm)
    expect(computeHeal(exact, 'open', now).action).toBe('heal')
  })
})

// ── computeCloseDecision: tolerância no evento 'close' do webhook ─────────────

describe('computeCloseDecision', () => {
  it('null (instância 404) → disconnect imediato', () => {
    expect(computeCloseDecision(null).action).toBe('disconnect')
  })

  it('open (reconectou durante re-verificação) → reconnect', () => {
    expect(computeCloseDecision('open').action).toBe('reconnect')
  })

  it('close confirmado → wait (janela de carência)', () => {
    expect(computeCloseDecision('close').action).toBe('wait')
  })

  it('connecting confirmado → wait (janela de carência)', () => {
    expect(computeCloseDecision('connecting').action).toBe('wait')
  })
})
