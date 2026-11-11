// O banco devolve no máximo 1000 linhas por consulta: lê em páginas até acabar.
// Falha (erro, exceção de rede ou limite de páginas estourado) vem sinalizada em `failed`,
// porque uma lista parcial monta um público errado e quem chama precisa bloquear o envio.

export const PAGE_SIZE = 1000

export interface PageResult<T> {
  data: T[] | null
  error: unknown
}

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<{ rows: T[]; failed: boolean }> {
  const pageSize = opts.pageSize ?? PAGE_SIZE
  const maxPages = opts.maxPages ?? 50
  const rows: T[] = []
  try {
    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize
      const { data, error } = await fetchPage(from, from + pageSize - 1)
      if (error) return { rows, failed: true }
      const got = data ?? []
      rows.push(...got)
      if (got.length < pageSize) return { rows, failed: false }
    }
    // todas as páginas vieram cheias e o teto acabou: ainda pode haver mais linhas
    return { rows, failed: true }
  } catch {
    return { rows, failed: true }
  }
}
