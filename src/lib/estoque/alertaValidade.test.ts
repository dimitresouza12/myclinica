import { describe, expect, it } from 'vitest'
import { withExpiryAlert } from './alertaValidade'
import { buildAlertRows, alertKeyOf, withLowStockAlert } from '@/lib/actionAlerts'

describe('withExpiryAlert', () => {
  it('sem texto não muda a lista', () => {
    expect(withExpiryAlert([], null)).toEqual([])
  })
  it('entra no grupo Estoque com chave própria, sem apagar o aviso de estoque baixo', () => {
    const alerts = withExpiryAlert(withLowStockAlert([], 2), '1 lote vencido')
    const rows = buildAlertRows(alerts, Date.now())
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map(r => r.key)).size).toBe(2)
    expect(rows.every(r => r.reason === 'estoque_baixo')).toBe(true)
    expect(alertKeyOf(alerts[1])).toBe('estoque_baixo-estoque_validade')
    expect(rows.find(r => r.patientId === 'estoque_validade')?.name).toBe('1 lote vencido')
  })
})
