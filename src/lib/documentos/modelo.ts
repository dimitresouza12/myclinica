// Preenchimento de modelos de texto com campos {{nome}}. Lógica pura (testada em documentos.test.ts), usada pelo
// atestado estruturado e pelos contratos. Campo sem valor NÃO some em silêncio: vira "[nome]" no texto e entra em
// `missing`, para a tela pedir o dado antes de imprimir ou enviar para assinatura (a assinatura recusa texto com
// colchetes, ver validateDocDraft em lib/assinatura/texto.ts).

const TOKEN = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi

/** Campos {{...}} que aparecem no modelo, sem repetição e na ordem em que surgem. */
export function listTokens(template: string): string[] {
  const seen = new Set<string>()
  for (const m of template.matchAll(TOKEN)) seen.add(m[1].toLowerCase())
  return Array.from(seen)
}

export interface FillResult {
  text: string
  /** Rótulos dos campos sem valor (já aparecem como [rótulo] no texto). */
  missing: string[]
}

/** Troca cada {{campo}} pelo valor. Valor vazio ou ausente deixa "[rótulo]" e registra em `missing`. */
export function fillTemplate(
  template: string,
  values: Record<string, string | null | undefined>,
  labels: Record<string, string> = {},
): FillResult {
  const missing = new Set<string>()
  const text = template.replace(TOKEN, (_all, raw: string) => {
    const key = raw.toLowerCase()
    const v = values[key]
    if (typeof v === 'string' && v.trim() !== '') return v
    const label = labels[key] ?? key.replace(/_/g, ' ')
    missing.add(label)
    return `[${label}]`
  })
  return { text, missing: Array.from(missing) }
}

/** Campos {{...}} de um modelo que não existem na lista permitida (erro de digitação na edição do modelo). */
export function unknownTokens(template: string, allowed: readonly string[]): string[] {
  const ok = new Set(allowed.map(k => k.toLowerCase()))
  return listTokens(template).filter(k => !ok.has(k))
}
