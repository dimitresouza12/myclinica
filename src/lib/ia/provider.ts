// Ponto de extensão do provedor de LLM. Provider-agnóstico: nenhuma chamada de rede, nenhuma chave e
// nenhum nome de modelo mora no código do MyClinica. A configuração (provedor, modelo, limites e controle
// de gasto por cliente) virá do painel do Gestor via getIaConfig() (src/lib/ia/config.ts).
//
// Sem config do Gestor (variáveis ausentes, Gestor fora do ar ou IA desligada para o cliente),
// resolveProvider() devolve o provedor "não configurado" e a rota responde 503 ia_indisponivel.
// O adaptador 'gestor' (src/lib/ia/gestorProvider.ts) se registra com registerProviderFactory().

import type { IaConfig } from './config'
import type { IaFeature } from './usage'

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
  model: string
  /** custo em USD, quando o provedor (Gestor) informar */
  costUsd?: number
}

export interface LlmCompletion {
  text: string
  usage: LlmUsage
}

/** Imagem enviada junto do pedido (modelos com visão). Só em memória: nunca guardada nem logada. */
export interface LlmImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  /** base64 puro, sem o prefixo `data:` */
  dataBase64: string
}

export interface LlmRequest {
  /** funcionalidade que originou a chamada (o Gestor usa para atribuir consumo) */
  feature?: IaFeature
  system: string
  user: string
  maxTokens: number
  /** até 3 imagens (~4 MB cada); o Gestor responde 400 modelo_sem_visao se o modelo não enxerga */
  images?: LlmImage[]
}

export interface LlmProvider {
  /** false = nada configurado; a rota responde 503 sem tentar chamar */
  readonly configured: boolean
  /**
   * true = o próprio provedor (ex.: Gestor) já registra o consumo; a rota NÃO chama recordIaUsage()
   * para não contar em dobro.
   */
  readonly recordsOwnUsage?: boolean
  complete(req: LlmRequest): Promise<LlmCompletion>
}

export type LlmErrorKind = 'indisponivel' | 'autenticacao' | 'limite' | 'sobrecarga' | 'timeout' | 'vazio' | 'erro'

/** Erro tipado de provedor. `message` nunca deve conter texto clínico nem chave. */
export class LlmProviderError extends Error {
  readonly kind: LlmErrorKind
  readonly status?: number
  /** código curto devolvido pelo provedor (ex.: 'limite_mensal', 'cliente_bloqueado'); nunca texto livre */
  readonly code?: string
  constructor(kind: LlmErrorKind, status?: number, code?: string) {
    super(`llm_${kind}`)
    this.name = 'LlmProviderError'
    this.kind = kind
    this.status = status
    this.code = code
  }
}

/** Provedor padrão: ninguém configurou nada. */
export const notConfiguredProvider: LlmProvider = {
  configured: false,
  async complete(): Promise<LlmCompletion> {
    throw new LlmProviderError('indisponivel')
  },
}

/** Contexto da chamada. `clinicId` vem da sessão autenticada, nunca do corpo da requisição. */
export interface LlmProviderContext {
  clinicId: string
}

export type LlmProviderFactory = (config: IaConfig, ctx: LlmProviderContext) => LlmProvider

const factories = new Map<string, LlmProviderFactory>()

/** Registra a implementação de um provedor (chave = IaConfig.provider). Hoje: 'gestor' (gestorProvider.ts). */
export function registerProviderFactory(name: string, factory: LlmProviderFactory): void {
  factories.set(name, factory)
}

/** Só para testes. */
export function clearProviderFactories(): void {
  factories.clear()
}

/** Config ausente, desligada ou sem fábrica registrada = provedor não configurado. */
export function resolveProvider(config: IaConfig | null, ctx: LlmProviderContext): LlmProvider {
  if (!config || !config.enabled) return notConfiguredProvider
  const factory = factories.get(config.provider)
  if (!factory) return notConfiguredProvider
  return factory(config, ctx)
}
