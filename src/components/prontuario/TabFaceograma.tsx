'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient, MedicalRecord } from '@/types'
import styles from './TabFaceograma.module.css'
import { Icon } from '@/components/ui/Icon'

const TOOLS = [
  { key: 'toxina',         label: 'Toxina botulínica', abbr: 'Tx', color: '#3B82F6', bg: '#DBEAFE' },
  { key: 'preenchimento',  label: 'Preenchimento',     abbr: 'Pr', color: '#8B5CF6', bg: '#EDE9FE' },
  { key: 'bioestimulador', label: 'Bioestimulador',    abbr: 'Bi', color: '#F59E0B', bg: '#FEF3C7' },
  { key: 'fio',            label: 'Fio tensor',        abbr: 'Fi', color: '#EC4899', bg: '#FCE7F3' },
  { key: 'ultrassom',      label: 'Ultrassom/Micro',   abbr: 'Us', color: '#10B981', bg: '#D1FAE5' },
]
const tColor = (k: string) => TOOLS.find(t => t.key === k)?.color ?? '#6B7280'
const tBg    = (k: string) => TOOLS.find(t => t.key === k)?.bg    ?? '#F3F4F6'
const tAbbr  = (k: string) => TOOLS.find(t => t.key === k)?.abbr  ?? '?'
const tLabel = (k: string) => TOOLS.find(t => t.key === k)?.label ?? k

interface Annotation { id: string; x: number; y: number; type: string; qty: string; note: string }
interface Session    { id: string; date: string; notes: string; annotations: Annotation[] }

function newSession(): Session {
  return { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), notes: '', annotations: [] }
}

// ViewBox dimensioned to match the anatomical reference image aspect ratio (1290×1068)
const VW = 300
const VH = Math.round(300 * (1068 / 1290)) // ≈ 248

interface Props { record: MedicalRecord | null; patient: Patient; clinicId: string; onSaved: () => void }

export function TabFaceograma({ record, patient, clinicId, onSaved }: Props) {
  const [sessions,  setSessions]  = useState<Session[]>([newSession()])
  const [activeIdx, setActiveIdx] = useState(0)
  const [tool,      setTool]      = useState('toxina')
  const [selId,     setSelId]     = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const sidePanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = record?.aesthetic_protocols as Session[] | undefined
    if (Array.isArray(raw) && raw.length > 0) { setSessions(raw); setActiveIdx(0) }
    else setSessions([newSession()])
  }, [record])

  // Auto-scroll to side panel on mobile when a point is selected
  useEffect(() => {
    if (!selId || !sidePanelRef.current) return
    if (window.innerWidth > 680) return
    setTimeout(() => {
      sidePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }, [selId])

  const session = sessions[activeIdx]
  const selAnn  = session?.annotations.find(a => a.id === selId) ?? null

  function updSession(fn: (s: Session) => Session) {
    setSessions(prev => prev.map((s, i) => i === activeIdx ? fn(s) : s))
  }
  function updAnn(id: string, patch: Partial<Annotation>) {
    updSession(s => ({ ...s, annotations: s.annotations.map(a => a.id === id ? { ...a, ...patch } : a) }))
  }
  function delAnn(id: string) {
    updSession(s => ({ ...s, annotations: s.annotations.filter(a => a.id !== id) }))
    setSelId(null)
  }

  function handleFaceClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg  = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x    = Math.round(((e.clientX - rect.left)  / rect.width)  * VW)
    const y    = Math.round(((e.clientY - rect.top)   / rect.height) * VH)
    for (const a of session.annotations) {
      if (Math.hypot(a.x - x, a.y - y) < 14) { setSelId(a.id === selId ? null : a.id); return }
    }
    const ann: Annotation = { id: crypto.randomUUID(), x, y, type: tool, qty: '', note: '' }
    updSession(s => ({ ...s, annotations: [...s.annotations, ann] }))
    setSelId(ann.id)
  }

  function addSession() {
    const s = newSession()
    setSessions(p => [...p, s])
    setActiveIdx(sessions.length)
    setSelId(null)
  }
  function delSession(i: number) {
    if (sessions.length === 1) return
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
    setSaved(true); setTimeout(() => setSaved(false), 2500)
    setSaving(false); onSaved()
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
              {new Date(s.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
              {sessions.length > 1 && (
                <button type="button" className={styles.sessionDel}
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
          <div className={styles.toolbar} data-hscroll>
            <span className={styles.toolbarLabel}>Marcar:</span>
            {TOOLS.map(t => (
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

          {/* Anatomical face reference + annotation overlay */}
          <div className={styles.faceWrap}>
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              className={styles.faceSvg}
              onClick={handleFaceClick}
              style={{ cursor: 'crosshair' }}
            >
              {/* Anatomical reference — WebP (19 KB) com fallback PNG (1.3 MB) */}
              <image
                href="/rosto.webp"
                x="0" y="0"
                width={VW} height={VH}
                preserveAspectRatio="xMidYMid meet"
              />

              {/* ── Annotation points ── */}
              {session.annotations.map(a => {
                const isSel = a.id === selId
                const col   = tColor(a.type)
                return (
                  <g key={a.id} style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setSelId(a.id === selId ? null : a.id) }}>
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
            </svg>
          </div>

          <p className={styles.faceHint}>
            Clique no rosto para marcar · Clique num ponto para editar
          </p>
        </div>

        {/* ── Side panel ── */}
        <div className={styles.sidePanel} ref={sidePanelRef}>

          {/* Session meta */}
          <div className={styles.sideSec}>
            <p className={styles.sideLabel}>Data da sessão</p>
            <input type="date" className={styles.dateInput} value={session.date}
              onChange={e => updSession(s => ({ ...s, date: e.target.value }))}/>
            <p className={styles.sideLabel} style={{ marginTop: '0.75rem' }}>Observações</p>
            <textarea className={styles.notesArea} rows={4}
              value={session.notes}
              placeholder="Queixas, contraindicações, lote do produto..."
              onChange={e => updSession(s => ({ ...s, notes: e.target.value }))}/>
          </div>

          {/* Selected annotation editor */}
          {selAnn && (
            <div className={styles.annPanel}
              style={{ '--ann-color': tColor(selAnn.type) } as React.CSSProperties}>
              <div className={styles.annHeader}>
                <span className={styles.annDot} style={{ background: tColor(selAnn.type) }}/>
                <span className={styles.annTitle}>{tLabel(selAnn.type)}</span>
                <button type="button" className={styles.annDel} onClick={() => delAnn(selAnn.id)}><Icon name="close" size={13} /></button>
              </div>

              <div className={styles.annFields}>
                <div className={styles.annField}>
                  <p className={styles.annFieldLabel}>Tipo de tratamento</p>
                  <div className={styles.typeGrid}>
                    {TOOLS.map(t => (
                      <button key={t.key} type="button"
                        className={`${styles.typeBtn} ${selAnn.type === t.key ? styles.typeBtnActive : ''}`}
                        style={{ '--tc': t.color, '--tbg': t.bg } as React.CSSProperties}
                        onClick={() => updAnn(selAnn.id, { type: t.key })}>
                        <span style={{ background: t.color, width: 7, height: 7, borderRadius: '50%', display: 'inline-block' }}/>
                        {t.label}
                      </button>
                    ))}
                  </div>
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
                      <span className={styles.annItemName}>{tLabel(a.type)}</span>
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
        {saved && <span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo com sucesso!</span>}
        <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Faceograma'}
        </button>
      </div>
    </div>
  )
}
