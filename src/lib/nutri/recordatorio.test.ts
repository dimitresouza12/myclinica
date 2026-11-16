import { describe, expect, it } from 'vitest'
import { alimentoDaLinha, catalogoCom, type Alimento } from './alimentos'
import { novoId } from './plano'
import {
  REFEICOES_RECORDATORIO, normalizarRecordatorio, percentualDaMeta, recordatorioTemConteudo, recordatorioVazio,
  resumirRecordatorio, totaisDoRecordatorio,
} from './recordatorio'

// catálogo mínimo no formato da TACO: [código, nome, grupo, kcal, proteína, carboidrato, lipídio, fibra] por 100 g
const arroz = alimentoDaLinha([3, 'Arroz, tipo 1, cozido', 'cereais', 128, 2.5, 28.1, 0.2, 1.6])
const feijao = alimentoDaLinha([561, 'Feijão, carioca, cozido', 'leguminosas', 76, 4.8, 13.6, 0.5, 8.5])
const catalogo: Alimento[] = [arroz, feijao]

describe('recordatório 24h', () => {
  it('vazio traz as refeições padrão, sem alimento, com ids únicos', () => {
    const r = recordatorioVazio()
    expect(r.refeicoes.map(x => x.nome)).toEqual(REFEICOES_RECORDATORIO)
    expect(r.refeicoes.every(x => x.itens.length === 0 && x.horario === '')).toBe(true)
    expect(new Set(r.refeicoes.map(x => x.id)).size).toBe(r.refeicoes.length)
    expect(recordatorioTemConteudo(r)).toBe(false)
  })

  it('totais por refeição e do dia usam os valores da TACO por 100 g', () => {
    const r = recordatorioVazio()
    r.refeicoes[2].horario = '12:30'
    r.refeicoes[2].itens = [
      { id: novoId(), alimentoId: arroz.id, gramas: 150, medida: '4 colheres de sopa' },
      { id: novoId(), alimentoId: feijao.id, gramas: 100 },
    ]
    r.refeicoes[4].itens = [{ id: novoId(), alimentoId: arroz.id, gramas: 100 }]
    const t = totaisDoRecordatorio(r, catalogo)
    expect(t.refeicoes[2].total.kcal).toBeCloseTo(128 * 1.5 + 76, 6)
    expect(t.refeicoes[2].total.proteina).toBeCloseTo(2.5 * 1.5 + 4.8, 6)
    expect(t.dia.kcal).toBeCloseTo(128 * 2.5 + 76, 6)
    expect(t.dia.fibra).toBeCloseTo(1.6 * 2.5 + 8.5, 6)
    expect(recordatorioTemConteudo(r)).toBe(true)
  })

  it('resumo conta alimentos e refeições com consumo; alimento fora do catálogo conta zero e é sinalizado', () => {
    const r = recordatorioVazio()
    r.refeicoes[0].itens = [
      { id: 'a', alimentoId: arroz.id, gramas: 100 },
      { id: 'b', alimentoId: 'taco-99999', gramas: 100 },
    ]
    r.refeicoes[1].itens = [{ id: 'c', alimentoId: feijao.id, gramas: 50 }]
    const s = resumirRecordatorio(r, catalogo)
    expect(s.alimentos).toBe(3)
    expect(s.refeicoesComConsumo).toBe(2)
    expect(s.semCalculo).toBe(1)
    expect(s.dia.kcal).toBeCloseTo(128 + 38, 6)
  })

  it('alimento personalizado do próprio recordatório entra no cálculo', () => {
    const r = recordatorioVazio()
    r.personalizados = [{ id: 'pers-1', nome: 'Biscoito', grupo: 'cereais', kcal: 450, proteina: 6, carboidrato: 70, lipidio: 16, fibra: 2 }]
    r.refeicoes[3].itens = [{ id: 'x', alimentoId: 'pers-1', gramas: 30 }]
    const t = totaisDoRecordatorio(r, catalogoCom(r.personalizados, catalogo))
    expect(t.dia.kcal).toBeCloseTo(135, 6)
  })

  it('normalizar aceita dado ausente, antigo ou corrompido sem lançar erro', () => {
    for (const lixo of [null, undefined, 3, 'x', [], {}, { refeicoes: 'nada' }, { refeicoes: [null, 1, { id: 5 }] }]) {
      const r = normalizarRecordatorio(lixo)
      expect(r.v).toBe(1)
      expect(Array.isArray(r.refeicoes)).toBe(true)
      expect(Array.isArray(r.personalizados)).toBe(true)
    }
  })

  it('normalizar preserva refeições, horário, itens e observações e descarta item sem gramas válidas', () => {
    const r = normalizarRecordatorio({
      v: 1, observacoes: 'Dia atípico',
      refeicoes: [{ id: 'r1', nome: 'Almoço', horario: '12:30', itens: [
        { id: 'i1', alimentoId: arroz.id, gramas: 120, medida: '3 colheres' },
        { id: 'i2', alimentoId: feijao.id, gramas: 'cem' },
        { id: 'i3', gramas: 50 },
      ] }],
    })
    expect(r.observacoes).toBe('Dia atípico')
    expect(r.refeicoes).toHaveLength(1)
    expect(r.refeicoes[0].nome).toBe('Almoço')
    expect(r.refeicoes[0].horario).toBe('12:30')
    expect(r.refeicoes[0].itens.map(i => i.id)).toEqual(['i1'])
  })

  it('ida e volta pelo JSON salvo mantém o conteúdo', () => {
    const r = recordatorioVazio()
    r.observacoes = 'Jejum até 10h'
    r.refeicoes[0].itens = [{ id: 'i1', alimentoId: arroz.id, gramas: 80, medida: '2 colheres' }]
    const volta = normalizarRecordatorio(JSON.parse(JSON.stringify(r)))
    expect(volta).toEqual(r)
  })

  it('só observação também conta como conteúdo', () => {
    const r = recordatorioVazio()
    r.observacoes = '  '
    expect(recordatorioTemConteudo(r)).toBe(false)
    r.observacoes = 'Dia de festa'
    expect(recordatorioTemConteudo(r)).toBe(true)
  })

  it('percentual da meta de energia', () => {
    expect(percentualDaMeta(900, 1800)).toBe(50)
    expect(percentualDaMeta(2000, 1800)).toBe(111)
    expect(percentualDaMeta(500, null)).toBeNull()
    expect(percentualDaMeta(500, 0)).toBeNull()
  })
})
