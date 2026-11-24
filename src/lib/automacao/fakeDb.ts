// Banco falso em memória, SÓ PARA TESTES das rotas e libs da automação (nunca importado pelo app).
// Entende o subconjunto do supabase-js que o código da automação usa: select/insert/upsert/update/delete,
// eq/neq/in/gte/gt/lt/lte/is/not/order/limit, maybeSingle/single, count head e UNIQUE por tabela.
// Relações embutidas (ex.: patients(name, phone)) vêm já dentro da linha de fixture.

type Row = Record<string, unknown>
type Filter = (r: Row) => boolean

export interface FakeDbOptions {
  /** colunas que formam uma UNIQUE por tabela (datas comparadas pelo instante) */
  unique?: Record<string, string[]>
  /** força erro de leitura/gravação em uma tabela: { tabela: { code } } */
  errors?: Record<string, { code: string; message: string }>
}

const canon = (v: unknown) => {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return String(new Date(v).getTime())
  return String(v)
}

let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

export function createFakeDb(seed: Record<string, Row[]> = {}, opts: FakeDbOptions = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map(r => ({ ...r }))
  const log: { op: string; table: string; payload?: unknown; filters: string[] }[] = []

  const conflicts = (table: string, rows: Row[], cand: Row): Row | undefined => {
    const cols = opts.unique?.[table]
    if (!cols) return undefined
    return rows.find(r => cols.every(c => canon(r[c]) === canon(cand[c])))
  }

  function builder(table: string) {
    tables[table] ??= []
    const filters: Filter[] = []
    const filterDesc: string[] = []
    let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select'
    let payload: Row | Row[] | null = null
    let ignoreDup = false
    let returning = false
    let head = false
    let limitN: number | null = null
    let orderBy: { col: string; asc: boolean } | null = null
    let wantsCount = false
    const b: Record<string, unknown> = {}

    const add = (desc: string, f: Filter) => { filters.push(f); filterDesc.push(desc) }
    b.select = (_cols?: string, o?: { count?: string; head?: boolean }) => {
      if (op === 'select') { wantsCount = !!o?.count; head = !!o?.head } else returning = true
      return b
    }
    b.insert = (p: Row | Row[]) => { op = 'insert'; payload = p; return b }
    b.upsert = (p: Row | Row[], o?: { ignoreDuplicates?: boolean }) => { op = 'upsert'; payload = p; ignoreDup = !!o?.ignoreDuplicates; return b }
    b.update = (p: Row) => { op = 'update'; payload = p; return b }
    b.delete = () => { op = 'delete'; return b }
    b.eq = (c: string, v: unknown) => { add(`eq ${c}`, r => canon(r[c]) === canon(v)); return b }
    b.neq = (c: string, v: unknown) => { add(`neq ${c}`, r => canon(r[c]) !== canon(v)); return b }
    b.in = (c: string, v: unknown[]) => { add(`in ${c}`, r => v.map(canon).includes(canon(r[c]))); return b }
    b.gte = (c: string, v: unknown) => { add(`gte ${c}`, r => r[c] != null && new Date(r[c] as string).getTime() >= new Date(v as string).getTime()); return b }
    b.gt = (c: string, v: unknown) => { add(`gt ${c}`, r => r[c] != null && new Date(r[c] as string).getTime() > new Date(v as string).getTime()); return b }
    b.lt = (c: string, v: unknown) => { add(`lt ${c}`, r => r[c] != null && new Date(r[c] as string).getTime() < new Date(v as string).getTime()); return b }
    b.lte = (c: string, v: unknown) => { add(`lte ${c}`, r => r[c] != null && new Date(r[c] as string).getTime() <= new Date(v as string).getTime()); return b }
    b.is = (c: string, v: unknown) => { add(`is ${c}`, r => (r[c] ?? null) === v); return b }
    b.not = (c: string, o: string, v: unknown) => {
      add(`not ${c}`, r => {
        if (o === 'is') return (r[c] ?? null) !== v
        if (o === 'like') { const pre = String(v).replace(/%$/, ''); return !String(r[c] ?? '').startsWith(pre) }
        return true
      })
      return b
    }
    b.order = (c: string, o?: { ascending?: boolean }) => { orderBy = { col: c, asc: o?.ascending !== false }; return b }
    b.limit = (n: number) => { limitN = n; return b }

    const matching = () => tables[table].filter(r => filters.every(f => f(r)))
    const finish = (): { data: Row[] | null; error: { code: string; message: string } | null; count: number | null } => {
      log.push({ op, table, payload: payload ?? undefined, filters: filterDesc })
      const err = opts.errors?.[table]
      if (err) return { data: null, error: err, count: null }
      if (op === 'select') {
        let rows = matching()
        if (orderBy) {
          const { col, asc } = orderBy
          rows = [...rows].sort((a, c) => (String(a[col]) < String(c[col]) ? -1 : 1) * (asc ? 1 : -1))
        }
        const count = rows.length
        if (limitN != null) rows = rows.slice(0, limitN)
        return { data: head ? null : rows.map(r => ({ ...r })), error: null, count: wantsCount ? count : null }
      }
      if (op === 'insert' || op === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload as Row]
        const inserted: Row[] = []
        for (const p of list) {
          // defaults de coluna que o banco real preenche (now())
          const stamp = new Date().toISOString()
          const row: Row = { id: uid(), ...p }
          for (const c of ['criada_em', 'criado_em', 'atualizado_em', 'created_at', 'updated_at']) if (row[c] === undefined) row[c] = stamp
          if (conflicts(table, tables[table], row)) {
            if (op === 'upsert' && ignoreDup) continue
            return { data: null, error: { code: '23505', message: 'duplicate key' }, count: null }
          }
          tables[table].push(row)
          inserted.push(row)
        }
        return { data: returning ? inserted.map(r => ({ ...r })) : null, error: null, count: null }
      }
      if (op === 'update') {
        const rows = matching()
        for (const r of rows) Object.assign(r, payload)
        return { data: returning ? rows.map(r => ({ ...r })) : null, error: null, count: null }
      }
      const rows = matching()
      tables[table] = tables[table].filter(r => !rows.includes(r))
      return { data: returning ? rows : null, error: null, count: null }
    }
    b.maybeSingle = async () => { const r = finish(); return { data: r.data?.[0] ?? null, error: r.error } }
    b.single = async () => {
      const r = finish()
      return r.error ? { data: null, error: r.error } : r.data?.[0] ? { data: r.data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    }
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(finish()).then(res, rej)
    return b
  }

  return { client: { from: (t: string) => builder(t) }, tables, log }
}
