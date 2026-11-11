// Validação do que o paciente envia ao assinar. Pura: o servidor roda isto antes de gravar qualquer coisa.

export type SignMethod = 'desenho' | 'digitado'

export const MAX_DRAWING_CHARS = 200_000
const MIN_DRAWING_CHARS = 400
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/
const PNG_MAGIC_B64 = 'iVBORw0KGgo'

export const SIGN_ACCEPT_TEXT = 'Li o documento e concordo com o seu conteúdo. Entendo que esta é uma assinatura eletrônica simples.'

export interface SignInput {
  requestId?: unknown
  method?: unknown
  signerName?: unknown
  drawing?: unknown
  accepted?: unknown
}

export type SignValidation =
  | { ok: true; requestId: string; method: SignMethod; signerName: string; drawing: string | null }
  | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function cleanSignerName(raw: unknown): string {
  return typeof raw === 'string' ? raw.normalize('NFC').replace(/\s+/g, ' ').trim() : ''
}

export function validateSignInput(i: SignInput): SignValidation {
  if (typeof i.requestId !== 'string' || !UUID.test(i.requestId)) return { ok: false, error: 'Documento inválido.' }
  if (i.accepted !== true) return { ok: false, error: 'Marque que leu e concorda para assinar.' }
  if (i.method !== 'desenho' && i.method !== 'digitado') return { ok: false, error: 'Escolha como assinar.' }
  const signerName = cleanSignerName(i.signerName)
  const words = signerName.split(' ')
  if (signerName.length < 5 || signerName.length > 120 || words.length < 2 || words.some(w => w.length < 2)) {
    return { ok: false, error: 'Digite seu nome completo.' }
  }
  if (/[<>]/.test(signerName)) return { ok: false, error: 'O nome tem caracteres inválidos.' }
  if (i.method === 'digitado') return { ok: true, requestId: i.requestId, method: 'digitado', signerName, drawing: null }

  const d = i.drawing
  if (typeof d !== 'string' || d.length < MIN_DRAWING_CHARS) return { ok: false, error: 'Faça o desenho da assinatura.' }
  if (d.length > MAX_DRAWING_CHARS) return { ok: false, error: 'O desenho da assinatura ficou grande demais.' }
  if (!PNG_DATA_URL.test(d) || !d.slice('data:image/png;base64,'.length).startsWith(PNG_MAGIC_B64)) {
    return { ok: false, error: 'Desenho da assinatura inválido.' }
  }
  return { ok: true, requestId: i.requestId, method: 'desenho', signerName, drawing: d }
}

/** user-agent guardado como prova técnica: sem caracteres de controle e com limite de tamanho. */
export function cleanUserAgent(ua: string | null | undefined): string {
  return (ua ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300)
}
