// Compressão de foto e escolha do formato de áudio, feitas no navegador antes do upload (o servidor nunca recebe arquivo pesado).
import { MAX_IMAGE_BYTES } from './attachments'

/** Meta de tamanho da foto depois de comprimida. */
export const IMAGE_TARGET_BYTES = 200 * 1024
export const IMAGE_START_QUALITY = 0.72
export const IMAGE_MIN_QUALITY = 0.4
export const IMAGE_QUALITY_STEP = 0.08
/** Maior lado, em ordem: se a meta de 200 KB não fecha com a qualidade mínima, passa para o próximo (540 e 420 vêm antes de aceitar até o teto de 600 KB). */
export const IMAGE_DIMENSIONS = [1280, 960, 720, 540, 420] as const
/** Entrada maior que isto nem é lida (evita travar o celular com um arquivo de centenas de MB). */
export const IMAGE_INPUT_MAX_BYTES = 40 * 1024 * 1024

export const AUDIO_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'] as const
export const AUDIO_BITS_PER_SECOND = 24_000

// ── partes puras ────────────────────────────────────────────────────────────

/** Reduz para caber em `max` no maior lado, sem aumentar e mantendo a proporção. */
export function fitDimensions(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 1, height: 1 }
  const longest = Math.max(width, height)
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) }
  const scale = max / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Qualidades a tentar, da inicial até o piso, em passos. */
export function qualitySteps(start = IMAGE_START_QUALITY, min = IMAGE_MIN_QUALITY, step = IMAGE_QUALITY_STEP): number[] {
  const out: number[] = []
  for (let q = start; q > min + 1e-9; q -= step) out.push(Math.round(q * 100) / 100)
  out.push(min)
  return out
}

/** Maiores lados a tentar para esta foto: sem repetir tamanho e nunca ampliando (foto pequena não passa por 960 e 720 à toa). */
export function dimensionPlan(width: number, height: number): { width: number; height: number }[] {
  const out: { width: number; height: number }[] = []
  for (const max of IMAGE_DIMENSIONS) {
    const d = fitDimensions(width, height, max)
    const last = out[out.length - 1]
    if (!last || d.width < last.width || d.height < last.height) out.push(d)
  }
  return out
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

/** Foto que aceitamos ler: JPEG, PNG, WebP e HEIC/HEIF (este só se o navegador souber decodificar). Tipo vazio vale pela extensão. */
export function isAcceptedImage(file: { type: string; name: string }): boolean {
  const type = file.type.toLowerCase()
  if (type) return IMAGE_TYPES.includes(type)
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXT.includes(ext)
}

/** Primeiro formato de gravação que o navegador suporta (webm/opus, ogg/opus, mp4); undefined se nenhum. */
export function pickAudioMime(isSupported: (mime: string) => boolean): string | undefined {
  return AUDIO_MIME_CANDIDATES.find(m => isSupported(m))
}

// ── compressão (usa canvas: só no navegador) ────────────────────────────────

export interface CompressedImage {
  blob: Blob
  /** tipo guardado: image/webp ou, quando o navegador não sabe WebP, image/jpeg */
  mime: 'image/webp' | 'image/jpeg'
  width: number
  height: number
}

export class ImageCompressError extends Error {}

interface Decoded { source: CanvasImageSource; width: number; height: number; close: () => void }

async function decode(file: File): Promise<Decoded> {
  // createImageBitmap com 'from-image' aplica a orientação EXIF; navegador que não aceita a opção cai para a sem opção e para <img>
  if (typeof createImageBitmap === 'function') {
    for (const opts of [{ imageOrientation: 'from-image' as const }, undefined]) {
      try {
        const bmp = await createImageBitmap(file, opts)
        return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
      } catch { /* tenta a próxima forma */ }
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new ImageCompressError('Não foi possível ler esta foto. Se for HEIC, tire a foto em JPEG ou escolha outra imagem.')
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), type, quality))
}

/**
 * Foto pronta para enviar: no máximo 1280 px, WebP (ou JPEG), qualidade 0,72 caindo até 0,4 até chegar a 200 KB; se
 * não chegar, reduz o lado maior para 960, 720, 540 e 420; só então aceita a melhor tentativa, até 600 KB. Respeita a orientação EXIF. Lança ImageCompressError com texto
 * para o usuário.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (!isAcceptedImage(file)) throw new ImageCompressError('Só é possível enviar foto (JPEG, PNG, WebP ou HEIC).')
  if (file.size <= 0) throw new ImageCompressError('A foto está vazia.')
  if (file.size > IMAGE_INPUT_MAX_BYTES) throw new ImageCompressError('A foto é grande demais. Escolha uma menor.')
  const dec = await decode(file)
  try {
    if (!(dec.width > 0) || !(dec.height > 0)) throw new ImageCompressError('Não foi possível ler esta foto.')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageCompressError('Este navegador não consegue preparar a foto.')
    let type: CompressedImage['mime'] = 'image/webp'
    let best: CompressedImage | null = null
    for (const dim of dimensionPlan(dec.width, dec.height)) {
      canvas.width = dim.width
      canvas.height = dim.height
      // fundo branco: PNG com transparência não vira preto no JPEG
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, dim.width, dim.height)
      ctx.drawImage(dec.source, 0, 0, dim.width, dim.height)
      for (const q of qualitySteps()) {
        let blob = await toBlob(canvas, type, q)
        // navegador sem WebP devolve PNG: troca para JPEG e refaz
        if (blob && type === 'image/webp' && blob.type !== 'image/webp') {
          type = 'image/jpeg'
          blob = await toBlob(canvas, type, q)
        }
        if (!blob) throw new ImageCompressError('Não foi possível preparar a foto.')
        const out: CompressedImage = { blob, mime: type, width: dim.width, height: dim.height }
        if (!best || blob.size < best.blob.size) best = out
        if (blob.size <= IMAGE_TARGET_BYTES) return out
      }
    }
    if (best && best.blob.size <= MAX_IMAGE_BYTES) return best
    throw new ImageCompressError('Não foi possível deixar esta foto leve o bastante. Escolha outra.')
  } finally {
    dec.close()
  }
}
