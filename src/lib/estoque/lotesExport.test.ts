import { describe, expect, it } from 'vitest'
import { celulaCsv, linhasDeLotes, lotesParaCsv, lotesParaHtml, recallParaCsv } from './lotesExport'
import type { StockLot } from './lotes'

const lot = (over: Partial<StockLot> = {}): StockLot => ({
  id: 'l1', clinic_id: 'c', stock_item_id: 'i1', lote: 'AB123', validade: '2026-11-20',
  quantidade_inicial: 10, quantidade_atual: 4, custo: null, fornecedor: 'Dist; "Sul"', nota_fiscal: '9981', created_at: '2026-10-01T10:00:00Z', ...over,
})
const itens = { i1: { name: 'Toxina botulínica 100U', unit: 'un' } }

describe('lista de lotes para exportar', () => {
  it('monta as linhas com situação e validade formatada', () => {
    const [l] = linhasDeLotes([lot()], itens, '2026-11-10')
    expect(l).toMatchObject({ produto: 'Toxina botulínica 100U', lote: 'AB123', validade: '20/11/2026', situacao: 'Vence em 10 dias', saldo: 4, unidade: 'un' })
  })
  it('esgotado aparece como esgotado', () => {
    expect(linhasDeLotes([lot({ quantidade_atual: 0 })], itens, '2026-11-10')[0].situacao).toBe('Esgotado')
  })
  it('CSV: BOM, ponto e vírgula, aspas escapadas', () => {
    const csv = lotesParaCsv(linhasDeLotes([lot()], itens, '2026-11-10'))
    expect(csv.startsWith('﻿Produto;Lote;Validade;')).toBe(true)
    expect(csv).toContain('"Dist; ""Sul"""')
    expect(csv.split('\r\n')).toHaveLength(2)
  })
  it('CSV neutraliza fórmula aberta no Excel', () => {
    expect(celulaCsv('=1+1')).toBe("'=1+1")
    expect(celulaCsv(5)).toBe('5')
  })
  it('HTML escapa texto e aceita lista vazia', () => {
    const html = lotesParaHtml(linhasDeLotes([lot({ lote: '<b>x</b>' })], itens, '2026-11-10'), { clinica: 'Clínica A&B', titulo: 'Lotes a vencer', filtro: '30 dias', geradoEm: '10/11/2026' })
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).toContain('Clínica A&amp;B')
    expect(lotesParaHtml([], { clinica: 'X', titulo: 'T', filtro: 'F', geradoEm: 'G' })).toContain('Nenhum lote nesta lista.')
  })
  it('CSV de recall: uma linha por uso', () => {
    const csv = recallParaCsv(lot(), 'Toxina', {
      semPaciente: 0, totalSaidas: 3,
      pacientes: [{ patientId: 'p', nome: 'Ana', telefone: '85999990000', quantidade: 3, usos: [{ data: '2026-10-05T15:00:00Z', quantidade: 1, appointmentId: null }, { data: '2026-10-09T15:00:00Z', quantidade: 2, appointmentId: null }] }],
    })
    expect(csv.split('\r\n')).toHaveLength(3)
    expect(csv).toContain('Ana;85999990000;05/10/2026;1')
  })
})
