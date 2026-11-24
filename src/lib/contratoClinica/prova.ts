// Prova da assinatura do contrato da clínica: selo (hash) do ato de assinar e linhas do manifesto que vai na
// última página do PDF. Funções puras. Reaproveita sha256Hex/shortHash de lib/assinatura (mesmo padrão dos
// documentos do paciente), só que o selo do contrato amarra também o CPF do responsável e o hash do conteúdo.

import { sha256Hex, shortHash } from '@/lib/assinatura/hash'
import { NOTA_ASSINATURA_SIMPLES, formatDateTimeBr } from '@/lib/assinatura/carimbo'
import { formatCpf } from '@/lib/documentos/campos'

export const SELO_VERSAO = 'myclinica-contrato-clinica-v1'

export interface ContractSealInput {
  agreementId: string
  clinicId: string
  userId: string
  contentHash: string
  signerName: string
  signerCpf: string
  method: 'desenho' | 'digitado'
  /** SHA-256 da imagem do desenho; vazio no modo digitado. */
  signatureImageHash: string
  /** ISO 8601 UTC do aceite. */
  signedAt: string
}

/** Selo do ato de assinar: qualquer campo diferente muda o hash. */
export async function contractSignedHash(i: ContractSealInput): Promise<string> {
  return sha256Hex(JSON.stringify([
    SELO_VERSAO, i.agreementId, i.clinicId, i.userId, i.contentHash, i.signerName, i.signerCpf,
    i.method, i.signatureImageHash, i.signedAt,
  ]))
}

export interface ManifestInput extends ContractSealInput {
  clinicName: string
  signedHash: string
  ipAddress: string
  userAgent: string
  /** Telefone mascarado que recebeu o código por WhatsApp. */
  codeSentTo: string
  contractVersion: string
}

/** Linhas [rótulo, valor] do manifesto de assinatura (última página do PDF). */
export function buildManifest(m: ManifestInput): [string, string][] {
  return [
    ['Documento', `Contrato ${m.agreementId}`],
    ['Versão do texto', m.contractVersion],
    ['Clínica', m.clinicName],
    ['Signatário', m.signerName],
    ['CPF do signatário', formatCpf(m.signerCpf) || m.signerCpf],
    ['Forma de assinatura', m.method === 'desenho' ? 'Desenho na tela, com confirmação por código' : 'Nome digitado, com confirmação por código'],
    ['Código de confirmação', `Enviado por WhatsApp para ${m.codeSentTo} e digitado pelo signatário`],
    ['Data e hora do aceite', formatDateTimeBr(m.signedAt) || m.signedAt],
    ['Data e hora (UTC)', m.signedAt],
    ['Endereço IP', m.ipAddress || 'não identificado'],
    ['Navegador (user agent)', m.userAgent || 'não identificado'],
    ['Hash do conteúdo (SHA-256)', m.contentHash],
    ['Hash da assinatura (SHA-256)', m.signedHash],
    ['Conferência rápida', `${shortHash(m.contentHash)} / ${shortHash(m.signedHash)}`],
    ['Natureza da assinatura', NOTA_ASSINATURA_SIMPLES],
  ]
}
