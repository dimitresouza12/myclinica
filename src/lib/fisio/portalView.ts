// O que a página pública do paciente (/p/[token]) mostra do programa de exercícios. Reduz as linhas do banco ao
// MÍNIMO: nada de ids de clínica, de profissional ou de exercício da biblioteca, caminhos do Storage ou notas internas.
// Funções puras.

import { rotuloRegiao, resumoDoItem, videoNormalizado, type Execucao } from './exercicios'

export interface LinhaPrescricaoPublica { id: string; title: string; notes: string | null }
export interface LinhaItemPublico {
  id: string
  prescricao_id: string
  name: string
  description: string | null
  region: string | null
  video_url: string | null
  image_path: string | null
  sets: number | null
  reps: string | null
  times_per_week: number
  notes: string | null
  sort_order: number
}

export interface ExercicioPublico {
  id: string
  name: string
  description: string | null
  region: string | null
  sets: number | null
  reps: string | null
  timesPerWeek: number
  notes: string | null
  /** endereço normalizado do YouTube/Vimeo, ou null */
  videoUrl: string | null
  /** URL assinada da foto (gerada no servidor, vale 1 hora), ou null */
  imageUrl: string | null
  doneToday: boolean
  doneLast7: number
}

export interface ProgramaPublico { id: string; title: string; notes: string | null; items: ExercicioPublico[] }
export interface ExerciciosPublicos { programs: ProgramaPublico[]; today: string }

export function shapeExercicios(args: {
  prescricoes: LinhaPrescricaoPublica[]
  itens: LinhaItemPublico[]
  execucoes: Execucao[]
  /** caminho do Storage -> URL assinada */
  imagens: ReadonlyMap<string, string>
  hoje: string
}): ExerciciosPublicos {
  const programs = args.prescricoes.map(p => ({
    id: p.id,
    title: p.title,
    notes: p.notes?.trim() || null,
    items: args.itens
      .filter(i => i.prescricao_id === p.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(i => {
        const r = resumoDoItem(i, args.execucoes, args.hoje)
        return {
          id: i.id,
          name: i.name,
          description: i.description?.trim() || null,
          region: rotuloRegiao(i.region) || null,
          sets: i.sets,
          reps: i.reps?.trim() || null,
          timesPerWeek: i.times_per_week,
          notes: i.notes?.trim() || null,
          videoUrl: videoNormalizado(i.video_url) ? i.video_url : null,
          imageUrl: (i.image_path && args.imagens.get(i.image_path)) || null,
          doneToday: r.feitoHoje,
          doneLast7: r.feitosNaSemana,
        }
      }),
  }))
  return { programs, today: args.hoje }
}
