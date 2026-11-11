/**
 * Checklist de AVD/independência em formato genérico e editável. Não reproduz nenhuma escala
 * proprietária (MIF, Barthel, Katz): os itens e os níveis abaixo são só um ponto de partida
 * que a clínica ajusta. A pontuação é a média simples dos níveis marcados.
 */

export type NivelAvd = 'independente' | 'supervisao' | 'ajuda_parcial' | 'ajuda_total' | 'nao_realiza'

export interface NivelInfo { key: NivelAvd; label: string; short: string; score: number }

export const NIVEIS_AVD: NivelInfo[] = [
  { key: 'independente', label: 'Independente', short: 'Indep.', score: 100 },
  { key: 'supervisao', label: 'Supervisão ou dica', short: 'Superv.', score: 75 },
  { key: 'ajuda_parcial', label: 'Ajuda parcial', short: 'Parcial', score: 50 },
  { key: 'ajuda_total', label: 'Ajuda total', short: 'Total', score: 25 },
  { key: 'nao_realiza', label: 'Não realiza', short: 'Não faz', score: 0 },
]

export interface ItemAvd {
  id: string
  label: string
  /** undefined = ainda não avaliado (fica fora da média) */
  nivel?: NivelAvd
}

export interface ChecklistAvdData {
  items: ItemAvd[]
  note?: string
}

export const ITENS_AVD_PADRAO: string[] = [
  'Alimentar-se',
  'Higiene pessoal (rosto, dentes, cabelo)',
  'Banho',
  'Vestir parte superior',
  'Vestir parte inferior',
  'Uso do banheiro',
  'Transferências (cama, cadeira)',
  'Locomoção em casa',
  'Preparar um lanche',
  'Organizar os próprios pertences',
]

export function novoChecklistPadrao(makeId: () => string): ChecklistAvdData {
  return { items: ITENS_AVD_PADRAO.map(label => ({ id: makeId(), label })) }
}

const NIVEL_BY_KEY = new Map(NIVEIS_AVD.map(n => [n.key, n]))

export function nivelInfo(k: NivelAvd | undefined): NivelInfo | null {
  return k ? NIVEL_BY_KEY.get(k) ?? null : null
}

export function sanitizeChecklist(raw: unknown): ChecklistAvdData {
  const items: ItemAvd[] = []
  const src = (raw && typeof raw === 'object' ? (raw as { items?: unknown }).items : null)
  if (Array.isArray(src)) {
    for (const it of src) {
      if (!it || typeof it !== 'object') continue
      const { id, label, nivel } = it as Record<string, unknown>
      if (typeof id !== 'string' || typeof label !== 'string' || !label.trim()) continue
      items.push({ id, label: label.trim(), ...(typeof nivel === 'string' && NIVEL_BY_KEY.has(nivel as NivelAvd) ? { nivel: nivel as NivelAvd } : {}) })
    }
  }
  const note = raw && typeof raw === 'object' && typeof (raw as { note?: unknown }).note === 'string' ? (raw as { note: string }).note : undefined
  return { items, ...(note ? { note } : {}) }
}

export interface ResumoAvd {
  avaliados: number
  total: number
  independentes: number
  /** Índice de independência (0 a 100): média dos níveis marcados; null sem nada marcado. */
  indice: number | null
}

export function resumoAvd(data: ChecklistAvdData): ResumoAvd {
  const marcados = data.items.filter(i => i.nivel)
  const independentes = marcados.filter(i => i.nivel === 'independente').length
  if (marcados.length === 0) return { avaliados: 0, total: data.items.length, independentes: 0, indice: null }
  const soma = marcados.reduce((a, i) => a + (nivelInfo(i.nivel)?.score ?? 0), 0)
  return { avaliados: marcados.length, total: data.items.length, independentes, indice: Math.round(soma / marcados.length) }
}
