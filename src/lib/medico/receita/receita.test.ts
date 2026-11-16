import { describe, expect, it } from 'vitest'
import { MEDICAMENTOS_SUGESTAO, pareceControlado, sugerirMedicamentos } from './medicamentos'
import {
  htmlReceita, itemVazio, medicamentosRepetidos, normalizarReceita, receitaTemConteudo, receitaVazia, resumoDaReceita, validarReceita, VIAS, VIA_ROTULO,
  type ItemReceita, type ReceitaDados,
} from './receita'

const item = (over: Partial<ItemReceita> = {}): ItemReceita => ({ ...itemVazio(), medicamento: 'Amoxicilina', dose: '500 mg, 1 cápsula', posologia: 'de 8 em 8 horas', duracao: '7 dias', ...over })
const rec = (itens: ItemReceita[], over: Partial<ReceitaDados> = {}): ReceitaDados => ({ ...receitaVazia(), itens, ...over })
const cab = {
  clinica: 'Clínica & Cia', paciente: 'João "Zé" Silva', data: '2026-11-15',
  profissional: { nome: 'Dr. Paulo Reis', registro: 'CRM 999', rqe: '' },
}

describe('sugestão de nomes', () => {
  it('lista sem repetição e sem nada além do nome', () => {
    const chaves = MEDICAMENTOS_SUGESTAO.map(n => n.toLowerCase())
    expect(new Set(chaves).size).toBe(chaves.length)
    for (const n of MEDICAMENTOS_SUGESTAO) expect(n).not.toMatch(/\d\s*(mg|mcg|g|ml)\b/i) // nenhum dado de dose
  })
  it('nenhum medicamento de controle especial entre as sugestões', () => {
    expect(MEDICAMENTOS_SUGESTAO.filter(pareceControlado)).toEqual([])
  })
  it('começa-com primeiro, sem acento, mínimo de 2 letras', () => {
    expect(sugerirMedicamentos('a')).toEqual([])
    expect(sugerirMedicamentos('amox')[0]).toBe('Amoxicilina')
    expect(sugerirMedicamentos('AMOXI')).toContain('Amoxicilina com clavulanato')
    expect(sugerirMedicamentos('acido')).toContain('Ácido fólico')
    expect(sugerirMedicamentos('clavulanato')).toContain('Amoxicilina com clavulanato')
    expect(sugerirMedicamentos('para', 3).length).toBeLessThanOrEqual(3)
    expect(sugerirMedicamentos('Dipirona')).toEqual([]) // nome exato já digitado
    expect(sugerirMedicamentos('zzzz')).toEqual([])
  })
  it('avisa de controle especial pelo nome', () => {
    expect(pareceControlado('Clonazepam 2 mg')).toBe(true)
    expect(pareceControlado('Tramadol')).toBe(true)
    expect(pareceControlado('Dipirona')).toBe(false)
    expect(pareceControlado('')).toBe(false)
  })
})

describe('receita estruturada', () => {
  it('começa com um item em branco, via oral', () => {
    const r = receitaVazia()
    expect(r.itens).toHaveLength(1)
    expect(r.itens[0].via).toBe('oral')
    expect(receitaTemConteudo(r)).toBe(false)
  })

  it('valida: medicamento, dose e posologia', () => {
    expect(validarReceita(receitaVazia())).toEqual(['Escreva pelo menos um medicamento.'])
    expect(validarReceita(rec([item()]))).toEqual([])
    const erros = validarReceita(rec([item(), item({ medicamento: 'Dipirona', dose: '', posologia: '' })]))
    expect(erros).toEqual(['Item 2 (Dipirona): informe a dose.', 'Item 2 (Dipirona): informe a posologia.'])
    // linha em branco no meio é ignorada
    expect(validarReceita(rec([item(), itemVazio()]))).toEqual([])
  })

  it('duração e observação são opcionais', () => {
    expect(validarReceita(rec([item({ duracao: '', observacao: '' })]))).toEqual([])
  })

  it('normaliza JSON salvo e descarta lixo', () => {
    expect(normalizarReceita(undefined).itens).toHaveLength(1)
    const r = normalizarReceita({
      orientacoes: ' beber água ',
      itens: [{ medicamento: ' Paracetamol ', dose: '500 mg', via: 'oral', posologia: 'a cada 6 horas', duracao: '3 dias', observacao: 'x' }, { medicamento: '' }, null, { medicamento: 'Soro', via: 'invalida' }],
    })
    expect(r.itens.map(i => i.medicamento)).toEqual(['Paracetamol', 'Soro'])
    expect(r.itens[1].via).toBeNull()
    expect(r.orientacoes).toBe('beber água')
  })

  it('resumo e duplicidade', () => {
    expect(resumoDaReceita(rec([item(), item({ medicamento: 'Dipirona' }), item({ medicamento: 'Ibuprofeno' })]))).toBe('Amoxicilina, Dipirona e mais 1')
    expect(resumoDaReceita(receitaVazia())).toBe('Sem medicamentos')
    expect(medicamentosRepetidos(rec([item(), item({ medicamento: 'amoxicilína ' }), item({ medicamento: 'Dipirona' })]))).toEqual(['amoxicilína'])
  })

  it('todas as vias têm rótulo', () => {
    for (const v of VIAS) expect(VIA_ROTULO[v].length).toBeGreaterThan(2)
  })

  it('impresso: título, itens numerados com dose, via, posologia, duração e observação; texto escapado', () => {
    const html = htmlReceita(cab, rec([
      item({ observacao: 'Tomar após as refeições' }),
      item({ medicamento: 'Dipirona <script>', via: 'topica', dose: '10 gotas', posologia: 'se necessário', duracao: '' }),
      itemVazio(),
    ], { orientacoes: 'Retorno em 7 dias & repouso' }))
    expect(html).toContain('RECEITA MÉDICA')
    expect(html).toContain('Clínica &amp; Cia')
    expect(html).toContain('João &quot;Zé&quot; Silva')
    expect(html).toContain('1.')
    expect(html).toContain('2.')
    expect(html).not.toContain('3.')
    expect(html).toContain('500 mg, 1 cápsula')
    expect(html).toContain('Oral')
    expect(html).toContain('de 8 em 8 horas')
    expect(html).toContain('7 dias')
    expect(html).toContain('Tomar após as refeições')
    expect(html).toContain('Dipirona &lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Tópica (na pele)')
    expect(html).toContain('Retorno em 7 dias &amp; repouso')
    expect(html).toContain('Dr. Paulo Reis')
    expect(html).toContain('CRM 999')
    expect(html).not.toContain('Duração:</span> </div>')
  })
})
