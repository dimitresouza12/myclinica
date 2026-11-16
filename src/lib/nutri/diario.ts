// Diário alimentar do paciente (Nutrição): o paciente registra o que comeu na página /p/[token] (escopo 'diario') e a
// nutricionista vê na ficha. Aqui ficam só as partes puras: tipos, validação do registro, conferência da foto pelos
// primeiros bytes, caminho no Storage e agrupamento por dia. Tabela: public.nutri_diario
// (supabase/migrations/20261134_nutri_substituicoes_receitas_diario.sql).

import { somarDias } from '@/lib/vet/datas'

export const REFEICOES_DIARIO = [
  { id: 'cafe_manha', rotulo: 'Café da manhã' },
  { id: 'lanche_manha', rotulo: 'Lanche da manhã' },
  { id: 'almoco', rotulo: 'Almoço' },
  { id: 'lanche_tarde', rotulo: 'Lanche da tarde' },
  { id: 'jantar', rotulo: 'Jantar' },
  { id: 'ceia', rotulo: 'Ceia' },
  { id: 'outro', rotulo: 'Outra refeição' },
] as const

export type RefeicaoDiario = (typeof REFEICOES_DIARIO)[number]['id']

export const LIMITES_DIARIO = {
  descricao: 1000,
  /** Registros por paciente por dia (evita encher a tabela por engano ou abuso). */
  porDia: 20,
  /** Foto já comprimida no navegador (alvo de 200 KB, teto de 600 KB); o servidor aceita até este tamanho. */
  fotoBytes: 1_500_000,
} as const

export const BUCKET_DIARIO = 'pacientes'
export const PASTA_DIARIO = 'diario'

export function isRefeicaoDiario(v: unknown): v is RefeicaoDiario {
  return typeof v === 'string' && REFEICOES_DIARIO.some(r => r.id === v)
}

export function rotuloRefeicao(id: string): string {
  return REFEICOES_DIARIO.find(r => r.id === id)?.rotulo ?? 'Refeição'
}

/** "07:30" (24 h). */
export function horarioValido(v: unknown): v is string {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
}

export interface RegistroValidado {
  dia: string
  refeicao: RefeicaoDiario
  horario: string | null
  descricao: string
}

export type ResultadoRegistro = { ok: true; dados: RegistroValidado } | { ok: false; erro: string }

/**
 * Valida o envio do paciente. O dia só pode ser hoje ou ontem (o paciente lembra da refeição de ontem à noite, mas o
 * histórico não é preenchido para trás). `hoje` vem do servidor (fuso de Brasília), nunca do navegador.
 */
export function validarRegistroDiario(input: { refeicao: unknown; horario: unknown; descricao: unknown; dia: unknown }, hoje: string): ResultadoRegistro {
  if (!isRefeicaoDiario(input.refeicao)) return { ok: false, erro: 'Escolha a refeição.' }
  const descricao = typeof input.descricao === 'string' ? input.descricao.replace(/\r\n/g, '\n').trim() : ''
  if (!descricao) return { ok: false, erro: 'Descreva o que você comeu.' }
  if (descricao.length > LIMITES_DIARIO.descricao) return { ok: false, erro: `A descrição pode ter até ${LIMITES_DIARIO.descricao} caracteres.` }
  if (input.horario !== undefined && input.horario !== null && typeof input.horario !== 'string') return { ok: false, erro: 'Horário inválido. Use o formato 07:30.' }
  const horarioBruto = typeof input.horario === 'string' ? input.horario.trim() : ''
  if (horarioBruto !== '' && !horarioValido(horarioBruto)) return { ok: false, erro: 'Horário inválido. Use o formato 07:30.' }
  const ontem = somarDias(hoje, -1)
  const dia = input.dia === undefined || input.dia === null || input.dia === '' ? hoje : input.dia
  if (typeof dia !== 'string' || (dia !== hoje && dia !== ontem)) return { ok: false, erro: 'Só é possível registrar refeições de hoje ou de ontem.' }
  return { ok: true, dados: { dia, refeicao: input.refeicao, horario: horarioBruto || null, descricao } }
}

// ── Foto ────────────────────────────────────────────────────────────────────

export type MimeFoto = 'image/jpeg' | 'image/png' | 'image/webp'

/** Tipo da imagem pelos primeiros bytes (não confia no nome nem no tipo declarado). `null` se não for JPEG, PNG ou WebP. */
export function detectarImagem(head: Uint8Array): MimeFoto | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) return 'image/png'
  if (head.length >= 12 && String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

const EXTENSAO: Record<MimeFoto, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function caminhoDaFotoDiario(clinicId: string, patientId: string, mime: MimeFoto, agora = Date.now(), rand = Math.random().toString(36).slice(2, 10)): string {
  const r = rand.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'x'
  return `${PASTA_DIARIO}/${clinicId}/${patientId}/${agora}-${r}.${EXTENSAO[mime]}`
}

/** true quando o caminho está na pasta da clínica E do paciente (nunca assinar caminho de outro). */
export function fotoDoDiarioValida(path: string | null | undefined, clinicId: string, patientId: string): path is string {
  return !!path && path.startsWith(`${PASTA_DIARIO}/${clinicId}/${patientId}/`) && !path.includes('..') && path.length <= 300
}

// ── Leitura ─────────────────────────────────────────────────────────────────

/** Linha de nutri_diario como a ficha da nutricionista usa. */
export interface RegistroDiario {
  id: string
  dia: string
  refeicao: string
  horario: string | null
  descricao: string
  foto_path: string | null
  created_at: string
}

export interface DiaDoDiario { dia: string; registros: RegistroDiario[] }

/** Dias do mais recente para o mais antigo; dentro do dia, por horário (quem não tem horário vem depois) e criação. */
export function agruparPorDia(registros: RegistroDiario[]): DiaDoDiario[] {
  const mapa = new Map<string, RegistroDiario[]>()
  for (const r of registros) {
    const l = mapa.get(r.dia) ?? []
    l.push(r)
    mapa.set(r.dia, l)
  }
  return [...mapa.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dia, lista]) => ({
      dia,
      registros: lista.sort((x, y) => {
        const hx = x.horario ?? '99:99'
        const hy = y.horario ?? '99:99'
        return hx.localeCompare(hy) || x.created_at.localeCompare(y.created_at)
      }),
    }))
}

/** Dias em que houve ao menos um registro, dentro dos últimos `dias` dias até `hoje` (inclusive). */
export function diasComRegistro(registros: RegistroDiario[], hoje: string, dias = 7): number {
  const desde = somarDias(hoje, -(dias - 1)) ?? hoje
  return new Set(registros.filter(r => r.dia >= desde && r.dia <= hoje).map(r => r.dia)).size
}

// ── Visão pública (página do paciente) ──────────────────────────────────────

export interface LinhaDiarioPublica {
  id: string
  dia: string
  refeicao: string
  horario: string | null
  descricao: string
  foto_path: string | null
  created_at: string
}

/** O que a página do paciente recebe de cada registro: sem ids de clínica ou paciente nem caminho do Storage. */
export interface RegistroPublico {
  id: string
  dia: string
  refeicao: RefeicaoDiario
  horario: string | null
  descricao: string
  /** URL assinada da foto (gerada no servidor, vale 1 hora), ou null. */
  fotoUrl: string | null
  /** Só os registros de hoje e de ontem podem ser apagados pelo paciente. */
  podeApagar: boolean
}

export interface DiarioPublico { today: string; entries: RegistroPublico[] }

export function shapeDiario(args: { linhas: LinhaDiarioPublica[]; imagens: ReadonlyMap<string, string>; hoje: string }): DiarioPublico {
  const ontem = somarDias(args.hoje, -1)
  return {
    today: args.hoje,
    entries: args.linhas.map(l => ({
      id: l.id,
      dia: l.dia,
      refeicao: isRefeicaoDiario(l.refeicao) ? l.refeicao : 'outro',
      horario: l.horario,
      descricao: l.descricao,
      fotoUrl: (l.foto_path && args.imagens.get(l.foto_path)) || null,
      podeApagar: l.dia === args.hoje || l.dia === ontem,
    })),
  }
}
