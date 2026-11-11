import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import type { ContractDetail, ContractItem, TemplateItem } from '@/lib/contratos/server'

// Cliente das rotas /api/contratos (o servidor decide a clínica pelo login; nunca vai id de clínica no corpo).
export type { ContractDetail, ContractItem, TemplateItem }

export interface ContractInput {
  title: string
  contentText: string
  validFrom: string
  validUntil: string
  amount: number | null
  paymentMethod: string
  professionalId?: string | null
}

export const listContracts = (patientId?: string) =>
  whatsappApi<{ contracts: ContractItem[] }>(`/api/contratos${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`).then(r => r.contracts)

export const getContract = (id: string) => whatsappApi<{ contract: ContractDetail }>(`/api/contratos/${id}`).then(r => r.contract)

export const createContract = (body: ContractInput & { patientId: string; templateId?: string | null; packageId?: string | null }) =>
  whatsappApi<{ id: string }>('/api/contratos', { method: 'POST', body })

export const updateContract = (id: string, body: ContractInput) => whatsappApi<{ ok: true }>(`/api/contratos/${id}`, { method: 'PATCH', body })

export const removeContract = (id: string) => whatsappApi<{ ok: true; mode: 'apagado' | 'cancelado' }>(`/api/contratos/${id}`, { method: 'DELETE' })

export const sendContract = (id: string, ttlDays: number) =>
  whatsappApi<{ url: string; expiresAt: string }>(`/api/contratos/${id}/enviar`, { method: 'POST', body: { ttlDays } })

export const listTemplates = () => whatsappApi<{ templates: TemplateItem[] }>('/api/contratos/modelos').then(r => r.templates)

export const saveTemplate = (body: { id?: string; name: string; body: string }) =>
  body.id
    ? whatsappApi<{ template: TemplateItem }>(`/api/contratos/modelos/${body.id}`, { method: 'PATCH', body: { name: body.name, body: body.body } })
    : whatsappApi<{ template: TemplateItem }>('/api/contratos/modelos', { method: 'POST', body: { name: body.name, body: body.body } })

export const deleteTemplate = (id: string) => whatsappApi<{ ok: true }>(`/api/contratos/modelos/${id}`, { method: 'DELETE' })
