// Texto dos documentos que o paciente assina pelo link: tipos, conversão de HTML do modelo para texto puro e
// verificação de campos [entre colchetes] esquecidos. O documento assinado é TEXTO PURO (nunca HTML): o que o
// paciente lê e o que entra no hash é exatamente o mesmo texto, e não há como injetar marcação na página pública.

export const SIGN_DOC_TYPES = ['tcle', 'termo_imagem', 'contrato'] as const
export type SignDocType = (typeof SIGN_DOC_TYPES)[number]

export const SIGN_DOC_LABEL: Record<SignDocType, string> = {
  tcle: 'TCLE',
  termo_imagem: 'Termo de uso de imagem',
  contrato: 'Contrato',
}

export const SIGN_DOC_TITLE: Record<SignDocType, string> = {
  tcle: 'Termo de Consentimento Livre e Esclarecido',
  termo_imagem: 'Termo de Autorização de Uso de Imagem',
  contrato: 'Contrato de Prestação de Serviços',
}

export const MAX_DOC_TEXT = 20_000
export const MAX_DOC_TITLE = 120

export function isSignDocType(v: unknown): v is SignDocType {
  return typeof v === 'string' && (SIGN_DOC_TYPES as readonly string[]).includes(v)
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }

/** HTML simples do modelo (parágrafos, listas, quebras) para texto puro com linhas em branco entre blocos. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol)\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, e => ENTITIES[e] ?? e)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Campos modelo ainda não preenchidos, como "[nome do paciente]". */
export function findPlaceholders(text: string): string[] {
  return Array.from(new Set(text.match(/\[[^\]\n]{1,80}\]/g) ?? []))
}

/** Normaliza o texto que o paciente vai ler: quebras de linha unificadas, sem espaço sobrando nem excesso de linhas em branco. */
export function normalizeDocText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface DocDraft { docType: unknown; title: unknown; contentText: unknown }
export type DocDraftResult =
  | { ok: true; docType: SignDocType; title: string; contentText: string }
  | { ok: false; error: string }

/** Valida um documento a assinar vindo do formulário da clínica. */
export function validateDocDraft(d: DocDraft): DocDraftResult {
  if (!isSignDocType(d.docType)) return { ok: false, error: 'Tipo de documento inválido.' }
  const title = typeof d.title === 'string' ? d.title.trim() : ''
  if (!title || title.length > MAX_DOC_TITLE) return { ok: false, error: `Informe o título (até ${MAX_DOC_TITLE} caracteres).` }
  const raw = typeof d.contentText === 'string' ? d.contentText : ''
  const contentText = normalizeDocText(raw)
  if (contentText.length < 30) return { ok: false, error: 'O texto do documento está curto demais.' }
  if (contentText.length > MAX_DOC_TEXT) return { ok: false, error: `O texto passa de ${MAX_DOC_TEXT} caracteres.` }
  const pend = findPlaceholders(contentText)
  if (pend.length > 0) return { ok: false, error: `Preencha os campos entre colchetes antes de gerar o link: ${pend.slice(0, 3).join(', ')}.` }
  return { ok: true, docType: d.docType, title, contentText }
}

/** Tira as linhas de assinatura em papel ("____") e de local/data: a assinatura aqui é eletrônica e leva data e hora. */
export function stripPaperSignatureLines(text: string): string {
  return text
    .split('\n')
    .filter(l => !/_{4,}/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Preenche o que o sistema já sabe ([nome do paciente], [nome da clínica]); o resto continua entre colchetes para a clínica completar. */
export function fillKnownFields(text: string, known: { patientName: string; clinicName: string }): string {
  return text
    .replace(/\[nome do paciente\]/gi, known.patientName)
    .replace(/\[nome da cl[ií]nica\]/gi, known.clinicName)
}

/** Texto inicial de um documento a assinar: modelo genérico do tipo (editável), ou o contrato salvo na ficha do paciente. */
export function prefillDocText(
  type: SignDocType,
  ctx: { patientName: string; clinicName: string; contractText?: string | null },
  templates: { tcle: string; termo_imagem: string },
): string {
  if (type === 'contrato') return ctx.contractText?.trim() ? normalizeDocText(ctx.contractText) : ''
  const base = stripPaperSignatureLines(htmlToPlainText(templates[type]))
  return fillKnownFields(base, ctx)
}
