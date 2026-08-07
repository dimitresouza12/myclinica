'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient, MedicalRecord } from '@/types'
import styles from './TabCorpograma.module.css'
import { Icon } from '@/components/ui/Icon'

const TOOLS = [
  { key: 'criolipolise',     label: 'Criolipólise',        abbr: 'Cr', color: '#3B82F6', bg: '#DBEAFE' },
  { key: 'radiofrequencia',  label: 'Radiofrequência',     abbr: 'Rf', color: '#F59E0B', bg: '#FEF3C7' },
  { key: 'drenagem',         label: 'Drenagem linfática',  abbr: 'Dr', color: '#10B981', bg: '#D1FAE5' },
  { key: 'massagem',         label: 'Massagem modeladora', abbr: 'Ma', color: '#EC4899', bg: '#FCE7F3' },
  { key: 'carboxiterapia',   label: 'Carboxiterapia',      abbr: 'Ca', color: '#8B5CF6', bg: '#EDE9FE' },
  { key: 'ventosaterapia',   label: 'Ventosaterapia',      abbr: 'Ve', color: '#EF4444', bg: '#FEE2E2' },
]
const tColor = (k: string) => TOOLS.find(t => t.key === k)?.color ?? '#6B7280'
const tBg    = (k: string) => TOOLS.find(t => t.key === k)?.bg    ?? '#F3F4F6'
const tAbbr  = (k: string) => TOOLS.find(t => t.key === k)?.abbr  ?? '?'
const tLabel = (k: string) => TOOLS.find(t => t.key === k)?.label ?? k

interface Annotation { id: string; x: number; y: number; view: 'frente' | 'costas'; type: string; qty: string; note: string }
interface Session    { id: string; date: string; notes: string; annotations: Annotation[] }

function newSession(): Session {
  return { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), notes: '', annotations: [] }
}

const VW = 210
const VH = 280

interface Props { record: MedicalRecord | null; patient: Patient; clinicId: string; onSaved: () => void }

export function TabCorpograma({ record, patient, clinicId, onSaved }: Props) {
  const [sessions,  setSessions]  = useState<Session[]>([newSession()])
  const [activeIdx, setActiveIdx] = useState(0)
  const [tool,      setTool]      = useState('criolipolise')
  const [view,      setView]      = useState<'frente' | 'costas'>('frente')
  const [selId,     setSelId]     = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const sidePanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = record?.body_protocols as Session[] | undefined
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
  const visibleAnnotations = session?.annotations.filter(a => a.view === view) ?? []
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

  function handleBodyClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg  = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x    = Math.round(((e.clientX - rect.left)  / rect.width)  * VW)
    const y    = Math.round(((e.clientY - rect.top)   / rect.height) * VH)
    for (const a of visibleAnnotations) {
      if (Math.hypot(a.x - x, a.y - y) < 10) { setSelId(a.id === selId ? null : a.id); return }
    }
    const ann: Annotation = { id: crypto.randomUUID(), x, y, view, type: tool, qty: '', note: '' }
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
      body_protocols: sessions,
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

        {/* ── Body canvas ── */}
        <div className={styles.bodyCol}>

          {/* Tool selector */}
          <div className={styles.toolbar}>
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

          {/* Frente/Costas toggle */}
          <div className={styles.viewToggle}>
            <button type="button"
              className={`${styles.viewBtn} ${view === 'frente' ? styles.viewBtnActive : ''}`}
              onClick={() => { setView('frente'); setSelId(null) }}>Frente</button>
            <button type="button"
              className={`${styles.viewBtn} ${view === 'costas' ? styles.viewBtnActive : ''}`}
              onClick={() => { setView('costas'); setSelId(null) }}>Costas</button>
          </div>

          {/* Body silhouette + annotation overlay */}
          <div className={styles.bodyWrap}>
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              className={styles.bodySvg}
              onClick={handleBodyClick}
              style={{ cursor: 'crosshair' }}
            >
              {/* Referência anatômica — WebP, ver ATTRIBUTIONS.md (CC BY-SA 3.0, Termininja/Wikimedia, recolorido) */}
              <image
                href={view === 'frente' ? '/corpo-frente.webp' : '/corpo-costas.webp'}
                x="0" y="0"
                width={VW} height={VH}
                preserveAspectRatio="xMidYMid meet"
              />

              {/* ── Annotation points ── */}
              {visibleAnnotations.map(a => {
                const isSel = a.id === selId
                const col   = tColor(a.type)
                return (
                  <g key={a.id} style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setSelId(a.id === selId ? null : a.id) }}>
                    {isSel && (
                      <circle cx={a.x} cy={a.y} r={14} fill="none"
                        stroke={col} strokeWidth="1" strokeDasharray="2.5,1.5" opacity="0.7"/>
                    )}
                    <circle cx={a.x + 0.4} cy={a.y + 0.6} r={isSel ? 9.5 : 7.5}
                      fill="rgba(0,0,0,0.3)" opacity="0.5"/>
                    <circle cx={a.x} cy={a.y} r={isSel ? 9 : 7}
                      fill={tBg(a.type)} fillOpacity="0.94"
                      stroke={col} strokeWidth={isSel ? 2 : 1.5}/>
                    <text x={a.x} y={a.y + 2.6} textAnchor="middle"
                      fill={col} fontSize="6.5" fontWeight="700"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {tAbbr(a.type)}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          <p className={styles.bodyHint}>
            Clique no corpo para marcar · Clique num ponto para editar
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
              placeholder="Queixas, contraindicações, medidas..."
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
                  <p className={styles.annFieldLabel}>Sessões / Intensidade</p>
                  <input type="text" className={styles.annInput}
                    value={selAnn.qty}
                    placeholder="ex: 10 sessões, nível 3..."
                    onChange={e => updAnn(selAnn.id, { qty: e.target.value })}/>
                </div>
                <div className={styles.annField}>
                  <p className={styles.annFieldLabel}>Nota</p>
                  <textarea className={styles.annNote} rows={3}
                    value={selAnn.note}
                    placeholder="Local específico, técnica, observações..."
                    onChange={e => updAnn(selAnn.id, { note: e.target.value })}/>
                </div>
              </div>
            </div>
          )}

          {/* Annotations list */}
          {visibleAnnotations.length > 0 && (
            <div className={styles.sideSec}>
              <p className={styles.sideLabel}>Pontos marcados · {view === 'frente' ? 'Frente' : 'Costas'} ({visibleAnnotations.length})</p>
              <div className={styles.annList}>
                {visibleAnnotations.map(a => (
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

          {visibleAnnotations.length === 0 && !selAnn && (
            <div className={styles.emptyHint}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
              </svg>
              <p>Selecione uma ferramenta e clique no corpo para marcar os pontos de tratamento.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Save ── */}
      <div className={styles.saveRow}>
        {saved && <span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo com sucesso!</span>}
        <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Corpograma'}
        </button>
      </div>
    </div>
  )
}
