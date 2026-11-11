import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/print', () => ({ printDocumento: vi.fn() }))

import { diasEntre, isoValido, somarDias } from './datas'
import {
  catalogoDaEspecie, chaveDoProduto, especieDoCatalogo, proximaDose, seloDaCarteira, situacaoDaCarteira, situacaoDoPrazo,
  textoDoPrazo, validarRegistro, vigentes, type RegistroCarteira,
} from './vacinas'
import { htmlCarteira } from './imprimir'

const reg = (o: Partial<RegistroCarteira> & { id: string }): RegistroCarteira => ({
  kind: 'vacina', name: 'V10', batch: null, manufacturer: null, applied_on: '2026-01-10', next_due_on: null,
  professional_id: null, professional_name: null, professional_registration: null, notes: null, created_at: '2026-01-10T10:00:00Z', ...o,
})

describe('datas', () => {
  it('valida datas reais e soma dias atravessando mês e ano', () => {
    expect(isoValido('2026-02-30')).toBe(false)
    expect(isoValido('2028-02-29')).toBe(true)
    expect(somarDias('2026-12-20', 21)).toBe('2027-01-10')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(somarDias('lixo', 3)).toBeNull()
    expect(diasEntre('2026-11-14', '2026-11-20')).toBe(6)
    expect(diasEntre('2026-11-14', '2026-11-10')).toBe(-4)
  })
})

describe('próxima dose', () => {
  it('soma o intervalo à aplicação', () => {
    expect(proximaDose('2026-11-14', 21)).toBe('2026-12-05')
    expect(proximaDose('2026-11-14', 365)).toBe('2027-11-14')
  })
  it('sem intervalo válido não calcula', () => {
    expect(proximaDose('2026-11-14', null)).toBeNull()
    expect(proximaDose('2026-11-14', 0)).toBeNull()
    expect(proximaDose('2026-11-14', -5)).toBeNull()
    expect(proximaDose('2026-11-14', 2.5)).toBeNull()
    expect(proximaDose('', 30)).toBeNull()
  })
})

describe('situação do prazo', () => {
  const hoje = '2026-11-14'
  it('vencida, a vencer (até 30 dias, inclusive hoje) e em dia', () => {
    expect(situacaoDoPrazo('2026-11-13', hoje)).toBe('vencida')
    expect(situacaoDoPrazo('2026-11-14', hoje)).toBe('a_vencer')
    expect(situacaoDoPrazo('2026-12-14', hoje)).toBe('a_vencer')
    expect(situacaoDoPrazo('2026-12-15', hoje)).toBe('em_dia')
    expect(situacaoDoPrazo(null, hoje)).toBe('sem_prazo')
  })
  it('textos curtos', () => {
    expect(textoDoPrazo('2026-11-02', hoje)).toBe('Venceu há 12 dias')
    expect(textoDoPrazo('2026-11-13', hoje)).toBe('Venceu ontem')
    expect(textoDoPrazo('2026-11-14', hoje)).toBe('Vence hoje')
    expect(textoDoPrazo('2026-11-15', hoje)).toBe('Vence amanhã')
    expect(textoDoPrazo('2026-11-19', hoje)).toBe('Vence em 5 dias')
    expect(textoDoPrazo('2027-03-01', hoje)).toBe('Em dia')
    expect(textoDoPrazo(null, hoje)).toBe('Sem próxima dose')
  })
})

describe('carteira do pet', () => {
  const hoje = '2026-11-14'
  it('só a aplicação mais recente de cada produto vale; reforço em dia tira a dose antiga do alerta', () => {
    const antiga = reg({ id: 'a', applied_on: '2025-10-01', next_due_on: '2026-10-01' })
    const nova = reg({ id: 'b', applied_on: '2026-10-05', next_due_on: '2027-10-05', created_at: '2026-10-05T10:00:00Z' })
    expect(vigentes([antiga, nova]).map(r => r.id)).toEqual(['b'])
    const s = situacaoDaCarteira([antiga, nova], hoje)
    expect(s.geral).toBe('em_dia')
    expect(s.vencidas).toHaveLength(0)
  })
  it('produto com o nome escrito diferente conta como o mesmo', () => {
    expect(chaveDoProduto({ kind: 'vacina', name: ' Antirrábica ' })).toBe(chaveDoProduto({ kind: 'vacina', name: 'antirrabica' }))
    expect(chaveDoProduto({ kind: 'vermifugo', name: 'Antirrábica' })).not.toBe(chaveDoProduto({ kind: 'vacina', name: 'Antirrábica' }))
  })
  it('separa vencidas e a vencer e acha a próxima data', () => {
    const lista = [
      reg({ id: '1', name: 'Antirrábica', next_due_on: '2026-11-01' }),
      reg({ id: '2', name: 'Gripe canina', next_due_on: '2026-11-30' }),
      reg({ id: '3', name: 'Giárdia', next_due_on: '2027-06-01' }),
      reg({ id: '4', kind: 'vermifugo', name: 'Vermífugo', next_due_on: null }),
    ]
    const s = situacaoDaCarteira(lista, hoje)
    expect(s.vencidas.map(r => r.id)).toEqual(['1'])
    expect(s.aVencer.map(r => r.id)).toEqual(['2'])
    expect(s.proxima).toEqual({ data: '2026-11-01', nome: 'Antirrábica' })
    expect(s.geral).toBe('vencida')
    expect(seloDaCarteira(s)).toBe('1 vencida')
  })
  it('sem registros e só a vencer', () => {
    expect(situacaoDaCarteira([], hoje).geral).toBe('sem_registro')
    const s = situacaoDaCarteira([reg({ id: '1', next_due_on: '2026-11-20' }), reg({ id: '2', name: 'Outra', next_due_on: '2026-11-21' })], hoje)
    expect(seloDaCarteira(s)).toBe('2 a vencer')
    expect(seloDaCarteira(situacaoDaCarteira([reg({ id: '1', next_due_on: '2027-11-20' })], hoje))).toBe('')
  })
})

describe('catálogo de sugestões', () => {
  it('reconhece cão e gato e não inventa catálogo para outras espécies', () => {
    expect(especieDoCatalogo('Canino')).toBe('canino')
    expect(especieDoCatalogo('Cão')).toBe('canino')
    expect(especieDoCatalogo('felino')).toBe('felino')
    expect(especieDoCatalogo('Ave')).toBeNull()
    expect(catalogoDaEspecie('Ave')).toEqual([])
    expect(catalogoDaEspecie('Canino', 'vacina').every(i => i.tipo === 'vacina')).toBe(true)
    expect(catalogoDaEspecie('Felino', 'vacina').some(i => i.nome.includes('FeLV'))).toBe(true)
  })
})

describe('validação do registro', () => {
  const hoje = '2026-11-14'
  it('aceita um registro correto', () => {
    expect(validarRegistro({ nome: 'V10', aplicadaEm: '2026-11-14', proximaEm: '2027-11-14' }, hoje)).toEqual([])
    expect(validarRegistro({ nome: 'V10', aplicadaEm: '2026-11-14', proximaEm: '' }, hoje)).toEqual([])
  })
  it('recusa nome vazio, data futura e próxima antes da aplicação', () => {
    expect(validarRegistro({ nome: ' ', aplicadaEm: '2026-11-14', proximaEm: '' }, hoje)).toHaveLength(1)
    expect(validarRegistro({ nome: 'V10', aplicadaEm: '2026-11-15', proximaEm: '' }, hoje)[0]).toMatch(/futuro/)
    expect(validarRegistro({ nome: 'V10', aplicadaEm: '2026-11-14', proximaEm: '2026-11-01' }, hoje)[0]).toMatch(/antes/)
    expect(validarRegistro({ nome: 'V10', aplicadaEm: '', proximaEm: '' }, hoje)[0]).toMatch(/aplicação/)
  })
})

describe('impresso da carteira', () => {
  const cab = { clinica: 'Clínica <Pet>', pet: 'Thor', tutor: 'Maria', emitidoEm: '2026-11-14', especie: 'Canino', microchip: null }
  it('escapa texto digitado, mostra CRMV e a data em formato brasileiro', () => {
    const html = htmlCarteira(cab, [reg({ id: '1', name: '<b>V10</b>', applied_on: '2026-03-05', next_due_on: '2027-03-05', batch: 'L123', professional_name: 'Ana', professional_registration: 'CRMV-CE 1234' })], { nome: 'Ana', registro: 'CRMV-CE 1234' })
    expect(html).toContain('Clínica &lt;Pet&gt;')
    expect(html).toContain('&lt;b&gt;V10&lt;/b&gt;')
    expect(html).not.toContain('<b>V10</b>')
    expect(html).toContain('05/03/2026')
    expect(html).toContain('05/03/2027')
    expect(html).toContain('L123')
    expect(html).toContain('CRMV-CE 1234')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('NaN')
  })
  it('carteira vazia avisa e não quebra', () => {
    expect(htmlCarteira(cab, [], null)).toContain('Nenhum registro na carteira')
  })
})
