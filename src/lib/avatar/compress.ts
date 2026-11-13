// Foto de perfil leve: recorte quadrado central, 160 px, WebP (ou JPEG) em data URL pequena, feita no navegador.
// O banco guarda a string em clinic_users.avatar_data (limite de 40000 caracteres); aqui ficamos bem abaixo.
import { IMAGE_INPUT_MAX_BYTES, ImageCompressError, decode } from '@/lib/teamChat/compress'

/** Lado do quadrado final, em px. */
export const AVATAR_SIZE = 160
/** Meta: ~12 KB de imagem, que em base64 (4/3) dá cerca de 16 mil caracteres. */
export const AVATAR_TARGET_BYTES = 12 * 1024
/** Teto da string (data URL inteira) que aceitamos guardar. */
export const AVATAR_MAX_CHARS = 30_000
export const AVATAR_START_QUALITY = 0.82
export const AVATAR_MIN_QUALITY = 0.3
export const AVATAR_QUALITY_STEP = 0.1
/** Lados a tentar, em ordem; só passa para o próximo se a menor qualidade ainda não coube na meta. */
export const AVATAR_SIZES = [AVATAR_SIZE, 128, 112, 96] as const

// ── partes puras ────────────────────────────────────────────────────────────

/** Quadrado central da imagem: origem e lado, em px da imagem original. */
export function centerSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  if (!(width > 0) || !(height > 0)) return { sx: 0, sy: 0, side: 1 }
  const side = Math.floor(Math.min(width, height))
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side: Math.max(1, side) }
}

/** Qualidades a tentar, da inicial até o piso, em passos. */
export function avatarQualitySteps(start = AVATAR_START_QUALITY, min = AVATAR_MIN_QUALITY, step = AVATAR_QUALITY_STEP): number[] {
  const out: number[] = []
  for (let q = start; q > min + 1e-9; q -= step) out.push(Math.round(q * 100) / 100)
  out.push(min)
  return out
}

/** Tamanho aproximado, em bytes, da imagem dentro de uma data URL base64 (o prefixo não conta). */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',')
  if (i < 0) return 0
  const b64 = dataUrl.slice(i + 1)
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad)
}

/** Data URL de imagem que aceitamos guardar: webp/jpeg, base64, dentro do teto de caracteres. */
export function isValidAvatarData(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= AVATAR_MAX_CHARS
    && /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value)
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'bmp']

/** Arquivo de imagem: tipo image/* (menos SVG) ou, sem tipo (alguns celulares), extensão conhecida. */
export function isImageFile(file: { type: string; name: string }): boolean {
  const type = file.type.toLowerCase()
  if (type) return type.startsWith('image/') && type !== 'image/svg+xml'
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXT.includes(ext)
}

// ── compressão (usa canvas: só no navegador) ────────────────────────────────

export interface CompressedAvatar {
  /** data URL pronta para gravar em clinic_users.avatar_data */
  dataUrl: string
  mime: 'image/webp' | 'image/jpeg'
  size: number
}

/**
 * Foto de perfil pronta para salvar: quadrado central, 160 px, WebP (JPEG se o navegador não souber WebP), qualidade
 * reduzida até caber em ~12 KB; se não couber, diminui o lado (128, 112, 96). Aceita até 30 mil caracteres.
 * Respeita a orientação EXIF. Lança ImageCompressError com texto para o usuário.
 */
export async function compressAvatar(file: File): Promise<CompressedAvatar> {
  if (!isImageFile(file)) throw new ImageCompressError('Escolha um arquivo de imagem (JPEG, PNG ou WebP).')
  if (file.size <= 0) throw new ImageCompressError('A foto está vazia.')
  if (file.size > IMAGE_INPUT_MAX_BYTES) throw new ImageCompressError('A foto é grande demais. Escolha uma menor.')
  const dec = await decode(file)
  try {
    if (!(dec.width > 0) || !(dec.height > 0)) throw new ImageCompressError('Não foi possível ler esta foto.')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageCompressError('Este navegador não consegue preparar a foto.')
    const { sx, sy, side } = centerSquare(dec.width, dec.height)
    let type: CompressedAvatar['mime'] = 'image/webp'
    let best: CompressedAvatar | null = null
    for (const size of AVATAR_SIZES) {
      canvas.width = size
      canvas.height = size
      ctx.imageSmoothingQuality = 'high'
      // fundo branco: PNG com transparência não vira preto no JPEG
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(dec.source, sx, sy, side, side, 0, 0, size, size)
      for (const q of avatarQualitySteps()) {
        let url = canvas.toDataURL(type, q)
        // navegador sem WebP devolve PNG: troca para JPEG e refaz
        if (type === 'image/webp' && !url.startsWith('data:image/webp')) {
          type = 'image/jpeg'
          url = canvas.toDataURL(type, q)
        }
        if (!url.startsWith(`data:${type}`)) throw new ImageCompressError('Não foi possível preparar a foto.')
        const out: CompressedAvatar = { dataUrl: url, mime: type, size: dataUrlBytes(url) }
        if (!best || url.length < best.dataUrl.length) best = out
        if (out.size <= AVATAR_TARGET_BYTES) return out
      }
    }
    if (best && best.dataUrl.length <= AVATAR_MAX_CHARS) return best
    throw new ImageCompressError('Não foi possível deixar esta foto leve o bastante. Escolha outra.')
  } finally {
    dec.close()
  }
}
