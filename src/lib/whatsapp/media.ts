// Mídia das conversas de WhatsApp: o que o WhatsApp manda, o que aceitamos enviar, nomes e tamanhos.
// Funções puras (sem rede, sem banco, sem React).

export type MediaKind = 'image' | 'audio' | 'video' | 'document' | 'sticker'

/** Quanto tempo a cópia do arquivo fica guardada. Depois a limpeza apaga; a mensagem continua na conversa. */
export const MEDIA_TTL_DAYS = 3
/** Quanto tempo se guarda o necessário para baixar de novo do WhatsApp (ele mesmo costuma apagar antes). */
export const MEDIA_SOURCE_TTL_DAYS = 30
/** Maior arquivo que o usuário envia por aqui. */
export const MAX_UPLOAD_BYTES = 16 * 1024 * 1024
/** Maior arquivo que guardamos ao receber (o bucket recusa acima disso). */
export const MAX_STORED_BYTES = 20 * 1024 * 1024
/** Miniatura maior que isto (em caracteres base64) é descartada: ela só serve de prévia. */
const MAX_THUMB_CHARS = 30_000

export interface MediaInfo {
  kind: MediaKind
  mime: string | null
  name: string | null
  size: number | null
  seconds: number | null
  /** JPEG pequeno em base64, sem prefixo */
  thumb: string | null
  /** onda do áudio: até 64 valores de 0 a 100, em base64 */
  wave: string | null
}

const PART_KEYS: Array<[string, MediaKind]> = [
  ['imageMessage', 'image'], ['audioMessage', 'audio'], ['videoMessage', 'video'],
  ['documentMessage', 'document'], ['stickerMessage', 'sticker'], ['ptvMessage', 'video'],
]

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Desembrulha mensagem temporária, "ver uma vez" e documento com legenda. */
function unwrap(message: unknown, depth = 0): Obj | null {
  if (!isObj(message) || depth > 4) return null
  const inner = (message.ephemeralMessage ?? message.viewOnceMessage ?? message.viewOnceMessageV2 ?? message.documentWithCaptionMessage) as { message?: unknown } | undefined
  if (inner && isObj(inner) && inner.message) return unwrap(inner.message, depth + 1)
  return message
}

function toNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : isObj(v) && 'low' in v ? Number(v.low) : NaN
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

/** A miniatura chega como texto base64 ou como lista de bytes, conforme a versão. */
function thumbToBase64(v: unknown): string | null {
  let b64: string | null = null
  if (typeof v === 'string') b64 = v
  else if (isObj(v)) {
    const bytes = Array.isArray(v.data) ? v.data : Object.values(v)
    if (bytes.length > 0 && bytes.every(x => typeof x === 'number' && x >= 0 && x <= 255)) {
      b64 = Buffer.from(bytes as number[]).toString('base64')
    }
  }
  if (!b64 || b64.length > MAX_THUMB_CHARS || !/^[A-Za-z0-9+/=]+$/.test(b64)) return null
  return b64
}

/** Cabeçalho de tipo sem parâmetros: "audio/ogg; codecs=opus" → "audio/ogg". */
export function baseMime(mime: unknown): string | null {
  if (typeof mime !== 'string') return null
  const m = mime.split(';')[0].trim().toLowerCase()
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(m) ? m : null
}

/** Dados de mídia de uma mensagem do WhatsApp, ou null se não for mídia. */
export function extractMediaInfo(message: unknown): MediaInfo | null {
  const m = unwrap(message)
  if (!m) return null
  for (const [key, kind] of PART_KEYS) {
    const part = m[key]
    if (!isObj(part)) continue
    const name = typeof part.fileName === 'string' && part.fileName.trim() ? sanitizeFileName(part.fileName) : null
    return {
      kind,
      mime: baseMime(part.mimetype),
      name,
      size: toNumber(part.fileLength),
      seconds: toNumber(part.seconds),
      thumb: thumbToBase64(part.jpegThumbnail),
      wave: kind === 'audio' ? normalizeWave(part.waveform) : null,
    }
  }
  return null
}

// ── tipo guardado e exibido ─────────────────────────────────────────────────

const INLINE_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/**
 * Tipo com que o arquivo é guardado (e servido). Só imagem, áudio e vídeo de tipo conhecido abrem dentro da
 * página; e PDF abre no navegador; qualquer outra coisa (HTML, SVG, script…) vira "application/octet-stream" e só baixa.
 */
export function storedMime(kind: MediaKind, mime: string | null): string {
  const m = baseMime(mime)
  if (kind === 'sticker') return 'image/webp'
  if (kind === 'image') return m && INLINE_IMAGE.has(m) ? m : 'image/jpeg'
  if (kind === 'audio') return m && m.startsWith('audio/') ? m : 'audio/ogg'
  if (kind === 'video') return m && m.startsWith('video/') ? m : 'video/mp4'
  return m === 'application/pdf' ? m : 'application/octet-stream'
}

/** Esta mídia aparece dentro da conversa (e não só como cartão de download)? */
export const isInlineKind = (kind: string): boolean => kind === 'image' || kind === 'audio' || kind === 'video' || kind === 'sticker'

// ── nome de arquivo, tamanho e duração ──────────────────────────────────────

/** Tira caminho, caracteres de controle e o que atrapalha em nome de arquivo; no máximo 100 caracteres. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const clean = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
  if (!clean) return 'arquivo'
  if (clean.length <= 100) return clean
  const dot = clean.lastIndexOf('.')
  const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : ''
  return clean.slice(0, 100 - ext.length) + ext
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** 42 → "0:42"; 3725 → "1:02:05". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return ''
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const two = (x: number) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`
}

export function expiryFrom(now: Date, days = MEDIA_TTL_DAYS): Date {
  return new Date(now.getTime() + days * 86_400_000)
}

// ── o que o usuário pode enviar ─────────────────────────────────────────────

type Magic = 'jpeg' | 'png' | 'webp' | 'gif' | 'pdf' | 'zip' | 'ole' | 'text'

interface AllowedType { mime: string; kind: 'image' | 'document'; magic: Magic }

/** Por extensão (o navegador às vezes não informa o tipo). Nada executável, nada de HTML/SVG. */
const ALLOWED: Record<string, AllowedType> = {
  jpg:  { mime: 'image/jpeg', kind: 'image', magic: 'jpeg' },
  jpeg: { mime: 'image/jpeg', kind: 'image', magic: 'jpeg' },
  png:  { mime: 'image/png', kind: 'image', magic: 'png' },
  webp: { mime: 'image/webp', kind: 'image', magic: 'webp' },
  pdf:  { mime: 'application/pdf', kind: 'document', magic: 'pdf' },
  doc:  { mime: 'application/msword', kind: 'document', magic: 'ole' },
  xls:  { mime: 'application/vnd.ms-excel', kind: 'document', magic: 'ole' },
  ppt:  { mime: 'application/vnd.ms-powerpoint', kind: 'document', magic: 'ole' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document', magic: 'zip' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'document', magic: 'zip' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'document', magic: 'zip' },
  odt:  { mime: 'application/vnd.oasis.opendocument.text', kind: 'document', magic: 'zip' },
  ods:  { mime: 'application/vnd.oasis.opendocument.spreadsheet', kind: 'document', magic: 'zip' },
  txt:  { mime: 'text/plain', kind: 'document', magic: 'text' },
  csv:  { mime: 'text/csv', kind: 'document', magic: 'text' },
}

/** Valor para o atributo accept do seletor de arquivo. */
export const UPLOAD_ACCEPT = Object.keys(ALLOWED).map(e => `.${e}`).join(',')

function startsWith(head: Uint8Array, bytes: number[], at = 0): boolean {
  return bytes.every((b, i) => head[at + i] === b)
}

function matchesMagic(magic: Magic, head: Uint8Array): boolean {
  switch (magic) {
    case 'jpeg': return startsWith(head, [0xff, 0xd8, 0xff])
    case 'png':  return startsWith(head, [0x89, 0x50, 0x4e, 0x47])
    case 'gif':  return startsWith(head, [0x47, 0x49, 0x46, 0x38])
    case 'webp': return startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)
    case 'pdf':  return startsWith(head, [0x25, 0x50, 0x44, 0x46])
    case 'zip':  return startsWith(head, [0x50, 0x4b, 0x03, 0x04])
    case 'ole':  return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0])
    case 'text': return !head.includes(0)
  }
}

export type UploadCheck =
  | { ok: true; kind: 'image' | 'document'; mime: string; name: string }
  | { ok: false; error: string }

/** Confere nome, tamanho e conteúdo (primeiros bytes) de um arquivo a enviar. */
export function checkUpload(file: { name: string; size: number; head: Uint8Array }): UploadCheck {
  if (file.size <= 0) return { ok: false, error: 'O arquivo está vazio.' }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: `O arquivo passa de ${formatBytes(MAX_UPLOAD_BYTES)}. Escolha um menor.` }
  const name = sanitizeFileName(file.name)
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const type = ALLOWED[ext]
  if (!type) return { ok: false, error: 'Este tipo de arquivo não pode ser enviado. Use foto (JPG, PNG, WebP), PDF, Word, Excel, PowerPoint, TXT ou CSV.' }
  if (!matchesMagic(type.magic, file.head)) return { ok: false, error: 'O conteúdo do arquivo não confere com a extensão. Confira se ele não está corrompido.' }
  return { ok: true, kind: type.kind, mime: type.mime, name }
}

// ── mensagem de voz gravada no navegador ────────────────────────────────────

/** Maior duração de uma mensagem de voz gravada por aqui. */
export const MAX_VOICE_SECONDS = 15 * 60

export type VoiceCheck = { ok: true; mime: string } | { ok: false; error: string }

/** Confere o áudio gravado (Chrome grava WebM, Safari grava MP4) pelos primeiros bytes. */
export function checkVoice(file: { size: number; head: Uint8Array }): VoiceCheck {
  if (file.size <= 0) return { ok: false, error: 'A gravação está vazia. Grave de novo.' }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'A gravação é grande demais. Grave um áudio mais curto.' }
  const h = file.head
  const mime =
    startsWith(h, [0x1a, 0x45, 0xdf, 0xa3]) ? 'audio/webm'
    : startsWith(h, [0x4f, 0x67, 0x67, 0x53]) ? 'audio/ogg'
    : startsWith(h, [0x66, 0x74, 0x79, 0x70], 4) ? 'audio/mp4'
    : startsWith(h, [0x52, 0x49, 0x46, 0x46]) && startsWith(h, [0x57, 0x41, 0x56, 0x45], 8) ? 'audio/wav'
    : startsWith(h, [0x49, 0x44, 0x33]) || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) ? 'audio/mpeg'
    : null
  return mime ? { ok: true, mime } : { ok: false, error: 'Formato de áudio não reconhecido. Grave de novo.' }
}

// ── onda do áudio (as barrinhas do player) ──────────────────────────────────

export const WAVE_POINTS = 64

function bytesToBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(b64: string): number[] | null {
  try { return Array.from(atob(b64), c => c.charCodeAt(0)) } catch { return null }
}

/**
 * Aceita a onda como o WhatsApp manda (texto base64 ou lista de bytes) ou como guardamos, e devolve base64
 * com no máximo 64 valores de 0 a 100; null se não servir.
 */
export function normalizeWave(v: unknown): string | null {
  let bytes: number[] | null = null
  if (typeof v === 'string') bytes = /^[A-Za-z0-9+/=]+$/.test(v) && v.length <= 140 ? base64ToBytes(v) : null
  else if (isObj(v)) {
    const list = Array.isArray(v.data) ? v.data : Object.values(v)
    bytes = list.length > 0 && list.every(x => typeof x === 'number' && Number.isFinite(x)) ? (list as number[]) : null
  }
  if (!bytes || bytes.length === 0 || bytes.length > 100) return null
  return bytesToBase64(bytes.map(b => Math.max(0, Math.min(100, Math.round(b)))))
}

/** Reduz uma lista de níveis (0 a 1) para `WAVE_POINTS` valores de 0 a 100, em base64, prontos para guardar. */
export function encodeWave(levels: number[]): string | null {
  if (levels.length === 0) return null
  const peak = Math.max(...levels, 0.0001)
  const out: number[] = []
  for (let i = 0; i < WAVE_POINTS; i++) {
    const from = Math.floor((i * levels.length) / WAVE_POINTS)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / WAVE_POINTS))
    let m = 0
    for (let j = from; j < Math.min(to, levels.length); j++) m = Math.max(m, levels[j])
    out.push(Math.round((m / peak) * 100))
  }
  return bytesToBase64(out)
}

/**
 * Alturas (0 a 1) das `count` barras do player. Usa a onda da mensagem; sem ela, gera um desenho estável
 * a partir do `seed` (o mesmo áudio sempre tem o mesmo desenho).
 */
export function waveBars(wave: string | null | undefined, seed: string, count = 40): number[] {
  const bytes = wave ? base64ToBytes(wave) : null
  if (bytes && bytes.length > 0) {
    return Array.from({ length: count }, (_, i) => {
      const from = Math.floor((i * bytes.length) / count)
      const to = Math.max(from + 1, Math.floor(((i + 1) * bytes.length) / count))
      let m = 0
      for (let j = from; j < Math.min(to, bytes.length); j++) m = Math.max(m, bytes[j])
      return Math.max(0.12, Math.min(1, m / 100))
    })
  }
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return Array.from({ length: count }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
    return 0.2 + (h % 1000) / 1000 * 0.7
  })
}
