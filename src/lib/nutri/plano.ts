// Plano alimentar: tipos guardados em nutri_avaliacoes.dados (tipo 'plano'), totais por refeição e por dia,
// progresso contra a meta e lista de compras. Funções puras.

import {
  GRUPO_INFO, NUTRIENTES_ZERO, indexarCatalogo, nutrientesDaPorcao, somarNutrientes,
  type Alimento, type AlimentoPersonalizado, type GrupoAlimentar, type Nutrientes,
} from './alimentos'
import { arredondar } from './validacao'

export interface ItemPlano {
  id: string
  alimentoId: string
  gramas: number
  /** Texto livre: "2 colheres de sopa", "1 concha". Só informativo; a gramagem é quem calcula. */
  medida?: string
}

export interface Refeicao {
  id: string
  nome: string
  /** "07:30" ou vazio. */
  horario: string
  itens: ItemPlano[]
  obs?: string
}

export interface MetaDiaria { kcal: number | null; proteinaG: number | null; carboidratoG: number | null; lipidioG: number | null }

export interface PlanoDados {
  v: 1
  titulo: string
  meta: MetaDiaria
  refeicoes: Refeicao[]
  personalizados: AlimentoPersonalizado[]
  observacoes?: string
}

export const REFEICOES_PADRAO = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia']

export const META_VAZIA: MetaDiaria = { kcal: null, proteinaG: null, carboidratoG: null, lipidioG: null }

export function novoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function planoVazio(titulo = 'Plano alimentar'): PlanoDados {
  return {
    v: 1, titulo, meta: { ...META_VAZIA }, personalizados: [],
    refeicoes: REFEICOES_PADRAO.slice(0, 5).map(nome => ({ id: novoId(), nome, horario: '', itens: [] })),
  }
}

/** Lê o JSON salvo e devolve um plano utilizável mesmo se faltar campo (versão antiga ou dado corrompido). */
export function normalizarPlano(raw: unknown): PlanoDados {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<PlanoDados>
  const meta = (r.meta && typeof r.meta === 'object' ? r.meta : {}) as Partial<MetaDiaria>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  return {
    v: 1,
    titulo: typeof r.titulo === 'string' && r.titulo.trim() ? r.titulo : 'Plano alimentar',
    meta: { kcal: n(meta.kcal), proteinaG: n(meta.proteinaG), carboidratoG: n(meta.carboidratoG), lipidioG: n(meta.lipidioG) },
    personalizados: Array.isArray(r.personalizados) ? r.personalizados.filter(a => a && typeof a.id === 'string' && typeof a.nome === 'string') : [],
    refeicoes: Array.isArray(r.refeicoes)
      ? r.refeicoes.filter(x => x && typeof x.id === 'string').map(x => ({
          id: x.id, nome: String(x.nome ?? ''), horario: String(x.horario ?? ''), obs: x.obs ? String(x.obs) : undefined,
          itens: Array.isArray(x.itens) ? x.itens.filter(i => i && typeof i.id === 'string' && typeof i.alimentoId === 'string' && Number.isFinite(i.gramas)) : [],
        }))
      : [],
    observacoes: typeof r.observacoes === 'string' ? r.observacoes : undefined,
  }
}

export interface TotaisRefeicao { refeicao: Refeicao; total: Nutrientes; itens: { item: ItemPlano; alimento: Alimento | null; nutrientes: Nutrientes }[] }

/** Totais por refeição e do dia. Item cujo alimento sumiu do catálogo conta zero (e vem com `alimento: null`). */
export function totaisDoPlano(plano: PlanoDados, catalogo: Alimento[]): { refeicoes: TotaisRefeicao[]; dia: Nutrientes } {
  const idx = indexarCatalogo(catalogo)
  const refeicoes = plano.refeicoes.map(refeicao => {
    const itens = refeicao.itens.map(item => {
      const alimento = idx.get(item.alimentoId) ?? null
      return { item, alimento, nutrientes: alimento ? nutrientesDaPorcao(alimento, item.gramas) : { ...NUTRIENTES_ZERO } }
    })
    return { refeicao, itens, total: somarNutrientes(itens.map(i => i.nutrientes)) }
  })
  return { refeicoes, dia: somarNutrientes(refeicoes.map(r => r.total)) }
}

export interface Progresso {
  chave: 'kcal' | 'proteina' | 'carboidrato' | 'lipidio'
  rotulo: string
  un: string
  atual: number
  meta: number | null
  /** 0 a 1+ (passa de 1 quando estoura a meta); null sem meta. */
  fracao: number | null
  /** 'abaixo' (< 90%), 'ok' (90 a 110%), 'acima' (> 110%); null sem meta. */
  situacao: 'abaixo' | 'ok' | 'acima' | null
}

/** Progresso do dia contra a meta: ok entre 90% e 110%. */
export function progressoDoDia(dia: Nutrientes, meta: MetaDiaria): Progresso[] {
  const linhas: [Progresso['chave'], string, string, number, number | null][] = [
    ['kcal', 'Energia', 'kcal', dia.kcal, meta.kcal],
    ['proteina', 'Proteína', 'g', dia.proteina, meta.proteinaG],
    ['carboidrato', 'Carboidrato', 'g', dia.carboidrato, meta.carboidratoG],
    ['lipidio', 'Lipídio', 'g', dia.lipidio, meta.lipidioG],
  ]
  return linhas.map(([chave, rotulo, un, atual, m]) => {
    const fracao = m && m > 0 ? atual / m : null
    return {
      chave, rotulo, un, atual: arredondar(atual, 1), meta: m, fracao,
      situacao: fracao === null ? null : fracao < 0.9 ? 'abaixo' : fracao <= 1.1 ? 'ok' : 'acima',
    }
  })
}

// ── Lista de compras ─────────────────────────────────────────────────────────

export interface ItemCompra { alimento: Alimento; gramasPorDia: number; gramasTotal: number }
export interface GrupoCompra { grupo: GrupoAlimentar; rotulo: string; itens: ItemCompra[] }

/**
 * Soma cada alimento do plano e multiplica por `dias` (7 = semana). As quantidades são as do plano, no preparo
 * prescrito (ex.: arroz cozido); a tela e o impresso avisam que cru/com casca exige margem.
 */
export function listaDeCompras(plano: PlanoDados, catalogo: Alimento[], dias = 7): GrupoCompra[] {
  const idx = indexarCatalogo(catalogo)
  const soma = new Map<string, number>()
  for (const r of plano.refeicoes) for (const i of r.itens) soma.set(i.alimentoId, (soma.get(i.alimentoId) ?? 0) + i.gramas)
  const porGrupo = new Map<GrupoAlimentar, ItemCompra[]>()
  for (const [id, g] of soma) {
    const alimento = idx.get(id)
    if (!alimento || g <= 0) continue
    const lista = porGrupo.get(alimento.grupo) ?? []
    lista.push({ alimento, gramasPorDia: g, gramasTotal: g * dias })
    porGrupo.set(alimento.grupo, lista)
  }
  return [...porGrupo.entries()]
    .sort((a, b) => GRUPO_INFO[a[0]].ordem - GRUPO_INFO[b[0]].ordem)
    .map(([grupo, itens]) => ({
      grupo, rotulo: GRUPO_INFO[grupo].rotulo,
      itens: itens.sort((x, y) => x.alimento.nome.localeCompare(y.alimento.nome, 'pt-BR')),
    }))
}

/** 1500 -> "1,5 kg"; 350 -> "350 g". */
export function formatarPeso(gramas: number): string {
  if (gramas >= 1000) return `${arredondar(gramas / 1000, 2).toLocaleString('pt-BR')} kg`
  return `${arredondar(gramas, 0).toLocaleString('pt-BR')} g`
}
