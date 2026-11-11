import { describe, expect, it } from 'vitest'
import { ITENS_AVD_PADRAO, novoChecklistPadrao, resumoAvd, sanitizeChecklist } from './avd'

describe('checklist de AVD', () => {
  it('nasce com os itens padrão, sem nível', () => {
    let n = 0
    const c = novoChecklistPadrao(() => `i${++n}`)
    expect(c.items).toHaveLength(ITENS_AVD_PADRAO.length)
    expect(resumoAvd(c)).toEqual({ avaliados: 0, total: ITENS_AVD_PADRAO.length, independentes: 0, indice: null })
  })
  it('índice é a média dos níveis marcados', () => {
    const r = resumoAvd({ items: [
      { id: '1', label: 'a', nivel: 'independente' },
      { id: '2', label: 'b', nivel: 'ajuda_parcial' },
      { id: '3', label: 'c' },
      { id: '4', label: 'd', nivel: 'nao_realiza' },
    ] })
    expect(r).toEqual({ avaliados: 3, total: 4, independentes: 1, indice: 50 })
  })
  it('sanitiza dado inválido', () => {
    const c = sanitizeChecklist({ items: [{ id: '1', label: ' x ', nivel: 'independente' }, { id: '2', label: 'y', nivel: 'xx' }, { id: 3, label: 'z' }, null, { id: '4', label: '  ' }], note: 'n' })
    expect(c.items).toEqual([{ id: '1', label: 'x', nivel: 'independente' }, { id: '2', label: 'y' }])
    expect(c.note).toBe('n')
    expect(sanitizeChecklist(undefined).items).toEqual([])
  })
})
