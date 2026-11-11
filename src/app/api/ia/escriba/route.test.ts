// IA escriba: barreiras da rota (sessão, provedor, plano, consentimento, limites) e o que sai para o provedor.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const state = vi.hoisted(() => ({
  plan: 'completo_plus' as string | null,
  clinicType: 'psico',
  specialties: ['psico'] as string[],
  consent: true,
  consentColumn: true,
  demo: false,
  patient: { name: 'Maria José da Silva', birth_date: '2015-05-03' } as { name: string; birth_date: string } | null,
  entries: [] as { created_at: string; entry_text: string; is_confidential?: boolean }[],
  entriesColumnMissing: false,
  audits: [] as Record<string, unknown>[],
  updates: [] as { patch: Record<string, unknown>; eqs: [string, unknown][] }[],
  entryFilters: [] as [string, unknown][],
  limited: false,
}))

vi.mock('@/lib/whatsapp/auth', () => ({
  requireModulePerm: vi.fn(async (req: Request) =>
    req.headers.get('authorization') ? { clinicId: 'c1', userId: 'u1', userName: 'T' } : NextResponse.json({ error: 'Não autorizado' }, { status: 401 })),
  requireClinicAdmin: vi.fn(async (req: Request) =>
    req.headers.get('authorization') === 'Bearer admin' ? { clinicId: 'c1', userId: 'u-admin' } : NextResponse.json({ error: 'Somente o administrador' }, { status: 403 })),
}))
vi.mock('@/lib/demoGuard', () => ({ isDemoClinic: async () => state.demo }))
vi.mock('@/lib/rateLimit', () => ({
  rateLimit: () => ({ success: !state.limited, remaining: 0, resetAt: 0 }),
}))
vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table !== 'clinics') return { data: null, error: null }
            if (cols.includes('ia_escriba_consent')) {
              return state.consentColumn
                ? { data: { ia_escriba_consent: state.consent }, error: null }
                : { data: null, error: { code: '42703' } }
            }
            return { data: { plan: state.plan, clinic_type: state.clinicType, specialties: state.specialties }, error: null }
          },
        }),
      }),
      insert: async (row: Record<string, unknown>) => { state.audits.push(row); return { error: null } },
      update: (patch: Record<string, unknown>) => {
        const call = { patch, eqs: [] as [string, unknown][] }
        state.updates.push(call)
        return { eq: async (c: string, v: unknown) => { call.eqs.push([c, v]); return { error: state.consentColumn ? null : { code: '42703' } } } }
      },
    }),
  }),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      const filters: [string, unknown][] = []
      const self = {
        select: () => self,
        eq: (c: string, v: unknown) => { filters.push([c, v]); if (table === 'record_entries') state.entryFilters.push([c, v]); return self },
        gte: () => self, lte: () => self, order: () => self, limit: () => self,
        maybeSingle: async () => ({ data: table === 'patients' ? state.patient : null, error: null }),
        then: (res: (x: unknown) => unknown) => {
          const hasConf = filters.some(([c]) => c === 'is_confidential')
          const out = state.entriesColumnMissing && hasConf
            ? { data: null, error: { code: '42703' } }
            : { data: state.entries.filter(e => !(hasConf && e.is_confidential)), error: null }
          return Promise.resolve(out).then(res)
        },
      }
      void chain
      return self
    },
  }),
}))

import { clearProviderFactories, LlmProviderError, registerProviderFactory } from '@/lib/ia/provider'
import { setIaUsageSink } from '@/lib/ia/usage'

const configRef = vi.hoisted(() => ({ value: null as null | { provider: string; model: string; enabled: boolean; budgetRemaining?: number | null } }))
vi.mock('@/lib/ia/config', async (orig) => ({ ...(await orig<typeof import('@/lib/ia/config')>()), getIaConfig: async () => configRef.value }))

import { GET, POST, PUT } from './route'

const PID = '11111111-1111-4111-8111-111111111111'
const complete = vi.fn()
const usageSink = vi.fn(async () => {})

function post(body: unknown, auth = 'Bearer tok') {
  return new Request('http://localhost/api/ia/escriba', {
    method: 'POST', headers: auth ? { authorization: auth, 'user-agent': 'vitest' } : {}, body: JSON.stringify(body),
  })
}
const ev = (texto = 'paciente relatou melhora no sono e menos crises') => ({ modo: 'evolucao', area: 'psico', patient_id: PID, texto })

beforeEach(() => {
  Object.assign(state, {
    plan: 'completo_plus', clinicType: 'psico', specialties: ['psico'], consent: true, consentColumn: true, demo: false,
    patient: { name: 'Maria José da Silva', birth_date: '2015-05-03' }, entries: [], entriesColumnMissing: false, limited: false,
  })
  state.audits.length = 0; state.updates.length = 0; state.entryFilters.length = 0
  clearProviderFactories()
  complete.mockReset()
  complete.mockResolvedValue({ text: 'Evolução redigida.', usage: { inputTokens: 100, outputTokens: 30, model: 'm-1' } })
  registerProviderFactory('x', () => ({ configured: true, complete }))
  configRef.value = { provider: 'x', model: 'm-1', enabled: true }
  usageSink.mockClear()
  setIaUsageSink(usageSink)
})

describe('POST /api/ia/escriba: barreiras', () => {
  it('sem sessão: 401 e nada chega ao provedor', async () => {
    const res = await POST(post(ev(), ''))
    expect(res.status).toBe(401)
    expect(complete).not.toHaveBeenCalled()
  })

  it('sem config remota (padrão): 503 ia_indisponivel', async () => {
    configRef.value = null
    const res = await POST(post(ev()))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('ia_indisponivel')
    expect(complete).not.toHaveBeenCalled()
  })

  it('config desligada ou provedor sem implementação: 503 ia_indisponivel', async () => {
    configRef.value = { provider: 'x', model: 'm-1', enabled: false }
    expect((await POST(post(ev()))).status).toBe(503)
    configRef.value = { provider: 'desconhecido', model: 'm-1', enabled: true }
    const res = await POST(post(ev()))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('ia_indisponivel')
  })

  it('plano sem IA: 403', async () => {
    state.plan = 'completo'
    const res = await POST(post(ev()))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('plano_sem_ia')
    expect(complete).not.toHaveBeenCalled()
  })

  it('sem consentimento: 403 com mensagem clara', async () => {
    state.consent = false
    const res = await POST(post(ev()))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('consentimento_ausente')
    expect(body.message).toMatch(/autorizou o uso de IA/)
    expect(complete).not.toHaveBeenCalled()
  })

  it('coluna de consentimento inexistente: IA desligada (403)', async () => {
    state.consentColumn = false
    const res = await POST(post(ev()))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('consentimento_ausente')
    expect(complete).not.toHaveBeenCalled()
  })

  it('área que a clínica não atende: 403; demonstração libera', async () => {
    const body = { ...ev(), area: 'fono' }
    const res = await POST(post(body))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('area_invalida')
    state.demo = true
    expect((await POST(post(body))).status).toBe(200)
  })

  it('limites: texto curto 400, longo 413, área fora do plano 400, paciente inválido 400', async () => {
    expect((await POST(post(ev('oi')))).status).toBe(400)
    expect((await POST(post(ev('a'.repeat(4001))))).status).toBe(413)
    expect((await POST(post({ ...ev(), area: 'odonto' }))).status).toBe(400)
    expect((await POST(post({ ...ev(), patient_id: 'x' }))).status).toBe(400)
    expect(complete).not.toHaveBeenCalled()
  })

  it('rate limit: 429 sem chamar o provedor', async () => {
    state.limited = true
    const res = await POST(post(ev()))
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('limite_de_uso')
    expect(complete).not.toHaveBeenCalled()
  })

  it('paciente de outra clínica (não visível pela RLS): 404', async () => {
    state.patient = null
    expect((await POST(post(ev()))).status).toBe(404)
    expect(complete).not.toHaveBeenCalled()
  })
})

describe('POST /api/ia/escriba: Gestor (limite, bloqueio, uso próprio)', () => {
  it('budgetRemaining <= 0: 429 limite_mensal sem chamar o provedor; > 0 ou ausente segue', async () => {
    configRef.value = { provider: 'x', model: 'm-1', enabled: true, budgetRemaining: 0 }
    const res = await POST(post(ev()))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('limite_mensal')
    expect(body.message).toMatch(/Limite mensal de IA atingido/)
    expect(complete).not.toHaveBeenCalled()
    configRef.value = { provider: 'x', model: 'm-1', enabled: true, budgetRemaining: -3 }
    expect((await POST(post(ev()))).status).toBe(429)
    configRef.value = { provider: 'x', model: 'm-1', enabled: true, budgetRemaining: 0.5 }
    expect((await POST(post(ev()))).status).toBe(200)
    configRef.value = { provider: 'x', model: 'm-1', enabled: true, budgetRemaining: null }
    expect((await POST(post(ev()))).status).toBe(200)
  })

  it('limite_mensal vindo do Gestor na chamada vira 429; bloqueio e IA desativada viram 403', async () => {
    complete.mockRejectedValueOnce(new LlmProviderError('limite', 429, 'limite_mensal'))
    const lim = await POST(post(ev()))
    expect(lim.status).toBe(429)
    expect((await lim.json()).error).toBe('limite_mensal')
    complete.mockRejectedValueOnce(new LlmProviderError('indisponivel', 403, 'cliente_bloqueado'))
    const blk = await POST(post(ev()))
    expect(blk.status).toBe(403)
    expect((await blk.json()).error).toBe('ia_bloqueada')
    complete.mockRejectedValueOnce(new LlmProviderError('indisponivel', 403, 'ia_desativada'))
    expect((await (await POST(post(ev()))).json()).error).toBe('ia_desativada')
    complete.mockRejectedValueOnce(new LlmProviderError('indisponivel', 503, 'ia_nao_configurada'))
    const off = await POST(post(ev()))
    expect(off.status).toBe(503)
    expect((await off.json()).error).toBe('ia_indisponivel')
  })

  it('envia clinicId da sessão ao provedor e a feature na chamada', async () => {
    const seen = vi.fn()
    registerProviderFactory('x', (_c, ctx) => { seen(ctx); return { configured: true, complete } })
    await POST(post(ev()))
    expect(seen).toHaveBeenCalledWith({ clinicId: 'c1' })
    expect(complete.mock.calls[0][0]).toMatchObject({ feature: 'escriba_evolucao' })
  })

  it('provedor que registra o próprio uso (Gestor): sink não é chamado, auditoria continua', async () => {
    registerProviderFactory('x', () => ({ configured: true, recordsOwnUsage: true, complete }))
    const res = await POST(post(ev()))
    expect(res.status).toBe(200)
    expect(usageSink).not.toHaveBeenCalled()
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0].details).toMatchObject({ tokens_entrada: 100, tokens_saida: 30, modelo: 'm-1' })
  })
})

describe('POST /api/ia/escriba: o que sai para o provedor', () => {
  it('evolução: devolve rascunho, sanitiza identificadores e nunca manda o cadastro', async () => {
    const res = await POST(post(ev('Maria José da Silva, cpf 123.456.789-09, tel (85) 99999-0000, maria@x.com, melhorou bastante hoje')))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rascunho).toBe('Evolução redigida.')
    expect(body.aviso).toMatch(/Rascunho gerado por IA/)
    expect(complete).toHaveBeenCalledTimes(1)
    const sent = complete.mock.calls[0][0] as { system: string; user: string; maxTokens: number }
    const all = `${sent.system}\n${sent.user}`
    for (const leak of ['Maria', 'José', 'Silva', '123.456.789-09', '99999-0000', 'maria@x.com', '03/05/2015']) expect(all).not.toContain(leak)
    expect(sent.user).toContain('o paciente')
    expect(sent.system).toContain('CFP 001/2009')
    expect(sent.maxTokens).toBeGreaterThan(0)
  })

  it('registra uso (tokens, sem texto) no destino de uso e na auditoria', async () => {
    const texto = 'paciente relatou melhora no sono e menos crises'
    await POST(post(ev(texto)))
    expect(usageSink).toHaveBeenCalledWith({ clinicId: 'c1', feature: 'escriba_evolucao', model: 'm-1', inputTokens: 100, outputTokens: 30 })
    expect(state.audits).toHaveLength(1)
    const a = state.audits[0]
    expect(a).toMatchObject({ action: 'ia.escriba', module: 'prontuario', user_id: 'u1', clinic_id: 'c1', resource_id: PID })
    expect(JSON.stringify(a)).not.toContain('melhora no sono')
    expect(JSON.stringify(a)).not.toContain('Evolução redigida')
    expect(a.details).toMatchObject({ modo: 'evolucao', area: 'psico', entrada_chars: texto.length })
  })

  it('relatório: só evoluções do período, sem sigilosas, sanitizadas, com filtro de clínica e sigilo', async () => {
    state.entries = [
      { created_at: '2026-10-20T15:00:00Z', entry_text: 'Maria falou do pai, ligar 85999990000' },
      { created_at: '2026-10-12T15:00:00Z', entry_text: 'NOTA SIGILOSA', is_confidential: true },
      { created_at: '2026-10-10T15:00:00Z', entry_text: 'sessão inicial, vínculo' },
    ]
    const res = await POST(post({ modo: 'relatorio', area: 'psico', patient_id: PID, publico: 'escola', de: '2026-10-01', ate: '2026-10-31' }))
    expect(res.status).toBe(200)
    expect((await res.json()).registros).toBe(2)
    const sent = complete.mock.calls[0][0] as { system: string; user: string }
    expect(sent.user).not.toContain('SIGILOSA')
    expect(sent.user).not.toMatch(/Maria|85999990000/)
    expect(sent.user.indexOf('sessão inicial')).toBeLessThan(sent.user.indexOf('o paciente falou'))
    expect(sent.system).toMatch(/Destinatário: escola/)
    expect(state.entryFilters).toEqual(expect.arrayContaining([['clinic_id', 'c1'], ['patient_id', PID], ['is_confidential', false]]))
    expect(usageSink).toHaveBeenCalledWith(expect.objectContaining({ feature: 'escriba_relatorio' }))
  })

  it('relatório sem a coluna de sigilo no banco: relê sem o filtro', async () => {
    state.entriesColumnMissing = true
    state.entries = [{ created_at: '2026-10-10T15:00:00Z', entry_text: 'sessão inicial' }]
    const res = await POST(post({ modo: 'relatorio', area: 'psico', patient_id: PID, publico: 'convenio', de: '2026-10-01', ate: '2026-10-31' }))
    expect(res.status).toBe(200)
  })

  it('relatório sem evoluções com texto: 422 sem chamar o provedor', async () => {
    state.entries = [{ created_at: '2026-10-12T15:00:00Z', entry_text: '(imagem anexada)' }]
    const res = await POST(post({ modo: 'relatorio', area: 'psico', patient_id: PID, publico: 'medico', de: '2026-10-01', ate: '2026-10-31' }))
    expect(res.status).toBe(422)
    expect(complete).not.toHaveBeenCalled()
  })

  it('erros do provedor viram respostas claras', async () => {
    complete.mockRejectedValueOnce(new LlmProviderError('limite', 429))
    const busy = await POST(post(ev()))
    expect(busy.status).toBe(503)
    expect((await busy.json()).error).toBe('ia_ocupada')
    complete.mockRejectedValueOnce(new LlmProviderError('timeout'))
    expect((await POST(post(ev()))).status).toBe(504)
    complete.mockRejectedValueOnce(new LlmProviderError('autenticacao', 401))
    expect((await (await POST(post(ev()))).json()).error).toBe('ia_indisponivel')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    complete.mockRejectedValueOnce(new Error('boom'))
    expect((await POST(post(ev()))).status).toBe(502)
    complete.mockResolvedValueOnce({ text: '   ', usage: { inputTokens: 1, outputTokens: 0, model: 'm-1' } })
    expect((await POST(post(ev()))).status).toBe(502)
    expect(state.audits).toHaveLength(0)
  })
})

describe('GET e PUT /api/ia/escriba', () => {
  it('GET informa o estado sem chamar o provedor', async () => {
    const res = await GET(new Request('http://localhost/api/ia/escriba', { headers: { authorization: 'Bearer tok' } }))
    expect(await res.json()).toEqual({ configurada: true, plano: true, consentimento: true, consentimento_suportado: true })
    configRef.value = null
    state.consent = false
    const off = await (await GET(new Request('http://localhost/x', { headers: { authorization: 'Bearer tok' } }))).json()
    expect(off).toMatchObject({ configurada: false, consentimento: false })
    expect(complete).not.toHaveBeenCalled()
  })

  const put = (body: unknown, auth = 'Bearer admin') => new Request('http://localhost/api/ia/escriba', { method: 'PUT', headers: { authorization: auth }, body: JSON.stringify(body) })

  it('PUT só para administrador, escopado à clínica da sessão', async () => {
    expect((await PUT(put({ consentimento: true }, 'Bearer tok'))).status).toBe(403)
    const res = await PUT(put({ consentimento: true }))
    expect(res.status).toBe(200)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].patch).toMatchObject({ ia_escriba_consent: true, ia_escriba_consent_by: 'u-admin' })
    expect(state.updates[0].eqs).toEqual([['id', 'c1']])
    expect(state.audits[0]).toMatchObject({ action: 'ia.escriba_consent', user_id: 'u-admin' })
  })

  it('PUT: corpo inválido 400, plano sem IA 403, coluna ausente 503', async () => {
    expect((await PUT(put({ consentimento: 'sim' }))).status).toBe(400)
    state.plan = 'completo'
    expect((await PUT(put({ consentimento: true }))).status).toBe(403)
    state.plan = 'completo_plus'
    state.consentColumn = false
    const res = await PUT(put({ consentimento: true }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('consentimento_indisponivel')
  })
})
