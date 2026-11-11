// Banco de alimentos da Nutrição: catálogo (TACO carregada sob demanda + alimentos personalizados da clínica), busca,
// nutrientes por porção e lista de substituições equivalentes. Funções puras (exceto o carregador da TACO).

import type { GrupoAlimentar, LinhaTaco } from './taco'
import { arredondar } from './validacao'

export type { GrupoAlimentar } from './taco'

export interface Alimento {
  id: string
  nome: string
  grupo: GrupoAlimentar
  /** Valores por 100 g. */
  kcal: number
  proteina: number
  carboidrato: number
  lipidio: number
  fibra: number
  origem: 'taco' | 'personalizado'
}

/** Alimento criado pela clínica na tela (valores do rótulo ou de outra tabela), guardado dentro do próprio plano. */
export type AlimentoPersonalizado = Omit<Alimento, 'origem'>

export interface InfoGrupo {
  id: GrupoAlimentar
  rotulo: string
  /** Grupos do mesmo `pool` trocam entre si na lista de substituições. */
  pool: string
  /** Ordem na lista de compras. */
  ordem: number
}

export const GRUPOS: InfoGrupo[] = [
  { id: 'cereais',     rotulo: 'Cereais, pães e tubérculos',        pool: 'cereais',        ordem: 1 },
  { id: 'hortalicas',  rotulo: 'Verduras e legumes',                pool: 'hortalicas',     ordem: 2 },
  { id: 'frutas',      rotulo: 'Frutas',                            pool: 'frutas',         ordem: 3 },
  { id: 'carnes',      rotulo: 'Carnes e aves',                     pool: 'proteina',       ordem: 4 },
  { id: 'pescados',    rotulo: 'Peixes e frutos do mar',            pool: 'proteina',       ordem: 5 },
  { id: 'ovos',        rotulo: 'Ovos',                              pool: 'proteina',       ordem: 6 },
  { id: 'leites',      rotulo: 'Leites e derivados',                pool: 'leites',         ordem: 7 },
  { id: 'leguminosas', rotulo: 'Leguminosas e derivados de soja',   pool: 'leguminosas',    ordem: 8 },
  { id: 'oleaginosas', rotulo: 'Oleaginosas e sementes',            pool: 'oleaginosas',    ordem: 9 },
  { id: 'gorduras',    rotulo: 'Óleos, gorduras e molhos',          pool: 'gorduras',       ordem: 10 },
  { id: 'acucares',    rotulo: 'Açúcares e doces',                  pool: 'acucares',       ordem: 11 },
  { id: 'bebidas',     rotulo: 'Bebidas',                           pool: 'bebidas',        ordem: 12 },
  { id: 'preparados',  rotulo: 'Preparações e outros',              pool: 'preparados',     ordem: 13 },
]
export const GRUPO_INFO: Record<GrupoAlimentar, InfoGrupo> = Object.fromEntries(GRUPOS.map(g => [g.id, g])) as Record<GrupoAlimentar, InfoGrupo>

/** Converte uma linha da TACO em alimento. `null` da TACO (não informado) conta como 0. */
export function alimentoDaLinha([id, nome, grupo, kcal, p, c, l, f]: LinhaTaco): Alimento {
  return { id: `taco-${id}`, nome, grupo, kcal, proteina: p ?? 0, carboidrato: c ?? 0, lipidio: l ?? 0, fibra: f ?? 0, origem: 'taco' }
}

let tacoPromessa: Promise<Alimento[]> | null = null
let tacoPronta: Alimento[] | null = null

/**
 * Carrega o catálogo da TACO sob demanda (import dinâmico: os dados viram um chunk separado, fora do bundle inicial).
 * A promessa é guardada: chamadas seguintes reaproveitam o mesmo resultado. Se o carregamento falhar (rede), a
 * próxima chamada tenta de novo.
 */
export function carregarTaco(): Promise<Alimento[]> {
  if (!tacoPromessa) {
    tacoPromessa = import('./taco-dados').then(m => {
      tacoPronta = m.TACO_LINHAS.map(alimentoDaLinha)
      return tacoPronta
    }).catch(e => { tacoPromessa = null; throw e })
  }
  return tacoPromessa
}

/** A TACO já carregada, ou `null` se ainda não foi pedida (permite a primeira renderização já com dados). */
export function tacoCarregada(): Alimento[] | null {
  return tacoPronta
}

/** Personalizados da clínica vêm antes da TACO. `taco` é o resultado de `carregarTaco()`. */
export function catalogoCom(personalizados: AlimentoPersonalizado[] | undefined | null, taco: Alimento[]): Alimento[] {
  if (!personalizados || personalizados.length === 0) return taco
  return [...personalizados.map(a => ({ ...a, origem: 'personalizado' as const })), ...taco]
}

export function indexarCatalogo(lista: Alimento[]): Map<string, Alimento> {
  return new Map(lista.map(a => [a.id, a]))
}

// ── Medidas caseiras ─────────────────────────────────────────────────────────

export interface MedidaPadrao { rotulo: string; gramas: number }

/**
 * Unidades de peso praticamente padronizado. A TACO não publica medidas caseiras, então só entram aqui as poucas
 * unidades com peso de referência consagrado; são aproximadas (ovo e pão variam). Para qualquer outro alimento a
 * medida caseira é texto livre no item do plano ("2 colheres de sopa", "1 concha"), e quem manda é a gramagem.
 */
export const MEDIDAS_PADRAO: Record<string, MedidaPadrao[]> = {
  'taco-488': [{ rotulo: 'ovo médio (unidade)', gramas: 50 }],
  'taco-489': [{ rotulo: 'ovo médio (unidade)', gramas: 50 }],
  'taco-485': [{ rotulo: 'ovo de codorna (unidade)', gramas: 10 }],
  'taco-53':  [{ rotulo: 'pão francês (unidade)', gramas: 50 }],
  'taco-52':  [{ rotulo: 'fatia de pão de forma', gramas: 25 }],
  'taco-48':  [{ rotulo: 'fatia de pão de forma', gramas: 25 }],
}

// ── Nutrientes ───────────────────────────────────────────────────────────────

export interface Nutrientes { kcal: number; proteina: number; carboidrato: number; lipidio: number; fibra: number }

export const NUTRIENTES_ZERO: Nutrientes = { kcal: 0, proteina: 0, carboidrato: 0, lipidio: 0, fibra: 0 }

/** Nutrientes de `gramas` de um alimento (valores por 100 g). */
export function nutrientesDaPorcao(a: Pick<Alimento, 'kcal' | 'proteina' | 'carboidrato' | 'lipidio' | 'fibra'>, gramas: number): Nutrientes {
  const f = Math.max(0, gramas) / 100
  return { kcal: a.kcal * f, proteina: a.proteina * f, carboidrato: a.carboidrato * f, lipidio: a.lipidio * f, fibra: a.fibra * f }
}

export function somarNutrientes(lista: Nutrientes[]): Nutrientes {
  return lista.reduce((acc, n) => ({
    kcal: acc.kcal + n.kcal, proteina: acc.proteina + n.proteina, carboidrato: acc.carboidrato + n.carboidrato,
    lipidio: acc.lipidio + n.lipidio, fibra: acc.fibra + n.fibra,
  }), { ...NUTRIENTES_ZERO })
}

// ── Busca ────────────────────────────────────────────────────────────────────

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Sem acento, minúsculo e com hífen/barra como espaço: "grão-de-bico" e "grao de bico" se encontram. */
const paraBusca = (s: string) => semAcento(s).replace(/[-/]/g, ' ')

/**
 * Busca por todas as palavras digitadas (sem acento, em qualquer ordem). Ordem: nomes que começam pela busca vêm antes;
 * dentro de cada faixa, as versões cruas ficam depois das preparadas (o plano costuma levar o alimento pronto), a não
 * ser que a busca peça "cru"; depois, nome mais curto.
 */
export function buscarAlimentos(lista: Alimento[], consulta: string, limite = 40): Alimento[] {
  const termos = paraBusca(consulta).split(/[\s,]+/).filter(Boolean)
  if (termos.length === 0) return []
  const pedeCru = termos.some(t => t.startsWith('cru'))
  const achados: { a: Alimento; nota: number }[] = []
  for (const a of lista) {
    const nome = paraBusca(a.nome)
    if (!termos.every(t => nome.includes(t))) continue
    const cru = !pedeCru && /\bcrua?\b/.test(nome)
    achados.push({ a, nota: (nome.startsWith(termos[0]) ? 0 : 2) + (cru ? 1 : 0) })
  }
  achados.sort((x, y) => x.nota - y.nota || x.a.nome.length - y.a.nome.length || x.a.nome.localeCompare(y.a.nome, 'pt-BR'))
  return achados.slice(0, limite).map(x => x.a)
}

// ── Substituições equivalentes ───────────────────────────────────────────────

export interface Substituicao {
  alimento: Alimento
  gramas: number
  kcal: number
  proteina: number
  carboidrato: number
  lipidio: number
  /** Diferença de energia para o item original, em %. Sempre dentro da tolerância. */
  desvioPct: number
}

const PASSO_G = 5
const MAX_G = 600

function perfilMacros(a: Pick<Alimento, 'kcal' | 'proteina' | 'carboidrato' | 'lipidio'>): [number, number, number] {
  if (a.kcal <= 0) return [0, 0, 0]
  return [a.proteina * 4 / a.kcal, a.carboidrato * 4 / a.kcal, a.lipidio * 9 / a.kcal]
}

/**
 * Trocas equivalentes: outros alimentos do mesmo grupo de substituição (cereais com cereais, proteínas animais entre
 * si, frutas com frutas...) em quantidade que dá a MESMA energia do item original, arredondada de 5 em 5 g e mantida só
 * se ficar a no máximo `tolerancia` (10%) da energia original. Ordena por semelhança do perfil de macros (quem tem a
 * mesma "cara" de proteína/carboidrato/lipídio vem primeiro). Itens de até 15 kcal (folhas, temperos) não geram troca.
 */
export function substituicoesEquivalentes(
  original: Alimento, gramas: number, catalogo: Alimento[], opcoes: { tolerancia?: number; max?: number } = {},
): Substituicao[] {
  const { tolerancia = 0.1, max = 8 } = opcoes
  const alvo = nutrientesDaPorcao(original, gramas).kcal
  if (!(alvo > 15)) return []
  const pool = GRUPO_INFO[original.grupo].pool
  const base = perfilMacros(original)
  const saida: { sub: Substituicao; dist: number }[] = []
  for (const c of catalogo) {
    if (c.id === original.id || c.kcal <= 0 || GRUPO_INFO[c.grupo].pool !== pool) continue
    const exato = (alvo / c.kcal) * 100
    const g = Math.round(exato / PASSO_G) * PASSO_G
    if (g < PASSO_G || g > MAX_G) continue
    const n = nutrientesDaPorcao(c, g)
    const desvio = (n.kcal - alvo) / alvo
    if (Math.abs(desvio) > tolerancia) continue
    const p = perfilMacros(c)
    const dist = Math.hypot(p[0] - base[0], p[1] - base[1], p[2] - base[2])
    saida.push({
      dist,
      sub: {
        alimento: c, gramas: g, kcal: arredondar(n.kcal, 0), proteina: arredondar(n.proteina, 1),
        carboidrato: arredondar(n.carboidrato, 1), lipidio: arredondar(n.lipidio, 1), desvioPct: arredondar(desvio * 100, 1),
      },
    })
  }
  saida.sort((a, b) => a.dist - b.dist || a.sub.alimento.nome.localeCompare(b.sub.alimento.nome, 'pt-BR'))
  return saida.slice(0, max).map(x => x.sub)
}
