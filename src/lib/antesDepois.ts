// Comparador Antes/Depois do prontuário (estética e odontologia). Lógica pura,
// sem rede: reaproveita as fotos que a Evolução já guarda em
// record_entries.photo_urls (bucket privado `pacientes`) e decide quais fotos
// entram na comparação, como ordenar, o par inicial e o comportamento do slider.
import { attachmentKindFromPath } from '@/lib/prontuarioAttachments'

/** Estrutura mínima de uma evolução que interessa aqui (RecordEntry cabe nela). */
export interface EntryLike {
  id: string
  created_at: string
  entry_text?: string | null
  photo_url?: string | null
  photo_urls?: string[] | null
  is_confidential?: boolean
}

export interface ComparadorPhoto {
  /** chave estável: id da evolução + posição da foto nela */
  key: string
  entryId: string
  /** valor original salvo em photo_urls */
  raw: string
  /** path no bucket `pacientes`; null quando o dado antigo é uma URL completa de outro lugar */
  path: string | null
  /** data da evolução (ISO) */
  takenAt: string
  /** trecho do texto da evolução, que faz o papel de "procedimento" */
  procedure: string
  /** posição da foto na evolução (1..total) e total de fotos de imagem dela */
  index: number
  total: number
}

/** Path no bucket a partir do que foi salvo (path relativo, ou URL antiga do storage). */
export function storagePathFromPhotoUrl(value: string): string | null {
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) return value
  const m = value.split(/[?#]/)[0].match(/\/storage\/v1\/object\/(?:public|sign)\/pacientes\/(.+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** Primeira linha de texto da evolução, sem HTML, curta o bastante pra caber num seletor. */
export function procedureLabel(entryText: string | null | undefined, max = 48): string {
  if (!entryText) return ''
  const plain = entryText
    .replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  const first = plain.split('\n').map(l => l.trim()).find(Boolean) ?? ''
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first
}

function timeOf(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? NaN : t
}

/** Ordena por data da foto. Datas inválidas vão sempre pro fim; empate mantém a ordem original. */
export function sortPhotosByDate<T extends { takenAt: string }>(items: T[], dir: 'asc' | 'desc' = 'asc'): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return items
    .map((item, i) => ({ item, i, t: timeOf(item.takenAt) }))
    .sort((a, b) => {
      const aBad = Number.isNaN(a.t), bBad = Number.isNaN(b.t)
      if (aBad || bBad) return aBad === bBad ? a.i - b.i : aBad ? 1 : -1
      return a.t === b.t ? a.i - b.i : (a.t - b.t) * sign
    })
    .map(x => x.item)
}

/**
 * Fotos (só imagens) das evoluções do paciente, da mais antiga para a mais nova.
 * Anotações sigilosas nunca entram, e anexos PDF/áudio/vídeo ficam de fora.
 */
export function collectPhotos(entries: EntryLike[]): ComparadorPhoto[] {
  const out: ComparadorPhoto[] = []
  for (const e of entries) {
    if (e.is_confidential) continue
    const raws = e.photo_urls?.length ? e.photo_urls : (e.photo_url ? [e.photo_url] : [])
    const imgs = raws
      .map((raw, pos) => ({ raw, pos, path: storagePathFromPhotoUrl(raw) }))
      .filter(x => x.raw && attachmentKindFromPath(x.path ?? x.raw) === 'image')
    imgs.forEach((x, i) => out.push({
      key: `${e.id}:${x.pos}`,
      entryId: e.id,
      raw: x.raw,
      path: x.path,
      takenAt: e.created_at,
      procedure: procedureLabel(e.entry_text),
      index: i + 1,
      total: imgs.length,
    }))
  }
  return sortPhotosByDate(out, 'asc')
}

/** Par inicial: a foto mais antiga como "Antes" e a mais recente como "Depois". Menos de 2 fotos → null. */
export function suggestPair(photos: ComparadorPhoto[]): { before: string; after: string } | null {
  const sorted = sortPhotosByDate(photos, 'asc')
  if (sorted.length < 2) return null
  return { before: sorted[0].key, after: sorted[sorted.length - 1].key }
}

/**
 * Ao escolher uma foto num dos lados, devolve o par resultante. Se a escolha
 * for igual à do outro lado, troca os dois (nunca fica a mesma foto nos dois).
 */
export function pickPhoto(pair: { before: string; after: string }, side: 'before' | 'after', key: string): { before: string; after: string } {
  if (side === 'before') return key === pair.after ? { before: key, after: pair.before } : { ...pair, before: key }
  return key === pair.before ? { before: pair.after, after: key } : { ...pair, after: key }
}

/** Mantém o par só com chaves que ainda existem; se alguma sumiu, recomeça pelo par sugerido. */
export function reconcilePair(pair: { before: string; after: string } | null, photos: ComparadorPhoto[]): { before: string; after: string } | null {
  if (pair) {
    const keys = new Set(photos.map(p => p.key))
    if (keys.has(pair.before) && keys.has(pair.after) && pair.before !== pair.after) return pair
  }
  return suggestPair(photos)
}

/** Dias inteiros entre duas datas ISO (absoluto); null se alguma for inválida. */
export function daysBetween(aIso: string, bIso: string): number | null {
  const a = timeOf(aIso), b = timeOf(bIso)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round(Math.abs(b - a) / 86_400_000)
}

/** "3 meses", "12 dias"... só para o resumo do intervalo entre as fotos. */
export function formatInterval(days: number | null): string {
  if (days === null) return ''
  if (days === 0) return 'no mesmo dia'
  if (days < 30) return `${days} ${days === 1 ? 'dia' : 'dias'} depois`
  const months = Math.round(days / 30)
  if (days < 365) return `${months} ${months === 1 ? 'mês' : 'meses'} depois`
  const years = Math.floor(days / 365)
  const restMonths = Math.round((days - years * 365) / 30)
  const y = `${years} ${years === 1 ? 'ano' : 'anos'}`
  return restMonths > 0 && restMonths < 12 ? `${y} e ${restMonths} ${restMonths === 1 ? 'mês' : 'meses'} depois` : `${y} depois`
}

/** dd/mm/aaaa no fuso do Brasil (não depende do fuso de quem abre). */
export function formatPhotoDate(iso: string): string {
  const t = timeOf(iso)
  if (Number.isNaN(t)) return 'Sem data'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(t))
}

/** Texto de uma opção do seletor: data, procedimento e, se a evolução tem várias fotos, "foto 2 de 3". */
export function photoOptionLabel(p: ComparadorPhoto): string {
  const parts = [formatPhotoDate(p.takenAt)]
  if (p.procedure) parts.push(p.procedure)
  if (p.total > 1) parts.push(`foto ${p.index} de ${p.total}`)
  return parts.join(' - ')
}

// ── Slider ───────────────────────────────────────────────────────────────

export const SLIDER_MIN = 0
export const SLIDER_MAX = 100
export const SLIDER_STEP = 2
export const SLIDER_BIG_STEP = 10

/** Limita o valor a 0..100; NaN/infinito caem no meio (50). */
export function clampSlider(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value))
}

/** Posição do ponteiro dentro da caixa → 0..100 (largura 0 ou inválida → 50). */
export function pointerToPercent(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return 50
  return clampSlider(((clientX - left) / width) * 100)
}

/** Novo valor do slider para uma tecla; null se a tecla não mexe nele. */
export function sliderKeyValue(current: number, key: string, shift = false): number | null {
  const step = shift ? SLIDER_BIG_STEP : SLIDER_STEP
  switch (key) {
    case 'ArrowLeft': case 'ArrowDown': return clampSlider(current - step)
    case 'ArrowRight': case 'ArrowUp': return clampSlider(current + step)
    case 'PageDown': return clampSlider(current - SLIDER_BIG_STEP)
    case 'PageUp': return clampSlider(current + SLIDER_BIG_STEP)
    case 'Home': return SLIDER_MIN
    case 'End': return SLIDER_MAX
    default: return null
  }
}
