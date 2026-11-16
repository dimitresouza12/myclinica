// Biblioteca de exercícios e prescrição de fisioterapia: tipos, validação, leitura de link de vídeo e adesão
// do paciente. Funções puras (sem rede), testadas em exercicios.test.ts.

import { diasEntre, isoValido, somarDias } from '@/lib/vet/datas'
import { lerNumero } from '@/lib/vet/numeros'

// ── Regiões do corpo ────────────────────────────────────────────────────────
export const REGIOES = [
  { value: 'cervical', label: 'Cervical' },
  { value: 'ombro', label: 'Ombro' },
  { value: 'cotovelo_punho', label: 'Cotovelo, punho e mão' },
  { value: 'toracica', label: 'Coluna torácica' },
  { value: 'lombar', label: 'Coluna lombar' },
  { value: 'quadril', label: 'Quadril' },
  { value: 'joelho', label: 'Joelho' },
  { value: 'tornozelo_pe', label: 'Tornozelo e pé' },
  { value: 'core', label: 'Core e estabilização' },
  { value: 'membros_superiores', label: 'Membros superiores' },
  { value: 'membros_inferiores', label: 'Membros inferiores' },
  { value: 'equilibrio', label: 'Equilíbrio e marcha' },
  { value: 'respiratorio', label: 'Respiratório' },
  { value: 'corpo_todo', label: 'Corpo todo' },
] as const

export function rotuloRegiao(value: string | null | undefined): string {
  if (!value) return ''
  return REGIOES.find(r => r.value === value)?.label ?? value
}

// ── Limites (espelham os CHECK da migration) ────────────────────────────────
export const MAX_NOME = 120
export const MAX_DESCRICAO = 2000
export const MAX_REPS = 40
export const MAX_NOTA_ITEM = 500
export const MAX_TITULO = 120
export const MAX_ORIENTACOES = 2000
export const MAX_SERIES = 20
export const MAX_ITENS_PROGRAMA = 40

/** Pasta do Storage (bucket `pacientes`): exercicios/<clinica>/<exercicio>/<arquivo>. A 2ª pasta é a clínica. */
export const PASTA_FOTOS = 'exercicios'
export const BUCKET_FOTOS = 'pacientes'

export function caminhoDaFoto(clinicId: string, exercicioId: string, mime: string, agora = Date.now(), rand = Math.random().toString(36).slice(2, 8)): string {
  const ext = mime === 'image/webp' ? 'webp' : 'jpg'
  const r = rand.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'x'
  return `${PASTA_FOTOS}/${clinicId}/${exercicioId}/${agora}-${r}.${ext}`
}

/** true quando o caminho da foto está na pasta da própria clínica (nunca assinar caminho de outra). */
export function fotoDaClinica(path: string | null | undefined, clinicId: string): path is string {
  return !!path && path.startsWith(`${PASTA_FOTOS}/${clinicId}/`) && !path.includes('..') && path.length <= 300
}

// ── Vídeo (YouTube ou Vimeo) ────────────────────────────────────────────────
export interface Video {
  provedor: 'youtube' | 'vimeo'
  id: string
  /** Endereço normalizado: é o que vai para o banco e para o botão "Assistir". */
  url: string
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^\d{1,12}$/
const VIMEO_HASH = /^[0-9a-f]{6,20}$/

/**
 * Lê um link de vídeo colado em qualquer formato comum (watch, youtu.be, shorts, embed, vimeo.com, player.vimeo.com)
 * e devolve o endereço normalizado. Só YouTube e Vimeo: qualquer outro endereço (ou texto que não é link) volta null.
 */
export function lerVideo(entrada: unknown): Video | null {
  if (typeof entrada !== 'string') return null
  let texto = entrada.trim()
  if (!texto || texto.length > 300) return null
  if (!/^https?:\/\//i.test(texto)) texto = `https://${texto}`
  let u: URL
  try { u = new URL(texto) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password) return null
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '')
  const partes = u.pathname.split('/').filter(Boolean)

  if (host === 'youtu.be') {
    const id = partes[0]
    return id && YT_ID.test(id) ? { provedor: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` } : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    let id: string | undefined
    if (partes[0] === 'watch') id = u.searchParams.get('v') ?? undefined
    else if (['shorts', 'embed', 'live', 'v'].includes(partes[0] ?? '')) id = partes[1]
    return id && YT_ID.test(id) ? { provedor: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` } : null
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    // vimeo.com/123456789, vimeo.com/123456789/abcdef0123 (não listado), vimeo.com/channels/x/123456789, player.vimeo.com/video/123456789?h=abcdef0123
    const i = partes.findIndex(p => VIMEO_ID.test(p))
    if (i < 0) return null
    const id = partes[i]
    const hash = [partes[i + 1], u.searchParams.get('h')].find(h => !!h && VIMEO_HASH.test(h))
    return { provedor: 'vimeo', id, url: `https://vimeo.com/${id}${hash ? `/${hash}` : ''}` }
  }
  return null
}

/** Mesmo teste do CHECK do banco: só o endereço já normalizado passa. */
export function videoNormalizado(url: unknown): url is string {
  return typeof url === 'string' && /^https:\/\/(www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}|vimeo\.com\/[0-9]{1,12}(\/[0-9a-f]{6,20})?)$/.test(url)
}

export const ROTULO_VIDEO: Record<Video['provedor'], string> = { youtube: 'YouTube', vimeo: 'Vimeo' }

// ── Biblioteca ──────────────────────────────────────────────────────────────
export interface Exercicio {
  id: string
  name: string
  description: string | null
  region: string | null
  default_sets: number | null
  default_reps: string | null
  video_url: string | null
  image_path: string | null
  active: boolean
  created_at: string
}

export interface RascunhoExercicio {
  name: string
  description: string
  region: string
  sets: string
  reps: string
  videoUrl: string
}

export const exercicioVazio = (): RascunhoExercicio => ({ name: '', description: '', region: '', sets: '', reps: '', videoUrl: '' })

export function rascunhoDoExercicio(e: Exercicio): RascunhoExercicio {
  return {
    name: e.name, description: e.description ?? '', region: e.region ?? '', sets: e.default_sets ? String(e.default_sets) : '',
    reps: e.default_reps ?? '', videoUrl: e.video_url ?? '',
  }
}

/** Inteiro de 1 a `max` digitado; vazio vale null (sem erro). Texto, decimal ou fora da faixa: erro. */
export function lerInteiro(v: string, max: number): { valor: number | null; erro: boolean } {
  const t = v.trim()
  if (!t) return { valor: null, erro: false }
  const n = lerNumero(t)
  if (n === null || !Number.isInteger(n) || n < 1 || n > max) return { valor: null, erro: true }
  return { valor: n, erro: false }
}

export interface DadosExercicio {
  name: string
  description: string | null
  region: string | null
  default_sets: number | null
  default_reps: string | null
  video_url: string | null
}

const vazioNulo = (v: string) => (v.trim() ? v.trim() : null)

export function validarExercicio(r: RascunhoExercicio): { ok: true; dados: DadosExercicio } | { ok: false; erros: string[] } {
  const erros: string[] = []
  const nome = r.name.trim()
  if (!nome) erros.push('Dê um nome ao exercício.')
  else if (nome.length > MAX_NOME) erros.push(`O nome passa de ${MAX_NOME} caracteres.`)
  if (r.description.trim().length > MAX_DESCRICAO) erros.push(`A descrição passa de ${MAX_DESCRICAO} caracteres.`)
  const series = lerInteiro(r.sets, MAX_SERIES)
  if (series.erro) erros.push(`Séries: informe um número inteiro de 1 a ${MAX_SERIES}.`)
  if (r.reps.trim().length > MAX_REPS) erros.push(`Repetições passam de ${MAX_REPS} caracteres.`)
  let video: string | null = null
  if (r.videoUrl.trim()) {
    const v = lerVideo(r.videoUrl)
    if (!v) erros.push('O link do vídeo precisa ser do YouTube ou do Vimeo.')
    else video = v.url
  }
  if (erros.length) return { ok: false, erros }
  return {
    ok: true,
    dados: {
      name: nome, description: vazioNulo(r.description), region: vazioNulo(r.region), default_sets: series.valor,
      default_reps: vazioNulo(r.reps), video_url: video,
    },
  }
}

/** Filtro da biblioteca: busca por nome/descrição (sem acento) e região. */
export function filtrarExercicios(lista: Exercicio[], busca: string, regiao: string): Exercicio[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(busca.trim())
  return lista.filter(e => (!regiao || e.region === regiao) && (!q || norm(`${e.name} ${e.description ?? ''}`).includes(q)))
}

// ── Prescrição ──────────────────────────────────────────────────────────────
export interface Prescricao {
  id: string
  title: string
  notes: string | null
  status: 'ativa' | 'encerrada'
  started_on: string
  ended_on: string | null
  professional_id: string | null
  created_at: string
}

export interface ItemPrescricao {
  id: string
  prescricao_id: string
  exercicio_id: string | null
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

/** Item como é editado na tela: números ainda em texto, `id` já definido (novo item recebe um id do navegador). */
export interface ItemRascunho {
  id: string
  exercicioId: string | null
  name: string
  description: string
  region: string
  videoUrl: string
  imagePath: string | null
  sets: string
  reps: string
  timesPerWeek: string
  notes: string
}

export function itemDoExercicio(e: Exercicio, id: string): ItemRascunho {
  return {
    id, exercicioId: e.id, name: e.name, description: e.description ?? '', region: e.region ?? '', videoUrl: e.video_url ?? '',
    imagePath: e.image_path, sets: e.default_sets ? String(e.default_sets) : '', reps: e.default_reps ?? '', timesPerWeek: '7', notes: '',
  }
}

export function itemDoBanco(i: ItemPrescricao): ItemRascunho {
  return {
    id: i.id, exercicioId: i.exercicio_id, name: i.name, description: i.description ?? '', region: i.region ?? '', videoUrl: i.video_url ?? '',
    imagePath: i.image_path, sets: i.sets ? String(i.sets) : '', reps: i.reps ?? '', timesPerWeek: String(i.times_per_week), notes: i.notes ?? '',
  }
}

export interface DadosItem {
  id: string
  exercicio_id: string | null
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

export interface RascunhoPrescricao { titulo: string; orientacoes: string; itens: ItemRascunho[] }

export function validarPrescricao(r: RascunhoPrescricao): { ok: true; titulo: string; orientacoes: string | null; itens: DadosItem[] } | { ok: false; erros: string[] } {
  const erros: string[] = []
  const titulo = r.titulo.trim()
  if (!titulo) erros.push('Dê um título ao programa.')
  else if (titulo.length > MAX_TITULO) erros.push(`O título passa de ${MAX_TITULO} caracteres.`)
  if (r.orientacoes.trim().length > MAX_ORIENTACOES) erros.push(`As orientações passam de ${MAX_ORIENTACOES} caracteres.`)
  if (r.itens.length === 0) erros.push('Inclua ao menos um exercício no programa.')
  if (r.itens.length > MAX_ITENS_PROGRAMA) erros.push(`O programa aceita até ${MAX_ITENS_PROGRAMA} exercícios.`)

  const itens: DadosItem[] = []
  r.itens.forEach((it, idx) => {
    const n = idx + 1
    const nome = it.name.trim()
    if (!nome) { erros.push(`Exercício ${n}: sem nome.`); return }
    const series = lerInteiro(it.sets, MAX_SERIES)
    if (series.erro) erros.push(`${nome}: séries de 1 a ${MAX_SERIES}.`)
    const dias = lerInteiro(it.timesPerWeek, 7)
    if (dias.erro || dias.valor === null) erros.push(`${nome}: dias por semana de 1 a 7.`)
    if (it.reps.trim().length > MAX_REPS) erros.push(`${nome}: repetições passam de ${MAX_REPS} caracteres.`)
    if (it.notes.trim().length > MAX_NOTA_ITEM) erros.push(`${nome}: a observação passa de ${MAX_NOTA_ITEM} caracteres.`)
    let video: string | null = null
    if (it.videoUrl.trim()) {
      const v = lerVideo(it.videoUrl)
      if (!v) erros.push(`${nome}: o vídeo precisa ser do YouTube ou do Vimeo.`)
      else video = v.url
    }
    itens.push({
      id: it.id, exercicio_id: it.exercicioId, name: nome, description: vazioNulo(it.description), region: vazioNulo(it.region), video_url: video,
      image_path: it.imagePath, sets: series.valor, reps: vazioNulo(it.reps), times_per_week: dias.valor ?? 7, notes: vazioNulo(it.notes), sort_order: idx,
    })
  })
  if (erros.length) return { ok: false, erros }
  return { ok: true, titulo, orientacoes: vazioNulo(r.orientacoes), itens }
}

/** "3 séries de 10 repetições" / "3 séries" / "10 repetições" / "" */
export function textoDaDose(sets: number | null, reps: string | null): string {
  const r = reps?.trim() ?? ''
  const rep = /^\d+$/.test(r) ? `${r} ${r === '1' ? 'repetição' : 'repetições'}` : r
  if (sets && rep) return `${sets} ${sets === 1 ? 'série' : 'séries'} de ${rep}`
  if (sets) return `${sets} ${sets === 1 ? 'série' : 'séries'}`
  return rep
}

export function textoDaFrequencia(diasPorSemana: number): string {
  if (diasPorSemana >= 7) return 'Todos os dias'
  return `${diasPorSemana} ${diasPorSemana === 1 ? 'dia' : 'dias'} por semana`
}

// ── Execução (o que o paciente marcou) ──────────────────────────────────────
export interface Execucao { item_id: string; done_on: string }

export interface ResumoExecucao {
  /** dias diferentes, nos últimos 7 dias (hoje incluído), em que o item foi marcado */
  feitosNaSemana: number
  meta: number
  /** 0 a 100 */
  pct: number
  feitoHoje: boolean
  ultimaVez: string | null
}

/** Janela de adesão: 7 dias corridos terminando em `hoje`. */
export const JANELA_ADESAO_DIAS = 7

export function resumoDoItem(item: { id: string; times_per_week: number }, execucoes: readonly Execucao[], hoje: string): ResumoExecucao {
  const inicio = somarDias(hoje, -(JANELA_ADESAO_DIAS - 1)) ?? hoje
  const dias = new Set<string>()
  let ultima: string | null = null
  for (const e of execucoes) {
    if (e.item_id !== item.id || !isoValido(e.done_on) || e.done_on > hoje) continue
    if (!ultima || e.done_on > ultima) ultima = e.done_on
    if (e.done_on >= inicio) dias.add(e.done_on)
  }
  const meta = Math.max(1, Math.min(7, Math.round(item.times_per_week) || 1))
  return {
    feitosNaSemana: dias.size, meta, pct: Math.min(100, Math.round((dias.size / meta) * 100)), feitoHoje: dias.has(hoje), ultimaVez: ultima,
  }
}

/** Adesão do programa inteiro: soma do feito sobre a soma das metas, limitando cada item à sua meta. */
export function adesaoDoPrograma(itens: { id: string; times_per_week: number }[], execucoes: readonly Execucao[], hoje: string): number | null {
  if (itens.length === 0) return null
  let feito = 0
  let meta = 0
  for (const it of itens) {
    const r = resumoDoItem(it, execucoes, hoje)
    feito += Math.min(r.feitosNaSemana, r.meta)
    meta += r.meta
  }
  return meta > 0 ? Math.round((feito / meta) * 100) : null
}

/** Texto da última vez: "hoje", "ontem", "há 3 dias" ou nulo. */
export function textoUltimaVez(ultima: string | null, hoje: string): string {
  if (!ultima) return 'Ainda não marcado'
  const d = diasEntre(ultima, hoje)
  if (d === null) return ''
  if (d <= 0) return 'Feito hoje'
  if (d === 1) return 'Feito ontem'
  return `Último há ${d} dias`
}

/** UUID v4 para itens novos criados no navegador (crypto.randomUUID quando existe; senão aleatório simples). */
export function gerarId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = Math.floor(Math.random() * 16)
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
