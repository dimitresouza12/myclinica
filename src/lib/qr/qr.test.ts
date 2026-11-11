import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encodeQr, qrDataUri, qrToSvg, QR_MAX_BYTES } from './qr'

const fingerprint = (m: boolean[][]) => createHash('sha256').update(m.map(r => r.map(c => (c ? '1' : '0')).join('')).join('\n')).digest('hex')

describe('encodeQr', () => {
  it('escolhe a versão pelo tamanho do texto', () => {
    expect(encodeQr('a').length).toBe(21) // versão 1
    expect(encodeQr('x'.repeat(30)).length).toBe(29) // versão 3
    expect(encodeQr('x'.repeat(QR_MAX_BYTES)).length).toBe(57) // versão 10
  })

  it('recusa texto acima de 213 bytes', () => {
    expect(() => encodeQr('x'.repeat(QR_MAX_BYTES + 1))).toThrow(/longo demais/)
  })

  it('conta bytes UTF-8, não caracteres', () => {
    expect(() => encodeQr('ç'.repeat(110))).toThrow()
  })

  it('desenha os três localizadores e o módulo escuro fixo', () => {
    const m = encodeQr('https://exemplo.com/verificar/ABCD')
    const n = m.length
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let i = 0; i < 7; i++) {
        expect(m[oy][ox + i]).toBe(true)
        expect(m[oy + 6][ox + i]).toBe(true)
        expect(m[oy + i][ox]).toBe(true)
        expect(m[oy + i][ox + 6]).toBe(true)
      }
      expect(m[oy + 3][ox + 3]).toBe(true)
      expect(m[oy + 1][ox + 1]).toBe(false)
    }
    expect(m[n - 8][8]).toBe(true)
  })

  it('é determinístico e muda com o texto', () => {
    expect(fingerprint(encodeQr('MyClinica'))).toBe(fingerprint(encodeQr('MyClinica')))
    expect(fingerprint(encodeQr('MyClinica'))).not.toBe(fingerprint(encodeQr('MyClinicb')))
  })
})

describe('qrToSvg / qrDataUri', () => {
  it('gera SVG com zona de silêncio e um único path', () => {
    const svg = qrToSvg(encodeQr('a'))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox="0 0 29 29"') // 21 + 2*4
    expect(svg.match(/<path/g)).toHaveLength(1)
  })

  it('data URI é SVG codificado', () => {
    const uri = qrDataUri('a')
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true)
  })
})
