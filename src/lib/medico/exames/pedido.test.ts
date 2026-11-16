import { describe, expect, it } from 'vitest'
import { examePorId } from './catalogo'
import {
  adicionarLivre, agruparPorCategoria, alternarExame, htmlPedidoExames, itemDoCatalogo, MAX_ITENS, normalizarPedido, pedidoTemConteudo, pedidoVazio,
  resumoDoPedido, validarPedido,
} from './pedido'

const cab = {
  clinica: 'Clínica Saúde & Vida', detalhe: 'Rua A, 10', paciente: 'Maria <b>Souza</b>', pacienteDetalhe: 'CPF 111.444.777-35',
  data: '2026-11-15', profissional: { nome: 'Dra. Ana Lima', registro: 'CRM 12345', rqe: 'RQE 678' },
}
const hemo = examePorId('hemograma')!
const glic = examePorId('glicemia-jejum')!
const us = examePorId('us-tireoide')!

describe('pedido de exames', () => {
  it('seleção múltipla: marca, desmarca e respeita o limite', () => {
    let itens = alternarExame([], hemo)
    itens = alternarExame(itens, glic)
    expect(itens.map(i => i.id)).toEqual(['hemograma', 'glicemia-jejum'])
    expect(itens[0].tuss).toBe('40304361')
    expect(alternarExame(itens, hemo).map(i => i.id)).toEqual(['glicemia-jejum'])
    const cheio = Array.from({ length: MAX_ITENS }, (_, i) => ({ id: null, nome: `Exame ${i}`, categoria: 'Outros exames', tuss: null }))
    expect(alternarExame(cheio, hemo)).toHaveLength(MAX_ITENS)
  })

  it('exame livre: limpa espaços, não repete e vai para "Outros exames"', () => {
    let itens = adicionarLivre([], '  Teste   de   alergia ')
    expect(itens).toEqual([{ id: null, nome: 'Teste de alergia', categoria: 'Outros exames', tuss: null }])
    itens = adicionarLivre(itens, 'teste de ALERGIA')
    expect(itens).toHaveLength(1)
    expect(adicionarLivre(itens, '   ')).toHaveLength(1)
  })

  it('valida: exige exame e indicação ou CID', () => {
    const d = pedidoVazio()
    expect(validarPedido(d)).toEqual(['Escolha pelo menos um exame.', expect.stringContaining('indicação clínica ou o CID')])
    expect(validarPedido({ ...d, itens: [itemDoCatalogo(hemo)], cid: 'D64.9' })).toEqual([])
    expect(validarPedido({ ...d, itens: [itemDoCatalogo(hemo)], indicacao: 'Cansaço' })).toEqual([])
    expect(pedidoTemConteudo(d)).toBe(false)
    expect(pedidoTemConteudo({ ...d, observacoes: 'jejum' })).toBe(true)
  })

  it('normaliza JSON salvo: aceita o conhecido, ignora o lixo', () => {
    expect(normalizarPedido(null)).toEqual(pedidoVazio())
    const d = normalizarPedido({
      urgencia: 'urgente', indicacao: ' dor ', cid: 'R10', observacoes: 'x',
      itens: [{ id: 'hemograma', nome: 'Hemograma completo', categoria: 'Hematologia', tuss: '40304361' }, { nome: '' }, 5, { id: 'removido', nome: 'Exame antigo', tuss: 'abc' }],
      profissional: { nome: 'Dr. X', registro: 'CRM 1', rqe: '' },
    })
    expect(d.urgencia).toBe('urgente')
    expect(d.itens.map(i => i.nome)).toEqual(['Hemograma completo', 'Exame antigo'])
    expect(d.itens[1]).toEqual({ id: null, nome: 'Exame antigo', categoria: 'Outros exames', tuss: null })
    expect(d.profissional?.nome).toBe('Dr. X')
    expect(normalizarPedido({ urgencia: 'qualquer' }).urgencia).toBe('rotina')
  })

  it('agrupa por categoria e deixa os livres por último; resumo do histórico', () => {
    const itens = [adicionarLivre([], 'Outro')[0], itemDoCatalogo(hemo), itemDoCatalogo(glic), itemDoCatalogo(examePorId('vhs')!)]
    const g = agruparPorCategoria(itens)
    expect(g.map(x => x.categoria)).toEqual(['Hematologia', 'Glicose e diabetes', 'Outros exames'])
    expect(g[0].itens).toHaveLength(2)
    expect(resumoDoPedido({ ...pedidoVazio(), itens: [itemDoCatalogo(hemo)] })).toBe('Hemograma completo')
    expect(resumoDoPedido({ ...pedidoVazio(), itens })).toBe('Outro, Hemograma completo e mais 2')
    expect(resumoDoPedido(pedidoVazio())).toBe('Sem exames')
  })

  it('impresso: título, urgência, indicação, CID, exames numerados, TUSS e assinatura; texto digitado escapado', () => {
    const html = htmlPedidoExames(cab, {
      ...pedidoVazio(), urgencia: 'urgente', itens: [itemDoCatalogo(hemo), itemDoCatalogo(us), adicionarLivre([], 'Exame <i>livre</i>')[0]],
      indicacao: 'Fadiga & astenia', cid: 'D64.9 - Anemia não especificada', observacoes: 'Jejum de 8 horas',
    })
    expect(html).toContain('SOLICITAÇÃO DE EXAMES')
    expect(html).toContain('URGENTE')
    expect(html).toContain('Clínica Saúde &amp; Vida')
    expect(html).toContain('Maria &lt;b&gt;Souza&lt;/b&gt;')
    expect(html).toContain('15/11/2026')
    expect(html).toContain('Fadiga &amp; astenia')
    expect(html).toContain('D64.9 - Anemia não especificada')
    expect(html).toContain('Hemograma completo')
    expect(html).toContain('40304361')
    expect(html).toContain('Exame &lt;i&gt;livre&lt;/i&gt;')
    expect(html).toContain('Jejum de 8 horas')
    expect(html).toContain('Dra. Ana Lima')
    expect(html).toContain('CRM 12345 | RQE 678')
    expect(html).not.toContain('<b>Souza')
    expect(html.indexOf('1.')).toBeLessThan(html.indexOf('3.'))
  })

  it('impresso sem urgência nem TUSS não traz selo nem coluna de código', () => {
    const html = htmlPedidoExames(cab, { ...pedidoVazio(), itens: [itemDoCatalogo(us)], indicacao: 'Nódulo' })
    expect(html).not.toContain('URGENTE')
    expect(html).not.toContain('código TUSS')
  })
})
