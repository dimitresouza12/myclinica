import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_MAX_BYTES, attachmentDisplayName, attachmentKindFromPath, buildAttachmentPath,
  ATTACHMENT_ACCEPTED_MIMES, fileExtension, formatBytes, normalizeMime, slugifyFileName, validateAttachment,
} from './prontuarioAttachments'

const MB = 1024 * 1024
const f = (name: string, type: string, size = 1000) => ({ name, type, size })

describe('validateAttachment', () => {
  it('aceita imagem, PDF, áudio e vídeo comuns', () => {
    expect(validateAttachment(f('foto.jpg', 'image/jpeg'))).toMatchObject({ ok: true, kind: 'image' })
    expect(validateAttachment(f('laudo.pdf', 'application/pdf'))).toMatchObject({ ok: true, kind: 'pdf', mime: 'application/pdf', ext: 'pdf' })
    expect(validateAttachment(f('voz.ogg', 'audio/ogg; codecs=opus'))).toMatchObject({ ok: true, kind: 'audio', mime: 'audio/ogg' })
    expect(validateAttachment(f('video.mp4', 'video/mp4'))).toMatchObject({ ok: true, kind: 'video' })
    expect(validateAttachment(f('video.MOV', 'video/quicktime'))).toMatchObject({ ok: true, kind: 'video' })
  })

  it('usa a extensão quando o navegador não informa o MIME (m4a, heic)', () => {
    expect(validateAttachment(f('nota.m4a', ''))).toMatchObject({ ok: true, kind: 'audio', mime: 'audio/mp4', ext: 'm4a' })
    expect(validateAttachment(f('IMG_1.HEIC', 'application/octet-stream'))).toMatchObject({ ok: true, kind: 'image', mime: 'image/heic' })
  })

  it('recusa tipos fora da lista, inclusive SVG e executáveis', () => {
    expect(validateAttachment(f('a.svg', 'image/svg+xml')).ok).toBe(false)
    expect(validateAttachment(f('a.exe', 'application/x-msdownload')).ok).toBe(false)
    expect(validateAttachment(f('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).ok).toBe(false)
    expect(validateAttachment(f('semtipo', '')).ok).toBe(false)
    expect(validateAttachment(f('a.exe', '')).ok).toBe(false)
  })

  it('recusa MIME que não confere com a extensão', () => {
    const r = validateAttachment(f('virus.pdf', 'image/png'))
    expect(r.ok).toBe(false)
  })

  it('respeita o limite de cada tipo', () => {
    expect(validateAttachment(f('a.jpg', 'image/jpeg', ATTACHMENT_MAX_BYTES.image)).ok).toBe(true)
    const big = validateAttachment(f('a.jpg', 'image/jpeg', ATTACHMENT_MAX_BYTES.image + 1))
    expect(big).toMatchObject({ ok: false })
    expect(!big.ok && big.reason).toContain('15 MB')
    expect(validateAttachment(f('a.pdf', 'application/pdf', 21 * MB)).ok).toBe(false)
    expect(validateAttachment(f('a.pdf', 'application/pdf', 19 * MB)).ok).toBe(true)
    expect(validateAttachment(f('a.mp4', 'video/mp4', 41 * MB)).ok).toBe(false)
  })

  it('áudio .webm e vídeo .ogg legítimos são aceitos e gravados com a extensão do tipo', () => {
    expect(validateAttachment(f('gravacao.webm', 'audio/webm'))).toMatchObject({ ok: true, kind: 'audio', mime: 'audio/webm', ext: 'weba' })
    expect(validateAttachment(f('clipe.ogg', 'video/ogg'))).toMatchObject({ ok: true, kind: 'video', mime: 'video/ogg', ext: 'ogv' })
    expect(validateAttachment(f('video.webm', 'video/webm'))).toMatchObject({ ok: true, kind: 'video', ext: 'webm' })
    expect(validateAttachment(f('voz.ogg', 'audio/ogg'))).toMatchObject({ ok: true, kind: 'audio', ext: 'ogg' })
    // o que foi gravado reabre com o player certo
    expect(attachmentKindFromPath('evolucao/c/p/1-a.weba')).toBe('audio')
    expect(attachmentKindFromPath('evolucao/c/p/1-a.ogv')).toBe('video')
    // mas .webm/.ogg com MIME de outro tipo continua recusado
    expect(validateAttachment(f('a.webm', 'image/png')).ok).toBe(false)
    expect(validateAttachment(f('a.ogg', 'application/pdf')).ok).toBe(false)
  })

  it('MIME válido sem extensão grava com a extensão certa, nunca .bin', () => {
    for (const mime of ATTACHMENT_ACCEPTED_MIMES) {
      const r = validateAttachment(f('semextensao', mime))
      expect(r, mime).toMatchObject({ ok: true })
      if (r.ok) {
        expect(r.ext, mime).toMatch(/^[a-z0-9]{1,5}$/)
        expect(r.ext, mime).not.toBe('bin')
        // a extensão escolhida precisa devolver o mesmo tipo ao reabrir
        expect(attachmentKindFromPath(`evolucao/c/p/1-a.${r.ext}`), mime).toBe(r.kind)
      }
    }
    expect(validateAttachment(f('foto', 'image/jpg'))).toMatchObject({ ok: true, ext: 'jpg' })
    expect(validateAttachment(f('audio', 'audio/x-m4a'))).toMatchObject({ ok: true, ext: 'm4a' })
    expect(validateAttachment(f('relatorio v1.2', 'application/pdf'))).toMatchObject({ ok: true, ext: 'pdf' })
  })

  it('extensão fora da lista no nome é recusada mesmo com MIME aceito', () => {
    for (const name of ['exploit.svg', 'x.exe', 'pagina.html', 'a.js', 'laudo.pdf.exe']) {
      expect(validateAttachment(f(name, 'image/png')).ok, name).toBe(false)
      expect(validateAttachment(f(name, 'application/pdf')).ok, name).toBe(false)
    }
  })

  it('recusa arquivo vazio', () => {
    expect(validateAttachment(f('a.pdf', 'application/pdf', 0))).toMatchObject({ ok: false, reason: 'arquivo vazio' })
  })
})

describe('tipo de anexo salvo', () => {
  it('descobre o tipo pela extensão do path', () => {
    expect(attachmentKindFromPath('evolucao/c/p/1-a.pdf')).toBe('pdf')
    expect(attachmentKindFromPath('evolucao/c/p/1-a.M4A')).toBe('audio')
    expect(attachmentKindFromPath('evolucao/c/p/1-a.webm')).toBe('video')
    expect(attachmentKindFromPath('https://x.supabase.co/storage/v1/object/sign/pacientes/e/1.pdf?token=abc')).toBe('pdf')
  })

  it('trata anexo antigo (imagem, sem extensão ou desconhecido) como imagem', () => {
    expect(attachmentKindFromPath('evolucao/c/p/123.jpg')).toBe('image')
    expect(attachmentKindFromPath('evolucao/c/p/123')).toBe('image')
    expect(attachmentKindFromPath('evolucao/c/p/123.xyz')).toBe('image')
  })
})

describe('nomes e paths', () => {
  it('normaliza MIME e extensão', () => {
    expect(normalizeMime('Audio/OGG; codecs=opus')).toBe('audio/ogg')
    expect(normalizeMime('lixo')).toBe('')
    expect(normalizeMime(null)).toBe('')
    expect(fileExtension('Laudo.Final.PDF')).toBe('pdf')
    expect(fileExtension('semext')).toBe('')
    expect(fileExtension('.oculto')).toBe('')
  })

  it('gera slug seguro do nome original', () => {
    expect(slugifyFileName('Tomografia Crânio (final).pdf')).toBe('tomografia-cranio-final')
    expect(slugifyFileName('../../etc/passwd')).toBe('passwd')
    expect(slugifyFileName('???.pdf')).toBe('')
    expect(slugifyFileName('a'.repeat(100) + '.pdf').length).toBeLessThanOrEqual(40)
  })

  it('monta o path de armazenamento e o nome exibido faz o caminho de volta', () => {
    const path = buildAttachmentPath({ clinicId: 'c1', patientId: 'p1', fileName: 'Laudo Tomografia.pdf', ext: 'pdf', now: 1700000000000, rand: 'ab12cd' })
    expect(path).toBe('evolucao/c1/p1/1700000000000-ab12cd-laudo-tomografia.pdf')
    expect(attachmentDisplayName(path)).toBe('laudo tomografia')
    expect(buildAttachmentPath({ clinicId: 'c1', patientId: 'p1', fileName: '???', ext: 'jpg', now: 1700000000000, rand: 'ab12cd' }))
      .toBe('evolucao/c1/p1/1700000000000-ab12cd.jpg')
    expect(buildAttachmentPath({ clinicId: 'c', patientId: 'p', fileName: 'a', ext: '../x', now: 1, rand: 'z' })).toMatch(/\.bin$/)
  })

  it('nome exibido vazio para path antigo sem nome', () => {
    expect(attachmentDisplayName('evolucao/c1/p1/1700000000000-ab12cd.jpg')).toBe('')
  })

  it('formata bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * MB)).toBe('5,0 MB')
    expect(formatBytes(30 * MB)).toBe('30 MB')
  })
})
