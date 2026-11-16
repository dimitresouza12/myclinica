// Anti-abuso da rota pública de agendamento: o que gasta cada balde de limite.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const srv = vi.hoisted(() => ({
  createOnlineBooking: vi.fn(),
  loadPublicContext: vi.fn(),
}))
vi.mock('@/lib/agendamentoOnline/server', () => ({
  createOnlineBooking: srv.createOnlineBooking,
  loadPublicContext: srv.loadPublicContext,
  loadFreeSlots: vi.fn(),
  MAX_RANGE_DAYS: 31,
}))
vi.mock('@/lib/portal/token', () => ({
  clientIpFrom: (h: { get(n: string): string | null }) => h.get('x-test-ip') ?? '0.0.0.0',
  hashIp: () => 'a'.repeat(64),
  ipHashSecret: () => 'segredo-de-teste-123456',
}))

import { POST } from './route'

const PROF = '11111111-1111-4111-8111-111111111111'
const DONE = { ok: true as const, done: { status: 'agendado' as const, startsAt: '2026-12-01T12:00:00Z', durationMinutes: 30, clinicName: 'Clínica', professionalName: 'Dra', procedureName: 'Consulta' } }

let n = 0
const fresh = () => { n++; return { slug: `clinica-${n}`, ip: `10.0.${Math.floor(n / 250)}.${n % 250}` } }
const valid = (phone = '(85) 99999-8888', over: Record<string, unknown> = {}) => ({
  professionalId: PROF, procedureId: null, date: '2030-01-07', time: '09:00', name: 'Maria da Silva', phone, email: '', consent: true, website: '', openedAt: Date.now() - 20_000, ...over,
})
const call = (slug: string, ip: string, body: unknown) =>
  POST(new Request(`http://localhost/api/agendar/${slug}/agendar`, { method: 'POST', headers: { 'x-test-ip': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
    { params: Promise.resolve({ slug }) })

beforeEach(() => {
  srv.createOnlineBooking.mockReset()
  srv.loadPublicContext.mockReset()
  srv.loadPublicContext.mockResolvedValue({ ok: true, context: { clinic: { name: 'Clínica' } } })
  srv.createOnlineBooking.mockResolvedValue(DONE)
})

describe('POST /api/agendar/[slug]/agendar: baldes de limite', () => {
  it('corpo inválido não gasta o balde da clínica (120/h) nem o global: o lixo não bloqueia a clínica', async () => {
    const { slug } = fresh()
    // 130 pedidos inválidos de IPs diferentes: mais que a cota da clínica
    for (let i = 0; i < 130; i++) {
      const res = await call(slug, `172.16.${i % 250}.${Math.floor(i / 250) + 1}`, i % 2 ? 'não é json' : valid('123'))
      expect(res.status).toBe(400)
    }
    const ok = await call(slug, fresh().ip, valid())
    expect(ok.status).toBe(200)
    expect(srv.createOnlineBooking).toHaveBeenCalledTimes(1)
  })

  it('o campo isca preenchido responde ok sem gravar e sem gastar o balde da clínica', async () => {
    const { slug } = fresh()
    for (let i = 0; i < 130; i++) {
      const res = await call(slug, `172.17.${i % 250}.${Math.floor(i / 250) + 1}`, valid('(85) 99999-8888', { website: 'http://spam' }))
      expect(res.status).toBe(200)
    }
    expect(srv.createOnlineBooking).not.toHaveBeenCalled()
    expect((await call(slug, fresh().ip, valid())).status).toBe(200)
  })

  it('o IP continua sendo o freio principal: gasta a cada pedido, inclusive o inválido (5 por 10 min)', async () => {
    const { slug, ip } = fresh()
    for (let i = 0; i < 5; i++) expect((await call(slug, ip, 'lixo')).status).toBe(400)
    expect((await call(slug, ip, valid())).status).toBe(429)
  })

  it('pedido válido gasta o balde da clínica (120/h): o 121º é barrado', async () => {
    const { slug } = fresh()
    for (let i = 0; i < 120; i++) {
      const res = await call(slug, `172.18.${i % 250}.${Math.floor(i / 250) + 1}`, valid(`(85) 98${String(1000000 + i).slice(1)}`))
      expect(res.status).toBe(200)
    }
    expect((await call(slug, fresh().ip, valid('(85) 97777-1234'))).status).toBe(429)
  })

  it('o limite do telefone só conta reserva gravada: horário ocupado não queima a cota', async () => {
    const { slug } = fresh()
    srv.createOnlineBooking.mockResolvedValue({ ok: false, code: 'horario_ocupado' })
    for (let i = 0; i < 6; i++) expect((await call(slug, fresh().ip, valid())).status).toBe(409)

    srv.createOnlineBooking.mockResolvedValue(DONE)
    for (let i = 0; i < 3; i++) expect((await call(slug, fresh().ip, valid())).status).toBe(200)
    // 3 reservas gravadas no mesmo celular: a quarta tentativa é barrada antes de chegar ao banco
    const calls = srv.createOnlineBooking.mock.calls.length
    const blocked = await call(slug, fresh().ip, valid())
    expect(blocked.status).toBe(429)
    expect(srv.createOnlineBooking.mock.calls.length).toBe(calls)
  })

  it('outro celular na mesma clínica não é afetado pelo limite do primeiro', async () => {
    const { slug } = fresh()
    for (let i = 0; i < 3; i++) await call(slug, fresh().ip, valid())
    expect((await call(slug, fresh().ip, valid())).status).toBe(429)
    expect((await call(slug, fresh().ip, valid('(85) 98888-1111'))).status).toBe(200)
  })

  it('slug inválido é 404 antes de qualquer outra coisa', async () => {
    const res = await call('Slug Inválido!', fresh().ip, valid())
    expect(res.status).toBe(404)
    expect(srv.createOnlineBooking).not.toHaveBeenCalled()
  })
})
