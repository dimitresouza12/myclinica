import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import type { DocKind, Finalidade, ModeloTextos } from '@/lib/documentos/atestado'
import type { CampoImportado } from '@/lib/documentos/importar'

// Cliente das rotas /api/documentos/importar-modelo e /api/documentos/modelos (a clínica vem da sessão no servidor).
export interface ModeloClinicaItem { key: string; name: string; body: string; source: 'foto_ia' | 'manual'; updatedAt: string }

export interface ModeloLido { texto: string; campos: CampoImportado[]; avisos: string[]; aviso: string }

export function importarModeloPorFoto(body: {
  tipo: DocKind; finalidade: Finalidade | null; confirmaEmBranco: true; imagens: { mediaType: string; dataBase64: string }[]
}) {
  return whatsappApi<ModeloLido>('/api/documentos/importar-modelo', { method: 'POST', body })
}

export async function listarModelosDaClinica(): Promise<ModeloClinicaItem[]> {
  const r = await whatsappApi<{ modelos: ModeloClinicaItem[] }>('/api/documentos/modelos')
  return r.modelos
}

export function salvarModeloDaClinica(body: {
  tipo: DocKind; finalidade: Finalidade | null; nome: string; texto: string; confirmadoPelaPessoa: true; origem: 'foto_ia'
}) {
  return whatsappApi<{ modelo: ModeloClinicaItem }>('/api/documentos/modelos', { method: 'POST', body })
}

export function voltarAoModeloPadrao(tipo: DocKind, finalidade: Finalidade | null) {
  const q = new URLSearchParams({ tipo, ...(finalidade ? { finalidade } : {}) })
  return whatsappApi<{ ok: true }>(`/api/documentos/modelos?${q.toString()}`, { method: 'DELETE' })
}

export function modelosComoMapa(itens: ModeloClinicaItem[]): ModeloTextos {
  return Object.fromEntries(itens.map(m => [m.key, m.body]))
}
