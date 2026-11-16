// Rota pública de horários livres: o que gasta cada balde de limite.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const srv = vi.hoisted(() => ({ loadFreeSlots: vi.fn() }))
vi.mock('@/lib/agendamentoOnline/server', () => ({ loadFreeSlots: srv.loadFreeSlots, MAX_RANGE_DAYS: 31, loadPublicContext: vi.fn(), createOnlineBooking: vi.fn() }))
vi.mock('@/lib/portal/token', () => ({ clientIpFrom: (h: { get(n: string): string | null }) => h.get('x-test-ip') ?? '0.0.0.0' }))

import { GET } from './route'

const PROF = '11111111-1111-4111-8111-111111111111'
let n = 0
const fresh = () => { n++; return { slug: `hor-${n}`, ip: `10.1.${Math.floor(n / 250)}.${n % 250}` } }
const call = (slug: string, ip: string, qs: string) =>
  GET(new Request(`http://localhost/api/agendar/${slug}/horarios?${qs}`, { headers: { 'x-test-ip': ip } }), { params: Promise.resolve({ slug }) })
const good = `profissional=${PROF}&inicio=2030-01-07&dias=7`

beforeEach(() => {
  srv.loadFreeSlots.mockReset()
  srv.loadFreeSlots.mockResolvedValue({ ok: true, days: {}, nextFrom: '2030-01-14', durationMin: 30 })
})

describe('GET /api/agendar/[slug]/horarios: baldes de limite', () => {
  it('pedido inválido não gasta o balde da clínica (240/min): o lixo não bloqueia quem usa de verdade', async () => {
    const { slug } = fresh()
    for (let i = 0; i < 260; i++) {
      const res = await call(slug, `172.20.${i % 250}.${Math.floor(i / 250) + 1}`, 'profissional=x&inicio=ontem')
      expect(res.status).toBe(400)
    }
    expect((await call(slug, fresh().ip, good)).status).toBe(200)
    expect(srv.loadFreeSlots).toHaveBeenCalledTimes(1)
  })

  it('o IP é o freio principal e gasta a cada pedido, válido ou não (40 por minuto)', async () => {
    const { slug, ip } = fresh()
    for (let i = 0; i < 40; i++) expect((await call(slug, ip, 'lixo')).status).toBe(400)
    expect((await call(slug, ip, good)).status).toBe(429)
  })

  it('pedido válido gasta o balde da clínica: o 241º é barrado', async () => {
    const { slug } = fresh()
    for (let i = 0; i < 240; i++) expect((await call(slug, `172.21.${i % 250}.${Math.floor(i / 250) + 1}`, good)).status).toBe(200)
    expect((await call(slug, fresh().ip, good)).status).toBe(429)
  })

  it('slug inválido é 404 sem consultar o banco', async () => {
    expect((await call('Slug Inválido!', fresh().ip, good)).status).toBe(404)
    expect(srv.loadFreeSlots).not.toHaveBeenCalled()
  })
})
