// Escopos do link mágico do paciente: o que a página pública /p/[token] pode mostrar. Cada link carrega só os
// escopos que a clínica marcou; o que não está na lista nem é consultado no banco. Funções puras.

import type { ClinicType } from '@/types'

export const PORTAL_SCOPES = ['plano_alimentar', 'vacinas_peso', 'proximas_consultas', 'orientacoes', 'assinatura'] as const
export type PortalScope = (typeof PORTAL_SCOPES)[number]

export const SCOPE_LABEL: Record<PortalScope, string> = {
  plano_alimentar: 'Plano alimentar',
  vacinas_peso: 'Vacinas e peso do pet',
  proximas_consultas: 'Próximas consultas',
  orientacoes: 'Orientações da clínica',
  assinatura: 'Assinar termos e contratos',
}

export const SCOPE_HINT: Record<PortalScope, string> = {
  plano_alimentar: 'Refeições do plano mais recente.',
  vacinas_peso: 'Carteira de vacinas, vermífugos e histórico de peso.',
  proximas_consultas: 'Data, hora e profissional dos próximos agendamentos.',
  orientacoes: 'Um texto curto que você escreve para este paciente.',
  assinatura: 'TCLE, termo de uso de imagem ou contrato para assinar no celular.',
}

/** Escopos que só fazem sentido para uma área da clínica (os demais valem para todas). */
const AREA_SCOPE: Partial<Record<PortalScope, ClinicType>> = { plano_alimentar: 'nutri', vacinas_peso: 'vet' }

/** Escopos oferecidos no formulário, conforme as áreas da clínica. */
export function scopesForAreas(areas: readonly ClinicType[]): PortalScope[] {
  return PORTAL_SCOPES.filter(s => {
    const area = AREA_SCOPE[s]
    return !area || areas.includes(area)
  })
}

export function isPortalScope(v: unknown): v is PortalScope {
  return typeof v === 'string' && (PORTAL_SCOPES as readonly string[]).includes(v)
}

/** Lista de escopos vinda do corpo da requisição: só valores conhecidos, sem repetição, na ordem canônica. Vazio se algo for inválido. */
export function normalizeScopes(input: unknown): PortalScope[] {
  if (!Array.isArray(input)) return []
  if (input.some(v => !isPortalScope(v))) return []
  const set = new Set(input as PortalScope[])
  return PORTAL_SCOPES.filter(s => set.has(s))
}

export function hasScope(scopes: readonly string[], scope: PortalScope): boolean {
  return scopes.includes(scope)
}
