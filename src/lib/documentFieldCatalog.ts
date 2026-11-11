import type { DocumentTemplateType, FieldPosition } from '@/types'
import { registrationFieldLabel, type CouncilInfo } from '@/lib/professionalCouncil'

// Catálogo de campos disponíveis pra calibrar em cima do papel timbrado
// próprio de cada clínica — mesmos nomes já usados em DefaultTemplateArgs
// (TabDocumentos.tsx), só que agora com posição livre em vez de fixa.
// `corpo` (texto livre) está sempre presente: é onde o profissional digita
// o conteúdo do documento (prescrição, texto do atestado, etc.).
export interface FieldCatalogEntry {
  key: string
  label: string
  kind: 'text' | 'body'
}

const BASE_FIELDS_BEFORE_REGISTRO: FieldCatalogEntry[] = [
  { key: 'paciente', label: 'Nome do paciente', kind: 'text' },
  { key: 'data', label: 'Data', kind: 'text' },
  { key: 'medico', label: 'Nome do profissional', kind: 'text' },
]
const BODY_FIELD: FieldCatalogEntry = { key: 'corpo', label: 'Texto do documento', kind: 'body' }

const RECEITA_ESPECIAL_EXTRA: FieldCatalogEntry[] = [
  { key: 'endereco_paciente', label: 'Endereço do paciente', kind: 'text' },
  { key: 'comprador_nome', label: 'Comprador — nome', kind: 'text' },
  { key: 'comprador_doc', label: 'Comprador — identificação', kind: 'text' },
  { key: 'fornecedor_nome', label: 'Fornecedor — nome', kind: 'text' },
]

/**
 * Campos calibráveis do tipo de documento. O rótulo do registro segue o
 * conselho da área (`council`, ver professionalCouncil.ts); sem conselho
 * informado fica genérico. O campo RQE só entra quando o conselho da área
 * tem RQE (medicina) — nas demais áreas seria só ruído no calibrador.
 */
export function getFieldCatalog(type: DocumentTemplateType, council?: CouncilInfo): FieldCatalogEntry[] {
  const registro: FieldCatalogEntry = {
    key: 'registro',
    label: council ? registrationFieldLabel(council) : 'Registro profissional',
    kind: 'text',
  }
  const base = [...BASE_FIELDS_BEFORE_REGISTRO, registro]
  if (council && /RQE/i.test(council.label)) base.push({ key: 'rqe', label: 'RQE', kind: 'text' })
  base.push(BODY_FIELD)
  return type === 'receita_especial' ? [...base, ...RECEITA_ESPECIAL_EXTRA] : base
}

// Posição/estilo inicial ao adicionar um campo novo no calibrador — usuário
// ajusta depois. fontPt em pontos (não px) — ver FieldPosition em types/index.ts.
export function defaultFieldPosition(entry: FieldCatalogEntry): FieldPosition {
  return {
    key: entry.key,
    label: entry.label,
    kind: entry.kind,
    xPct: 8,
    yPct: entry.kind === 'body' ? 40 : 10,
    widthPct: entry.kind === 'body' ? 84 : 40,
    heightPct: entry.kind === 'body' ? 30 : undefined,
    fontPt: entry.kind === 'body' ? 11 : 10,
    align: 'left',
    bold: false,
  }
}
