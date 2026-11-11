import { describe, it, expect } from 'vitest'
import { CID10_COMUNS, searchCid, cidText, buildCidIndex, searchCidIndex, loadCidCompleto } from './cid10'
import completo from './cid10-datasus.json'

describe('CID-10 curta', () => {
  it('não repete código e tem formato válido', () => {
    const codes = CID10_COMUNS.map(e => e[0])
    expect(new Set(codes).size).toBe(codes.length)
    for (const c of codes) expect(c).toMatch(/^[A-Z]\d{2}(\.\d)?$/)
  })
  it('acha por código exato primeiro', () => {
    expect(searchCid('I10')[0][0]).toBe('I10')
    expect(searchCid('e11.9')[0][0]).toBe('E11.9')
  })
  it('acha por prefixo de código', () => {
    const codes = searchCid('E11').map(e => e[0])
    expect(codes).toContain('E11.9')
  })
  it('acha por palavras da descrição, sem acento e sem caixa', () => {
    expect(searchCid('hipertensao').map(e => e[0])).toContain('I10')
    expect(searchCid('diabetes tipo 2').map(e => e[0])).toContain('E11.9')
    expect(searchCid('LOMBAR').map(e => e[0])).toContain('M54.5')
  })
  it('consulta curta ou sem resultado devolve vazio e respeita o limite', () => {
    expect(searchCid('a')).toEqual([])
    expect(searchCid('zzzzz')).toEqual([])
    expect(searchCid('dor', 3).length).toBeLessThanOrEqual(3)
  })
  it('texto para o campo', () => {
    expect(cidText(['I10', 'Hipertensão essencial (primária)'])).toBe('I10 - Hipertensão essencial (primária)')
  })
})

describe('CID-10 completa (DATASUS)', () => {
  const lista = completo as unknown as [string, string][]
  const index = buildCidIndex(lista)

  it('tem a tabela inteira, sem repetição e com formato válido', () => {
    expect(lista.length).toBe(12451)
    expect(new Set(lista.map(e => e[0])).size).toBe(lista.length)
    for (const [c, d] of lista) {
      expect(c).toMatch(/^[A-Z]\d{2}(\.[\dX])?$/)
      expect(d.length).toBeGreaterThan(2)
      expect(d).not.toContain('�')
    }
  })
  it('códigos da lista curta fora da tabela de 2008 são só os de revisões posteriores ou subdivididas lá', () => {
    const oficiais = new Set(lista.map(e => e[0]))
    expect(CID10_COMUNS.map(e => e[0]).filter(c => !oficiais.has(c))).toEqual(['K64.9', 'U07.1', 'Z23'])
  })
  it('índice mantém os 134 sugeridos com a mesma descrição já salva, e acrescenta o resto', () => {
    const porCodigo = new Map(index.map(i => [i.e[0], i.e[1]]))
    for (const [c, d] of CID10_COMUNS) expect(porCodigo.get(c)).toBe(d)
    expect(index.length).toBe(12451 + 3)
  })
  it('acha subcategorias que a lista curta não tem', () => {
    expect(searchCidIndex('A00.1', index)[0][0]).toBe('A00.1')
    expect(searchCidIndex('a001', index)[0][0]).toBe('A00.1')
    expect(searchCidIndex('colera', index, 50).map(e => e[0])).toContain('A00.0')
    expect(searchCidIndex('traqueite', index, 50).length).toBeGreaterThan(0)
  })
  it('acha o diagnóstico comum pela descrição oficial também', () => {
    expect(searchCidIndex('nao-insulino', index, 50).map(e => e[0])).toContain('E11.9')
  })
  it('comuns vêm antes em empate e o limite é respeitado', () => {
    const r = searchCidIndex('dor', index, 50)
    expect(r.length).toBe(50)
    expect(searchCidIndex('E11', index, 50)[0][0]).toBe('E11.9')
    const ordem = searchCidIndex('dor lombar', index, 10).map(e => e[0])
    expect(ordem[0]).toBe('M54.5')
  })
  it('loadCidCompleto carrega o índice completo', async () => {
    const idx = await loadCidCompleto()
    expect(idx.length).toBe(12454)
    expect(searchCidIndex('hipertensao essencial', idx, 5).map(e => e[0])).toContain('I10')
  })
})
