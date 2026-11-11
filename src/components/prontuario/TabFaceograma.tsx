'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient, MedicalRecord } from '@/types'
import styles from './TabFaceograma.module.css'
import { Icon } from '@/components/ui/Icon'
import { DatePicker } from '@/components/ui/DatePicker'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { ZoomCanvas, ExpandButton } from './ZoomCanvas'
import { roundCoord } from '@/lib/zoomView'
import { FACE_TOOLS, FACE_VW, FACE_VH, FACE_SHORTCUTS, faceRegion, sessionTotals, formatTotal, type FaceAnnotation, type FaceSession } from '@/lib/faceograma'

const tColor = (k: string) => FACE_TOOLS.find(t => t.key === k)?.color ?? '#6B7280'
const tBg    = (k: string) => FACE_TOOLS.find(t => t.key === k)?.bg    ?? '#F3F4F6'
const tAbbr  = (k: string) => FACE_TOOLS.find(t => t.key === k)?.abbr  ?? '?'
const tLabel = (k: string) => FACE_TOOLS.find(t => t.key === k)?.label ?? k

type Annotation = FaceAnnotation
type Session    = FaceSession
const VW = FACE_VW
const VH = FACE_VH

function newSession(): Session {
  return { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), notes: '', annotations: [] }
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
// o nome da região acompanha o ponto quando é o automático; um nome que o profissional digitou fica
function movedPatch(a: Annotation, x: number, y: number): Partial<Annotation> {
  const auto = !a.region || a.region === faceRegion(a.x, a.y)
  return auto ? { x, y, region: faceRegion(x, y) } : { x, y }
}
const fmtSessionDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })

interface Props { record: MedicalRecord | null; patient: Patient; clinicId: string; onSaved: () => void; onDirtyChange?: (dirty: boolean) => void }

export function TabFaceograma({ record, patient, clinicId, onSaved, onDirtyChange }: Props) {
  const [initial]                  = useState<Session[]>(() => [newSession()])
  const [sessions,  setSessions]  = useState<Session[]>(initial)
  const [savedSnap, setSavedSnap] = useState(() => JSON.stringify(initial))
  const [undoStack, setUndoStack] = useState<{ sid: string; annotations: Annotation[] }[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [tool,      setTool]      = useState('toxina')
  const [selId,     setSelId]     = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [fs,        setFs]        = useState(false)
  const sidePanelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; cx: number; cy: number; moved: boolean } | null>(null)
  const nudgeRef = useRef<{ id: string; t: number } | null>(null)

  // O prontuário recarrega o registro quando QUALQUER aba salva. Só reaplica aqui se o faceograma
  // mudou de fato; senão salvar outra aba apagaria o que foi marcado aqui e ainda não foi salvo.
  const loadedKey = useRef<string | null>(null)
  useEffect(() => {
    const key = JSON.stringify(record?.aesthetic_protocols ?? null)
    if (key === loadedKey.current) return
    loadedKey.current = key
    const raw = record?.aesthetic_protocols as Session[] | undefined
    const next = Array.isArray(raw) && raw.length > 0 ? raw : [newSession()]
    setSessions(next); setActiveIdx(0); setSavedSnap(JSON.stringify(next)); setUndoStack([])
  }, [record])

  // avisa o prontuário, que pergunta antes de fechar com alterações não salvas
  const dirty = JSON.stringify(sessions) !== savedSnap
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // Auto-scroll to side panel on mobile when a point is selected
  useEffect(() => {
    if (!selId || !sidePanelRef.current || fs) return
    if (window.innerWidth > 680) return
    setTimeout(() => {
      sidePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }, [selId, fs])

  const session = sessions[activeIdx]
  const selAnn  = session?.annotations.find(a => a.id === selId) ?? null
  const totals  = sessionTotals(session?.annotations ?? [])

  function updSession(fn: (s: Session) => Session) {
    setSessions(prev => prev.map((s, i) => i === activeIdx ? fn(s) : s))
  }
  function updAnn(id: string, patch: Partial<Annotation>) {
    updSession(s => ({ ...s, annotations: s.annotations.map(a => a.id === id ? { ...a, ...patch } : a) }))
  }
  // guarda os pontos da sessão antes de uma mudança, para o "Desfazer"
  function rememberForUndo() {
    setUndoStack(st => [...st.slice(-29), { sid: session.id, annotations: session.annotations }])
  }
  function undo() {
    const last = undoStack[undoStack.length - 1]
    if (!last) return
    setUndoStack(st => st.slice(0, -1))
    const idx = sessions.findIndex(s => s.id === last.sid)
    if (idx < 0) return
    setSessions(prev => prev.map(s => s.id === last.sid ? { ...s, annotations: last.annotations } : s))
    setActiveIdx(idx)
    setSelId(null)
  }
  function delAnn(id: string) {
    rememberForUndo()
    updSession(s => ({ ...s, annotations: s.annotations.filter(a => a.id !== id) }))
    setSelId(null)
  }
  // coordenada do viewBox sob o ponteiro, na tela normal (sem zoom): pelo SVG que contém o ponto
  function toSvg(e: React.PointerEvent<SVGGElement>) {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    return { x: Math.round(((e.clientX - r.left) / r.width) * VW), y: Math.round(((e.clientY - r.top) / r.height) * VH) }
  }

  // Toque ou clique em (x, y): se pegou um ponto existente seleciona (ou fecha a seleção) e devolve true
  function selectAt(x: number, y: number, radius: number): boolean {
    for (const a of session.annotations) {
      if (Math.hypot(a.x - x, a.y - y) < radius) { setSelId(a.id === selId ? null : a.id); return true }
    }
    return false
  }
  function placeAt(x: number, y: number) {
    const ann: Annotation = { id: crypto.randomUUID(), x, y, type: tool, qty: '', note: '', region: faceRegion(x, y) }
    rememberForUndo()
    updSession(s => ({ ...s, annotations: [...s.annotations, ann] }))
    setSelId(ann.id)
  }
  function handleFaceClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg  = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x    = Math.round(((e.clientX - rect.left)  / rect.width)  * VW)
    const y    = Math.round(((e.clientY - rect.top)   / rect.height) * VH)
    if (selectAt(x, y, 14)) return
    placeAt(x, y)
  }

  function addSession() {
    const s = newSession()
    setSessions(p => [...p, s])
    setActiveIdx(sessions.length)
    setSelId(null)
  }
  async function delSession(i: number) {
    if (sessions.length === 1) return
    const target = sessions[i]
    if (target.annotations.length > 0 || target.notes.trim()) {
      const n = target.annotations.length
      const ok = await confirmDialog({
        title: 'Excluir esta sessão?',
        message: `A sessão de ${fmtSessionDate(target.date)}${n > 0 ? ` e ${n === 1 ? 'o ponto marcado' : `os ${n} pontos marcados`}` : ''} serão removidos. Isso só vale depois de salvar o faceograma.`,
        confirmText: 'Excluir sessão',
        cancelText: 'Manter',
        danger: true,
      })
      if (!ok) return
    }
    const next = sessions.filter((_, idx) => idx !== i)
    setSessions(next)
    setActiveIdx(Math.min(activeIdx, next.length - 1))
    setSelId(null)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      clinic_id: clinicId, patient_id: patient.id,
      aesthetic_protocols: sessions,
      updated_at: new Date().toISOString(),
    }
    if (record?.id) await supabase.from('medical_records').update(payload).eq('id', record.id)
    else            await supabase.from('medical_records').insert([payload])
    setSavedSnap(JSON.stringify(sessions)); setUndoStack([])
    setSaved(true); setTimeout(() => setSaved(false), 2500)
    setSaving(false); onSaved()
  }

  function renderToolbar() {
    return (
      <div className={styles.toolbar} data-hscroll>
        <span className={styles.toolbarLabel}>Marcar:</span>
        {FACE_TOOLS.map(t => (
          <button key={t.key} type="button"
            aria-label={t.label}
            aria-pressed={tool === t.key}
            className={`${styles.toolBtn} ${tool === t.key ? styles.toolBtnActive : ''}`}
            style={{ '--tc': t.color, '--tbg': t.bg } as React.CSSProperties}
            onClick={() => setTool(t.key)}>
            <span className={styles.toolDot} style={{ background: t.color }}/>
            <span className={styles.toolLabel}>{t.label}</span>
          </button>
        ))}
      </div>
    )
  }

  // `p` prefixa os ids dos campos: a tela cheia e a tela normal podem estar montadas ao mesmo tempo
  function renderAnnEditor(p: string) {
    if (!selAnn) return null
    return (
      <div className={styles.annPanel}
        style={{ '--ann-color': tColor(selAnn.type) } as React.CSSProperties}>
        <div className={styles.annHeader}>
          <span className={styles.annDot} style={{ background: tColor(selAnn.type) }}/>
          <span className={styles.annTitle}>{tLabel(selAnn.type)}</span>
          <button type="button" className={styles.annDel} onClick={() => delAnn(selAnn.id)} aria-label="Remover este ponto" title="Remover este ponto"><Icon name="close" size={13} /></button>
        </div>
        <div className={styles.annFields}>
          <div className={styles.annField}>
            <p className={styles.annFieldLabel}>Tipo de tratamento</p>
            <div className={styles.typeGrid}>
              {FACE_TOOLS.map(t => (
                <button key={t.key} type="button"
                  className={`${styles.typeBtn} ${selAnn.type === t.key ? styles.typeBtnActive : ''}`}
                  style={{ '--tc': t.color, '--tbg': t.bg } as React.CSSProperties}
                  onClick={() => { if (selAnn.type !== t.key) { rememberForUndo(); updAnn(selAnn.id, { type: t.key }) } }}>
                  <span style={{ background: t.color, width: 7, height: 7, borderRadius: '50%', display: 'inline-block' }}/>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.annField}>
            <label className={styles.annFieldLabel} htmlFor={`${p}annRegion`}>Região</label>
            <input id={`${p}annRegion`} type="text" className={styles.annInput}
              value={selAnn.region ?? ''}
              placeholder="ex: Glabela, Frontal..."
              onChange={e => updAnn(selAnn.id, { region: e.target.value })}/>
          </div>
          <div className={styles.annField}>
            <p className={styles.annFieldLabel}>Dose / Volume</p>
            <input type="text" className={styles.annInput}
              value={selAnn.qty}
              placeholder="ex: 20U, 0.5ml, 1A..."
              onChange={e => updAnn(selAnn.id, { qty: e.target.value })}/>
          </div>
          <div className={styles.annField}>
            <p className={styles.annFieldLabel}>Nota</p>
            <textarea className={styles.annNote} rows={3}
              value={selAnn.note}
              placeholder="Local específico, técnica, dilução..."
              onChange={e => updAnn(selAnn.id, { note: e.target.value })}/>
          </div>
        </div>
      </div>
    )
  }

  // A imagem de referência e os pontos, em coordenadas do viewBox. `k` escala os marcadores (1 na tela normal;
  // na tela cheia é o inverso do zoom, para manterem o tamanho visual) e `toVB` converte o evento em coordenada.
  function renderImageAndPoints(k: number, toVB: (e: React.PointerEvent<SVGGElement>) => { x: number; y: number }) {
    return (
      <>
        {/* Anatomical reference — WebP (19 KB) com fallback PNG (1.3 MB) */}
        <image
          href="/rosto.webp"
          x="0" y="0"
          width={VW} height={VH}
          preserveAspectRatio="xMidYMid meet"
        />
        {session.annotations.map(a => {
          const isSel = a.id === selId
          const col   = tColor(a.type)
          return (
            <g key={a.id} className={styles.point}
              style={{ cursor: 'grab', touchAction: isSel ? 'none' : undefined }}
              // k = 1 na tela normal. Na tela cheia o marcador escala em torno do próprio centro (tamanho visual constante)
              transform={k === 1 ? undefined : `translate(${a.x} ${a.y}) scale(${k}) translate(${-a.x} ${-a.y})`}
              // diz à tela cheia que este ponto cuida do próprio arraste (no toque, só o selecionado)
              data-zc-drag={isSel ? 'all' : 'mouse'}
              role="button" tabIndex={0}
              aria-label={`${tLabel(a.type)}${a.region ? `, ${a.region}` : ''}${a.qty ? `, ${a.qty}` : ''}. Enter edita, setas movem, Delete remove.`}
              onPointerDown={e => {
                if (e.button !== 0) return
                // no toque, só arrasta o ponto que já está selecionado (senão atrapalha rolar a tela)
                if (e.pointerType === 'touch' && a.id !== selId) return
                dragRef.current = { id: a.id, cx: e.clientX, cy: e.clientY, moved: false }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={e => {
                const d = dragRef.current
                if (!d || d.id !== a.id) return
                if (!d.moved) {
                  if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 5) return
                  d.moved = true
                  rememberForUndo()
                }
                const p = toVB(e)
                updAnn(a.id, movedPatch(a, clamp(p.x, 0, VW), clamp(p.y, 0, VH)))
              }}
              onPointerUp={() => { setTimeout(() => { dragRef.current = null }, 0) }}
              onPointerCancel={() => { setTimeout(() => { dragRef.current = null }, 0) }}
              onKeyDown={e => {
                const step = e.shiftKey ? 8 : 2
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(a.id) }
                else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delAnn(a.id) }
                else if (e.key.startsWith('Arrow')) {
                  e.preventDefault()
                  // setas seguidas no mesmo ponto contam como um único passo do "Desfazer"
                  const now = Date.now()
                  if (nudgeRef.current?.id !== a.id || now - nudgeRef.current.t > 800) rememberForUndo()
                  nudgeRef.current = { id: a.id, t: now }
                  updAnn(a.id, movedPatch(
                    a,
                    clamp(a.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), 0, VW),
                    clamp(a.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0), 0, VH),
                  ))
                }
              }}
              onClick={e => {
                e.stopPropagation()
                if (dragRef.current?.moved) { setSelId(a.id); return }
                setSelId(a.id === selId ? null : a.id)
              }}>
              {isSel && (
                <circle cx={a.x} cy={a.y} r={20} fill="none"
                  stroke={col} strokeWidth="1.2" strokeDasharray="3,2" opacity="0.7"/>
              )}
              {/* Drop shadow for visibility against complex background */}
              <circle cx={a.x + 0.5} cy={a.y + 0.8} r={isSel ? 13.5 : 10.5}
                fill="rgba(0,0,0,0.35)" opacity="0.6"/>
              <circle cx={a.x} cy={a.y} r={isSel ? 13 : 10}
                fill={tBg(a.type)} fillOpacity="0.93"
                stroke={col} strokeWidth={isSel ? 2.4 : 1.8}/>
              <text x={a.x} y={a.y + 3.5} textAnchor="middle"
                fill={col} fontSize="8.5" fontWeight="700"
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {tAbbr(a.type)}
              </text>
            </g>
          )
        })}

      </>
    )
  }

  if (!session) return null

  return (
    <div className={styles.wrap}>

      {/* ── Session bar ── */}
      <div className={styles.sessionBar}>
        <div className={styles.sessionTabs}>
          {sessions.map((s, i) => (
            <div key={s.id}
              className={`${styles.sessionTab} ${i === activeIdx ? styles.sessionTabActive : ''}`}
              onClick={() => { setActiveIdx(i); setSelId(null) }}>
              {fmtSessionDate(s.date)}
              {sessions.length > 1 && (
                <button type="button" className={styles.sessionDel}
                  aria-label={`Excluir a sessão de ${fmtSessionDate(s.date)}`}
                  onClick={e => { e.stopPropagation(); delSession(i) }}>×</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" className={styles.btnNewSession} onClick={addSession}>+ Sessão</button>
      </div>

      <div className={styles.layout}>

        {/* ── Face canvas ── */}
        <div className={styles.faceCol}>

          {/* Tool selector */}
          {renderToolbar()}

          {/* Anatomical face reference + annotation overlay */}
          <div className={styles.faceWrap}>
            <ExpandButton onClick={() => setFs(true)} />
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              className={styles.faceSvg}
              onClick={handleFaceClick}
              style={{ cursor: 'crosshair' }}
            >
              {renderImageAndPoints(1, toSvg)}
            </svg>
          </div>

          <div className={styles.faceFoot}>
            <p className={styles.faceHint}>
              Clique no rosto para marcar · Clique num ponto para editar · Arraste para mover
            </p>
            <button type="button" className={styles.undoBtn} onClick={undo} disabled={undoStack.length === 0}>
              Desfazer
            </button>
          </div>
        </div>

        {/* ── Tela cheia: a mesma sessão e as mesmas ferramentas, numa visão ampliada ── */}
        <ZoomCanvas
          open={fs} onClose={() => setFs(false)}
          title="Faceograma em tela cheia" vw={VW} vh={VH} markerPx={1.5}
          shortcuts={FACE_SHORTCUTS}
          onSelectAt={selectAt} onPlace={placeAt}
          panel={
            <div className={styles.fsPanel}>
              {renderToolbar()}
              <div className={styles.faceFoot}>
                <p className={styles.faceHint}>{session.annotations.length} {session.annotations.length === 1 ? 'ponto marcado' : 'pontos marcados'}</p>
                <button type="button" className={styles.undoBtn} onClick={undo} disabled={undoStack.length === 0}>
                  Desfazer
                </button>
              </div>
              {renderAnnEditor('fs-')}
            </div>
          }>
          {ctx => renderImageAndPoints(ctx.k, e => {
            const p = ctx.toViewBox(e.clientX, e.clientY)
            return { x: roundCoord(p.x), y: roundCoord(p.y) }
          })}
        </ZoomCanvas>

        {/* ── Side panel ── */}
        <div className={styles.sidePanel} ref={sidePanelRef}>

          {/* Session meta */}
          <div className={styles.sideSec}>
            <p className={styles.sideLabel}>Data da sessão</p>
            <DatePicker ariaLabel="Data da sessão" value={session.date}
              onChange={v => updSession(s => ({ ...s, date: v }))} />
            <p className={styles.sideLabel} style={{ marginTop: '0.75rem' }}>Observações</p>
            <textarea className={styles.notesArea} rows={4}
              value={session.notes}
              placeholder="Queixas, contraindicações, lote do produto..."
              onChange={e => updSession(s => ({ ...s, notes: e.target.value }))}/>
          </div>

          {/* Selected annotation editor */}
          {renderAnnEditor('')}

          {/* Total por produto na sessão */}
          {totals.totals.length > 0 && (
            <div className={styles.sideSec}>
              <p className={styles.sideLabel}>Total da sessão</p>
              <ul className={styles.totals}>
                {totals.totals.map(t => (
                  <li key={`${t.tool}|${t.unit}`} style={{ '--ann-color': tColor(t.tool) } as React.CSSProperties}>
                    <span className={styles.annItemDot} style={{ background: tColor(t.tool) }}/>
                    <span className={styles.totalName}>{tLabel(t.tool)}</span>
                    <b>{formatTotal(t)}</b>
                    <small>{t.points} {t.points === 1 ? 'ponto' : 'pontos'}</small>
                  </li>
                ))}
              </ul>
              {totals.semDose > 0 && (
                <p className={styles.totalsHint}>{totals.semDose} {totals.semDose === 1 ? 'ponto sem dose preenchida' : 'pontos sem dose preenchida'} não entram na soma.</p>
              )}
            </div>
          )}

          {/* Annotations list */}
          {session.annotations.length > 0 && (
            <div className={styles.sideSec}>
              <p className={styles.sideLabel}>Pontos marcados ({session.annotations.length})</p>
              <div className={styles.annList}>
                {session.annotations.map(a => (
                  <div key={a.id}
                    className={`${styles.annItem} ${a.id === selId ? styles.annItemActive : ''}`}
                    style={{ '--ann-color': tColor(a.type) } as React.CSSProperties}
                    onClick={() => setSelId(a.id === selId ? null : a.id)}>
                    <span className={styles.annItemDot} style={{ background: tColor(a.type) }}/>
                    <div className={styles.annItemBody}>
                      <span className={styles.annItemName}>{tLabel(a.type)}{a.region ? ` · ${a.region}` : ''}</span>
                      {a.qty  && <span className={styles.annItemQty}>{a.qty}</span>}
                      {a.note && <span className={styles.annItemNote}>{a.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {session.annotations.length === 0 && !selAnn && (
            <div className={styles.emptyHint}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
              </svg>
              <p>Selecione uma ferramenta e clique no rosto para marcar os pontos de tratamento.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Save ── */}
      <div className={styles.saveRow}>
        {dirty && !saving && <span className={styles.unsavedMsg}>Alterações não salvas</span>}
        {saved && <span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo com sucesso!</span>}
        <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Faceograma'}
        </button>
      </div>
    </div>
  )
}
