import { describe, expect, it } from 'vitest'
import { lerCorpoLimitado, lerFormularioLimitado } from './corpoLimitado'

function req(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/x', { method: 'POST', body, headers, ...(body ? { duplex: 'half' } : {}) } as RequestInit)
}

// requisição simulada com corpo em pedaços (sem Content-Length, ou com um que mente): o limite tem que valer pelos bytes lidos.
// Não usa `new Request(stream)` porque o undici tenta enfileirar depois do cancelamento e emite um erro assíncrono de teste.
function reqEmPedacos(tamanhos: number[], headers: Record<string, string> = {}): Request {
  return { headers: new Headers(headers), body: emPedacos(tamanhos) } as unknown as Request
}

function emPedacos(tamanhos: number[]): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= tamanhos.length) { c.close(); return }
      c.enqueue(new Uint8Array(tamanhos[i++]).fill(65))
    },
  })
}

describe('lerCorpoLimitado', () => {
  it('lê o corpo inteiro quando cabe no limite', async () => {
    const r = await lerCorpoLimitado(req('abcdef'), 10)
    expect(r.ok && r.bytes.byteLength).toBe(6)
  })

  it('recusa pelo Content-Length declarado acima do limite, sem ler', async () => {
    const r = await lerCorpoLimitado(req('x', { 'content-length': '999999' }), 10)
    expect(r).toEqual({ ok: false, motivo: 'grande' })
  })

  it('recusa pelos bytes realmente lidos quando não há Content-Length', async () => {
    const r = await lerCorpoLimitado(reqEmPedacos([4, 4, 4, 4]), 10)
    expect(r).toEqual({ ok: false, motivo: 'grande' })
  })

  it('recusa quando o Content-Length mente para baixo', async () => {
    const r = await lerCorpoLimitado(reqEmPedacos([8, 8], { 'content-length': '3' }), 10)
    expect(r).toEqual({ ok: false, motivo: 'grande' })
  })

  it('aceita exatamente o limite', async () => {
    const r = await lerCorpoLimitado(reqEmPedacos([5, 5]), 10)
    expect(r.ok && r.bytes.byteLength).toBe(10)
  })
})

describe('lerFormularioLimitado', () => {
  it('interpreta multipart dentro do limite', async () => {
    const fd = new FormData()
    fd.set('descricao', 'arroz')
    fd.set('foto', new File([new Uint8Array([1, 2, 3])], 'f.jpg', { type: 'image/jpeg' }))
    const r = await lerFormularioLimitado(new Request('http://localhost/x', { method: 'POST', body: fd }), 10_000)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.form.get('descricao')).toBe('arroz')
      expect((r.form.get('foto') as File).size).toBe(3)
    }
  })

  it('recusa multipart acima do limite pelos bytes lidos', async () => {
    const r = await lerFormularioLimitado(reqEmPedacos([600, 600], { 'content-type': 'multipart/form-data; boundary=x' }), 1000)
    expect(r).toEqual({ ok: false, motivo: 'grande' })
  })

  it('recusa corpo que não é multipart', async () => {
    const r = await lerFormularioLimitado(req('{"a":1}', { 'content-type': 'application/json' }), 1000)
    expect(r).toEqual({ ok: false, motivo: 'invalido' })
  })
})
