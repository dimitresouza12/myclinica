import { describe, expect, it } from 'vitest'
import { describeObject, suggestAmount } from '../contratos/modelo'
import {
  aprovacaoDoItem, aprovarTodos, comAprovacao, itensVigentes, statusOrcamento, temDecisao, totaisOrcamento, type AprovacaoItem,
} from './orcamento'

const it_ = (id: string, value: number | null, approval?: AprovacaoItem) => ({ id, description: id, value, approval })

describe('status de cada item', () => {
  it('item sem status (plano antigo) é pendente', () => {
    expect(aprovacaoDoItem({})).toBe('pendente')
    expect(aprovacaoDoItem({ approval: 'aprovado' })).toBe('aprovado')
    expect(aprovacaoDoItem({ approval: 'qualquer' as AprovacaoItem })).toBe('pendente')
  })
})

describe('totais do orçamento', () => {
  it('separa o valor aprovado, pendente e recusado', () => {
    const t = totaisOrcamento([it_('a', 300, 'aprovado'), it_('b', 150.5, 'recusado'), it_('c', 99.5), it_('d', 200, 'aprovado'), it_('e', null, 'aprovado')])
    expect(t.total).toBe(750)
    expect(t.aprovado).toBe(500)
    expect(t.recusado).toBe(150.5)
    expect(t.pendente).toBe(99.5)
    expect(t.vigente).toBe(599.5)
    expect([t.qtdAprovado, t.qtdRecusado, t.qtdPendente]).toEqual([3, 1, 1])
  })
  it('não acumula erro de centavos', () => {
    expect(totaisOrcamento([it_('a', 0.1, 'aprovado'), it_('b', 0.2, 'aprovado')]).aprovado).toBe(0.3)
  })
  it('valor negativo ou vazio não entra', () => {
    expect(totaisOrcamento([it_('a', -5), it_('b', null)]).total).toBe(0)
  })
})

describe('status do orçamento como um todo', () => {
  it('vazio, pendente, aprovado e recusado', () => {
    expect(statusOrcamento([])).toBe('vazio')
    expect(statusOrcamento([it_('a', 1), it_('b', 1, 'pendente')])).toBe('pendente')
    expect(statusOrcamento([it_('a', 1, 'aprovado'), it_('b', 1, 'aprovado')])).toBe('aprovado')
    expect(statusOrcamento([it_('a', 1, 'recusado'), it_('b', 1, 'recusado')])).toBe('recusado')
  })
  it('parcial: parte aprovada e o resto recusado ou em aberto', () => {
    expect(statusOrcamento([it_('a', 1, 'aprovado'), it_('b', 1, 'recusado')])).toBe('parcial')
    expect(statusOrcamento([it_('a', 1, 'aprovado'), it_('b', 1)])).toBe('parcial')
  })
  it('só recusado e pendente continua pendente', () => {
    expect(statusOrcamento([it_('a', 1, 'recusado'), it_('b', 1)])).toBe('pendente')
  })
})

describe('operações na lista', () => {
  const lista = [it_('a', 10), it_('b', 20)]
  it('muda um item sem mutar a lista', () => {
    const r = comAprovacao(lista, 'b', 'aprovado')
    expect(r[1].approval).toBe('aprovado')
    expect(r[0].approval).toBeUndefined()
    expect(lista[1].approval).toBeUndefined()
  })
  it('define todos', () => {
    expect(aprovarTodos(lista, 'recusado').every(i => i.approval === 'recusado')).toBe(true)
  })
  it('itens vigentes tiram só o recusado', () => {
    const l = [it_('a', 1, 'recusado'), it_('b', 1, 'aprovado'), it_('c', 1)]
    expect(itensVigentes(l).map(i => i.id)).toEqual(['b', 'c'])
  })
  it('sabe se há decisão registrada', () => {
    expect(temDecisao(lista)).toBe(false)
    expect(temDecisao([it_('a', 1, 'pendente')])).toBe(false)
    expect(temDecisao([it_('a', 1, 'recusado')])).toBe(true)
  })
})

describe('contrato com orçamento parcialmente aprovado', () => {
  const plano = [
    { description: 'Coroa no dente 26', value: 1200, approval: 'aprovado' as const },
    { description: 'Implante no dente 36', value: 3000, approval: 'recusado' as const },
    { description: 'Selante no dente 16', value: 150 },
  ]
  it('o valor sugerido ignora o item recusado', () => {
    expect(suggestAmount({ planItems: plano })).toBe(1350)
  })
  it('o serviço do contrato não lista o item recusado', () => {
    const txt = describeObject({ planItems: plano })
    expect(txt).toContain('Coroa no dente 26')
    expect(txt).toContain('Selante no dente 16')
    expect(txt).not.toContain('Implante')
  })
  it('plano antigo, sem status, soma tudo como sempre', () => {
    expect(suggestAmount({ planItems: [{ description: 'a', value: 10 }, { description: 'b', value: 5 }] })).toBe(15)
  })
})
