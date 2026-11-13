// Tokens do corpo das mensagens do Chat da equipe. O corpo continua sendo texto puro no banco; aqui só se reconhece
// o que o app mesmo escreve (menção "@Nome" e citação "[[paciente:<uuid>|<Nome>]]") para renderizar como elementos
// React. Funções puras (sem React, sem rede). Mensagem sem token vira um único segmento de texto, igual ao que era.
import { escapeLike as escapeLikeLiteral } from '@/lib/likeEscape'
import type { TeamDirectoryEntry } from './types'

/** Quantos pacientes uma mensagem pode citar. */
export const MAX_PATIENT_TOKENS = 3

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const PATIENT_SOURCE = `\\[\\[paciente:(${UUID})\\|([^\\[\\]|\\r\\n]{1,120})\\]\\]`

/** Nome seguro para ir dentro do token: sem colchetes, barra vertical nem quebra de linha. */
function tokenName(name: string): string {
  return name.replace(/[[\]|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Paciente'
}

/**
 * Token de citação de paciente. Só nome e link: nenhum dado clínico vai para o texto.
 * O nome do token é apenas um rótulo: nada o valida contra o cadastro. Quem escrever o token na mão pode pôr um nome
 * qualquer junto do id de outro paciente; quem clica cai em /pacientes/<id>, onde a RLS e a página decidem o acesso.
 * Por isso o chip nunca deve ser lido como prova de quem é o paciente.
 */
export function patientToken(id: string, name: string): string {
  return `[[paciente:${id.toLowerCase()}|${tokenName(name)}]]`
}

/** Quantas citações de paciente o texto tem. */
export function countPatientTokens(body: string): number {
  return Array.from(body.matchAll(new RegExp(PATIENT_SOURCE, 'g'))).length
}

/**
 * Separa as citações de paciente do texto (para editar o texto sem os tokens). Devolve o texto sem elas e os
 * pacientes, sem repetir id, na ordem em que apareciam. `composeBody` faz o caminho de volta.
 */
export function splitPatientTokens(body: string): { text: string; patients: { id: string; name: string }[] } {
  const patients: { id: string; name: string }[] = []
  const text = body.replace(new RegExp(PATIENT_SOURCE, 'g'), (_all, id: string, name: string) => {
    const lower = id.toLowerCase()
    if (!patients.some(p => p.id === lower)) patients.push({ id: lower, name: name.trim() })
    return ''
  })
  if (patients.length === 0) return { text: body, patients }
  return { text: text.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim(), patients }
}

/** Texto + citações de paciente no corpo que vai para o banco: o texto e, na linha de baixo, os tokens. */
export function composeBody(text: string, patients: { id: string; name: string }[]): string {
  const t = text.trim()
  const tokens = patients.map(p => patientToken(p.id, p.name)).join(' ')
  return t && tokens ? `${t}\n${tokens}` : t || tokens
}

/** Quanto do limite de caracteres os tokens (e a quebra de linha antes deles) já ocupam. */
export function tokensReserve(patients: { id: string; name: string }[]): number {
  if (patients.length === 0) return 0
  return patients.map(p => patientToken(p.id, p.name)).join(' ').length + 1
}

export type BodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; me: boolean }
  | { kind: 'patient'; id: string; name: string }

export interface MentionIndex {
  /** nomes em minúsculas, do mais longo para o mais curto (para "Maria Silva" ganhar de "Maria") */
  names: { lower: string; me: boolean }[]
  maxLen: number
}

/** Índice de nomes do diretório para reconhecer "@Nome" no texto. */
export function buildMentionIndex(directory: TeamDirectoryEntry[]): MentionIndex {
  const byName = new Map<string, boolean>()
  for (const d of directory) {
    const lower = d.display_name.trim().toLowerCase()
    if (!lower) continue
    byName.set(lower, (byName.get(lower) ?? false) || d.is_me)
  }
  const names = Array.from(byName, ([lower, me]) => ({ lower, me })).sort((a, b) => b.lower.length - a.lower.length)
  return { names, maxLen: names.length ? names[0].lower.length : 0 }
}

const WORD_CHAR = /[\p{L}\p{N}_]/u
// antes do "@" só vale início do texto, espaço ou pontuação de abertura (e-mail como "a@b.com" não é menção)
const BEFORE_AT = /[\s([{>,;:"'-]/

function splitMentions(text: string, index: MentionIndex | undefined): BodySegment[] {
  if (!index || index.names.length === 0 || !text.includes('@')) return [{ kind: 'text', text }]
  const out: BodySegment[] = []
  let last = 0
  let i = text.indexOf('@')
  while (i !== -1) {
    const prev = i > 0 ? text[i - 1] : ''
    if (prev && !BEFORE_AT.test(prev)) { i = text.indexOf('@', i + 1); continue }
    const rest = text.slice(i + 1, i + 1 + index.maxLen).toLowerCase()
    const hit = index.names.find(n => {
      if (!rest.startsWith(n.lower)) return false
      const after = text[i + 1 + n.lower.length]
      return after === undefined || !WORD_CHAR.test(after)
    })
    if (hit) {
      const end = i + 1 + hit.lower.length
      if (i > last) out.push({ kind: 'text', text: text.slice(last, i) })
      out.push({ kind: 'mention', text: text.slice(i, end), me: hit.me })
      last = end
      i = text.indexOf('@', end)
    } else {
      i = text.indexOf('@', i + 1)
    }
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out.length ? out : [{ kind: 'text', text }]
}

/** Quebra o corpo em texto, menções e citações de paciente. Da 4ª citação em diante o token fica como texto. */
export function parseBody(body: string, index?: MentionIndex): BodySegment[] {
  const out: BodySegment[] = []
  let last = 0
  let patients = 0
  for (const m of body.matchAll(new RegExp(PATIENT_SOURCE, 'g'))) {
    if (patients >= MAX_PATIENT_TOKENS) break
    const at = m.index ?? 0
    if (at > last) out.push(...splitMentions(body.slice(last, at), index))
    out.push({ kind: 'patient', id: m[1].toLowerCase(), name: m[2].trim() })
    last = at + m[0].length
    patients++
  }
  if (last < body.length) out.push(...splitMentions(body.slice(last), index))
  return out.length ? out : [{ kind: 'text', text: body }]
}

/** O texto menciona o próprio login? */
export function mentionsMe(segments: BodySegment[]): boolean {
  return segments.some(s => s.kind === 'mention' && s.me)
}

/** Texto corrido para listas e citações: a citação de paciente vira só o nome. */
export function plainText(body: string): string {
  return body.replace(new RegExp(PATIENT_SOURCE, 'g'), (_all, _id: string, name: string) => name.trim())
}

// ── busca ──────────────────────────────────────────────────────────────────

/**
 * Escapa o termo para um `ilike` (lib/likeEscape: \ % _ viram literais). O PostgREST também trata "*" como curinga;
 * ele vira "_" (um caractere qualquer, que casa com o próprio "*").
 */
export function escapeLike(term: string): string {
  return escapeLikeLiteral(term).replace(/\*/g, '_')
}

/** Minúsculas e sem acento (a mesma ideia de normalizeSearch em format.ts, que importa este arquivo). */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * O texto que o usuário vê (citação de paciente = só o nome) contém o termo, sem diferenciar acento nem caixa?
 * A busca no banco olha o corpo cru: "paciente:", pedaços de uuid e o resto do token casariam sem estar no texto visível.
 */
export function visibleTextHas(body: string, term: string): boolean {
  const needle = fold(term.trim())
  return needle.length > 0 && fold(plainText(body)).includes(needle)
}

/**
 * Termos para buscar paciente por nome: o digitado e o sem acento (ilike não ignora acento e o banco não tem
 * `unaccent`). Devolve [] quando sobram menos de 2 letras úteis depois de tirar o que quebra o filtro `or` do
 * PostgREST (vírgula, parênteses, aspas) e os curingas (% _ * \): "%%" ou "__" nunca podem casar com todos.
 * Limitação: quem digita sem acento ("jose") não acha "José" cadastrado com acento; só o contrário.
 */
export function patientSearchTerms(term: string): string[] {
  const safe = term.replace(/[%_,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim()
  if (safe.replace(/\s/g, '').length < 2) return []
  const plain = safe.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return plain === safe ? [safe] : [safe, plain]
}

export interface SnippetPart { text: string; hit: boolean }

/** Trecho de uma linha em volta da primeira ocorrência do termo, com as ocorrências marcadas. */
export function snippetParts(body: string, term: string, radius = 44): SnippetPart[] {
  const text = plainText(body).replace(/\s+/g, ' ').trim()
  const needle = term.trim().toLowerCase()
  if (!needle) return [{ text: text.slice(0, radius * 2), hit: false }]
  const lower = text.toLowerCase()
  const first = lower.indexOf(needle)
  if (first === -1) return [{ text: text.length > radius * 2 ? `${text.slice(0, radius * 2 - 1)}…` : text, hit: false }]
  const start = Math.max(0, first - radius)
  const end = Math.min(text.length, first + needle.length + radius)
  const parts: SnippetPart[] = []
  if (start > 0) parts.push({ text: '…', hit: false })
  let cursor = start
  let at = lower.indexOf(needle, cursor)
  while (at !== -1 && at < end) {
    if (at > cursor) parts.push({ text: text.slice(cursor, at), hit: false })
    parts.push({ text: text.slice(at, at + needle.length), hit: true })
    cursor = at + needle.length
    at = lower.indexOf(needle, cursor)
  }
  if (cursor < end) parts.push({ text: text.slice(cursor, end), hit: false })
  if (end < text.length) parts.push({ text: '…', hit: false })
  return parts
}

// ── menção no campo de escrever ─────────────────────────────────────────────

export interface MentionQuery {
  /** posição do "@" no texto */
  start: number
  /** o que já foi digitado depois do "@" */
  query: string
}

/** O cursor está logo depois de um "@alguma-coisa"? Devolve onde começa e o que foi digitado. */
export function detectMention(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret)
  const m = /(^|[\s([{>,;:"'-])@([^@\r\n]{0,40})$/u.exec(before)
  if (!m) return null
  return { start: caret - m[2].length - 1, query: m[2] }
}
