// Lista de porções equivalentes (substituições) do plano alimentar. Base PEQUENA e conservadora, própria do MyClinica:
// cada grupo define uma porção de referência em kcal (valor redondo, escolhido aqui) e uma lista curta de alimentos
// comuns da dieta brasileira, referenciados pelo código da TACO que já está no app. As gramas de cada alimento NÃO são
// digitadas: saem da TACO (energia por 100 g) para igualar a energia da porção. Nenhuma tabela de terceiros foi copiada.
//
// É uma ajuda para a trocar um alimento por outro de energia parecida e do mesmo tipo; não substitui o julgamento da
// nutricionista (macros e micronutrientes mudam entre alimentos do mesmo grupo). Funções puras.

import { MEDIDAS_PADRAO, indexarCatalogo, nutrientesDaPorcao, type Alimento } from './alimentos'
import { arredondar } from './validacao'

export interface GrupoPorcao {
  id: string
  rotulo: string
  /** Energia de uma porção do grupo, em kcal. */
  kcalPorcao: number
  /** Arredondamento das gramas (5 g para alimentos comuns; 1 g para óleos, manteiga e castanhas). */
  passoG: number
  /** Aviso curto mostrado junto da lista (preparo, o que muda entre os itens). */
  nota?: string
  /** Ids do catálogo (`taco-<código>`). Cada alimento está em um só grupo. */
  alimentoIds: string[]
}

export const GRUPOS_PORCAO: GrupoPorcao[] = [
  {
    id: 'cereais', rotulo: 'Cereais, pães e tubérculos', kcalPorcao: 150, passoG: 5,
    nota: 'Preparados como descrito no nome (cozidos, assados). Integrais trazem mais fibra com a mesma energia.',
    alimentoIds: ['taco-3', 'taco-1', 'taco-53', 'taco-52', 'taco-62', 'taco-91', 'taco-88', 'taco-129', 'taco-533'],
  },
  {
    id: 'frutas', rotulo: 'Frutas', kcalPorcao: 70, passoG: 5,
    nota: 'Gramas da parte comestível, sem casca nem caroço quando for o caso.',
    alimentoIds: ['taco-182', 'taco-222', 'taco-214', 'taco-226', 'taco-235', 'taco-256', 'taco-231', 'taco-251', 'taco-164'],
  },
  {
    id: 'hortalicas', rotulo: 'Verduras e legumes', kcalPorcao: 25, passoG: 5,
    nota: 'Porção de energia baixa: costuma ser servida em quantidade livre dentro do plano.',
    alimentoIds: ['taco-109', 'taco-100', 'taco-112', 'taco-70', 'taco-97', 'taco-118', 'taco-95', 'taco-161'],
  },
  {
    id: 'leguminosas', rotulo: 'Feijões, lentilha e tofu', kcalPorcao: 80, passoG: 5,
    alimentoIds: ['taco-561', 'taco-567', 'taco-577', 'taco-584'],
  },
  {
    id: 'carnes', rotulo: 'Carnes, peixes e ovos', kcalPorcao: 100, passoG: 5,
    nota: 'Cozidos, grelhados ou assados, sem gordura adicional. Gordura e proteína variam entre os cortes.',
    alimentoIds: ['taco-410', 'taco-408', 'taco-377', 'taco-432', 'taco-425', 'taco-301', 'taco-318', 'taco-278', 'taco-488'],
  },
  {
    id: 'iogurtes', rotulo: 'Iogurtes e leite fermentado', kcalPorcao: 120, passoG: 5,
    alimentoIds: ['taco-448', 'taco-449', 'taco-460'],
  },
  {
    id: 'queijos', rotulo: 'Queijos', kcalPorcao: 120, passoG: 5,
    nota: 'Queijos curados e salgados têm mais sódio que o frescal e a ricota.',
    alimentoIds: ['taco-461', 'taco-462', 'taco-463', 'taco-467', 'taco-469'],
  },
  {
    id: 'gorduras', rotulo: 'Óleos, azeite e manteiga', kcalPorcao: 45, passoG: 1,
    alimentoIds: ['taco-260', 'taco-272', 'taco-262', 'taco-264'],
  },
  {
    id: 'oleaginosas', rotulo: 'Castanhas, amendoim e sementes', kcalPorcao: 80, passoG: 1,
    alimentoIds: ['taco-589', 'taco-557', 'taco-588', 'taco-594'],
  },
]

const GRUPO_DO_ALIMENTO: Map<string, GrupoPorcao> = new Map(
  GRUPOS_PORCAO.flatMap(g => g.alimentoIds.map(id => [id, g] as const)),
)

/** Grupo de porção ao qual o alimento pertence, ou `null` se ele não está na lista curada. */
export function grupoPorcaoDoAlimento(alimentoId: string): GrupoPorcao | null {
  return GRUPO_DO_ALIMENTO.get(alimentoId) ?? null
}

/** Gramas do alimento que dão `kcalAlvo`, arredondadas ao passo do grupo (nunca menos que um passo). */
export function gramasParaEnergia(alimento: Pick<Alimento, 'kcal'>, kcalAlvo: number, passoG: number): number {
  if (!(alimento.kcal > 0) || !(kcalAlvo > 0)) return 0
  const exato = (kcalAlvo / alimento.kcal) * 100
  return Math.max(passoG, Math.round(exato / passoG) * passoG)
}

/**
 * Medida caseira aproximada, só para os alimentos com unidade de peso padronizado (MEDIDAS_PADRAO: ovo, pão).
 * Aceita meias unidades; se as gramas se afastam mais de 10% da unidade mais próxima, não sugere medida.
 */
export function medidaAproximada(alimentoId: string, gramas: number): string | null {
  const m = MEDIDAS_PADRAO[alimentoId]?.[0]
  if (!m || !(gramas > 0)) return null
  const n = Math.round((gramas / m.gramas) * 2) / 2
  if (n < 0.5 || Math.abs(n * m.gramas - gramas) / gramas > 0.1) return null
  return `aprox. ${String(n).replace('.', ',')} x ${m.rotulo}`
}

export interface ItemPorcao {
  alimento: Alimento
  gramas: number
  kcal: number
  proteina: number
  carboidrato: number
  lipidio: number
  medida: string | null
}

function itemPorcao(alimento: Alimento, kcalAlvo: number, passoG: number): ItemPorcao {
  const gramas = gramasParaEnergia(alimento, kcalAlvo, passoG)
  const n = nutrientesDaPorcao(alimento, gramas)
  return {
    alimento, gramas, kcal: arredondar(n.kcal, 0), proteina: arredondar(n.proteina, 1),
    carboidrato: arredondar(n.carboidrato, 1), lipidio: arredondar(n.lipidio, 1),
    medida: medidaAproximada(alimento.id, gramas),
  }
}

/** Uma linha por alimento do grupo, em quantidade de `porcoes` porções (padrão 1). Alimento fora do catálogo é ignorado. */
export function listaDoGrupo(grupo: GrupoPorcao, catalogo: Alimento[], porcoes = 1): ItemPorcao[] {
  const idx = indexarCatalogo(catalogo)
  const alvo = grupo.kcalPorcao * porcoes
  return grupo.alimentoIds.flatMap(id => {
    const a = idx.get(id)
    return a ? [itemPorcao(a, alvo, grupo.passoG)] : []
  })
}

export interface EquivalentesPorcao {
  grupo: GrupoPorcao
  /** Quantas porções do grupo o item original representa (energia do item / energia da porção). */
  porcoes: number
  kcalOriginal: number
  /** Os outros alimentos do grupo, em gramas que igualam a energia do item original. */
  itens: ItemPorcao[]
}

/**
 * Trocas pela lista de porções para um item do plano. Devolve `null` quando o alimento não está na lista curada
 * (a tela segue oferecendo as trocas por energia de `substituicoesEquivalentes`) ou quando a energia é zero.
 * Cada troca mantém a MESMA energia do item original, arredondada ao passo do grupo.
 */
export function equivalentesDoItem(original: Alimento, gramas: number, catalogo: Alimento[]): EquivalentesPorcao | null {
  const grupo = grupoPorcaoDoAlimento(original.id)
  if (!grupo) return null
  const kcal = nutrientesDaPorcao(original, gramas).kcal
  if (!(kcal > 0)) return null
  const idx = indexarCatalogo(catalogo)
  const itens = grupo.alimentoIds.flatMap(id => {
    const a = id === original.id ? undefined : idx.get(id)
    return a ? [itemPorcao(a, kcal, grupo.passoG)] : []
  })
  return { grupo, porcoes: arredondar(kcal / grupo.kcalPorcao, 2), kcalOriginal: arredondar(kcal, 0), itens }
}

/** "1 porção", "1,5 porção", "2 porções". */
export function textoPorcoes(n: number): string {
  const t = String(arredondar(n, 2)).replace('.', ',')
  return `${t} ${n > 1 ? 'porções' : 'porção'}`
}
