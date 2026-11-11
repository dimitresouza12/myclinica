// Adaptador 'gestor': LlmProvider que chama o Gestor (server-to-server). A chave do provedor de LLM, os
// modelos, os preços e os limites por cliente moram no painel do Gestor; o MyClinica só envia o pedido
// com a chave de integração (GESTOR_IA_KEY) e recebe o texto. O Gestor registra o consumo por conta
// própria, por isso `recordsOwnUsage = true` (a rota não chama recordIaUsage e nada conta em dobro).
//
// Só roda no servidor (lê env). NUNCA loga prompt, texto clínico, corpo de resposta nem a chave: os
// erros carregam apenas tipo, status HTTP e um código curto vindo do Gestor.
//
// Contrato (ver docs/ia-gateway-myclinica.md):
//   POST {GESTOR_API_URL}/api/publico/ia/complete   cabeçalho x-sistema-chave
//   corpo   {ref, feature, system, user, maxTokens, images?: [{mediaType, dataBase64}]}  (images só quando houver)
//   200     {text, usage: {inputTokens, outputTokens, model, costUsd}}
//   400 {error: modelo_sem_visao} (images enviadas a um modelo sem visão)
//   401 chave inválida | 403 {error: cliente_bloqueado|ia_desativada} | 429 {error: limite_mensal}
//   503 {error: ia_nao_configurada} | 502/504/rede = indisponibilidade momentânea

import { gestorEnv, GESTOR_PROVIDER, invalidateIaConfig } from './config'
import {
  LlmProviderError, registerProviderFactory,
  type LlmCompletion, type LlmProvider, type LlmRequest,
} from './provider'

export const GESTOR_COMPLETE_TIMEOUT_MS = 45_000

/** Texto padrão quando o limite mensal do cliente acabou (também usado pela rota). */
export const MSG_LIMITE_MENSAL = 'Limite mensal de IA atingido. Fale com o suporte.'

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = await res.json() as { error?: unknown } | null
    const code = body && typeof body === 'object' ? body.error : undefined
    // só um código curto e seguro; qualquer outra coisa é descartada
    return typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? code : undefined
  } catch {
    return undefined
  }
}

function num(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0
}

export function createGestorProvider(clinicId: string): LlmProvider {
  return {
    configured: true,
    recordsOwnUsage: true,
    async complete(req: LlmRequest): Promise<LlmCompletion> {
      const env = gestorEnv()
      if (!env) throw new LlmProviderError('indisponivel', undefined, 'gestor_nao_configurado')

      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), GESTOR_COMPLETE_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetch(`${env.base}/api/publico/ia/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-sistema-chave': env.key },
          body: JSON.stringify({
            ref: clinicId,
            feature: req.feature ?? 'escriba',
            system: req.system,
            user: req.user,
            maxTokens: req.maxTokens,
            // imagens vão só no corpo desta chamada (memória): nada é guardado nem logado aqui
            ...(req.images && req.images.length > 0 ? { images: req.images } : {}),
          }),
          cache: 'no-store',
          signal: ctrl.signal,
        })
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw new LlmProviderError('timeout')
        // rede/DNS/conexão recusada: Gestor inacessível agora, tentar de novo costuma resolver
        throw new LlmProviderError('sobrecarga')
      } finally {
        clearTimeout(timer)
      }

      if (res.ok) {
        let body: { text?: unknown; usage?: { inputTokens?: unknown; outputTokens?: unknown; model?: unknown; costUsd?: unknown } | null } | null
        try { body = await res.json() } catch { throw new LlmProviderError('erro', res.status, 'resposta_invalida') }
        if (!body || typeof body.text !== 'string') throw new LlmProviderError('erro', res.status, 'resposta_invalida')
        const u = body.usage ?? {}
        // o consumo mudou no Gestor: a próxima consulta de status deve reler o saldo
        invalidateIaConfig(clinicId)
        return {
          text: body.text,
          usage: {
            inputTokens: num(u.inputTokens),
            outputTokens: num(u.outputTokens),
            model: typeof u.model === 'string' && u.model ? u.model : GESTOR_PROVIDER,
            ...(typeof u.costUsd === 'number' && Number.isFinite(u.costUsd) ? { costUsd: u.costUsd } : {}),
          },
        }
      }

      const code = await errorCode(res)
      switch (res.status) {
        case 400:
          // modelo sem visão (ou corpo recusado): código curto, nunca o texto do Gestor
          throw new LlmProviderError('erro', 400, code === 'modelo_sem_visao' ? 'modelo_sem_visao' : code)
        case 401:
          // chave do MyClinica inválida no Gestor: problema de configuração, não do usuário
          throw new LlmProviderError('autenticacao', 401)
        case 403:
          throw new LlmProviderError('indisponivel', 403, code === 'cliente_bloqueado' || code === 'ia_desativada' ? code : 'ia_desativada')
        case 429:
          if (code === 'limite_mensal') {
            invalidateIaConfig(clinicId)
            throw new LlmProviderError('limite', 429, 'limite_mensal')
          }
          throw new LlmProviderError('limite', 429, code)
        case 503:
          throw new LlmProviderError('indisponivel', 503, code ?? 'ia_nao_configurada')
        case 408:
        case 504:
          throw new LlmProviderError('timeout', res.status)
        case 502:
          throw new LlmProviderError('sobrecarga', 502)
        default:
          throw new LlmProviderError(res.status >= 500 ? 'sobrecarga' : 'erro', res.status, code)
      }
    },
  }
}

/** Registra a fábrica 'gestor'. Chamado ao importar este módulo e reexportado para os testes. */
export function registerGestorProvider(): void {
  registerProviderFactory(GESTOR_PROVIDER, (_config, ctx) => createGestorProvider(ctx.clinicId))
}

registerGestorProvider()
