import { describe, it, expect } from 'vitest'
import { fetchAllPages } from './paginate'

const makeSource = (total: number) => {
  const all = Array.from({ length: total }, (_, i) => i)
  const calls: Array<[number, number]> = []
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to])
    return { data: all.slice(from, to + 1), error: null }
  }
  return { fetchPage, calls }
}

describe('fetchAllPages', () => {
  it('junta todas as páginas (2500 linhas em 3 consultas)', async () => {
    const { fetchPage, calls } = makeSource(2500)
    const res = await fetchAllPages(fetchPage)
    expect(res.failed).toBe(false)
    expect(res.rows).toHaveLength(2500)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })
  it('para na primeira página quando vem menos que o tamanho', async () => {
    const { fetchPage, calls } = makeSource(10)
    const res = await fetchAllPages(fetchPage)
    expect(res).toEqual({ rows: Array.from({ length: 10 }, (_, i) => i), failed: false })
    expect(calls).toHaveLength(1)
  })
  it('tabela vazia', async () => {
    const res = await fetchAllPages(async () => ({ data: null, error: null }))
    expect(res).toEqual({ rows: [], failed: false })
  })
  it('página cheia exata exige mais uma consulta', async () => {
    const { fetchPage, calls } = makeSource(2000)
    const res = await fetchAllPages(fetchPage)
    expect(res.rows).toHaveLength(2000)
    expect(res.failed).toBe(false)
    expect(calls).toHaveLength(3)
  })
  it('erro no meio marca falha', async () => {
    let n = 0
    const res = await fetchAllPages<number>(async () => {
      n++
      return n === 1 ? { data: Array(1000).fill(1), error: null } : { data: null, error: new Error('x') }
    })
    expect(res.failed).toBe(true)
  })
  it('exceção de rede marca falha em vez de estourar', async () => {
    const res = await fetchAllPages<number>(async () => { throw new Error('offline') })
    expect(res).toEqual({ rows: [], failed: true })
  })
  it('estouro do limite de páginas marca falha (lista truncada)', async () => {
    const { fetchPage } = makeSource(10_000)
    const res = await fetchAllPages(fetchPage, { maxPages: 3 })
    expect(res.failed).toBe(true)
  })
})
