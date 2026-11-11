// Contas da visão Dia em colunas: largura das colunas, densidade, filtro de profissionais e a chave
// de armazenamento por usuário. Funções puras, sem tocar em tela nem em localStorage, para testar à parte.

/** Coluna de horas fixa à esquerda. */
export const RAIL_PX = 56
/** Abaixo disso o nome do profissional e o bloco da consulta deixam de ser legíveis: passa a rolar na horizontal. */
export const MIN_COL_PX = 140

export type Density = 'normal' | 'compacta'

/** Altura de cada casa de 30 min. Compacta cabe mais horas na tela. */
export const ROW_PX: Record<Density, number> = { normal: 48, compacta: 32 }

export function parseDensity(raw: unknown): Density {
  return raw === 'compacta' ? 'compacta' : 'normal'
}

/** `grid-template-columns`: horas fixas + uma coluna por profissional que divide o espaço, nunca menor que o mínimo. */
export function gridTemplate(count: number, rail = RAIL_PX, min = MIN_COL_PX): string {
  const n = Math.max(1, Math.floor(count))
  return `${rail}px repeat(${n}, minmax(${min}px, 1fr))`
}

/** Largura real de cada coluna dado o espaço disponível (com a coluna de horas já descontada). */
export function columnWidth(available: number, count: number, rail = RAIL_PX, min = MIN_COL_PX): number {
  const n = Math.max(1, Math.floor(count))
  const share = Math.floor((available - rail) / n)
  return Math.max(min, share)
}

/** Cabem todas as colunas sem rolagem horizontal? */
export function fitsWithoutScroll(available: number, count: number, rail = RAIL_PX, min = MIN_COL_PX): boolean {
  const n = Math.max(1, Math.floor(count))
  return rail + n * min <= available
}

/** Id da coluna mostrada no celular: a escolhida, se ainda existir, senão a primeira. */
export function pickSingleId(ids: string[], selected: string | null): string | null {
  if (ids.length === 0) return null
  return selected !== null && ids.includes(selected) ? selected : ids[0]
}

/**
 * Filtro guardado -> conjunto de ocultos. Descarta ids que não existem mais (profissional removido).
 * '' (consultas sem profissional) é mantido. Se tudo estivesse oculto, a agenda abriria vazia: volta a mostrar todos.
 */
export function sanitizeHidden(stored: unknown, professionalIds: string[]): Set<string> {
  if (!Array.isArray(stored)) return new Set()
  const valid = new Set(professionalIds)
  const out = new Set<string>()
  for (const id of stored) {
    if (typeof id !== 'string') continue
    if (id === '' || valid.has(id)) out.add(id)
  }
  if (professionalIds.length > 0 && professionalIds.every(id => out.has(id))) return new Set()
  return out
}

export function parseHidden(raw: string | null, professionalIds: string[]): Set<string> {
  if (!raw) return new Set()
  try { return sanitizeHidden(JSON.parse(raw), professionalIds) } catch { return new Set() }
}

export function serializeHidden(hidden: Set<string>): string {
  return JSON.stringify([...hidden].sort())
}

export type GridPref = 'density' | 'hidden' | 'sidebar'

/** Chave de armazenamento por usuário e por clínica (a mesma pessoa pode ter mais de um vínculo). */
export function prefKey(pref: GridPref, userId: string | null | undefined, clinicId?: string | null): string {
  return `agenda.${pref}:${clinicId ?? '-'}:${userId ?? '-'}`
}
