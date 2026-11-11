import { ESTETICA_TCLE_BODY, ESTETICA_TERMO_IMAGEM_BODY } from '@/lib/documentBodyTemplates'
import { prefillDocText, type SignDocType } from './texto'

/** Texto inicial para a tela da clínica (modelos genéricos de documentBodyTemplates.ts). */
export function initialDocText(type: SignDocType, ctx: { patientName: string; clinicName: string; contractText?: string | null }): string {
  return prefillDocText(type, ctx, { tcle: ESTETICA_TCLE_BODY, termo_imagem: ESTETICA_TERMO_IMAGEM_BODY })
}
