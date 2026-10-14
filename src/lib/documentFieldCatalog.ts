import type { DocumentTemplateType, FieldPosition } from '@/types'

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

const BASE_FIELDS: FieldCatalogEntry[] = [
  { key: 'paciente', label: 'Nome do paciente', kind: 'text' },
  { key: 'data', label: 'Data', kind: 'text' },
  { key: 'medico', label: 'Nome do profissional', kind: 'text' },
  { key: 'registro', label: 'Registro (CRO/CRM)', kind: 'text' },
  { key: 'corpo', label: 'Texto do documento', kind: 'body' },
]

const RECEITA_ESPECIAL_EXTRA: FieldCatalogEntry[] = [
  { key: 'endereco_paciente', label: 'Endereço do paciente', kind: 'text' },
  { key: 'comprador_nome', label: 'Comprador — nome', kind: 'text' },
  { key: 'comprador_doc', label: 'Comprador — identificação', kind: 'text' },
  { key: 'fornecedor_nome', label: 'Fornecedor — nome', kind: 'text' },
]

export function getFieldCatalog(type: DocumentTemplateType): FieldCatalogEntry[] {
  return type === 'receita_especial' ? [...BASE_FIELDS, ...RECEITA_ESPECIAL_EXTRA] : BASE_FIELDS
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
