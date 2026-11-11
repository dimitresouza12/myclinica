import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import type { PortalScope } from '@/lib/portal/scopes'
import type { SignDocType } from '@/lib/assinatura/texto'
import type { VerifiableDocType } from '@/lib/assinatura/tipos'
import type { SignedDocView } from '@/lib/assinatura/carimbo'

// Cliente das rotas /api/portal e /api/documentos (o servidor decide a clínica; nunca vai id de clínica no corpo).
export interface CreatedLink { id: string; url: string; expiresAt: string; scopes: PortalScope[] }
export interface LinkItem {
  id: string; scopes: PortalScope[]; createdAt: string; expiresAt: string; revokedAt: string | null
  lastAccessAt: string | null; accessCount: number; state: 'active' | 'expired' | 'revoked'
}
export interface SignatureItem {
  id: string; linkId: string | null; docType: SignDocType; title: string; status: 'pendente' | 'assinado' | 'revogado'
  createdAt: string; signedAt: string | null; signerName: string | null
}

export function createLink(body: {
  patientId: string; scopes: PortalScope[]; ttlDays: number; message: string
  docs: { docType: SignDocType; title: string; contentText: string }[]
}) {
  return whatsappApi<CreatedLink>('/api/portal/links', { method: 'POST', body })
}

export function listPortal(patientId: string) {
  return whatsappApi<{ links: LinkItem[]; signatures: SignatureItem[] }>(`/api/portal/links?patientId=${encodeURIComponent(patientId)}`)
}

export function revokeLink(id: string) {
  return whatsappApi<{ ok: true }>(`/api/portal/links/${id}`, { method: 'DELETE' })
}

export async function fetchSignedDocument(requestId: string): Promise<SignedDocView> {
  const r = await whatsappApi<{ doc: SignedDocView }>(`/api/portal/assinaturas/${requestId}`)
  return r.doc
}

export function emitVerifiable(body: { patientId: string; docType: VerifiableDocType; contentHash: string; professionalId?: string }) {
  return whatsappApi<{ code: string; url: string; issuedAt: string }>('/api/documentos/emitir', { method: 'POST', body })
}
