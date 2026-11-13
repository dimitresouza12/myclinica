// Anexos do Chat da equipe (foto e áudio): limites do banco, caminho no bucket e prazo de validade. Funções puras.
import type { TeamAttachmentKind } from './types'

/** Bucket privado do Storage. */
export const TEAM_BUCKET = 'team-chat'
/** Quanto tempo o arquivo fica no servidor. Depois o banco marca `expired_at` e o arquivo é apagado. */
export const ATTACHMENT_TTL_DAYS = 15
/** Perto do vencimento (este número de dias ou menos) a bolha avisa "some em N dias". */
export const EXPIRY_WARN_DAYS = 3
/** Duração de validade da URL assinada (segundos). Gerada sob demanda; nunca guardada. */
export const SIGNED_URL_SECONDS = 300

// Limites que o banco confere (a mesma regra vale aqui para não subir arquivo que seria recusado).
export const MAX_IMAGE_BYTES = 614_400
export const MAX_FILE_BYTES = 1_572_864
export const MAX_AUDIO_MS = 300_000
export const MIN_AUDIO_MS = 1_000
/** iOS/Safari grava audio/mp4 e pode ignorar o bitrate pedido (chega a ~128 kbps): 90 s cabem em 1,5 MB. */
export const MAX_AUDIO_MS_MP4 = 90_000
export const MAX_CAPTION = 1000

/** Tipos que o bucket aceita. */
export const ALLOWED_MIMES = ['image/webp', 'image/jpeg', 'audio/webm', 'audio/ogg', 'audio/mp4'] as const

const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
}

/** "audio/webm;codecs=opus" → "audio/webm". */
export function baseMime(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase()
}

export const isAllowedMime = (mime: string): boolean => (ALLOWED_MIMES as readonly string[]).includes(baseMime(mime))

/** Duração máxima de gravação para o formato: audio/mp4 (Safari) 90 s; os demais 5 minutos. */
export function maxAudioMsForMime(mime: string): number {
  return baseMime(mime) === 'audio/mp4' ? MAX_AUDIO_MS_MP4 : MAX_AUDIO_MS
}

/** Limite em texto para o aviso de gravação: 300000 → "5 minutos"; 90000 → "1 minuto e 30 segundos". */
export function audioLimitLabel(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  const mm = m > 0 ? `${m} ${m === 1 ? 'minuto' : 'minutos'}` : ''
  const ss = s > 0 ? `${s} ${s === 1 ? 'segundo' : 'segundos'}` : ''
  return mm && ss ? `${mm} e ${ss}` : mm || ss
}

/** Extensão do arquivo para o tipo (sem o ponto); null quando o tipo não é aceito. */
export function extForMime(mime: string): string | null {
  return EXT[baseMime(mime)] ?? null
}

/** Caminho obrigatório no bucket: `<clinic_id>/<channel_id>/<uuid>.<ext>`. */
export function buildStoragePath(clinicId: string, channelId: string, uuid: string, mime: string): string | null {
  const ext = extForMime(mime)
  return ext ? `${clinicId}/${channelId}/${uuid}.${ext}` : null
}

/** O arquivo já foi (ou vai ser, no minuto) apagado pelo servidor? Não se tenta baixar. */
export function isAttachmentExpired(a: { expires_at: string; expired_at: string | null }, now: Date): boolean {
  if (a.expired_at) return true
  const t = Date.parse(a.expires_at)
  return Number.isFinite(t) && t <= now.getTime()
}

/** Dias que faltam (arredondado para cima) para o arquivo sumir; null quando já expirou ou ainda falta muito. */
export function daysUntilExpiry(a: { expires_at: string; expired_at: string | null }, now: Date): number | null {
  if (isAttachmentExpired(a, now)) return null
  const left = Math.ceil((Date.parse(a.expires_at) - now.getTime()) / 86_400_000)
  return left <= EXPIRY_WARN_DAYS ? Math.max(1, left) : null
}

/** Legenda pequena da bolha perto do vencimento; null quando não é o caso. */
export function expiryNote(a: { expires_at: string; expired_at: string | null }, now: Date): string | null {
  const d = daysUntilExpiry(a, now)
  if (d === null) return null
  return `some em ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** Prévia de uma mensagem sem texto: "Foto" ou "Áudio" (nunca vazio). `kind` ausente = ainda não consultado. */
export function attachmentPreview(kind: TeamAttachmentKind | null | undefined): string {
  if (kind === 'audio') return 'Áudio'
  if (kind === 'image') return 'Foto'
  return 'Anexo'
}

/** Proporção width/height para reservar o espaço da miniatura; limitada para não gerar bolha gigante ou fina demais. */
export function thumbBox(width: number | null, height: number | null, maxW = 260, maxH = 320): { width: number; height: number } {
  const w = width && width > 0 ? width : 4
  const h = height && height > 0 ? height : 3
  const scale = Math.min(maxW / w, maxH / h)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}
