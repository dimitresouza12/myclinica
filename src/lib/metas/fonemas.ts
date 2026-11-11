/**
 * Quadro fonêmico do português brasileiro: grade de consoantes por posição na palavra.
 * Só registra o que o profissional marcou; não traz norma de idade nem ponto de corte
 * clínico (isso fica a critério de quem avalia).
 */

export type Posicao = 'ini' | 'med' | 'fin'
export type Marca = 'c' | 'o' | 's' | 'd'
/** Mapa "fonema|posicao" para a marca. Célula ausente = não avaliada. */
export type FonemaCells = Record<string, Marca>

export const POSICOES: { key: Posicao; label: string }[] = [
  { key: 'ini', label: 'Inicial' },
  { key: 'med', label: 'Medial' },
  { key: 'fin', label: 'Final' },
]

export const MARCA_LABEL: Record<Marca, string> = {
  c: 'Correto',
  o: 'Omitido',
  s: 'Substituído',
  d: 'Distorcido',
}

export const MARCA_SIGLA: Record<Marca, string> = { c: 'C', o: 'O', s: 'S', d: 'D' }

/** Ordem do ciclo de toque: vazio, correto, substituído, omitido, distorcido, vazio. */
const CICLO: (Marca | null)[] = [null, 'c', 's', 'o', 'd']

export interface Consoante {
  /** Símbolo IPA mostrado */
  ipa: string
  /** Exemplo curto para o profissional se orientar */
  exemplo: string
}

export interface GrupoConsoantes {
  nome: string
  consoantes: Consoante[]
}

export const QUADRO_CONSOANTES: GrupoConsoantes[] = [
  { nome: 'Plosivas', consoantes: [
    { ipa: 'p', exemplo: 'pato' }, { ipa: 'b', exemplo: 'bola' },
    { ipa: 't', exemplo: 'tatu' }, { ipa: 'd', exemplo: 'dado' },
    { ipa: 'k', exemplo: 'casa' }, { ipa: 'g', exemplo: 'gato' },
  ] },
  { nome: 'Fricativas', consoantes: [
    { ipa: 'f', exemplo: 'faca' }, { ipa: 'v', exemplo: 'vaca' },
    { ipa: 's', exemplo: 'sapo' }, { ipa: 'z', exemplo: 'zebra' },
    { ipa: 'ʃ', exemplo: 'chave' }, { ipa: 'ʒ', exemplo: 'janela' },
  ] },
  { nome: 'Nasais', consoantes: [
    { ipa: 'm', exemplo: 'mala' }, { ipa: 'n', exemplo: 'nuvem' }, { ipa: 'ɲ', exemplo: 'ninho' },
  ] },
  { nome: 'Líquidas', consoantes: [
    { ipa: 'l', exemplo: 'lua' }, { ipa: 'ʎ', exemplo: 'olho' },
    { ipa: 'ɾ', exemplo: 'arara' }, { ipa: 'ʁ', exemplo: 'rato' },
  ] },
]

export const TODAS_CONSOANTES: Consoante[] = QUADRO_CONSOANTES.flatMap(g => g.consoantes)

export const cellKey = (ipa: string, pos: Posicao) => `${ipa}|${pos}`

export function nextMarca(atual: Marca | undefined): Marca | undefined {
  const i = CICLO.indexOf(atual ?? null)
  const prox = CICLO[(i + 1) % CICLO.length]
  return prox ?? undefined
}

/** Devolve um novo mapa com a célula avançada no ciclo (a original não muda). */
export function cycleCell(cells: FonemaCells, ipa: string, pos: Posicao): FonemaCells {
  const key = cellKey(ipa, pos)
  const prox = nextMarca(cells[key])
  const out = { ...cells }
  if (prox) out[key] = prox
  else delete out[key]
  return out
}

/** Só chaves de consoantes e posições que existem no quadro, com marca válida (dado vindo do banco). */
export function sanitizeCells(raw: unknown): FonemaCells {
  if (!raw || typeof raw !== 'object') return {}
  const validIpa = new Set(TODAS_CONSOANTES.map(c => c.ipa))
  const validPos = new Set<string>(POSICOES.map(p => p.key))
  const out: FonemaCells = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const [ipa, pos] = k.split('|')
    if (!validIpa.has(ipa) || !validPos.has(pos)) continue
    if (v === 'c' || v === 'o' || v === 's' || v === 'd') out[k] = v
  }
  return out
}

export interface FonemaResumo {
  avaliadas: number
  corretas: number
  omitidas: number
  substituidas: number
  distorcidas: number
  /** Percentual de consoantes corretas (PCC): corretas / avaliadas x 100; null sem nada avaliado. */
  pcc: number | null
}

export function resumoFonemico(cells: FonemaCells, filtroPos?: Posicao): FonemaResumo {
  const validos = sanitizeCells(cells)
  let c = 0, o = 0, s = 0, d = 0
  for (const [k, v] of Object.entries(validos)) {
    if (filtroPos && k.split('|')[1] !== filtroPos) continue
    if (v === 'c') c++
    else if (v === 'o') o++
    else if (v === 's') s++
    else d++
  }
  const avaliadas = c + o + s + d
  return {
    avaliadas,
    corretas: c,
    omitidas: o,
    substituidas: s,
    distorcidas: d,
    pcc: avaliadas === 0 ? null : Math.round((c / avaliadas) * 1000) / 10,
  }
}

export interface FonemaAvaliacaoData {
  cells: FonemaCells
  note?: string
}

/** Lista de consoantes com alguma alteração (não corretas), para o relatório. */
export function alteracoes(cells: FonemaCells): { ipa: string; pos: Posicao; marca: Exclude<Marca, 'c'> }[] {
  const validos = sanitizeCells(cells)
  const out: { ipa: string; pos: Posicao; marca: Exclude<Marca, 'c'> }[] = []
  for (const g of QUADRO_CONSOANTES) for (const c of g.consoantes) for (const p of POSICOES) {
    const m = validos[cellKey(c.ipa, p.key)]
    if (m && m !== 'c') out.push({ ipa: c.ipa, pos: p.key, marca: m })
  }
  return out
}
