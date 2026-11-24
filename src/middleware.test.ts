// O middleware libera /api/automacao/* (n8n, sem sessão) e não aplica o limite por IP nelas;
// o resto da API continua exigindo sessão e limitada por IP.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}))

import { middleware } from './middleware'

const call = (path: string, init: { method?: string; ip?: string } = {}) =>
  middleware(new NextRequest(`http://localhost${path}`, {
    method: init.method ?? 'GET',
    headers: { 'x-forwarded-for': init.ip ?? '10.0.0.1' },
  }))

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.local'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

describe('middleware e /api/automacao', () => {
  it('sem sessão: passa direto (não redireciona para /login)', async () => {
    for (const path of ['/api/automacao/consultas', '/api/automacao/enviar', '/api/automacao/marcar-confirmada', '/api/automacao/avisar-recepcao', '/api/automacao/aniversariantes']) {
      const res = await call(path, { method: path.endsWith('consultas') || path.endsWith('aniversariantes') ? 'GET' : 'POST' })
      expect(res.status, path).toBe(200)
      expect(res.headers.get('location'), path).toBeNull()
    }
  })

  it('não aplica o limite global por IP (60/min) a estas rotas', async () => {
    const statuses = new Set<number>()
    for (let i = 0; i < 120; i++) statuses.add((await call('/api/automacao/consultas', { ip: '10.9.9.9' })).status)
    expect([...statuses]).toEqual([200])
  })

  it('controle: outra rota de API continua limitada por IP', async () => {
    let last = 0
    for (let i = 0; i < 70; i++) last = (await call('/api/pacientes/x', { ip: '10.8.8.8' })).status
    expect(last).toBe(429)
  })

  it('controle: rota privada sem sessão redireciona para /login', async () => {
    const res = await call('/agenda', { ip: '10.7.7.7' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('só o prefixo exato: /api/automacao-falsa não é liberada', async () => {
    const res = await call('/api/automacao-falsa/x', { ip: '10.6.6.6' })
    expect(res.status).toBe(307)
  })
})
