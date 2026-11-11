// Adaptador do Gestor: contrato HTTP, mapeamento de erros, timeout, falha fechada e cache. fetch mockado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clearIaConfigCache, getIaConfig } from './config'
import { clearProviderFactories, LlmProviderError, notConfiguredProvider, resolveProvider } from './provider'
import { createGestorProvider, GESTOR_COMPLETE_TIMEOUT_MS, registerGestorProvider } from './gestorProvider'

const KEY = 'chave-secreta-de-teste'
const REQ = { feature: 'escriba_evolucao' as const, system: 'SISTEMA-CLINICO', user: 'TEXTO-CLINICO-SIGILOSO', maxTokens: 700 }
const fetchMock = vi.fn()

function res(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  vi.stubEnv('GESTOR_API_URL', 'https://gestor.exemplo.test/')
  vi.stubEnv('GESTOR_IA_KEY', KEY)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  clearIaConfigCache()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('gestor complete', () => {
  it('200: envia o contrato certo e devolve texto e uso', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { text: 'Evolução.', usage: { inputTokens: 120, outputTokens: 40, model: 'gpt-x', costUsd: 0.002 } }))
    const out = await createGestorProvider('clinic-1').complete(REQ)
    expect(out).toEqual({ text: 'Evolução.', usage: { inputTokens: 120, outputTokens: 40, model: 'gpt-x', costUsd: 0.002 } })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://gestor.exemplo.test/api/publico/ia/complete')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['x-sistema-chave']).toBe(KEY)
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'clinic-1', feature: 'escriba_evolucao', system: 'SISTEMA-CLINICO', user: 'TEXTO-CLINICO-SIGILOSO', maxTokens: 700 })
  })

  it('images vão no corpo só quando existem; modelo_sem_visao vira erro tipado sem vazar texto', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { text: 'ok' }))
    const img = { mediaType: 'image/png' as const, dataBase64: 'AAAA' }
    await createGestorProvider('c').complete({ ...REQ, feature: 'importar_modelo', images: [img] })
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toMatchObject({ feature: 'importar_modelo', images: [img] })
    fetchMock.mockResolvedValueOnce(res(200, { text: 'ok' }))
    await createGestorProvider('c').complete({ ...REQ, images: [] })
    expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string)).not.toHaveProperty('images')
    fetchMock.mockResolvedValueOnce(res(400, { error: 'modelo_sem_visao', detalhe: 'texto livre' }))
    const err = await createGestorProvider('c').complete({ ...REQ, images: [img] }).catch(e => e)
    expect(err).toBeInstanceOf(LlmProviderError)
    expect(err).toMatchObject({ kind: 'erro', status: 400, code: 'modelo_sem_visao' })
    expect(String(err.message)).not.toContain('AAAA')
  })

  it('provedor declara que o Gestor registra o consumo (sem contar em dobro)', () => {
    const p = createGestorProvider('c')
    expect(p.configured).toBe(true)
    expect(p.recordsOwnUsage).toBe(true)
  })

  it('200 sem usage usa zeros e 200 sem text é erro', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { text: 'ok' }))
    expect((await createGestorProvider('c').complete(REQ)).usage).toEqual({ inputTokens: 0, outputTokens: 0, model: 'gestor' })
    fetchMock.mockResolvedValueOnce(res(200, { nada: 1 }))
    await expect(createGestorProvider('c').complete(REQ)).rejects.toMatchObject({ kind: 'erro' })
    fetchMock.mockResolvedValueOnce(new Response('não é json', { status: 200 }))
    await expect(createGestorProvider('c').complete(REQ)).rejects.toMatchObject({ kind: 'erro' })
  })

  const cases: [string, number, unknown, { kind: string; code?: string }][] = [
    ['401 chave inválida', 401, { error: 'x' }, { kind: 'autenticacao' }],
    ['403 cliente_bloqueado', 403, { error: 'cliente_bloqueado' }, { kind: 'indisponivel', code: 'cliente_bloqueado' }],
    ['403 ia_desativada', 403, { error: 'ia_desativada' }, { kind: 'indisponivel', code: 'ia_desativada' }],
    ['403 sem corpo', 403, undefined, { kind: 'indisponivel', code: 'ia_desativada' }],
    ['429 limite_mensal', 429, { error: 'limite_mensal' }, { kind: 'limite', code: 'limite_mensal' }],
    ['429 outro', 429, { error: 'muitas_requisicoes' }, { kind: 'limite', code: 'muitas_requisicoes' }],
    ['503 ia_nao_configurada', 503, { error: 'ia_nao_configurada' }, { kind: 'indisponivel', code: 'ia_nao_configurada' }],
    ['502', 502, { error: 'provedor' }, { kind: 'sobrecarga' }],
    ['504', 504, undefined, { kind: 'timeout' }],
    ['500', 500, undefined, { kind: 'sobrecarga' }],
    ['400', 400, { error: 'ruim' }, { kind: 'erro' }],
  ]
  it.each(cases)('%s', async (_n, status, body, expected) => {
    fetchMock.mockResolvedValueOnce(res(status, body))
    const err = await createGestorProvider('c').complete(REQ).catch(e => e)
    expect(err).toBeInstanceOf(LlmProviderError)
    expect(err).toMatchObject({ status, ...expected })
  })

  it('código de erro fora do padrão é descartado (nunca texto livre)', async () => {
    fetchMock.mockResolvedValueOnce(res(429, { error: 'Texto clínico: paciente João' }))
    const err = await createGestorProvider('c').complete(REQ).catch(e => e)
    expect(err.code).toBeUndefined()
  })

  it('falha de rede vira sobrecarga', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(createGestorProvider('c').complete(REQ)).rejects.toMatchObject({ kind: 'sobrecarga' })
  })

  it('timeout de 45 s aborta a chamada e vira timeout', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const p = createGestorProvider('c').complete(REQ)
    const assertion = expect(p).rejects.toMatchObject({ kind: 'timeout' })
    await vi.advanceTimersByTimeAsync(GESTOR_COMPLETE_TIMEOUT_MS - 1)
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    await assertion
    expect(GESTOR_COMPLETE_TIMEOUT_MS).toBe(45_000)
  })

  it('sem variáveis de ambiente: indisponível, sem rede', async () => {
    vi.stubEnv('GESTOR_IA_KEY', '')
    await expect(createGestorProvider('c').complete(REQ)).rejects.toMatchObject({ kind: 'indisponivel' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('nunca loga prompt, texto clínico nem chave', async () => {
    const spies = [vi.spyOn(console, 'error'), vi.spyOn(console, 'log'), vi.spyOn(console, 'warn')].map(s => s.mockImplementation(() => {}))
    fetchMock.mockResolvedValueOnce(res(401, { error: 'x' }))
    const err = await createGestorProvider('c').complete(REQ).catch(e => e)
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await createGestorProvider('c').complete(REQ).catch(() => {})
    fetchMock.mockResolvedValueOnce(res(200, { text: 'ok' }))
    await createGestorProvider('c').complete(REQ)
    const logged = JSON.stringify(spies.flatMap(s => s.mock.calls)) + String(err.message)
    for (const secret of [KEY, 'TEXTO-CLINICO-SIGILOSO', 'SISTEMA-CLINICO']) expect(logged).not.toContain(secret)
  })
})

describe('fábrica registrada', () => {
  it('resolveProvider com config do Gestor devolve provedor ligado ao clinicId', async () => {
    clearProviderFactories()
    registerGestorProvider()
    const cfg = { provider: 'gestor', model: 'm', enabled: true }
    fetchMock.mockResolvedValueOnce(res(200, { text: 'ok', usage: { inputTokens: 1, outputTokens: 1, model: 'm' } }))
    const p = resolveProvider(cfg, { clinicId: 'clinic-9' })
    expect(p.configured).toBe(true)
    await p.complete(REQ)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).ref).toBe('clinic-9')
    expect(resolveProvider({ ...cfg, enabled: false }, { clinicId: 'clinic-9' })).toBe(notConfiguredProvider)
    expect(resolveProvider(null, { clinicId: 'clinic-9' })).toBe(notConfiguredProvider)
  })
})

describe('getIaConfig (status do Gestor)', () => {
  const statusOk = { enabled: true, model: 'gpt-x', budgetRemaining: 12.5 }

  it('consulta o status com chave e ref, e devolve a config do Gestor', async () => {
    fetchMock.mockResolvedValueOnce(res(200, statusOk))
    expect(await getIaConfig('clinic 1')).toEqual({ provider: 'gestor', model: 'gpt-x', enabled: true, budgetRemaining: 12.5 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://gestor.exemplo.test/api/publico/ia/status?ref=clinic%201')
    expect((init.headers as Record<string, string>)['x-sistema-chave']).toBe(KEY)
    expect(init.method).toBe('GET')
  })

  it('enabled diferente de true = desligada; budget null e ausente são preservados/omitidos', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { enabled: 'sim', budgetRemaining: null }))
    expect(await getIaConfig('a')).toMatchObject({ enabled: false, budgetRemaining: null, model: 'gestor' })
    fetchMock.mockResolvedValueOnce(res(200, { enabled: true }))
    const c = await getIaConfig('b')
    expect(c).toMatchObject({ enabled: true })
    expect(c).not.toHaveProperty('budgetRemaining')
  })

  it('falha fechada: sem variáveis, não faz rede e devolve null', async () => {
    vi.stubEnv('GESTOR_API_URL', '')
    expect(await getIaConfig('c')).toBeNull()
    vi.stubEnv('GESTOR_API_URL', 'ftp://x')
    expect(await getIaConfig('c')).toBeNull()
    vi.stubEnv('GESTOR_API_URL', 'https://gestor.exemplo.test')
    vi.stubEnv('GESTOR_IA_KEY', '')
    expect(await getIaConfig('c')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falha fechada: status não-2xx, rede, JSON inválido e timeout devolvem null', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const [i, outcome] of ([
      res(401, { error: 'x' }), res(403, { error: 'cliente_bloqueado' }), res(500), new Response('lixo', { status: 200 }), new TypeError('fetch failed'),
    ] as const).entries()) {
      if (outcome instanceof Error) fetchMock.mockRejectedValueOnce(outcome); else fetchMock.mockResolvedValueOnce(outcome)
      expect(await getIaConfig(`falha-${i}`)).toBeNull()
    }
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    const p = getIaConfig('lento')
    await vi.advanceTimersByTimeAsync(5_001)
    expect(await p).toBeNull()
  })

  it('cache de 60 s por clínica: não repete a consulta e expira', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(res(200, statusOk))
    await getIaConfig('c1'); await getIaConfig('c1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await getIaConfig('c2')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(59_000)
    await getIaConfig('c1')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(2_000)
    fetchMock.mockResolvedValue(res(200, { ...statusOk, budgetRemaining: 1 }))
    expect((await getIaConfig('c1'))?.budgetRemaining).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('chamadas simultâneas da mesma clínica dividem uma consulta', async () => {
    fetchMock.mockResolvedValue(res(200, statusOk))
    await Promise.all([getIaConfig('c1'), getIaConfig('c1'), getIaConfig('c1')])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falha também é guardada (10 s) para o Gestor fora do ar não travar a rota', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockResolvedValueOnce(res(500))
    expect(await getIaConfig('c1')).toBeNull()
    expect(await getIaConfig('c1')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_001)
    fetchMock.mockResolvedValueOnce(res(200, statusOk))
    expect((await getIaConfig('c1'))?.enabled).toBe(true)
  })

  it('consumo bem-sucedido invalida o cache da clínica (saldo é relido)', async () => {
    fetchMock.mockResolvedValueOnce(res(200, statusOk))
    await getIaConfig('c1')
    fetchMock.mockResolvedValueOnce(res(200, { text: 'ok' }))
    await createGestorProvider('c1').complete(REQ)
    fetchMock.mockResolvedValueOnce(res(200, { ...statusOk, budgetRemaining: 0 }))
    expect((await getIaConfig('c1'))?.budgetRemaining).toBe(0)
  })
})
