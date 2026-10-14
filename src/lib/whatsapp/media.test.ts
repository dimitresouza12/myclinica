import { describe, it, expect } from 'vitest'
import {
  extractMediaInfo, storedMime, sanitizeFileName, formatBytes, formatDuration, expiryFrom, checkUpload, baseMime,
  MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, isInlineKind, checkVoice,
} from './media'
import { extractMessage } from './webhook-parse'

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16 - b.length).fill(0)])
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47)
const PDF = bytes(0x25, 0x50, 0x44, 0x46)
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04)
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0)
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0])

describe('extractMediaInfo', () => {
  it('imagem com miniatura em base64', () => {
    const m = extractMediaInfo({ imageMessage: { mimetype: 'image/jpeg', fileLength: '48213', jpegThumbnail: '/9j/4AAQ', caption: 'oi' } })
    expect(m).toEqual({ kind: 'image', mime: 'image/jpeg', name: null, size: 48213, seconds: null, thumb: '/9j/4AAQ' })
  })
  it('miniatura como lista de bytes', () => {
    const m = extractMediaInfo({ imageMessage: { mimetype: 'image/png', jpegThumbnail: { 0: 255, 1: 216, 2: 255 } } })
    expect(m?.thumb).toBe(Buffer.from([255, 216, 255]).toString('base64'))
    const b = extractMediaInfo({ imageMessage: { jpegThumbnail: { type: 'Buffer', data: [1, 2, 3] } } })
    expect(b?.thumb).toBe(Buffer.from([1, 2, 3]).toString('base64'))
  })
  it('miniatura inválida ou grande demais é descartada', () => {
    expect(extractMediaInfo({ imageMessage: { jpegThumbnail: 'não é base64!' } })?.thumb).toBeNull()
    expect(extractMediaInfo({ imageMessage: { jpegThumbnail: 'A'.repeat(30_001) } })?.thumb).toBeNull()
    expect(extractMediaInfo({ imageMessage: { jpegThumbnail: { 0: 999 } } })?.thumb).toBeNull()
  })
  it('áudio: tipo sem parâmetros e duração', () => {
    const m = extractMediaInfo({ audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 42, ptt: true, fileLength: { low: 9000, high: 0 } } })
    expect(m).toMatchObject({ kind: 'audio', mime: 'audio/ogg', seconds: 42, size: 9000 })
  })
  it('documento com legenda embrulhado e nome limpo', () => {
    const m = extractMediaInfo({ documentWithCaptionMessage: { message: { documentMessage: { mimetype: 'application/pdf', fileName: '../../exame final.pdf', fileLength: 1024 } } } })
    expect(m).toMatchObject({ kind: 'document', mime: 'application/pdf', name: 'exame final.pdf', size: 1024 })
  })
  it('mensagem temporária e "ver uma vez"', () => {
    expect(extractMediaInfo({ ephemeralMessage: { message: { videoMessage: { mimetype: 'video/mp4', seconds: 7 } } } })).toMatchObject({ kind: 'video', seconds: 7 })
    expect(extractMediaInfo({ viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } } })).toMatchObject({ kind: 'image' })
  })
  it('figurinha', () => expect(extractMediaInfo({ stickerMessage: { mimetype: 'image/webp' } })?.kind).toBe('sticker'))
  it('texto e lixo não são mídia', () => {
    expect(extractMediaInfo({ conversation: 'oi' })).toBeNull()
    expect(extractMediaInfo(null)).toBeNull()
    expect(extractMediaInfo('x')).toBeNull()
    expect(extractMediaInfo({ imageMessage: 'não é objeto' })).toBeNull()
  })
  it('tipo com lixo vira null', () => expect(baseMime('<script>')).toBeNull())
})

describe('extractMessage com mídia', () => {
  const key = { remoteJid: '5585999998888@s.whatsapp.net', fromMe: false, id: 'ABC' }
  it('imagem traz os dados do arquivo e a mensagem original', () => {
    const message = { imageMessage: { mimetype: 'image/jpeg', fileLength: 10, caption: 'olha', mediaKey: 'k' } }
    const m = extractMessage({ key, message, pushName: 'Ana', messageTimestamp: 1760000000 })
    expect(m?.kind).toBe('image')
    expect(m?.body).toBe('olha')
    expect(m?.media).toMatchObject({ kind: 'image', mime: 'image/jpeg', size: 10 })
    expect(m?.raw).toEqual({ key, message })
  })
  it('texto não tem mídia', () => {
    expect(extractMessage({ key, message: { conversation: 'oi' } })?.media).toBeNull()
  })
})

describe('storedMime', () => {
  it('só tipos conhecidos abrem na página', () => {
    expect(storedMime('image', 'image/png')).toBe('image/png')
    expect(storedMime('image', 'image/svg+xml')).toBe('image/jpeg')
    expect(storedMime('image', 'text/html')).toBe('image/jpeg')
    expect(storedMime('audio', 'audio/ogg')).toBe('audio/ogg')
    expect(storedMime('audio', 'text/html')).toBe('audio/ogg')
    expect(storedMime('video', null)).toBe('video/mp4')
    expect(storedMime('sticker', 'image/webp')).toBe('image/webp')
  })
  it('documento: PDF abre, o resto só baixa', () => {
    expect(storedMime('document', 'application/pdf')).toBe('application/pdf')
    expect(storedMime('document', 'text/html')).toBe('application/octet-stream')
    expect(storedMime('document', 'image/svg+xml')).toBe('application/octet-stream')
    expect(storedMime('document', null)).toBe('application/octet-stream')
  })
  it('quais tipos aparecem dentro da conversa', () => {
    expect(['image', 'audio', 'video', 'sticker'].every(isInlineKind)).toBe(true)
    expect(isInlineKind('document')).toBe(false)
  })
})

describe('sanitizeFileName', () => {
  it('tira caminho, controle e caracteres proibidos', () => {
    expect(sanitizeFileName('C:\\x\\laudo.pdf')).toBe('laudo.pdf')
    expect(sanitizeFileName('a/b/c.png')).toBe('c.png')
    expect(sanitizeFileName('lau\u0000do<>:"|?*.pdf')).toBe('laudo.pdf')
    expect(sanitizeFileName('  muito   espaço .pdf ')).toBe('muito espaço .pdf')
    expect(sanitizeFileName('.htaccess')).toBe('htaccess')
  })
  it('vazio vira "arquivo"; nome longo mantém a extensão', () => {
    expect(sanitizeFileName('')).toBe('arquivo')
    expect(sanitizeFileName('///')).toBe('arquivo')
    const long = sanitizeFileName(`${'a'.repeat(300)}.pdf`)
    expect(long.length).toBe(100)
    expect(long.endsWith('.pdf')).toBe(true)
  })
  it('mantém acentos', () => expect(sanitizeFileName('Receituário João.pdf')).toBe('Receituário João.pdf'))
})

describe('formatação', () => {
  it('tamanho', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024 + 300 * 1024)).toBe('5,3 MB')
    expect(formatBytes(null)).toBe('')
    expect(formatBytes(-1)).toBe('')
  })
  it('duração', () => {
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(42)).toBe('0:42')
    expect(formatDuration(75)).toBe('1:15')
    expect(formatDuration(3725)).toBe('1:02:05')
    expect(formatDuration(null)).toBe('')
  })
  it('validade da cópia', () => {
    expect(expiryFrom(new Date('2026-10-14T12:00:00Z')).toISOString()).toBe('2026-10-17T12:00:00.000Z')
    expect(expiryFrom(new Date('2026-10-14T12:00:00Z'), 1).toISOString()).toBe('2026-10-15T12:00:00.000Z')
  })
})

describe('checkUpload', () => {
  const ok = (name: string, head: Uint8Array, size = 1000) => checkUpload({ name, size, head })
  it('aceita o que confere com a extensão', () => {
    expect(ok('foto.JPG', JPEG)).toEqual({ ok: true, kind: 'image', mime: 'image/jpeg', name: 'foto.JPG' })
    expect(ok('foto.png', PNG)).toMatchObject({ ok: true, kind: 'image', mime: 'image/png' })
    expect(ok('foto.webp', WEBP)).toMatchObject({ ok: true, mime: 'image/webp' })
    expect(ok('laudo.pdf', PDF)).toMatchObject({ ok: true, kind: 'document', mime: 'application/pdf' })
    expect(ok('a.docx', ZIP)).toMatchObject({ ok: true, kind: 'document' })
    expect(ok('a.xlsx', ZIP)).toMatchObject({ ok: true })
    expect(ok('a.doc', OLE)).toMatchObject({ ok: true })
    expect(ok('lista.csv', new TextEncoder().encode('a;b\n1;2\n'))).toMatchObject({ ok: true, mime: 'text/csv' })
    expect(ok('nota.txt', new TextEncoder().encode('oi'))).toMatchObject({ ok: true })
  })
  it('recusa extensão que não está na lista', () => {
    for (const n of ['virus.exe', 'pagina.html', 'img.svg', 'a.js', 'a.sh', 'a.zip', 'semextensao', 'a.pdf.exe', 'a.gif'])
      expect(ok(n, PDF)).toMatchObject({ ok: false })
  })
  it('recusa conteúdo que não confere com a extensão', () => {
    expect(ok('falso.pdf', JPEG)).toMatchObject({ ok: false })
    expect(ok('falso.jpg', PDF)).toMatchObject({ ok: false })
    expect(ok('falso.png', JPEG)).toMatchObject({ ok: false })
    expect(ok('falso.docx', OLE)).toMatchObject({ ok: false })
    expect(ok('falso.txt', bytes(0x4d, 0x5a, 0x00, 0x00))).toMatchObject({ ok: false }) // executável com NUL
  })
  it('limites de tamanho', () => {
    expect(ok('a.pdf', PDF, 0)).toMatchObject({ ok: false })
    expect(ok('a.pdf', PDF, MAX_UPLOAD_BYTES)).toMatchObject({ ok: true })
    expect(ok('a.pdf', PDF, MAX_UPLOAD_BYTES + 1)).toMatchObject({ ok: false })
  })
  it('nome vem limpo e o seletor lista as extensões', () => {
    expect(ok('../../x/laudo.pdf', PDF)).toMatchObject({ ok: true, name: 'laudo.pdf' })
    expect(UPLOAD_ACCEPT).toContain('.pdf')
    expect(UPLOAD_ACCEPT).not.toContain('.exe')
  })
})

describe('checkVoice', () => {
  const v = (head: Uint8Array, size = 5000) => checkVoice({ size, head })
  it('reconhece o que o navegador grava', () => {
    expect(v(bytes(0x1a, 0x45, 0xdf, 0xa3))).toEqual({ ok: true, mime: 'audio/webm' })
    expect(v(bytes(0x4f, 0x67, 0x67, 0x53))).toEqual({ ok: true, mime: 'audio/ogg' })
    expect(v(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, 0, 0, 0, 0]))).toEqual({ ok: true, mime: 'audio/mp4' })
    expect(v(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45, 0, 0, 0, 0]))).toEqual({ ok: true, mime: 'audio/wav' })
    expect(v(bytes(0x49, 0x44, 0x33))).toEqual({ ok: true, mime: 'audio/mpeg' })
  })
  it('recusa o que não é áudio, vazio e grande demais', () => {
    expect(v(PDF)).toMatchObject({ ok: false })
    expect(v(JPEG)).toMatchObject({ ok: false })
    expect(v(WEBP)).toMatchObject({ ok: false })
    expect(v(bytes(0x1a, 0x45, 0xdf, 0xa3), 0)).toMatchObject({ ok: false })
    expect(v(bytes(0x1a, 0x45, 0xdf, 0xa3), MAX_UPLOAD_BYTES + 1)).toMatchObject({ ok: false })
  })
})
