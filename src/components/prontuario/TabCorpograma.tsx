'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Patient, MedicalRecord } from '@/types'
import styles from './TabCorpograma.module.css'
import { Icon } from '@/components/ui/Icon'
import { DatePicker } from '@/components/ui/DatePicker'
import { PillTabs } from '@/components/ui/PillTabs'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { ZoomCanvas, ExpandButton } from './ZoomCanvas'
import { RefImage } from './RefImage'
import { BODY_IMAGES, bodySexFor } from '@/lib/referenceImages'
import {
  BODY_MODE_LABEL, BODY_VW, BODY_VH, EVA_LEVEL_LABEL, EVA_NO_VALUE_COLOR, EVA_VALUES,
  bodyShortcuts, bodyTotals, evaColor, evaLevel, formatBodyTotal, isMeaningfulSession, mergeUndoAnnotations, modesForSpecialties, painHistory, painSummary,
  painTrend, parseEva, sessionMode, toolAbbr, toolBg, toolColor, toolLabel, toolsFor,
  type BodyAnnotation, type BodyMode, type BodySession,
} from '@/lib/corpograma'

type Annotation = BodyAnnotation
type Session = BodySession

function newSession(mode: BodyMode): Session {
  return { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), notes: '', annotations: [], ...(mode === 'dor' ? { mode: 'dor' as const } : {}) }
}
// só o que tem algo registrado conta como alteração (uma sessão em branco nunca deve acender "não salvo")
const snapshot = (list: Session[]) => JSON.stringify(list.filter(isMeaningfulSession))
const fmtDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
const fmtShort = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const fmtNum = (n: number) => String(n).replace('.', ',')

// Enter e Espaço ativam o que não é um <button> de verdade (aba de sessão, item da lista, ponto no corpo)
const onActivateKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault(); e.stopPropagation(); fn()
}

const VW = BODY_VW
const VH = BODY_VH

interface Props {
  record: MedicalRecord | null; patient: Patient; clinicId: string; onSaved: () => void; onDirtyChange?: (dirty: boolean) => void
  /** Modos liberados. Sem isto, vêm das áreas da clínica: estética = Tratamento, fisioterapia = Dor. */
  modos?: BodyMode[]
}

export function TabCorpograma({ record, patient, clinicId, onSaved, onDirtyChange, modos }: Props) {
  const clinic = useAuthStore(s => s.clinic)
  const availableModes = useMemo<BodyMode[]>(
    () => modos && modos.length > 0 ? modos : modesForSpecialties(clinic ? (clinic.specialties?.length ? clinic.specialties : [clinic.type]) : null),
    [modos, clinic],
  )
  const [mode,      setModeState] = useState<BodyMode>(availableModes[0])
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [savedSnap, setSavedSnap] = useState(() => snapshot([]))
  const [undoStack, setUndoStack] = useState<{ sid: string; annotations: Annotation[] }[]>([])
  const [activeId,  setActiveId]  = useState<string | null>(null)
  // Cada modo tem sempre uma sessão aberta para marcar. Enquanto está em branco ela é só um rascunho
  // (fora da lista que se grava) e entra na lista na primeira marcação.
  const [drafts]                   = useState<Record<BodyMode, Session>>(() => ({ tratamento: newSession('tratamento'), dor: newSession('dor') }))
  const [tool,      setTool]      = useState('')
  const [nextEva,   setNextEva]   = useState<number | null>(null)
  const [view,      setView]      = useState<'frente' | 'costas'>('frente')
  const [selId,     setSelId]     = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [fs,        setFs]        = useState(false)
  const sidePanelRef = useRef<HTMLDivElement>(null)

  // a clínica pode trocar de área (conta demo): o modo precisa continuar valendo
  const activeMode: BodyMode = availableModes.includes(mode) ? mode : availableModes[0]
  const isPain = activeMode === 'dor'
  const tools = toolsFor(activeMode)
  const activeTool = tools.some(t => t.key === tool) ? tool : tools[0].key

  // O prontuário recarrega o registro quando QUALQUER aba salva. Só reaplica aqui se o corpograma
  // mudou de fato; senão salvar outra aba apagaria o que foi marcado aqui e ainda não foi salvo.
  const loadedKey = useRef<string | null>(null)
  useEffect(() => {
    const key = JSON.stringify(record?.body_protocols ?? null)
    if (key === loadedKey.current) return
    loadedKey.current = key
    const raw = record?.body_protocols as Session[] | undefined
    const next = Array.isArray(raw) ? raw : []
    setSessions(next); setActiveId(id => (id && next.some(s => s.id === id) ? id : null)); setSavedSnap(snapshot(next)); setUndoStack([])
  }, [record])

  // avisa o prontuário, que pergunta antes de fechar com alterações não salvas
  const dirty = snapshot(sessions) !== savedSnap
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

  const modeSessions = sessions.filter(s => sessionMode(s) === activeMode)
  const session = modeSessions.find(s => s.id === activeId) ?? modeSessions[0] ?? drafts[activeMode]
  const bodySex = bodySexFor(patient.gender)
  const visibleAnnotations = session?.annotations.filter(a => a.view === view) ?? []
  const selAnn  = session?.annotations.find(a => a.id === selId) ?? null
  const totals  = bodyTotals(session?.annotations ?? [])
  const summary = painSummary(session?.annotations ?? [])
  const history = useMemo(() => painHistory(sessions), [sessions])
  const trend   = painTrend(history)

  function setMode(m: BodyMode) {
    setModeState(m); setSelId(null); setActiveId(null)
  }
  function updSession(fn: (s: Session) => Session) {
    setSessions(prev => prev.some(s => s.id === session.id) ? prev.map(s => s.id === session.id ? fn(s) : s) : [...prev, fn(session)])
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
    const target = sessions.find(s => s.id === last.sid)
    if (!target) return
    setSessions(prev => prev.map(s => s.id === last.sid ? { ...s, annotations: mergeUndoAnnotations(last.annotations, s.annotations) } : s))
    if (sessionMode(target) !== activeMode && availableModes.includes(sessionMode(target))) setModeState(sessionMode(target))
    setActiveId(last.sid)
    setSelId(null)
  }
  function delAnn(id: string) {
    rememberForUndo()
    updSession(s => ({ ...s, annotations: s.annotations.filter(a => a.id !== id) }))
    setSelId(null)
  }

  // Toque ou clique em (x, y): se pegou um ponto existente seleciona (ou fecha a seleção) e devolve true
  function selectAt(x: number, y: number, radius: number): boolean {
    for (const a of visibleAnnotations) {
      if (Math.hypot(a.x - x, a.y - y) < radius) { setSelId(a.id === selId ? null : a.id); return true }
    }
    return false
  }
  function placeAt(x: number, y: number) {
    const ann: Annotation = { id: crypto.randomUUID(), x, y, view, type: activeTool, qty: '', note: '', ...(isPain && nextEva !== null ? { eva: nextEva } : {}) }
    rememberForUndo()
    updSession(s => ({ ...s, annotations: [...s.annotations, ann] }))
    setSelId(ann.id)
  }
  function handleBodyClick(e: React.MouseEvent<SVGSVGElement>) {
    const svg  = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x    = Math.round(((e.clientX - rect.left)  / rect.width)  * VW)
    const y    = Math.round(((e.clientY - rect.top)   / rect.height) * VH)
    if (selectAt(x, y, 10)) return
    placeAt(x, y)
  }

  function addSession() {
    const s = newSession(activeMode)
    setSessions(p => [...p, s])
    setActiveId(s.id)
    setSelId(null)
  }
  async function delSession(id: string) {
    if (modeSessions.length === 1) return
    const target = sessions.find(s => s.id === id)
    if (!target) return
    if (target.annotations.length > 0 || target.notes?.trim()) {
      const n = target.annotations.length
      const ok = await confirmDialog({
        title: 'Excluir esta sessão?',
        message: `A sessão de ${new Date(target.date + 'T12:00:00').toLocaleDateString('pt-BR')}${n > 0 ? ` e ${n === 1 ? 'o ponto marcado' : `os ${n} pontos marcados`}` : ''} serão removidos. Isso só vale depois de salvar o corpograma.`,
        confirmText: 'Excluir sessão',
        cancelText: 'Manter',
        danger: true,
      })
      if (!ok) return
    }
    setSessions(prev => prev.filter(s => s.id !== id))
    setUndoStack(st => st.filter(u => u.sid !== id))
    if (session?.id === id) setActiveId(null)
    setSelId(null)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      clinic_id: clinicId, patient_id: patient.id,
      body_protocols: sessions.filter(isMeaningfulSession),
      updated_at: new Date().toISOString(),
    }
    const { error } = record?.id
      ? await supabase.from('medical_records').update(payload).eq('id', record.id)
      : await supabase.from('medical_records').insert([payload])
    if (error) {
      setSaving(false)
      showToast('error', 'Não foi possível salvar o corpograma. Suas marcações continuam na tela, tente de novo.')
      return
    }
    setSavedSnap(snapshot(sessions))
    setSaved(true); setTimeout(() => setSaved(false), 2500)
    setSaving(false); onSaved()
  }

  const markerColor = (a: Annotation) => isPain ? evaColor(parseEva(a.eva)) : toolColor(a.type)

  function renderToolbar() {
    return (
      <div className={`${styles.toolbar} ${isPain ? styles.toolbarPain : ''}`} data-hscroll>
        <span className={styles.toolbarLabel}>Marcar:</span>
        {tools.map(t => (
          <button key={t.key} type="button"
            aria-label={t.label}
            aria-pressed={activeTool === t.key}
            className={`${styles.toolBtn} ${activeTool === t.key ? styles.toolBtnActive : ''}`}
            style={{ '--tc': t.color, '--tbg': t.bg } as React.CSSProperties}
            onClick={() => setTool(t.key)}>
            <span className={styles.toolDot} style={{ background: t.color }}/>
            <span className={styles.toolLabel}>{t.label}</span>
          </button>
        ))}
      </div>
    )
  }

  function renderEvaQuick(p: string) {
    if (!isPain) return null
    return (
      <div className={styles.evaQuick}>
        <label htmlFor={`${p}evaQuick`} className={styles.evaQuickLabel}>EVA ao marcar</label>
        <select id={`${p}evaQuick`} className={styles.evaSelect}
          value={nextEva === null ? '' : String(nextEva)}
          onChange={e => setNextEva(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Preencher depois</option>
          {EVA_VALUES.map(v => <option key={v} value={v}>{v} · {EVA_LEVEL_LABEL[evaLevel(v)].toLowerCase()}</option>)}
        </select>
      </div>
    )
  }

  function renderViewToggle() {
    return (
      <div className={styles.viewToggle}>
        <button type="button" aria-pressed={view === 'frente'}
          className={`${styles.viewBtn} ${view === 'frente' ? styles.viewBtnActive : ''}`}
          onClick={() => { setView('frente'); setSelId(null) }}>Frente</button>
        <button type="button" aria-pressed={view === 'costas'}
          className={`${styles.viewBtn} ${view === 'costas' ? styles.viewBtnActive : ''}`}
          onClick={() => { setView('costas'); setSelId(null) }}>Costas</button>
      </div>
    )
  }

  // `p` prefixa os ids: a tela cheia e a tela normal podem estar montadas ao mesmo tempo
  function renderAnnEditor(p: string) {
    if (!selAnn) return null
    return (
      <div className={styles.annPanel}
        style={{ '--ann-color': isPain ? markerColor(selAnn) : toolColor(selAnn.type) } as React.CSSProperties}>
        <div className={styles.annHeader}>
          <span className={styles.annDot} style={{ background: isPain ? markerColor(selAnn) : toolColor(selAnn.type) }}/>
          <span className={styles.annTitle}>{toolLabel(selAnn.type)}</span>
          <button type="button" className={styles.annDel} onClick={() => delAnn(selAnn.id)} aria-label="Remover este ponto" title="Remover este ponto"><Icon name="close" size={13} /></button>
        </div>

        <div className={styles.annFields}>
          <div className={styles.annField}>
            <p className={styles.annFieldLabel}>{isPain ? 'Tipo de achado' : 'Tipo de tratamento'}</p>
            <div className={styles.typeGrid}>
              {tools.map(t => (
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
          {isPain ? (
            <div className={styles.annField}>
              <p className={styles.annFieldLabel} id={`${p}evaLabel`}>
                Intensidade da dor (EVA 0 a 10)
                {parseEva(selAnn.eva) !== undefined && <span className={styles.evaRead}> · {EVA_LEVEL_LABEL[evaLevel(parseEva(selAnn.eva)!)]}</span>}
              </p>
              <div className={styles.evaGrid} role="group" aria-labelledby={`${p}evaLabel`}>
                {EVA_VALUES.map(v => {
                  const on = parseEva(selAnn.eva) === v
                  return (
                    <button key={v} type="button" aria-pressed={on}
                      className={`${styles.evaBtn} ${on ? styles.evaBtnOn : ''}`}
                      style={{ '--ev': evaColor(v) } as React.CSSProperties}
                      onClick={() => { rememberForUndo(); updAnn(selAnn.id, { eva: on ? undefined : v }) }}>
                      {v}
                    </button>
                  )
                })}
              </div>
              <p className={styles.evaHint}>0 sem dor, 10 pior dor imaginável. Toque no valor marcado para limpar.</p>
            </div>
          ) : (
            <div className={styles.annField}>
              <p className={styles.annFieldLabel}>Sessões / Intensidade</p>
              <input type="text" className={styles.annInput}
                value={selAnn.qty}
                placeholder="ex: 10 sessões, nível 3..."
                onChange={e => updAnn(selAnn.id, { qty: e.target.value })}/>
            </div>
          )}
          <div className={styles.annField}>
            <p className={styles.annFieldLabel}>Nota</p>
            <textarea className={styles.annNote} rows={3}
              value={selAnn.note}
              placeholder={isPain ? 'Característica da dor, fator desencadeante, teste positivo...' : 'Local específico, técnica, observações...'}
              onChange={e => updAnn(selAnn.id, { note: e.target.value })}/>
          </div>
        </div>
      </div>
    )
  }

  // A imagem de referência e os pontos, em coordenadas do viewBox. `k` escala os marcadores (1 na tela normal;
  // na tela cheia é o inverso do zoom, para manterem o tamanho visual).
  function renderImageAndPoints(k: number, hi = false) {
    // escala o marcador em torno do próprio centro
    const tf = (a: Annotation) => (k === 1 ? undefined : `translate(${a.x} ${a.y}) scale(${k}) translate(${-a.x} ${-a.y})`)
    return (
      <>
        {/* Referência anatômica: WebP com fundo transparente (ver ATTRIBUTIONS.md), figura feminina ou masculina conforme o paciente. Mais estreita que o quadro (proporção 0,67 contra 0,75), por isso fica centralizada; os pontos usam as coordenadas do quadro. */}
        <RefImage img={BODY_IMAGES[bodySex][view]} hi={hi} width={VW} height={VH} />

        {/* ── Annotation points ── */}
        {visibleAnnotations.map(a => {
          const isSel = a.id === selId
          const eva   = parseEva(a.eva)
          if (isPain) {
            const col = markerColor(a)
            return (
              <g key={a.id} style={{ cursor: 'pointer' }} className={styles.annPoint} transform={tf(a)}
                role="button" tabIndex={0} aria-pressed={isSel}
                aria-label={`${toolLabel(a.type)}${eva !== undefined ? `, EVA ${eva}` : ', sem EVA'}`}
                onKeyDown={onActivateKey(() => setSelId(a.id === selId ? null : a.id))}
                onClick={e => { e.stopPropagation(); setSelId(a.id === selId ? null : a.id) }}>
                <title>{toolLabel(a.type)}{eva !== undefined ? `, EVA ${eva} (${EVA_LEVEL_LABEL[evaLevel(eva)].toLowerCase()})` : ', sem EVA'}</title>
                {isSel && (
                  <circle cx={a.x} cy={a.y} r={15} fill="none"
                    stroke={col} strokeWidth="1.2" strokeDasharray="2.5,1.5" opacity="0.8"/>
                )}
                <circle cx={a.x + 0.4} cy={a.y + 0.6} r={isSel ? 10.5 : 8.5} fill="rgba(0,0,0,0.3)" opacity="0.5"/>
                <circle cx={a.x} cy={a.y} r={isSel ? 10 : 8}
                  fill={col} stroke="#fff" strokeWidth={isSel ? 2 : 1.5}/>
                <text x={a.x} y={a.y + 3} textAnchor="middle"
                  fill="#fff" fontSize={eva !== undefined ? 8.5 : 6.5} fontWeight="700"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {eva !== undefined ? eva : toolAbbr(a.type)}
                </text>
              </g>
            )
          }
          const col = toolColor(a.type)
          return (
            <g key={a.id} style={{ cursor: 'pointer' }} className={styles.annPoint} transform={tf(a)}
              role="button" tabIndex={0} aria-pressed={isSel}
              aria-label={`${toolLabel(a.type)}${a.qty ? `, ${a.qty}` : ''}`}
              onKeyDown={onActivateKey(() => setSelId(a.id === selId ? null : a.id))}
              onClick={e => { e.stopPropagation(); setSelId(a.id === selId ? null : a.id) }}>
              {isSel && (
                <circle cx={a.x} cy={a.y} r={14} fill="none"
                  stroke={col} strokeWidth="1" strokeDasharray="2.5,1.5" opacity="0.7"/>
              )}
              <circle cx={a.x + 0.4} cy={a.y + 0.6} r={isSel ? 9.5 : 7.5}
                fill="rgba(0,0,0,0.3)" opacity="0.5"/>
              <circle cx={a.x} cy={a.y} r={isSel ? 9 : 7}
                fill={toolBg(a.type)} fillOpacity="0.94"
                stroke={col} strokeWidth={isSel ? 2 : 1.5}/>
              <text x={a.x} y={a.y + 2.6} textAnchor="middle"
                fill={col} fontSize="6.5" fontWeight="700"
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {toolAbbr(a.type)}
              </text>
            </g>
          )
        })}

      </>
    )
  }

  return (
    <div className={styles.wrap}>

      {/* ── Modo (só quando a clínica usa os dois) ── */}
      {availableModes.length > 1 && (
        <div className={styles.modeBar}>
          <span className={styles.modeLabel}>Mapa de</span>
          <PillTabs
            label="Tipo de mapa corporal"
            value={activeMode}
            onChange={setMode}
            options={availableModes.map(m => ({ value: m, label: BODY_MODE_LABEL[m] }))}
          />
        </div>
      )}

      {/* ── Session bar ── */}
      <div className={styles.sessionBar}>
        <div className={styles.sessionTabs}>
          {modeSessions.map(s => (
            <div key={s.id}
              className={`${styles.sessionTab} ${s.id === session.id ? styles.sessionTabActive : ''}`}>
              <button type="button" className={styles.sessionTabBtn} aria-pressed={s.id === session.id}
                onClick={() => { setActiveId(s.id); setSelId(null) }}>
                {fmtDate(s.date)}
              </button>
              {modeSessions.length > 1 && (
                <button type="button" className={styles.sessionDel} aria-label={`Excluir a sessão de ${fmtDate(s.date)}`}
                  onClick={() => delSession(s.id)}>×</button>
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
          {renderToolbar()}

          {/* EVA aplicada aos próximos pontos (modo Dor) */}
          {renderEvaQuick('')}

          {/* Frente/Costas toggle */}
          {renderViewToggle()}

          {/* Body silhouette + annotation overlay */}
          <div className={styles.bodyWrap}>
            <ExpandButton onClick={() => setFs(true)} />
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              className={styles.bodySvg}
              onClick={handleBodyClick}
              style={{ cursor: 'crosshair' }}
            >
              {renderImageAndPoints(1)}
            </svg>
          </div>

          <div className={styles.bodyFoot}>
            <p className={styles.bodyHint}>
              Clique no corpo para marcar · Clique num ponto para editar
            </p>
            <button type="button" className={styles.undoBtn} onClick={undo} disabled={undoStack.length === 0}>
              Desfazer
            </button>
          </div>

          {isPain && (
            <ul className={styles.evaLegend} aria-label="Legenda da EVA">
              <li><span className={styles.legendBar} style={{ background: evaColor(2) }} />Leve, 1 a 3</li>
              <li><span className={styles.legendBar} style={{ background: evaColor(5) }} />Moderada, 4 a 6</li>
              <li><span className={styles.legendBar} style={{ background: evaColor(8) }} />Intensa, 7 a 10</li>
              <li><span className={styles.legendBar} style={{ background: EVA_NO_VALUE_COLOR }} />Sem EVA</li>
            </ul>
          )}
        </div>

        {/* ── Tela cheia: a mesma sessão e as mesmas ferramentas, numa visão ampliada ── */}
        <ZoomCanvas
          open={fs} onClose={() => setFs(false)}
          title={`Corpograma em tela cheia (${view === 'frente' ? 'frente' : 'costas'})`}
          vw={VW} vh={VH} markerPx={1.8}
          shortcuts={bodyShortcuts(view)} resetKey={view}
          onSelectAt={selectAt} onPlace={placeAt}
          panel={
            <div className={styles.fsPanel}>
              {renderViewToggle()}
              {renderToolbar()}
              {renderEvaQuick('fs-')}
              <div className={styles.bodyFoot}>
                <p className={styles.bodyHint}>{visibleAnnotations.length} {visibleAnnotations.length === 1 ? 'ponto' : 'pontos'} nesta vista</p>
                <button type="button" className={styles.undoBtn} onClick={undo} disabled={undoStack.length === 0}>
                  Desfazer
                </button>
              </div>
              {renderAnnEditor('fs-')}
            </div>
          }>
          {ctx => renderImageAndPoints(ctx.k, true)}
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
              placeholder={isPain ? 'Queixa principal, fatores de piora e melhora, conduta...' : 'Queixas, contraindicações, medidas...'}
              onChange={e => updSession(s => ({ ...s, notes: e.target.value }))}/>
          </div>

          {/* Selected annotation editor */}
          {renderAnnEditor('')}

          {/* Total por tipo na sessão (tratamento) */}
          {!isPain && totals.totals.length > 0 && (
            <div className={styles.sideSec}>
              <p className={styles.sideLabel}>Total da sessão</p>
              <ul className={styles.totals}>
                {totals.totals.map(t => (
                  <li key={`${t.tool}|${t.unit}`}>
                    <span className={styles.annItemDot} style={{ background: toolColor(t.tool), marginTop: 0 }}/>
                    <span className={styles.totalName}>{toolLabel(t.tool)}</span>
                    <b>{formatBodyTotal(t)}</b>
                    <small>{t.points} {t.points === 1 ? 'ponto' : 'pontos'}</small>
                  </li>
                ))}
              </ul>
              {totals.semDose > 0 && (
                <p className={styles.totalsHint}>{totals.semDose} {totals.semDose === 1 ? 'ponto sem número em sessões/intensidade' : 'pontos sem número em sessões/intensidade'} não entram na soma.</p>
              )}
            </div>
          )}

          {/* Resumo da dor na sessão */}
          {isPain && summary.points > 0 && (
            <div className={styles.sideSec}>
              <p className={styles.sideLabel}>Resumo da sessão</p>
              <dl className={styles.painStats}>
                <div><dt>Pontos</dt><dd>{summary.points}</dd></div>
                <div><dt>EVA máxima</dt><dd style={summary.max !== null ? { color: evaColor(summary.max) } : undefined}>{summary.max ?? '—'}</dd></div>
                <div><dt>EVA média</dt><dd>{summary.mean !== null ? fmtNum(summary.mean) : '—'}</dd></div>
              </dl>
              {summary.semEva > 0 && (
                <p className={styles.totalsHint}>{summary.semEva} {summary.semEva === 1 ? 'ponto sem EVA não entra' : 'pontos sem EVA não entram'} no resumo.</p>
              )}
            </div>
          )}

          {/* Evolução da dor, uma linha por data */}
          {isPain && history.length > 0 && (
            <div className={styles.sideSec}>
              <p className={styles.sideLabel}>Evolução da dor</p>
              {trend && (
                <p className={`${styles.trend} ${styles[`trend_${trend.direction}`]}`}>
                  {trend.direction === 'melhora' && `EVA máxima caiu de ${trend.from} para ${trend.to} (${Math.abs(trend.delta)} ${Math.abs(trend.delta) === 1 ? 'ponto' : 'pontos'} a menos).`}
                  {trend.direction === 'piora' && `EVA máxima subiu de ${trend.from} para ${trend.to} (${trend.delta} ${trend.delta === 1 ? 'ponto' : 'pontos'} a mais).`}
                  {trend.direction === 'estavel' && `EVA máxima estável em ${trend.to} desde a primeira sessão.`}
                </p>
              )}
              {history.length > 1 && <PainChart history={history} />}
              <ul className={styles.painRows}>
                {history.map(h => (
                  <li key={h.id}>
                    <button type="button" className={`${styles.painRow} ${h.id === session.id ? styles.painRowOn : ''}`}
                      onClick={() => { setActiveId(h.id); setSelId(null) }}>
                      <span className={styles.painDate}>{fmtDate(h.date)}</span>
                      <span className={styles.painChip} style={{ background: evaColor(h.max) }} title="EVA máxima">{h.max}</span>
                      <small>média {fmtNum(h.mean)} · {h.points} {h.points === 1 ? 'ponto' : 'pontos'}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Annotations list */}
          {visibleAnnotations.length > 0 && (
            <div className={styles.sideSec}>
              <p className={styles.sideLabel}>Pontos marcados · {view === 'frente' ? 'Frente' : 'Costas'} ({visibleAnnotations.length})</p>
              <div className={styles.annList}>
                {visibleAnnotations.map(a => {
                  const eva = parseEva(a.eva)
                  return (
                    <div key={a.id}
                      role="button" tabIndex={0} aria-pressed={a.id === selId}
                      className={`${styles.annItem} ${a.id === selId ? styles.annItemActive : ''}`}
                      style={{ '--ann-color': markerColor(a) } as React.CSSProperties}
                      onKeyDown={onActivateKey(() => setSelId(a.id === selId ? null : a.id))}
                      onClick={() => setSelId(a.id === selId ? null : a.id)}>
                      <span className={styles.annItemDot} style={{ background: markerColor(a) }}/>
                      <div className={styles.annItemBody}>
                        <span className={styles.annItemName}>{toolLabel(a.type)}</span>
                        {isPain && <span className={styles.annItemQty}>{eva !== undefined ? `EVA ${eva}` : 'sem EVA'}</span>}
                        {!isPain && a.qty && <span className={styles.annItemQty}>{a.qty}</span>}
                        {a.note && <span className={styles.annItemNote}>{a.note}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {visibleAnnotations.length === 0 && !selAnn && (
            <div className={styles.emptyHint}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
              </svg>
              <p>{isPain
                ? 'Selecione o tipo de achado e clique no corpo para marcar. Depois informe a EVA de cada ponto.'
                : 'Selecione uma ferramenta e clique no corpo para marcar os pontos de tratamento.'}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Save ── */}
      <div className={styles.saveRow}>
        {dirty && !saving && <span className={styles.unsavedMsg}>Alterações não salvas</span>}
        {saved && <span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo com sucesso!</span>}
        <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Corpograma'}
        </button>
      </div>
    </div>
  )
}

/** Linha da EVA máxima por data, num eixo fixo de 0 a 10 (a escala não se ajusta aos dados). */
function PainChart({ history }: { history: ReturnType<typeof painHistory> }) {
  const W = 300, H = 132, L = 28, R = 24, T = 10, B = 24
  const x = (i: number) => L + (history.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (history.length - 1))
  const y = (v: number) => T + (1 - v / 10) * (H - T - B)
  const step = Math.ceil(history.length / 6)
  const label = `EVA máxima por sessão: ${history.map(h => `${fmtShort(h.date)} ${h.max}`).join(', ')}`
  return (
    <svg className={styles.painChart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, 5, 10].map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={styles.chartGrid} />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" className={styles.chartTick}>{v}</text>
        </g>
      ))}
      <polyline className={styles.chartLine} fill="none" points={history.map((h, i) => `${x(i)},${y(h.max)}`).join(' ')} />
      {history.map((h, i) => (
        <g key={h.id}>
          <circle cx={x(i)} cy={y(h.max)} r={5} fill={evaColor(h.max)} stroke="var(--bg-secondary)" strokeWidth="1.5" />
          {(i % step === 0 || i === history.length - 1) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" className={styles.chartTick}>{fmtShort(h.date)}</text>
          )}
        </g>
      ))}
    </svg>
  )
}
