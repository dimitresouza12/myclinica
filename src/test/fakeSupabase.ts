// Supabase em memória para os testes das rotas e bibliotecas do servidor. Cobre só o que o código usa:
// from().select/insert/update/delete + eq/neq/in/gte/is/order/limit + maybeSingle/single, e storage.from().upload/remove/createSignedUrl.
// Imita o gatilho de clinic_agreements (contrato assinado só aceita mudar asaas_ref) e a UNIQUE de asaas_payment_events.
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>
type Err = { code?: string; message: string }
type Op = 'select' | 'insert' | 'update' | 'delete'

export interface FakeOptions {
  /** Falha injetada: devolve o erro para (tabela, operação) ou undefined para seguir normal. */
  failOn?: (table: string, op: Op, payload?: Row) => Err | undefined
  uniques?: Record<string, string[]>
}

const DEFAULTS: Record<string, () => Row> = {
  clinic_agreements: () => ({
    id: randomUUID(), code_attempts: 0, code_sent_count: 0, status: 'pending', installments: 1, card_fee_value: 0,
    created_at: new Date().toISOString(), asaas_ref: null, code_hash: null, code_expires_at: null,
    signed_at: null, signed_hash: null, pdf_path: null, pdf_hash: null,
  }),
  clinic_agreement_code_log: () => ({ id: randomUUID(), sent_at: new Date().toISOString() }),
  asaas_payment_events: () => ({ id: randomUUID(), received_at: new Date().toISOString() }),
}

export function createFakeSupabase(seed: Record<string, Row[]> = {}, opts: FakeOptions = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map(r => ({ ...r }))
  const uniques: Record<string, string[]> = { asaas_payment_events: ['payment_id', 'event'], ...(opts.uniques ?? {}) }
  const objects = new Map<string, Uint8Array>()
  const calls: { table: string; op: Op; payload?: Row }[] = []

  const table = (n: string) => (tables[n] ??= [])

  function builder(name: string) {
    let op: Op = 'select'
    let payload: Row | Row[] | undefined
    const filters: ((r: Row) => boolean)[] = []
    let orderBy: { col: string; asc: boolean } | null = null
    let max: number | null = null
    let wantRows = false

    const run = (): { data: Row[] | null; error: Err | null } => {
      const first = Array.isArray(payload) ? payload[0] : payload
      calls.push({ table: name, op, payload: first })
      const injected = opts.failOn?.(name, op, first)
      if (injected) return { data: null, error: injected }
      const rows = table(name)
      const match = () => rows.filter(r => filters.every(f => f(r)))

      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload!]).map(p => ({ ...(DEFAULTS[name]?.() ?? { id: randomUUID() }), ...p }))
        const keys = uniques[name]
        for (const row of list) {
          if (keys && rows.some(r => keys.every(k => r[k] === row[k]))) {
            return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${name}` } }
          }
        }
        rows.push(...list)
        return { data: list.map(r => ({ ...r })), error: null }
      }
      if (op === 'update') {
        const hit = match()
        for (const r of hit) {
          if (name === 'clinic_agreements' && r.status === 'signed') {
            const changed = Object.keys(payload as Row).filter(k => k !== 'asaas_ref' && (payload as Row)[k] !== r[k])
            if (changed.length) return { data: null, error: { code: 'P0001', message: 'clinic_agreement_signed_immutable' } }
          }
          if (name === 'clinic_agreements' && r.status === 'cancelled') {
            return { data: null, error: { code: 'P0001', message: 'clinic_agreement_cancelled_terminal' } }
          }
        }
        for (const r of hit) Object.assign(r, payload as Row)
        return { data: hit.map(r => ({ ...r })), error: null }
      }
      if (op === 'delete') {
        const hit = match()
        tables[name] = rows.filter(r => !hit.includes(r))
        return { data: hit.map(r => ({ ...r })), error: null }
      }
      let out = match().map(r => ({ ...r }))
      if (orderBy) {
        const { col, asc } = orderBy
        out = out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1))
      }
      if (max !== null) out = out.slice(0, max)
      return { data: out, error: null }
    }

    const finish = (mode: 'many' | 'maybe' | 'single') => {
      const r = run()
      if (r.error) return { data: null, error: r.error }
      const rows = r.data ?? []
      if (mode === 'many') return { data: op === 'select' || wantRows ? rows : null, error: null }
      if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } }
      if (rows.length === 0) return mode === 'single' ? { data: null, error: { code: 'PGRST116', message: 'no rows' } } : { data: null, error: null }
      return { data: rows[0], error: null }
    }

    const api: Record<string, unknown> = {
      select() { if (op !== 'select') wantRows = true; return api },
      insert(p: Row | Row[]) { op = 'insert'; payload = p; return api },
      update(p: Row) { op = 'update'; payload = p; return api },
      delete() { op = 'delete'; return api },
      eq(c: string, v: unknown) { filters.push(r => r[c] === v); return api },
      neq(c: string, v: unknown) { filters.push(r => r[c] !== v); return api },
      in(c: string, v: unknown[]) { filters.push(r => v.includes(r[c])); return api },
      gte(c: string, v: string) { filters.push(r => String(r[c]) >= v); return api },
      is(c: string, v: null) { filters.push(r => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return api },
      order(col: string, o?: { ascending?: boolean }) { orderBy = { col, asc: o?.ascending !== false }; return api },
      limit(n: number) { max = n; return api },
      maybeSingle() { return Promise.resolve(finish('maybe')) },
      single() { return Promise.resolve(finish('single')) },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(finish('many')).then(res, rej) },
    }
    return api
  }

  const storage = {
    from: (bucket: string) => ({
      async upload(path: string, body: Uint8Array | Buffer, o?: { upsert?: boolean }) {
        const key = `${bucket}/${path}`
        if (objects.has(key) && !o?.upsert) return { data: null, error: { message: 'The resource already exists' } }
        objects.set(key, new Uint8Array(body))
        return { data: { path }, error: null }
      },
      async remove(paths: string[]) {
        for (const p of paths) objects.delete(`${bucket}/${p}`)
        return { data: [], error: null }
      },
      async createSignedUrl(path: string, ttl: number) {
        if (!objects.has(`${bucket}/${path}`)) return { data: null, error: { message: 'Object not found' } }
        return { data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t&ttl=${ttl}` }, error: null }
      },
    }),
  }

  const db = { from: (n: string) => builder(n), storage } as unknown as SupabaseClient
  return { db, tables, objects, calls }
}
