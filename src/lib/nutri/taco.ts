// Tipos e metadados da TACO (Tabela Brasileira de Composição de Alimentos), 4ª edição revisada e ampliada,
// NEPA/UNICAMP, 2011. Os DADOS (591 dos 597 alimentos) ficam em `taco-dados.ts`, carregado sob demanda por
// `carregarTaco()` em alimentos.ts, para não entrar no bundle inicial. Este arquivo é leve e pode ser importado à vontade.
//
// A TACO NÃO traz medidas caseiras. Para cada alimento só há gramas; a medida caseira é texto livre no plano
// (ver MEDIDAS_PADRAO em alimentos.ts para as poucas unidades de peso padronizado).

export type GrupoAlimentar =
  | 'cereais' | 'hortalicas' | 'frutas' | 'gorduras' | 'pescados' | 'carnes' | 'ovos'
  | 'leites' | 'bebidas' | 'acucares' | 'leguminosas' | 'oleaginosas' | 'preparados'

export const TACO_FONTE = 'TACO 4ª edição revisada e ampliada (NEPA/UNICAMP, 2011)'

/** [id na TACO, nome, grupo, kcal, proteína g, carboidrato g, lipídio g, fibra g] por 100 g. */
export type LinhaTaco = [number, string, GrupoAlimentar, number, number | null, number | null, number | null, number | null]
