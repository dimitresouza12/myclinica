// Trava de envio da conta de demonstração: leitura de clinics.demo_mode no servidor.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Result = { data: unknown; error: { code?: string; message?: string } | null }
let result: Result = { data: null, error: null }
let throwOnRead: Error | null = null
const calls: { table: string; select: string; eq?: [string, unknown]; in?: [string, unknown[]] }[] = []

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      const call: (typeof calls)[number] = { table, select: '' }
      calls.push(call)
      const chain = {
        select: (cols: string) => { call.select = cols; return chain },
        eq: (col: string, v: unknown) => { call.eq = [col, v]; return chain },
        in: (col: string, v: unknown[]) => { call.in = [col, v]; return chain },
        maybeSingle: async () => { if (throwOnRead) throw throwOnRead; return result },
        then: (res: (r: Result) => unknown, rej?: (e: unknown) => unknown) =>
          (throwOnRead ? Promise.reject(throwOnRead) : Promise.resolve(result)).then(res, rej),
      }
      return chain
    },
  }),
}))

import { isDemoClinic, demoClinicIds, rejectIfDemo, DEMO_SEND_BLOCKED_MESSAGE } from './demoGuard'

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  result = { data: null, error: null }
  throwOnRead = null
  calls.length = 0
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

describe('isDemoClinic', () => {
  it('demo_mode true → true, lendo só a coluna demo_mode da clínica pedida', async () => {
    result = { data: { demo_mode: true }, error: null }
    expect(await isDemoClinic('clinic-1')).toBe(true)
    expect(calls[0]).toMatchObject({ table: 'clinics', select: 'demo_mode', eq: ['id', 'clinic-1'] })
    expect(warn).not.toHaveBeenCalled()
  })

  it('demo_mode false → false', async () => {
    result = { data: { demo_mode: false }, error: null }
    expect(await isDemoClinic('clinic-1')).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('clínica não encontrada ou valor nulo → false', async () => {
    result = { data: null, error: null }
    expect(await isDemoClinic('x')).toBe(false)
    result = { data: { demo_mode: null }, error: null }
    expect(await isDemoClinic('x')).toBe(false)
  })

  it('coluna inexistente (42703) → false e aviso no log, sem id nem dado pessoal', async () => {
    result = { data: null, error: { code: '42703', message: 'column clinics.demo_mode does not exist' } }
    expect(await isDemoClinic('clinic-secreta-123')).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    const logged = String(warn.mock.calls[0].join(' '))
    expect(logged).toContain('demo_mode')
    expect(logged).not.toContain('clinic-secreta-123')
  })

  it('coluna inexistente reportada só pela mensagem (PostgREST) → false e aviso', async () => {
    result = { data: null, error: { message: 'column clinics.demo_mode does not exist' } }
    expect(await isDemoClinic('c')).toBe(false)
    expect(String(warn.mock.calls[0].join(' '))).toContain('coluna demo_mode inexistente')
  })

  it('outro erro de leitura → false e aviso', async () => {
    result = { data: null, error: { code: '57014', message: 'timeout' } }
    expect(await isDemoClinic('c')).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('exceção na leitura → false e aviso', async () => {
    throwOnRead = new Error('rede caiu')
    expect(await isDemoClinic('c')).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0].join(' '))).not.toContain('rede caiu')
  })
})

describe('demoClinicIds', () => {
  it('devolve só as clínicas demo, numa consulta só', async () => {
    result = { data: [{ id: 'a', demo_mode: false }, { id: 'b', demo_mode: true }], error: null }
    const ids = await demoClinicIds(['a', 'b'])
    expect([...ids]).toEqual(['b'])
    expect(calls).toHaveLength(1)
    expect(calls[0].in).toEqual(['id', ['a', 'b']])
  })

  it('lista vazia não consulta o banco', async () => {
    expect((await demoClinicIds([])).size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('coluna inexistente ou erro → conjunto vazio e aviso', async () => {
    result = { data: null, error: { code: '42703', message: 'column does not exist' } }
    expect((await demoClinicIds(['a'])).size).toBe(0)
    throwOnRead = new Error('x')
    expect((await demoClinicIds(['a'])).size).toBe(0)
    expect(warn).toHaveBeenCalledTimes(2)
  })
})

describe('rejectIfDemo', () => {
  it('demo → resposta 403 em português', async () => {
    result = { data: { demo_mode: true }, error: null }
    const res = await rejectIfDemo('c')
    expect(res?.status).toBe(403)
    expect(await res?.json()).toEqual({ error: DEMO_SEND_BLOCKED_MESSAGE })
  })

  it('clínica normal → null', async () => {
    result = { data: { demo_mode: false }, error: null }
    expect(await rejectIfDemo('c')).toBeNull()
  })
})
