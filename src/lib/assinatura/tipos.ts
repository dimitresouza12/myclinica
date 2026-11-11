// Tipos de documento com QR verificador e formatação do código. Sem dependência de servidor: vale no navegador.

/** Documentos próprios que recebem QR verificador (nenhum é receita de controle especial). */
export const VERIFIABLE_DOC_TYPES = ['atestado', 'declaracao_comparecimento', 'laudo', 'receita_comum'] as const
export type VerifiableDocType = (typeof VERIFIABLE_DOC_TYPES)[number]

export const VERIFIABLE_LABEL: Record<VerifiableDocType, string> = {
  atestado: 'Atestado',
  declaracao_comparecimento: 'Declaração de comparecimento',
  laudo: 'Laudo',
  receita_comum: 'Receita comum',
}

export function isVerifiableDocType(v: unknown): v is VerifiableDocType {
  return typeof v === 'string' && (VERIFIABLE_DOC_TYPES as readonly string[]).includes(v)
}

/** "ABCDEFGHIJKLMNOP" -> "ABCD-EFGH-IJKL-MNOP". */
export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}
