// Configuração das funções determinísticas da automação que moram no MyClinica (coluna jsonb
// clinic_whatsapp.automacao_config, escrita pelo dashboard). Funções puras, sem banco.
//
// Formato mínimo:
//   { "foraDoHorario": { "ativa": true, "texto": "..." },
//     "parar":         { "palavras": ["parar", "pare", "sair", "stop"] },
//     "boasVindas":    { "diasSemConversar": 30 } }          // opcional; só decide o tipo do repasse ao n8n
// Qualquer campo ausente ou inválido volta ao padrão. Nunca lança.

export const PARAR_PALAVRAS_PADRAO = ['parar', 'pare', 'sair', 'stop'] as const

/** Resposta fixa ao PARAR: não é IA, não muda por clínica. Sem emoji (regra da interface do MyClinica). */
export const PARAR_CONFIRMACAO_TEXTO =
  'Pronto, você não receberá mais mensagens automáticas desta clínica. Se precisar de algo, é só escrever.'

export const FORA_HORARIO_TEXTO_MAX = 1000
export const DIAS_SEM_CONVERSAR_PADRAO = 30

export interface AutomacaoConfig {
  foraDoHorario: { ativa: boolean; texto: string }
  parar: { palavras: string[] }
  boasVindas: { diasSemConversar: number }
}

export const DEFAULT_AUTOMACAO_CONFIG: AutomacaoConfig = {
  foraDoHorario: { ativa: false, texto: '' },
  parar: { palavras: [...PARAR_PALAVRAS_PADRAO] },
  boasVindas: { diasSemConversar: DIAS_SEM_CONVERSAR_PADRAO },
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** minúsculas, sem acento, pontuação vira espaço, espaços repetidos colapsam. */
export function normalizeStopText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseAutomacaoConfig(raw: unknown): AutomacaoConfig {
  if (!isObj(raw)) return structuredClone(DEFAULT_AUTOMACAO_CONFIG)

  const fora = isObj(raw.foraDoHorario) ? raw.foraDoHorario : {}
  const texto = typeof fora.texto === 'string' ? fora.texto.trim().slice(0, FORA_HORARIO_TEXTO_MAX) : ''
  // ligada sem texto utilizável não pode mandar mensagem vazia: fica desligada
  const ativa = fora.ativa === true && texto.length > 0

  const parar = isObj(raw.parar) ? raw.parar : {}
  const seen = new Set<string>()
  const palavras: string[] = []
  if (Array.isArray(parar.palavras)) {
    for (const p of parar.palavras) {
      if (typeof p !== 'string') continue
      const n = normalizeStopText(p)
      if (n && !seen.has(n)) { seen.add(n); palavras.push(n) }
    }
  }

  const bv = isObj(raw.boasVindas) ? raw.boasVindas : {}
  const dias = bv.diasSemConversar
  const diasOk = typeof dias === 'number' && Number.isInteger(dias) && dias >= 1 && dias <= 365

  return {
    foraDoHorario: { ativa, texto },
    parar: { palavras: palavras.length > 0 ? palavras : [...PARAR_PALAVRAS_PADRAO] },
    boasVindas: { diasSemConversar: diasOk ? dias : DIAS_SEM_CONVERSAR_PADRAO },
  }
}

/** O texto inteiro da mensagem é uma das palavras de PARAR? (sem caixa e sem acento, pontuação nas pontas ignorada) */
export function isStopWord(text: string, palavras: string[]): boolean {
  const t = normalizeStopText(text)
  if (!t) return false
  return palavras.some(p => normalizeStopText(p) === t)
}
