// Registro de uso de IA por clínica (base do controle de gasto por cliente no Gestor). Integração ainda em
// desenho: por padrão não grava em lugar nenhum e não faz rede. Só metadados: NUNCA o texto clínico.

export type IaFeature = 'escriba_evolucao' | 'escriba_relatorio' | 'importar_modelo'

export interface IaUsageRecord {
  clinicId: string
  feature: IaFeature
  model: string
  inputTokens: number
  outputTokens: number
}

export type IaUsageSink = (record: IaUsageRecord) => Promise<void>

let sink: IaUsageSink | null = null

/** Ponto de extensão: a integração com o Gestor registra aqui quem recebe o consumo. */
export function setIaUsageSink(next: IaUsageSink | null): void {
  sink = next
}

function validCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
}

/**
 * Registra o consumo de uma chamada. Dado inválido é rejeitado de forma visível (retorna false e loga só
 * o motivo); falha do destino não derruba a requisição do usuário. Sem destino registrado = no-op (false).
 */
export async function recordIaUsage(record: IaUsageRecord): Promise<boolean> {
  if (!record.clinicId || !record.model || !validCount(record.inputTokens) || !validCount(record.outputTokens)) {
    console.error('[ia/usage] registro de uso inválido descartado', record.feature)
    return false
  }
  if (!sink) return false
  try {
    await sink({
      clinicId: record.clinicId,
      feature: record.feature,
      model: record.model,
      inputTokens: Math.round(record.inputTokens),
      outputTokens: Math.round(record.outputTokens),
    })
    return true
  } catch (e) {
    console.error('[ia/usage] destino do registro de uso falhou', e instanceof Error ? e.name : '')
    return false
  }
}
