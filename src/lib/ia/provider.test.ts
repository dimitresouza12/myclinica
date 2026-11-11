import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { type IaConfig } from './config'
import { clearProviderFactories, LlmProviderError, notConfiguredProvider, registerProviderFactory, resolveProvider } from './provider'
import { recordIaUsage, setIaUsageSink, type IaUsageRecord } from './usage'

const cfg: IaConfig = { provider: 'x', model: 'm-1', enabled: true }

const ctx = { clinicId: 'c1' }

describe('resolveProvider', () => {
  beforeEach(() => clearProviderFactories())

  it('sem config, desligada ou sem fábrica = não configurado', async () => {
    expect(resolveProvider(null, ctx)).toBe(notConfiguredProvider)
    expect(resolveProvider({ ...cfg, enabled: false }, ctx)).toBe(notConfiguredProvider)
    expect(resolveProvider(cfg, ctx)).toBe(notConfiguredProvider)
    expect(notConfiguredProvider.configured).toBe(false)
    await expect(notConfiguredProvider.complete({ system: 's', user: 'u', maxTokens: 1 })).rejects.toMatchObject({ name: 'LlmProviderError', kind: 'indisponivel' })
    await expect(notConfiguredProvider.complete({ system: 's', user: 'u', maxTokens: 1 })).rejects.toBeInstanceOf(LlmProviderError)
  })

  it('com fábrica registrada devolve o provedor dela', async () => {
    const complete = vi.fn(async () => ({ text: 'ok', usage: { inputTokens: 1, outputTokens: 2, model: 'm-1' } }))
    registerProviderFactory('x', (_c, got) => { expect(got).toEqual(ctx); return { configured: true, complete } })
    const p = resolveProvider(cfg, ctx)
    expect(p.configured).toBe(true)
    expect((await p.complete({ system: 's', user: 'u', maxTokens: 5 })).text).toBe('ok')
    expect(resolveProvider({ ...cfg, provider: 'outro' }, ctx)).toBe(notConfiguredProvider)
  })
})

describe('recordIaUsage', () => {
  const rec: IaUsageRecord = { clinicId: 'c1', feature: 'escriba_evolucao', model: 'm-1', inputTokens: 10.4, outputTokens: 20 }
  beforeEach(() => setIaUsageSink(null))
  afterEach(() => { setIaUsageSink(null); vi.restoreAllMocks() })

  it('sem destino registrado não grava nada (false)', async () => {
    expect(await recordIaUsage(rec)).toBe(false)
  })

  it('entrega ao destino só os campos tipados, com tokens inteiros', async () => {
    const sink = vi.fn(async () => {})
    setIaUsageSink(sink)
    expect(await recordIaUsage({ ...rec, texto: 'conteudo clinico' } as IaUsageRecord)).toBe(true)
    expect(sink).toHaveBeenCalledWith({ clinicId: 'c1', feature: 'escriba_evolucao', model: 'm-1', inputTokens: 10, outputTokens: 20 })
  })

  it('rejeita registro inválido e não derruba se o destino falhar', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sink = vi.fn(async () => { throw new Error('boom') })
    setIaUsageSink(sink)
    expect(await recordIaUsage({ ...rec, inputTokens: -1 })).toBe(false)
    expect(await recordIaUsage({ ...rec, clinicId: '' })).toBe(false)
    expect(sink).not.toHaveBeenCalled()
    expect(await recordIaUsage(rec)).toBe(false)
    expect(err).toHaveBeenCalled()
  })
})
