/** Auxiliares do filtro de profissionais da agenda (busca por nome e rótulos do botão e da lista). */

/** Minúsculas e sem acento, para a busca não depender de "José" ou "jose". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Mantém quem tem todas as palavras da busca no nome. Busca vazia devolve a lista inteira. */
export function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return items
  return items.filter(item => {
    const name = normalizeSearch(item.name)
    return terms.every(t => name.includes(t))
  })
}

/** Quantos profissionais aparecem na agenda (os que não estão ocultos). */
export function shownCount(items: { id: string }[], hiddenIds: ReadonlySet<string>): number {
  return items.filter(i => !hiddenIds.has(i.id)).length
}

/** Conjunto de ocultos para "Desmarcar todos": todo mundo, mais '' (consultas sem profissional). */
export function allHiddenIds(items: { id: string }[]): Set<string> {
  return new Set(['', ...items.map(i => i.id)])
}

/** Nenhum profissional marcado (só vale com mais de um profissional: com um só não há filtro). */
export function noneSelected(items: { id: string }[], hiddenIds: ReadonlySet<string>): boolean {
  return items.length > 1 && items.every(i => hiddenIds.has(i.id))
}

/** "21 de 21", ou "3 de 21" quando há filtro. */
export function countLabel(shown: number, total: number): string {
  return `${shown} de ${total}`
}

/** Contagem de consultas de cada linha da lista. */
export function appointmentsLabel(count: number): string {
  if (count <= 0) return 'Sem consultas'
  return count === 1 ? '1 consulta' : `${count} consultas`
}
