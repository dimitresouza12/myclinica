// Interpreta a resposta do paciente à mensagem de confirmação.
//
// REGRA DE OURO: na dúvida, não decide. Só devolve 'sim' ou 'nao' quando a
// mensagem inteira é, sem sobra, uma dessas respostas. "Sim, mas posso chegar
// atrasada?" ou "não sei ainda" caem em 'ambigua' e ficam para a recepção —
// é melhor um humano ler uma mensagem do que o sistema confirmar sozinho
// alguém que escreveu "sim, quero remarcar".

export type ReplyIntent = 'sim' | 'nao' | 'ambigua'

// Palavras de cortesia que não mudam o sentido: "sim, obrigada!", "bom dia, confirmo".
const COURTESY = [
  'obrigado', 'obrigada', 'obg', 'brigado', 'brigada', 'valeu', 'vlw', 'grato', 'grata',
  'por favor', 'pf', 'pfv', 'dra', 'dr', 'doutora', 'doutor',
  'bom dia', 'boa tarde', 'boa noite', 'ola', 'oi', 'tudo bem',
]

const SIM = [
  /^s+i+m+$/, /^s{1,2}$/, /^confirm(o+|ad[oa]+|ar)$/, /^confirmadissim[oa]$/,
  /^pode confirmar$/, /^ok+(ay)?$/, /^blz$/, /^beleza$/, /^certo$/, /^combinado$/,
  /^vou sim$/, /^sim vou$/, /^sim confirmo$/, /^confirmo sim$/, /^estarei (la|ai)$/,
  /^ate la$/, /^presente$/, /^claro$/, /^com certeza$/, /^positivo$/, /^pode ser$/,
  /^confirmad[oa]$/, /^t[ao]$/, /^show$/, /^fechado$/,
]

const NAO = [
  /^n+a+o+$/, /^n{1,2}$/, /^nope$/, /^nao (posso|vou|consigo|poderei|vai dar)$/,
  /^nao vou (conseguir|poder)$/, /^nao poderei ir$/, /^infelizmente nao$/,
  /^nao (posso|vou) ir$/, /^(preciso|quero|vou precisar|gostaria de) remarcar$/,
  /^remarcar$/, /^remarca$/, /^desmarcar$/, /^desmarca$/, /^cancelar$/, /^cancela$/,
  /^pode (cancelar|remarcar|desmarcar)$/, /^nao confirmo$/,
]

// 👍 ✅ 👌 ✔ ☑ → sim ; 👎 ❌ 🚫 → nao (com variação de pele e seletor de emoji)
const EMOJI_SIM = /[\u{1F44D}\u{2705}\u{1F44C}✔☑]️?[\u{1F3FB}-\u{1F3FF}]?/gu
const EMOJI_NAO = /[\u{1F44E}❌\u{1F6AB}]️?[\u{1F3FB}-\u{1F3FF}]?/gu

const MAX_CLEAN_LENGTH = 60

export function normalizeReply(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = String(raw)
    .replace(EMOJI_SIM, ' sim ')
    .replace(EMOJI_NAO, ' nao ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  // qualquer coisa que não seja letra, número ou espaço vira espaço
  s = s.replace(/[^a-z0-9\s]/g, ' ')
  // letra repetida 3+ vezes colapsa ("simmmm" → "sim")
  s = s.replace(/([a-z])\1{2,}/g, '$1')
  s = s.replace(/\s+/g, ' ').trim()
  // palavra repetida em seguida ("sim sim" → "sim")
  const words = s.split(' ').filter(Boolean)
  const dedup: string[] = []
  for (const w of words) if (dedup[dedup.length - 1] !== w) dedup.push(w)
  return dedup.join(' ')
}

function stripCourtesy(s: string): string {
  let out = ` ${s} `
  // frases maiores primeiro
  for (const c of [...COURTESY].sort((a, b) => b.length - a.length)) {
    out = out.split(` ${c} `).join(' ')
  }
  return out.replace(/\s+/g, ' ').trim()
}

export function parseReply(raw: string | null | undefined): ReplyIntent {
  const norm = normalizeReply(raw)
  if (!norm || norm.length > MAX_CLEAN_LENGTH) return 'ambigua'
  // pergunta nunca é resposta de confirmação
  if (typeof raw === 'string' && raw.includes('?')) return 'ambigua'

  const core = stripCourtesy(norm)
  if (!core) return 'ambigua'

  // "sim nao" / "nao sim" (ou qualquer mistura) não casa com nenhuma lista → ambígua
  const isSim = SIM.some(r => r.test(core))
  const isNao = NAO.some(r => r.test(core))
  if (isSim && !isNao) return 'sim'
  if (isNao && !isSim) return 'nao'
  return 'ambigua'
}
