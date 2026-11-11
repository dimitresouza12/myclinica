// Validação das imagens enviadas para importar um modelo: tipo por MAGIC BYTES (o `mediaType` declarado não vale
// nada sozinho), tamanho, quantidade e base64 bem formado. Lógica pura (sem Buffer: roda no servidor e no navegador), testada em
// importar.test.ts. NUNCA loga nem guarda a imagem: o resultado vive só na memória da requisição.

import type { LlmImage } from '@/lib/ia/provider'
import { IMPORTAR_LIMITES } from './importar'

export type ImagemTipo = LlmImage['mediaType']

/** Tipo real pelos primeiros bytes: JPEG, PNG ou WebP. Qualquer outra coisa (PDF, SVG, GIF, HTML...) = null. */
export function detectarTipoImagem(b: Uint8Array): ImagemTipo | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

export type ImagensResult =
  | { ok: true; images: LlmImage[]; totalBytes: number }
  | { ok: false; status: 400 | 413 | 415; error: string; message: string }

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** Bytes que o base64 decodifica, sem decodificar (barra o excesso antes de gastar memória). */
function bytesDoBase64(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - pad
}

export function validarImagens(raw: unknown): ImagensResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, status: 400, error: 'sem_imagem', message: 'Envie a foto do modelo.' }
  }
  if (raw.length > IMPORTAR_LIMITES.maxImagens) {
    return { ok: false, status: 400, error: 'imagens_demais', message: `Envie no máximo ${IMPORTAR_LIMITES.maxImagens} imagens.` }
  }
  const images: LlmImage[] = []
  let total = 0
  for (const item of raw) {
    const o = item as { dataBase64?: unknown } | null
    const b64 = typeof o?.dataBase64 === 'string' ? o.dataBase64 : ''
    if (!b64) return { ok: false, status: 400, error: 'imagem_invalida', message: 'Imagem inválida.' }
    // o limite vale ANTES de decodificar
    if (b64.length > Math.ceil((IMPORTAR_LIMITES.maxBytesPorImagem * 4) / 3) + 4) {
      return { ok: false, status: 413, error: 'imagem_grande', message: `Cada imagem pode ter no máximo ${IMPORTAR_LIMITES.maxBytesPorImagem / (1024 * 1024)} MB.` }
    }
    if (!BASE64.test(b64) || b64.length % 4 !== 0) return { ok: false, status: 400, error: 'imagem_invalida', message: 'Imagem inválida.' }
    const size = bytesDoBase64(b64)
    if (size > IMPORTAR_LIMITES.maxBytesPorImagem) {
      return { ok: false, status: 413, error: 'imagem_grande', message: `Cada imagem pode ter no máximo ${IMPORTAR_LIMITES.maxBytesPorImagem / (1024 * 1024)} MB.` }
    }
    // só o início basta para o tipo real; o tamanho já foi conferido pela conta do base64
    let head: Uint8Array
    try { head = Uint8Array.from(atob(b64.slice(0, 16)), ch => ch.charCodeAt(0)) } catch {
      return { ok: false, status: 400, error: 'imagem_invalida', message: 'Imagem inválida.' }
    }
    const tipo = detectarTipoImagem(head)
    if (!tipo) return { ok: false, status: 415, error: 'tipo_invalido', message: 'Use uma imagem JPG, PNG ou WebP. PDF: exporte a página como imagem.' }
    // o tipo enviado ao provedor é o REAL, nunca o declarado pelo navegador
    images.push({ mediaType: tipo, dataBase64: b64 })
    total += size
  }
  return { ok: true, images, totalBytes: total }
}
