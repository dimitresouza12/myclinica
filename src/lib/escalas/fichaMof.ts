/**
 * Ficha de motricidade orofacial: registro estruturado (adequado ou alterado) de aparência e postura, tonicidade, mobilidade
 * e funções orofaciais. Roteiro próprio, em redação própria, sem pontuação padronizada: a contagem de itens alterados serve
 * para acompanhar a evolução. Para escores padronizados existe o AMIOFE (Felício e Ferreira, 2008), que não é reproduzido aqui.
 */

import {
  escolha, textoCurto,
  type DestaqueProtocolo, type IndicadorProtocolo, type ModuloProtocolo,
} from './protocolos'

export interface ItemMof { id: string; rotulo: string; dica?: string }
export interface GrupoMof { id: string; titulo: string; itens: ItemMof[] }

export const MOF_GRUPOS: GrupoMof[] = [
  {
    id: 'postura', titulo: 'Aparência e postura em repouso',
    itens: [
      { id: 'face', rotulo: 'Face', dica: 'Simetria e expressão' },
      { id: 'labios_repouso', rotulo: 'Lábios', dica: 'Vedamento em repouso' },
      { id: 'lingua_repouso', rotulo: 'Língua', dica: 'Posição em repouso, volume' },
      { id: 'bochechas', rotulo: 'Bochechas', dica: 'Volume e simetria' },
      { id: 'mandibula', rotulo: 'Mandíbula', dica: 'Posição e simetria' },
      { id: 'palato', rotulo: 'Palato duro', dica: 'Altura e forma' },
      { id: 'dentes', rotulo: 'Dentição e oclusão', dica: 'Só observação, sem diagnóstico odontológico' },
    ],
  },
  {
    id: 'tonicidade', titulo: 'Tonicidade',
    itens: [
      { id: 'tonus_labios', rotulo: 'Lábios' },
      { id: 'tonus_lingua', rotulo: 'Língua' },
      { id: 'tonus_bochechas', rotulo: 'Bochechas' },
      { id: 'tonus_mento', rotulo: 'Região do mento' },
    ],
  },
  {
    id: 'mobilidade', titulo: 'Mobilidade',
    itens: [
      { id: 'mob_labios', rotulo: 'Lábios', dica: 'Protrair, retrair, estalar, vibrar' },
      { id: 'mob_lingua', rotulo: 'Língua', dica: 'Protrair, elevar, abaixar, lateralizar, estalar' },
      { id: 'mob_bochechas', rotulo: 'Bochechas', dica: 'Inflar, esvaziar, deslocar o ar' },
      { id: 'mob_mandibula', rotulo: 'Mandíbula', dica: 'Abrir, fechar, lateralizar, protruir' },
      { id: 'mob_palato', rotulo: 'Palato mole', dica: 'Elevação na emissão de /a/' },
    ],
  },
  {
    id: 'funcoes', titulo: 'Funções orofaciais',
    itens: [
      { id: 'respiracao', rotulo: 'Respiração', dica: 'Padrão e coordenação' },
      { id: 'mastigacao', rotulo: 'Mastigação', dica: 'Trituração, ruído, escape de alimento' },
      { id: 'degluticao', rotulo: 'Deglutição', dica: 'Contração perioral, interposição, movimento de cabeça' },
      { id: 'fala', rotulo: 'Articulação da fala', dica: 'Distorções, omissões, trocas' },
    ],
  },
]

export interface EscolhaMof { id: string; titulo: string; opcoes: { id: string; rotulo: string }[] }

export const MOF_ESCOLHAS: EscolhaMof[] = [
  {
    id: 'modo_respiratorio', titulo: 'Modo respiratório predominante',
    opcoes: [{ id: 'nasal', rotulo: 'Nasal' }, { id: 'oral', rotulo: 'Oral' }, { id: 'mista', rotulo: 'Oronasal' }],
  },
  {
    id: 'padrao_mastigatorio', titulo: 'Padrão de mastigação',
    opcoes: [{ id: 'bilateral', rotulo: 'Bilateral alternada' }, { id: 'unilateral', rotulo: 'Unilateral preferencial' }, { id: 'anterior', rotulo: 'Anterior (incisivos)' }],
  },
]

export type AvaliacaoMof = 'adequado' | 'alterado'
export const AVALIACOES_MOF: { id: AvaliacaoMof; rotulo: string }[] = [
  { id: 'adequado', rotulo: 'Adequado' },
  { id: 'alterado', rotulo: 'Alterado' },
]

export interface MofDados {
  /** Só aparecem os itens avaliados */
  itens: Record<string, AvaliacaoMof>
  escolhas: Record<string, string>
  obs: string
}

const TODOS_ITENS = MOF_GRUPOS.flatMap(g => g.itens)

export function mofVazio(): MofDados {
  return { itens: {}, escolhas: {}, obs: '' }
}

export function normalizarMof(raw: unknown): MofDados {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const i = (r.itens && typeof r.itens === 'object' ? r.itens : {}) as Record<string, unknown>
  const e = (r.escolhas && typeof r.escolhas === 'object' ? r.escolhas : {}) as Record<string, unknown>
  const itens: Record<string, AvaliacaoMof> = {}
  for (const item of TODOS_ITENS) {
    const v = escolha(i[item.id], ['adequado', 'alterado'] as const)
    if (v) itens[item.id] = v
  }
  const escolhas: Record<string, string> = {}
  for (const c of MOF_ESCOLHAS) {
    const v = escolha(e[c.id], c.opcoes.map(o => o.id))
    if (v) escolhas[c.id] = v
  }
  return { itens, escolhas, obs: textoCurto(r.obs) }
}

export function contarMof(d: MofDados): { avaliados: number; alterados: number } {
  const valores = Object.values(d.itens)
  return { avaliados: valores.length, alterados: valores.filter(v => v === 'alterado').length }
}

function resumo(d: MofDados): string[] {
  const linhas = ['Avaliação de motricidade orofacial (registro estruturado; itens adequados ou alterados).']
  const { avaliados, alterados } = contarMof(d)
  if (avaliados > 0) linhas.push(`Itens avaliados: ${avaliados}; alterados: ${alterados}.`)
  for (const g of MOF_GRUPOS) {
    const aval = g.itens.filter(x => d.itens[x.id])
    if (aval.length === 0) continue
    const alt = aval.filter(x => d.itens[x.id] === 'alterado').map(x => x.rotulo.toLowerCase())
    linhas.push(`${g.titulo}: ${alt.length ? `alterado em ${alt.join(', ')}` : 'sem alterações'} (${aval.length} ${aval.length === 1 ? 'item avaliado' : 'itens avaliados'}).`)
  }
  for (const c of MOF_ESCOLHAS) {
    const v = c.opcoes.find(o => o.id === d.escolhas[c.id])
    if (v) linhas.push(`${c.titulo}: ${v.rotulo.toLowerCase()}.`)
  }
  if (d.obs) linhas.push(`Observações: ${d.obs}`)
  return linhas
}

function destaque(d: MofDados): DestaqueProtocolo | null {
  const { avaliados, alterados } = contarMof(d)
  if (avaliados === 0) return null
  return {
    rotulo: alterados === 0 ? `Sem alterações em ${avaliados} itens` : `${alterados} ${alterados === 1 ? 'item alterado' : 'itens alterados'} de ${avaliados}`,
    tom: alterados === 0 ? 'ok' : alterados <= 3 ? 'wait' : 'warn',
  }
}

/** 0, 5, 10... até o máximo, sem repetir o último. */
function ticksAte(max: number): number[] {
  const t: number[] = []
  for (let v = 0; v <= max; v += 5) t.push(v)
  if (t[t.length - 1] !== max) t.push(max)
  return t
}

const indicadores: IndicadorProtocolo<MofDados>[] = [
  { id: 'alterados', rotulo: 'Itens alterados', unidade: '', yMax: TODOS_ITENS.length, yTicks: ticksAte(TODOS_ITENS.length), valor: d => (contarMof(d).avaliados > 0 ? contarMof(d).alterados : null) },
]

export const MODULO_MOF: ModuloProtocolo<MofDados> = {
  vazio: mofVazio,
  normalizar: normalizarMof,
  // só a observação não basta: precisa de pelo menos um item ou escolha
  pronto: d => {
    const n = normalizarMof(d)
    return Object.keys(n.itens).length > 0 || Object.keys(n.escolhas).length > 0
  },
  resumo,
  destaque,
  indicadores,
}
