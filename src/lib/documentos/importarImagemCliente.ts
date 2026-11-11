// Prepara a foto do modelo NO NAVEGADOR antes de enviar: confere o tipo pelos primeiros bytes, redimensiona e
// reencoda em JPEG (cabe nos 4 MB do servidor e tira o EXIF, inclusive a localização da foto). A imagem fica só em
// memória (base64 para o envio e um endereço blob: para a prévia): nada é salvo em disco, storage nem localStorage.
// Quem chama deve revogar o `previewUrl` (URL.revokeObjectURL) ao descartar. Só no navegador.

import { IMPORTAR_LIMITES } from './importar'
import { detectarTipoImagem } from './importarImagem'

const LADO_MAX = 2200
const BRUTO_MAX = 30 * 1024 * 1024

export type ImagemPreparada =
  | { ok: true; dataBase64: string; previewUrl: string; bytes: number }
  | { ok: false; message: string }

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('leitura'))
    r.onload = () => {
      const s = typeof r.result === 'string' ? r.result : ''
      const i = s.indexOf(',')
      if (i < 0) reject(new Error('leitura'))
      else resolve(s.slice(i + 1))
    }
    r.readAsDataURL(blob)
  })
}

function canvasParaJpeg(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', qualidade))
}

export async function prepararImagem(file: File): Promise<ImagemPreparada> {
  if (file.size === 0) return { ok: false, message: 'O arquivo está vazio.' }
  if (file.size > BRUTO_MAX) return { ok: false, message: 'O arquivo é grande demais. Use uma foto de até 30 MB.' }
  let tipo: ReturnType<typeof detectarTipoImagem>
  try { tipo = detectarTipoImagem(new Uint8Array(await file.slice(0, 16).arrayBuffer())) } catch { tipo = null }
  if (!tipo) return { ok: false, message: 'Use uma imagem JPG, PNG ou WebP. Se o modelo é um PDF, exporte a página como imagem.' }

  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { return { ok: false, message: 'Não foi possível abrir esta imagem.' } }
  try {
    let escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
    let qualidade = 0.86
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * escala))
      canvas.height = Math.max(1, Math.round(bitmap.height * escala))
      const ctx = canvas.getContext('2d')
      if (!ctx) return { ok: false, message: 'Não foi possível preparar a imagem neste navegador.' }
      // fundo branco: PNG/WebP com transparência não vira preto no JPEG
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await canvasParaJpeg(canvas, qualidade)
      canvas.width = 0; canvas.height = 0
      if (!blob) return { ok: false, message: 'Não foi possível preparar a imagem.' }
      if (blob.size <= IMPORTAR_LIMITES.maxBytesPorImagem - 64 * 1024) {
        return { ok: true, dataBase64: await blobParaBase64(blob), previewUrl: URL.createObjectURL(blob), bytes: blob.size }
      }
      escala *= 0.8
      qualidade = Math.max(0.6, qualidade - 0.08)
    }
    return { ok: false, message: 'A imagem continua grande demais. Tire a foto mais de perto ou com menos resolução.' }
  } catch {
    return { ok: false, message: 'Não foi possível preparar a imagem.' }
  } finally {
    bitmap.close()
  }
}
