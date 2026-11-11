'use client'
import { useEffect, useRef, useState } from 'react'
import { SIGN_ACCEPT_TEXT } from '@/lib/assinatura/validar'
import styles from './portal.module.css'

const W = 640
const H = 200

type Method = 'desenho' | 'digitado'

export function SignBox({ token, docId, text }: { token: string; docId: string; text: string }) {
  const [method, setMethod] = useState<Method>('digitado')
  const [name, setName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ hash: string } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => { if (method === 'desenho') clearCanvas() }, [method])

  function clearCanvas() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    setHasInk(false)
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = e.currentTarget.getContext('2d')
    const p = point(e)
    if (!ctx || !last.current) return
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    setHasInk(true)
  }
  function up() { drawing.current = false; last.current = null }

  async function submit() {
    setError('')
    if (method === 'desenho' && !hasInk) { setError('Faça o desenho da assinatura.'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/p/${token}/assinar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: docId, method, signerName: name, accepted,
          drawing: method === 'desenho' ? canvasRef.current?.toDataURL('image/png') : undefined,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; hash?: string }
      if (!res.ok) { setError(json.error ?? 'Não foi possível assinar. Tente de novo.'); return }
      setDone({ hash: json.hash ?? '' })
    } catch {
      setError('Sem conexão. Verifique a internet e tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return <p className={styles.tagOk} role="status">Documento assinado. Código do ato: {done.hash}. Você já pode fechar esta página.</p>
  }

  return (
    <div>
      <div className={styles.docText} tabIndex={0} aria-label="Texto do documento">{text}</div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Como você quer assinar</legend>
        <div className={styles.seg} role="radiogroup">
          <button type="button" role="radio" aria-checked={method === 'digitado'} className={method === 'digitado' ? styles.segOn : styles.segOff} onClick={() => setMethod('digitado')}>Digitar o nome</button>
          <button type="button" role="radio" aria-checked={method === 'desenho'} className={method === 'desenho' ? styles.segOn : styles.segOff} onClick={() => setMethod('desenho')}>Desenhar na tela</button>
        </div>
      </fieldset>

      <label className={styles.label} htmlFor={`nome-${docId}`}>Seu nome completo</label>
      <input id={`nome-${docId}`} className={styles.input} value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={120} />

      {method === 'desenho' && (
        <div className={styles.canvasWrap}>
          <canvas
            ref={canvasRef} width={W} height={H} className={styles.canvas}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            aria-label="Área para desenhar a assinatura"
          />
          <button type="button" className={styles.btnGhost} onClick={clearCanvas}>Limpar</button>
        </div>
      )}

      <label className={styles.check}>
        <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
        <span>{SIGN_ACCEPT_TEXT}</span>
      </label>

      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="button" className={styles.btn} disabled={busy || !accepted || name.trim().length < 5} onClick={submit}>
        {busy ? 'Assinando...' : 'Assinar documento'}
      </button>
    </div>
  )
}
