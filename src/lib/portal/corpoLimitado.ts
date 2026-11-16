// Leitura do corpo de uma requisição pública com limite em bytes REAIS lidos (SÓ NO SERVIDOR).
//
// Content-Length é só uma declaração do cliente: pode faltar (corpo em pedaços) ou mentir. Por isso o corpo é lido do
// fluxo e a leitura é cancelada assim que passa do limite, sem nunca guardar mais que `maxBytes` na memória.

export type CorpoLido = { ok: true; bytes: Uint8Array } | { ok: false; motivo: 'grande' | 'erro' }

export async function lerCorpoLimitado(req: Request, maxBytes: number): Promise<CorpoLido> {
  const declarado = Number(req.headers.get('content-length') ?? 0)
  if (Number.isFinite(declarado) && declarado > maxBytes) return { ok: false, motivo: 'grande' }
  if (!req.body) return { ok: true, bytes: new Uint8Array(0) }

  const reader = req.body.getReader()
  const pedacos: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, motivo: 'grande' }
      }
      pedacos.push(value)
    }
  } catch {
    return { ok: false, motivo: 'erro' }
  }

  const bytes = new Uint8Array(total)
  let ofs = 0
  for (const p of pedacos) { bytes.set(p, ofs); ofs += p.byteLength }
  return { ok: true, bytes }
}

/** Lê o corpo (com limite) e o interpreta como multipart/form-data. */
export async function lerFormularioLimitado(req: Request, maxBytes: number): Promise<{ ok: true; form: FormData } | { ok: false; motivo: 'grande' | 'invalido' }> {
  const tipo = req.headers.get('content-type') ?? ''
  if (!tipo.toLowerCase().startsWith('multipart/form-data')) return { ok: false, motivo: 'invalido' }
  const corpo = await lerCorpoLimitado(req, maxBytes)
  if (!corpo.ok) return { ok: false, motivo: corpo.motivo === 'grande' ? 'grande' : 'invalido' }
  try {
    const form = await new Response(corpo.bytes as BodyInit, { headers: { 'content-type': tipo } }).formData()
    return { ok: true, form }
  } catch {
    return { ok: false, motivo: 'invalido' }
  }
}
