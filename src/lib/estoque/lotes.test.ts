import { describe, expect, it } from 'vitest'
import {
  SEM_LOTE, agruparRecall, chaveLote, diasAteValidade, faixaValidade, filtrarPorValidade, formatarDia, ordenarFefo,
  planejarBaixa, resumoAlertas, resumoItem, textoAlertaValidade, textoValidade, type StockLot,
} from './lotes'
import { hojeBrasil } from '@/lib/brasilDate'

const HOJE = '2026-11-10'
let n = 0
const lot = (over: Partial<StockLot> = {}): StockLot => ({
  id: `l${++n}`, clinic_id: 'c', stock_item_id: 'i1', lote: `L${n}`, validade: '2027-06-30',
  quantidade_inicial: 10, quantidade_atual: 10, custo: null, fornecedor: null, nota_fiscal: null, created_at: '2026-10-01T10:00:00Z', ...over,
})

describe('diasAteValidade e faixas (fuso de Brasília)', () => {
  it('conta dias de calendário; hoje é 0 e ainda vale', () => {
    expect(diasAteValidade('2026-11-10', HOJE)).toBe(0)
    expect(diasAteValidade('2026-11-11', HOJE)).toBe(1)
    expect(diasAteValidade('2026-11-09', HOJE)).toBe(-1)
    expect(diasAteValidade('2027-01-01', HOJE)).toBe(52)
    expect(diasAteValidade(null, HOJE)).toBeNull()
    expect(diasAteValidade('lixo', HOJE)).toBeNull()
  })
  it('vira o ano e o mês certo, inclusive fevereiro de ano bissexto', () => {
    expect(diasAteValidade('2027-01-01', '2026-12-31')).toBe(1)
    expect(diasAteValidade('2028-03-01', '2028-02-28')).toBe(2)
  })
  it('ignora o horário da validade vinda do banco', () => {
    expect(diasAteValidade('2026-11-12T00:00:00+00:00', HOJE)).toBe(2)
  })
  it('faixas: vencido, 30, 60, 90, ok e sem validade', () => {
    expect(faixaValidade('2026-11-09', HOJE)).toBe('vencido')
    expect(faixaValidade('2026-11-10', HOJE)).toBe('ate30')
    expect(faixaValidade('2026-12-10', HOJE)).toBe('ate30') // 30 dias exatos
    expect(faixaValidade('2026-12-11', HOJE)).toBe('ate60')
    expect(faixaValidade('2027-01-09', HOJE)).toBe('ate60') // 60 dias
    expect(faixaValidade('2027-01-10', HOJE)).toBe('ate90')
    expect(faixaValidade('2027-02-08', HOJE)).toBe('ate90') // 90 dias
    expect(faixaValidade('2027-02-09', HOJE)).toBe('ok')
    expect(faixaValidade(null, HOJE)).toBe('sem_validade')
  })
  it('hojeBrasil: às 23h30 de Brasília (02h30 UTC do dia seguinte) o lote de hoje ainda não venceu', () => {
    const noite = new Date('2026-11-11T02:30:00Z') // 10/11 23:30 em Brasília
    expect(hojeBrasil(noite)).toBe('2026-11-10')
    expect(faixaValidade('2026-11-10', hojeBrasil(noite))).toBe('ate30')
    const manha = new Date('2026-11-11T03:00:00Z') // 11/11 00:00 em Brasília
    expect(faixaValidade('2026-11-10', hojeBrasil(manha))).toBe('vencido')
  })
  it('textos', () => {
    expect(textoValidade(-5)).toBe('Vencido há 5 dias')
    expect(textoValidade(-1)).toBe('Vencido ontem')
    expect(textoValidade(0)).toBe('Vence hoje')
    expect(textoValidade(1)).toBe('Vence amanhã')
    expect(textoValidade(12)).toBe('Vence em 12 dias')
    expect(textoValidade(null)).toBe('Sem validade')
    expect(formatarDia('2026-03-05')).toBe('05/03/2026')
    expect(formatarDia(null)).toBe('-')
  })
})

describe('ordenarFefo', () => {
  it('validade crescente, sem validade por último, desempate pela entrada mais antiga', () => {
    const a = lot({ id: 'a', validade: '2027-01-01' })
    const b = lot({ id: 'b', validade: '2026-12-01' })
    const c = lot({ id: 'c', validade: null })
    const d = lot({ id: 'd', validade: '2026-12-01', created_at: '2026-09-01T10:00:00Z' })
    expect(ordenarFefo([a, b, c, d]).map(l => l.id)).toEqual(['d', 'b', 'a', 'c'])
  })
  it('não altera o array original', () => {
    const arr = [lot({ validade: '2027-01-01' }), lot({ validade: '2026-12-01' })]
    const copia = [...arr]
    ordenarFefo(arr)
    expect(arr).toEqual(copia)
  })
})

describe('resumoItem (saldo por lote e saldo sem lote)', () => {
  it('produto sem lote: tudo é saldo sem lote, nada muda', () => {
    expect(resumoItem({ id: 'i1', quantity: 24 }, [], HOJE)).toMatchObject({ comLote: false, saldoLotes: 0, saldoSemLote: 24, inconsistente: false, destaque: null })
  })
  it('lotes + o que sobra sem lote', () => {
    const lots = [lot({ quantidade_atual: 6 }), lot({ quantidade_atual: 4, validade: '2026-12-01' }), lot({ stock_item_id: 'outro', quantidade_atual: 99 })]
    const r = resumoItem({ id: 'i1', quantity: 15 }, lots, HOJE)
    expect(r).toMatchObject({ comLote: true, saldoLotes: 10, saldoSemLote: 5, inconsistente: false })
    expect(r.destaque?.lot.validade).toBe('2026-12-01')
  })
  it('lote esgotado não conta', () => {
    expect(resumoItem({ id: 'i1', quantity: 3 }, [lot({ quantidade_atual: 0 })], HOJE).comLote).toBe(false)
  })
  it('vencido tem prioridade no destaque e soma a quantidade vencida', () => {
    const lots = [lot({ quantidade_atual: 2, validade: '2026-10-01' }), lot({ quantidade_atual: 5, validade: '2026-11-20' })]
    const r = resumoItem({ id: 'i1', quantity: 7 }, lots, HOJE)
    expect(r.destaque?.faixa).toBe('vencido')
    expect(r.vencidoQtd).toBe(2)
  })
  it('detecta soma dos lotes maior que o produto', () => {
    const r = resumoItem({ id: 'i1', quantity: 3 }, [lot({ quantidade_atual: 10 })], HOJE)
    expect(r).toMatchObject({ inconsistente: true, saldoSemLote: 0 })
  })
})

describe('planejarBaixa: FEFO automático', () => {
  const A = lot({ id: 'A', validade: '2026-12-01', quantidade_atual: 5 })
  const B = lot({ id: 'B', validade: '2027-03-01', quantidade_atual: 8 })
  const VENC = lot({ id: 'V', validade: '2026-10-01', quantidade_atual: 4 })

  it('sai primeiro o que vence primeiro e passa para o próximo lote', () => {
    const p = planejarBaixa({ quantidade: 7, lots: [B, A], saldoSemLote: 0, hoje: HOJE })
    expect(p).toEqual({ ok: true, alocacoes: [{ lotId: 'A', quantidade: 5, vencido: false }, { lotId: 'B', quantidade: 2, vencido: false }] })
  })
  it('lote vencido nunca entra sozinho', () => {
    const p = planejarBaixa({ quantidade: 3, lots: [VENC, A], saldoSemLote: 0, hoje: HOJE })
    expect(p).toEqual({ ok: true, alocacoes: [{ lotId: 'A', quantidade: 3, vencido: false }] })
  })
  it('se só o vencido cobriria, recusa e informa quanto está vencido', () => {
    const p = planejarBaixa({ quantidade: 8, lots: [VENC, A], saldoSemLote: 0, hoje: HOJE })
    expect(p).toEqual({ ok: false, erro: 'insuficiente', disponivel: 5, vencidos: 4 })
  })
  it('o saldo sem lote entra por último', () => {
    const p = planejarBaixa({ quantidade: 7, lots: [A], saldoSemLote: 10, hoje: HOJE })
    expect(p).toEqual({ ok: true, alocacoes: [{ lotId: 'A', quantidade: 5, vencido: false }, { lotId: null, quantidade: 2, vencido: false }] })
  })
  it('produto sem lote: comportamento antigo, sai tudo do saldo sem lote', () => {
    expect(planejarBaixa({ quantidade: 3, lots: [], saldoSemLote: 10, hoje: HOJE })).toEqual({ ok: true, alocacoes: [{ lotId: null, quantidade: 3, vencido: false }] })
    expect(planejarBaixa({ quantidade: 11, lots: [], saldoSemLote: 10, hoje: HOJE })).toMatchObject({ ok: false, erro: 'insuficiente', disponivel: 10 })
  })
  it('lote que vence hoje ainda sai; quantidade inválida é recusada', () => {
    const hoje = lot({ id: 'H', validade: HOJE, quantidade_atual: 2 })
    expect(planejarBaixa({ quantidade: 2, lots: [hoje], saldoSemLote: 0, hoje: HOJE })).toMatchObject({ ok: true })
    expect(planejarBaixa({ quantidade: 0, lots: [A], saldoSemLote: 0, hoje: HOJE })).toMatchObject({ ok: false, erro: 'quantidade' })
    expect(planejarBaixa({ quantidade: NaN, lots: [A], saldoSemLote: 0, hoje: HOJE })).toMatchObject({ ok: false, erro: 'quantidade' })
  })
})

describe('planejarBaixa: lote escolhido', () => {
  const A = lot({ id: 'A', validade: '2026-12-01', quantidade_atual: 5 })
  const VENC = lot({ id: 'V', validade: '2026-10-01', quantidade_atual: 4 })

  it('tira só daquele lote, mesmo que outro vença antes', () => {
    const B = lot({ id: 'B', validade: '2027-03-01', quantidade_atual: 8 })
    expect(planejarBaixa({ quantidade: 3, lots: [A, B], saldoSemLote: 0, hoje: HOJE, escolhido: 'B' })).toEqual({ ok: true, alocacoes: [{ lotId: 'B', quantidade: 3, vencido: false }] })
  })
  it('não passa do saldo do lote', () => {
    expect(planejarBaixa({ quantidade: 6, lots: [A], saldoSemLote: 50, hoje: HOJE, escolhido: 'A' })).toMatchObject({ ok: false, erro: 'lote_insuficiente', disponivel: 5 })
  })
  it('lote vencido exige confirmação', () => {
    expect(planejarBaixa({ quantidade: 2, lots: [VENC], saldoSemLote: 0, hoje: HOJE, escolhido: 'V' })).toMatchObject({ ok: false, erro: 'lote_vencido' })
    expect(planejarBaixa({ quantidade: 2, lots: [VENC], saldoSemLote: 0, hoje: HOJE, escolhido: 'V', permitirVencido: true }))
      .toEqual({ ok: true, alocacoes: [{ lotId: 'V', quantidade: 2, vencido: true }] })
  })
  it('lote que não é do produto não existe para a baixa', () => {
    expect(planejarBaixa({ quantidade: 1, lots: [A], saldoSemLote: 0, hoje: HOJE, escolhido: 'zzz' })).toMatchObject({ ok: false, erro: 'lote_inexistente' })
  })
  it('escolher "sem lote" usa só o saldo sem lote', () => {
    expect(planejarBaixa({ quantidade: 4, lots: [A], saldoSemLote: 4, hoje: HOJE, escolhido: SEM_LOTE })).toEqual({ ok: true, alocacoes: [{ lotId: null, quantidade: 4, vencido: false }] })
    expect(planejarBaixa({ quantidade: 5, lots: [A], saldoSemLote: 4, hoje: HOJE, escolhido: SEM_LOTE })).toMatchObject({ ok: false, erro: 'lote_insuficiente', disponivel: 4 })
  })
})

describe('alertas de validade', () => {
  const lots = [
    lot({ validade: '2026-11-01', quantidade_atual: 3 }), // vencido
    lot({ validade: '2026-11-10', quantidade_atual: 1 }), // hoje: 30
    lot({ validade: '2026-12-05', quantidade_atual: 4 }), // 25 dias: 30
    lot({ validade: '2026-12-25', quantidade_atual: 2 }), // 45 dias: 60
    lot({ validade: '2027-01-30', quantidade_atual: 6 }), // 81 dias: 90
    lot({ validade: '2028-01-01', quantidade_atual: 9 }), // longe
    lot({ validade: null, quantidade_atual: 9 }),         // sem validade não alerta
    lot({ validade: '2026-11-15', quantidade_atual: 0 }), // esgotado não alerta
  ]
  it('conta acumulado por horizonte e separa vencidos', () => {
    const r = resumoAlertas(lots, HOJE)
    expect(r.vencidos).toEqual({ lotes: 1, unidades: 3 })
    expect(r.ate30).toEqual({ lotes: 2, unidades: 5 })
    expect(r.ate60).toEqual({ lotes: 3, unidades: 7 })
    expect(r.ate90).toEqual({ lotes: 4, unidades: 13 })
  })
  it('texto do sino', () => {
    expect(textoAlertaValidade(resumoAlertas(lots, HOJE))).toBe('1 lote vencido e 2 lotes vencem em até 30 dias')
    expect(textoAlertaValidade(resumoAlertas([lot({ validade: '2028-01-01' })], HOJE))).toBeNull()
    expect(textoAlertaValidade(resumoAlertas([lot({ validade: '2026-11-12' })], HOJE))).toBe('1 lote vence em até 30 dias')
  })
  it('filtros da lista', () => {
    expect(filtrarPorValidade(lots, 'todos', HOJE)).toHaveLength(lots.length)
    expect(filtrarPorValidade(lots, 'vencidos', HOJE)).toHaveLength(1)
    expect(filtrarPorValidade(lots, '30', HOJE)).toHaveLength(3) // inclui o esgotado de 5 dias; a tela esconde esgotados à parte
    expect(filtrarPorValidade(lots, '60', HOJE)).toHaveLength(4)
    expect(filtrarPorValidade(lots, '90', HOJE)).toHaveLength(5)
  })
})

describe('recall: quais pacientes receberam o lote', () => {
  const movs = [
    { id: '1', type: 'saida', quantity: 2, created_at: '2026-10-01T12:00:00Z', patient_id: 'p1', appointment_id: 'a1' },
    { id: '2', type: 'saida', quantity: 1, created_at: '2026-10-05T12:00:00Z', patient_id: 'p2' },
    { id: '3', type: 'saida', quantity: 3, created_at: '2026-10-09T12:00:00Z', patient_id: 'p1' },
    { id: '4', type: 'saida', quantity: 4, created_at: '2026-10-10T12:00:00Z', patient_id: null },
    { id: '5', type: 'entrada', quantity: 50, created_at: '2026-09-01T12:00:00Z', patient_id: null },
  ]
  it('agrupa por paciente, soma, separa o que saiu sem paciente e ignora entrada', () => {
    const r = agruparRecall(movs, { p1: { name: 'Ana', phone: '85999990000' }, p2: { name: 'Bruno', phone: null } })
    expect(r.totalSaidas).toBe(10)
    expect(r.semPaciente).toBe(4)
    expect(r.pacientes.map(p => [p.nome, p.quantidade])).toEqual([['Ana', 5], ['Bruno', 1]])
    expect(r.pacientes[0].usos.map(u => u.quantidade)).toEqual([3, 2]) // mais recente primeiro
    expect(r.pacientes[0].usos[1].appointmentId).toBe('a1')
    expect(r.pacientes[0].telefone).toBe('85999990000')
  })
  it('paciente que a pessoa não pode ver continua na lista', () => {
    const r = agruparRecall(movs.slice(0, 1), {})
    expect(r.pacientes[0].nome).toBe('Paciente sem acesso ao nome')
  })
})

describe('chaveLote', () => {
  it('ignora caixa e espaços, mas distingue a validade', () => {
    expect(chaveLote(' ab  12 ', '2027-01-01')).toBe(chaveLote('AB 12', '2027-01-01T00:00:00Z'))
    expect(chaveLote('AB12', '2027-01-01')).not.toBe(chaveLote('AB12', '2027-02-01'))
    expect(chaveLote('AB12', null)).not.toBe(chaveLote('AB12', '2027-02-01'))
  })
})
