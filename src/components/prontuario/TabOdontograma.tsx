'use client'
import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Patient, MedicalRecord, OdontogramHistoryEntry } from '@/types'
import styles from './TabOdontograma.module.css'
import panel from './odontograma/odontogramaPanel.module.css'
import board from './odontograma/odontogramaBoard.module.css'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import { OdoDefs } from './odontograma/OdoDefs'
import { ArchBoard, FrontFigure, OcclusalFigure, ToothThumbSvg } from './odontograma/OdontogramaBoard'
import { ToolBar } from './odontograma/ToolBar'
import { JsonModal } from './odontograma/JsonModal'
import { FacePickerModal } from './odontograma/FacePickerModal'
import {
  TOOTH_STATUS, ALL_STATUS, DEFAULT_STATUS, UPPER, LOWER, FACE_NAME, FACE_KEYS, EXTRA_KEYS, EXTRA_NAME, EXTRA_STATUS_OF,
  UPPER_DECIDUOUS, LOWER_DECIDUOUS, EVERY_TOOTH, DENTITION_LABEL,
  statusColor, statusBg, statusLabel, toothMarks, plannedMarks, hasExtra,
  isDeciduous, isUpperTooth, quadrantOf, quadrantName, toothPositionName, successorOf, teethFor, visibleTeeth,
  ageInYears, suggestDentition, hasDeciduousData, readOdontogram, serializeOdontogram, emptyTooth, withPlanned,
  type SurfaceKey, type MarkKey, type ToothData, type Dentition, type ExtraKey,
} from '@/lib/odontograma'
import { faceLabel, rootCount, rootName, toothKind } from '@/lib/odontogramaGeometry'
import { COL_STEPS, clampStep, columnWidths, defaultStep, loadStoredStep, saveStoredStep, shouldOpenFacePicker } from '@/lib/odontogramaView'
import {
  TOOL_BY_KEY, applyTool, clearToothConditions, pendingHistoryEntries, toggleWhole, toothAlterations, toothChanged, type ToolKey, type Zone,
} from '@/lib/odontogramaTools'
import { OrcamentoOdontoModal } from './odontograma/OrcamentoOdontoModal'

// linha da arcada (para andar de um dente ao outro): permanentes ou decíduos, superior ou inferior
function rowOf(n: number): number[] {
  if (isDeciduous(n)) return isUpperTooth(n) ? UPPER_DECIDUOUS : LOWER_DECIDUOUS
  return UPPER.includes(n) ? UPPER : LOWER
}

// ── Textos clínicos por dente ──────────────────────────────────────
// o que fazer com cada condição (usado nos cartões e nas recomendações; regra fixa, não é IA)
const NEXT_STEP: Record<string, string> = {
  cariado: 'Restauração recomendada', fraturado: 'Avaliar restauração ou coroa', extracao: 'Agendar a extração',
  tratamento: 'Continuar o tratamento', implante: 'Acompanhar o implante', coroa: 'Revisar a coroa na manutenção',
  restaurado: 'Acompanhar a restauração', selante: 'Acompanhar o selante', protese: 'Revisar a prótese',
  ausente: 'Avaliar reposição (implante ou prótese)', endodontia: 'Acompanhar o tratamento de canal',
  pino: 'Acompanhar o pino intrarradicular', aparelho: 'Manter os retornos do aparelho',
}
// nome do procedimento no histórico
const PROCEDURE: Record<string, string> = {
  higido: 'Marcado como hígido', cariado: 'Cárie registrada', restaurado: 'Restauração', ausente: 'Ausência registrada',
  implante: 'Implante', coroa: 'Coroa', tratamento: 'Início de tratamento', fraturado: 'Fratura registrada',
  selante: 'Selante', extracao: 'Extração indicada', protese: 'Prótese',
  endodontia: 'Tratamento de canal', pino: 'Pino intrarradicular', aparelho: 'Aparelho ortodôntico',
}
const DONE = new Set(['higido', 'restaurado', 'implante', 'coroa', 'selante', 'protese', 'endodontia', 'pino', 'aparelho'])
const URGENT = new Set(['cariado', 'fraturado', 'extracao', 'tratamento'])

const faceOrExtra = (face: string) => FACE_NAME[face as SurfaceKey] ?? EXTRA_NAME[face as ExtraKey] ?? face
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(' de ', ' ').replace('.', '')

const SMALL_QUERY = '(max-width: 640px)'
const subscribeSmall = (cb: () => void) => {
  const mq = window.matchMedia(SMALL_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const getSmall = () => window.matchMedia(SMALL_QUERY).matches
const getSmallServer = () => false
// toque (sem mouse): as faces do tabuleiro são pequenas demais para o dedo
const COARSE_QUERY = '(pointer: coarse)'
const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia(COARSE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const getCoarse = () => window.matchMedia(COARSE_QUERY).matches

interface Props { record: MedicalRecord|null; patient: Patient; clinicId: string; onSaved: ()=>void; onDirtyChange?: (dirty: boolean) => void }

export function TabOdontograma({ record, patient, clinicId, onSaved, onDirtyChange }: Props) {
  const router = useRouter()
  const userName = useAuthStore(s => s.user?.displayName ?? '')
  const userId = useAuthStore(s => s.user?.id)
  const [teeth, setTeeth]             = useState<Record<number,ToothData>>({})
  const [savedTeeth, setSavedTeeth]   = useState<Record<number,ToothData>>({})
  const [history, setHistory]         = useState<OdontogramHistoryEntry[]>([])
  const [selectedTooth, setSelected]  = useState<number|null>(null)
  const [activeSurface, setActiveSurf]= useState<SurfaceKey|null>(null)
  const [mode, setMode]               = useState<'plano'|'historico'>('plano')
  const [tool, setTool]               = useState<ToolKey>('select')
  // celular: colunas mais largas por padrão, e a arcada rola para os lados dentro do contêiner
  const isSmall = useSyncExternalStore(subscribeSmall, getSmall, getSmallServer)
  const isCoarse = useSyncExternalStore(subscribeCoarse, getCoarse, getSmallServer)
  const [facePickTooth, setFacePickTooth] = useState<number | null>(null)
  // tamanho dos dentes: a escolha de cada usuário fica guardada neste navegador
  const [colPick, setColPick]         = useState<number | null>(() => loadStoredStep(userId))
  const colStep = colPick ?? defaultStep(isSmall)
  const setColStep = (f: (s: number) => number) => {
    const next = clampStep(f(colStep))
    setColPick(next)
    saveStoredStep(userId, next)
  }
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [detailOpen, setDetailOpen]   = useState(false)
  const [nextPlanned, setNextPlanned] = useState(false)
  const [budgetOpen, setBudgetOpen]   = useState(false)
  const [jsonOpen, setJsonOpen]       = useState(false)
  const [dentition, setDentition]     = useState<Dentition>('permanente')
  const dentitionTouched = useRef(false)
  const patientAge = useMemo(() => ageInYears(patient.birth_date), [patient.birth_date])

  // O prontuário recarrega o registro quando QUALQUER aba salva. Só reaplica aqui se o odontograma
  // mudou de fato; senão salvar o faceograma apagaria o que foi marcado aqui e ainda não foi salvo.
  const loadedKey = useRef<string | null>(null)
  useEffect(() => {
    const key = JSON.stringify(record?.odontogram ?? null)
    if (key === loadedKey.current) return
    loadedKey.current = key
    const raw = (record?.odontogram ?? {}) as Record<string, unknown>
    const loaded = readOdontogram(raw)
    // abre na dentição que combina com o paciente, a menos que a pessoa já tenha escolhido uma
    if (!dentitionTouched.current) setDentition(suggestDentition(patientAge, hasDeciduousData(raw)))
    setTeeth(loaded)
    setSavedTeeth(loaded)
    setHistory(Array.isArray(raw._history) ? (raw._history as OdontogramHistoryEntry[]) : [])
  }, [record, patientAge])

  function pickDentition(d: Dentition) {
    dentitionTouched.current = true
    setDentition(d)
    // não deixa um dente escondido selecionado
    if (selectedTooth !== null && !visibleTeeth(d).includes(selectedTooth)) selectTooth(null)
  }
  function pickMode(m: 'plano' | 'historico') {
    setMode(m)
    if (m === 'historico') setTool('select')
  }

  function selectTooth(num: number | null) {
    setSelected(num); setActiveSurf(null)
  }
  // clicar no número do dente (ou num cartão da análise) abre o detalhe dele num modal
  function openTooth(num: number) {
    selectTooth(num); setDetailOpen(true)
  }
  function closeDetail() { setDetailOpen(false) }
  // anterior/próximo dente da mesma arcada, de dentro do modal
  function stepTooth(dir: -1 | 1) {
    if (selectedTooth === null) return
    const row = rowOf(selectedTooth)
    const next = row[row.indexOf(selectedTooth) + dir]
    if (next === undefined) return
    selectTooth(next)
  }
  function handleSurfaceClick(s: SurfaceKey) {
    if (selectedTooth===null) return
    setActiveSurf(prev => prev===s ? null : s)
  }

  // Clique numa zona do desenho: com a ferramenta Selecionar só escolhe o dente; com outra, aplica.
  function onZone(n: number, zone: Zone) {
    const t = TOOL_BY_KEY[tool]
    if (mode === 'historico' || t.mode === 'select') { selectTooth(n); return }
    // em qualquer aparelho de toque (celular, iPad) a face do tabuleiro é pequena para o dedo: abre a vista ampliada
    if (shouldOpenFacePicker({ coarse: isCoarse, toolMode: t.mode, zoneKind: zone.kind })) { setFacePickTooth(n); setSelected(n); setActiveSurf(null); return }
    applyZone(n, zone)
  }
  function applyZone(n: number, zone: Zone) {
    const t = TOOL_BY_KEY[tool]
    setTeeth(p => ({ ...p, [n]: applyTool(p[n] ?? emptyTooth(), t, zone, n, nextPlanned) }))
    setSelected(n); setActiveSurf(null)
  }

  // Aplicar status nunca fecha o painel — dá pra escrever a observação ou
  // pintar outra face em seguida sem reabrir. Clicar de novo na condição que já
  // está marcada desmarca; "Hígido" no dente inteiro limpa o dente e as faces.
  function applyStatus(status: string) {
    if (selectedTooth===null) return
    const n = selectedTooth
    if (activeSurface) {
      const face = activeSurface
      setTeeth(p=>{
        const next = p[n].surfaces[face]===status ? DEFAULT_STATUS : status
        const d = {...p[n],surfaces:{...p[n].surfaces,[face]:next}}
        return {...p,[n]:withPlanned(d, face, next!==DEFAULT_STATUS && nextPlanned)}
      })
      setActiveSurf(null)
    } else if (status===DEFAULT_STATUS) {
      setTeeth(p=>({...p,[n]:clearToothConditions(p[n])}))
    } else {
      setTeeth(p=>{
        return {...p,[n]:toggleWhole(p[n], status, nextPlanned)}
      })
    }
  }
  // canal, pino e aparelho do dente aberto: a mesma lógica das ferramentas, por raiz
  function toggleExtra(key: ToolKey, zone: Zone) {
    if (selectedTooth===null) return
    const n = selectedTooth
    setTeeth(p => ({ ...p, [n]: applyTool(p[n] ?? emptyTooth(), TOOL_BY_KEY[key], zone, n, nextPlanned) }))
  }
  // "existente" ou "a realizar" da marcação que está em foco (dente inteiro ou a face escolhida)
  function setPlanned(on: boolean) {
    setNextPlanned(on)
    if (selectedTooth===null || !detailOpen) return
    const n = selectedTooth
    const key: MarkKey = activeSurface ?? 'all'
    setTeeth(p=>{
      const d = p[n]
      const marked = key==='all' ? d.status!==DEFAULT_STATUS : d.surfaces[key as SurfaceKey]!==DEFAULT_STATUS
      return marked ? {...p,[n]:withPlanned(d,key,on)} : p
    })
  }
  // marca como feito um procedimento que estava no plano
  function markDone(key: MarkKey) {
    if (selectedTooth===null) return
    const n = selectedTooth
    setTeeth(p=>({...p,[n]:withPlanned(p[n],key,false)}))
  }
  // tira uma marcação só (o dente inteiro, uma face ou um tratamento extra)
  function clearMark(face: SurfaceKey | ExtraKey | null) {
    if (selectedTooth===null) return
    const n = selectedTooth
    setTeeth(p => {
      const d = p[n]
      if (face === null) return {...p,[n]:withPlanned({...d,status:DEFAULT_STATUS}, 'all', false)}
      if (face === 'endo' || face === 'pin') return {...p,[n]:withPlanned({...d,[face]:undefined}, face, false)}
      if (face === 'bracket') return {...p,[n]:withPlanned({...d,bracket:undefined}, 'bracket', false)}
      return {...p,[n]:withPlanned({...d,surfaces:{...d.surfaces,[face]:DEFAULT_STATUS}}, face, false)}
    })
  }
  // volta o dente ao que estava no último salvamento
  function undoTooth() {
    if (selectedTooth===null) return
    const n = selectedTooth
    setTeeth(p=>({...p,[n]:savedTeeth[n] ?? emptyTooth()}))
    setActiveSurf(null)
  }
  const changed = (n: number) => toothChanged(teeth[n], savedTeeth[n])
  const dirtyAny = EVERY_TOOTH.some(changed)
  // avisa o prontuário, que pergunta antes de fechar com alterações não salvas
  useEffect(() => { onDirtyChange?.(dirtyAny) }, [dirtyAny, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  async function handleSave(): Promise<boolean> {
    setSaving(true)
    const nextHistory = [...history, ...pendingHistoryEntries(EVERY_TOOTH, teeth, savedTeeth, userName, new Date().toISOString())]
    const payload={clinic_id:clinicId,patient_id:patient.id,
      odontogram: serializeOdontogram(teeth, nextHistory) as MedicalRecord['odontogram'],
      updated_at:new Date().toISOString()}
    const { error } = record?.id
      ? await supabase.from('medical_records').update(payload).eq('id',record.id)
      : await supabase.from('medical_records').insert([payload])
    if (error) {
      setSaving(false)
      showToast('error', 'Não foi possível salvar o odontograma. Suas marcações continuam na tela, tente de novo.')
      return false
    }
    setHistory(nextHistory)
    setSavedTeeth(teeth)
    setSaved(true); setTimeout(()=>setSaved(false),2500)
    setSaving(false); onSaved()
    return true
  }

  const touched = useMemo(() => new Set(history.map(h => h.tooth)), [history])

  const analysis = EVERY_TOOTH.filter(n => teeth[n] && (toothAlterations(teeth[n]).length > 0 || teeth[n].note?.trim()))
  const urgent = EVERY_TOOTH.filter(n => teeth[n] && toothAlterations(teeth[n]).some(a => URGENT.has(a)))
  const risk = urgent.some(n => toothAlterations(teeth[n]).some(a => a === 'extracao' || a === 'fraturado')) || urgent.length >= 3
    ? 'alto' : urgent.length > 0 ? 'moderado' : 'baixo'
  // legenda: só as condições que aparecem neste odontograma, com a contagem de dentes
  const legend = ALL_STATUS.filter(s => s.key !== DEFAULT_STATUS)
    .map(s => ({ ...s, count: EVERY_TOOTH.filter(n => teeth[n] && toothAlterations(teeth[n]).includes(s.key)).length }))
    .filter(s => s.count > 0)
  const plannedList = plannedMarks(teeth)
  const byStatus = (k: string) => EVERY_TOOTH.filter(n => teeth[n] && toothAlterations(teeth[n]).includes(k))

  const selData = selectedTooth!==null ? teeth[selectedTooth] : null

  // dentes com registro que a dentição escolhida esconde (ex.: decíduos quando a visão é só permanente)
  const shown = new Set(visibleTeeth(dentition))
  const hiddenMarked = EVERY_TOOTH.filter(n => !shown.has(n) && teeth[n] && (toothAlterations(teeth[n]).length > 0 || teeth[n].note?.trim()))
  const hiddenDeciduous = hiddenMarked.filter(isDeciduous).length
  const showPermanent = dentition !== 'decidua'
  const showDeciduous = dentition !== 'permanente'
  const deciRows = teethFor('decidua')

  const risco = { alto: 'Risco alto', moderado: 'Risco moderado', baixo: 'Risco baixo' }[risk]
  const recTitle = { alto: 'Atenção imediata', moderado: 'Tratamento indicado', baixo: 'Cuidado preventivo' }[risk]
  const recParts: string[] = []
  const carie = byStatus('cariado'), frat = byStatus('fraturado'), ext = byStatus('extracao'), trat = byStatus('tratamento')
  if (carie.length) recParts.push(`${carie.length} ${carie.length > 1 ? 'dentes com cárie' : 'dente com cárie'} (${carie.join(', ')})`)
  if (frat.length) recParts.push(`${frat.length} ${frat.length > 1 ? 'fraturados' : 'fraturado'} (${frat.join(', ')})`)
  if (ext.length) recParts.push(`extração indicada em ${ext.join(', ')}`)
  if (trat.length) recParts.push(`tratamento em andamento em ${trat.join(', ')}`)
  const recText = recParts.length
    ? `${recParts.join('; ').replace(/^./, c => c.toUpperCase())}. Vale agendar o tratamento nas próximas semanas.`
    : 'Nenhuma alteração pedindo tratamento agora. Recomendado manter a limpeza e a revisão a cada 6 meses.'

  const activeTool = TOOL_BY_KEY[tool]
  const permCols = columnWidths(colStep)
  const deciCols = columnWidths(colStep, showPermanent)
  const boardProps = { teeth, tool: activeTool, selected: selectedTooth, touched: mode === 'historico' ? touched : undefined, onZone, onNumber: openTooth }

  return (
    <div className={`${styles.board} ${board.theme}`}>
      <OdoDefs />

      {/* ── Palco da arcada ── */}
      <section className={styles.stageCard}>
        <div className={styles.stageHead}>
          <div className={styles.modeTabs} role="group" aria-label="Visão da arcada">
            <button type="button" aria-pressed={mode === 'plano'} className={`${styles.modeTab} ${mode === 'plano' ? styles.modeTabOn : ''}`} onClick={() => pickMode('plano')}>Plano de tratamento</button>
            <button type="button" aria-pressed={mode === 'historico'} className={`${styles.modeTab} ${mode === 'historico' ? styles.modeTabOn : ''}`} onClick={() => pickMode('historico')}>Histórico</button>
          </div>
          <div className={styles.dentRow}>
            <span className={styles.dentLabel}>Dentição</span>
            <div className={styles.dentTabs} role="group" aria-label="Dentição">
              {(['permanente', 'decidua', 'mista'] as const).map(d => (
                <button key={d} type="button" aria-pressed={dentition === d} className={`${styles.dentTab} ${dentition === d ? styles.dentTabOn : ''}`} onClick={() => pickDentition(d)}>{DENTITION_LABEL[d]}</button>
              ))}
            </div>
          </div>
          <div className={styles.headTools}>
            <div className={styles.zoomBox} role="group" aria-label="Tamanho da arcada">
              <button type="button" className={styles.zoomBtn} aria-label="Reduzir a arcada" disabled={colStep === 0} onClick={() => setColStep(s => s - 1)}><Icon name="minus" size={16} /></button>
              <button type="button" className={styles.zoomBtn} aria-label="Ampliar a arcada" disabled={colStep === COL_STEPS.length - 1} onClick={() => setColStep(s => s + 1)}><Icon name="plus" size={16} /></button>
            </div>
            <button type="button" className={styles.jsonBtn} onClick={() => setJsonOpen(true)}>Ver JSON</button>
          </div>
        </div>

        <ToolBar tool={tool} onTool={setTool} planned={nextPlanned} onPlanned={setPlanned} readOnly={mode === 'historico'} />

        <div className={styles.plate}>
          {showPermanent && (
            <div className={styles.archBlock}>
              <ArchBoard {...boardProps} {...permCols} upper={UPPER} lower={LOWER} title="Dentição permanente" label="Odontograma, dentição permanente. Cada dente tem vista vestibular, vista oclusal e o número FDI." />
            </div>
          )}
          {showDeciduous && (
            <div className={`${styles.archBlock} ${showPermanent ? styles.archSep : ''}`}>
              <ArchBoard {...boardProps} {...deciCols} upper={deciRows.upper} lower={deciRows.lower} title="Dentes decíduos (de leite)" label="Odontograma, dentição decídua. Cada dente tem vista vestibular, vista oclusal e o número FDI." />
            </div>
          )}
        </div>

        <div className={styles.selBar}>
          {selectedTooth !== null && selData ? (
            <>
              <span className={styles.selText}><b>Dente {selectedTooth}</b> · {toothPositionName(selectedTooth)} · {quadrantName(selectedTooth)}{isDeciduous(selectedTooth) ? ' · decíduo' : ''}</span>
              <button type="button" className={styles.selBtn} onClick={() => openTooth(selectedTooth)}>Abrir histórico e observações</button>
            </>
          ) : (
            <span className={styles.stageHint}>Escolha uma ferramenta e clique na face, na coroa ou na raiz. Clique no número FDI para abrir o dente. Em tela pequena, role a arcada para os lados.</span>
          )}
        </div>

        {hiddenMarked.length > 0 && (
          <p className={styles.hiddenNote}>
            {hiddenDeciduous > 0
              ? `${hiddenDeciduous} ${hiddenDeciduous > 1 ? 'dentes decíduos com registro estão' : 'dente decíduo com registro está'} fora desta visão.`
              : `${hiddenMarked.length} ${hiddenMarked.length > 1 ? 'dentes permanentes com registro estão' : 'dente permanente com registro está'} fora desta visão.`}
            {' '}<button type="button" onClick={() => pickDentition('mista')}>Ver dentição mista</button>
          </p>
        )}
        <ul className={styles.legend} aria-label="Legenda das cores">
          {mode === 'historico' ? (
            <>
              <li><span className={styles.legendDot} style={{ background: '#2BC4A9' }} />Dente com registro no histórico</li>
              <li><span className={styles.legendDot} data-ghost="true" />Ausente</li>
            </>
          ) : legend.length === 0 ? (
            <li className={styles.legendNone}>Nenhuma alteração marcada. Os dentes hígidos ficam sem cor.</li>
          ) : (
            <>
              {legend.map(s => (
                <li key={s.key}><span className={styles.legendDot} style={{ background: s.color }} />{s.label} <small>{s.count}</small></li>
              ))}
              {plannedList.length > 0 && <li><span className={styles.legendDot} data-planned="true" />A realizar, mais claro e tracejado <small>{plannedList.length}</small></li>}
              <li className={styles.legendNone}>Hígido: sem cor</li>
            </>
          )}
        </ul>
        <p className={styles.srOnly} aria-live="polite">
          {selectedTooth !== null && selData ? `Dente ${selectedTooth}, ${toothPositionName(selectedTooth)}, ${statusLabel(selData.status)}` : ''}
        </p>
      </section>

      {/* ── Análise dos dentes ── */}
      <section className={`${styles.card} ${styles.analysis}`}>
        <h3 className={styles.cardTitle}>Análise dos dentes</h3>
        {analysis.length === 0 ? (
          <p className={styles.empty}>Nenhum dente com alteração. Escolha uma ferramenta e clique num dente da arcada para registrar.</p>
        ) : (
          <ul className={styles.analysisList}>
            {analysis.map(n => {
              const d = teeth[n]
              const alt = toothAlterations(d)
              const main = alt[0] ?? d.status
              return (
                <li key={n}>
                  <button type="button" className={`${styles.toothCard} ${selectedTooth === n ? styles.toothCardOn : ''}`} onClick={() => openTooth(n)}>
                    <span className={styles.thumb}><ToothThumbSvg n={n} data={d} /></span>
                    <span className={styles.toothCardGrid}>
                      <span><small>Dente</small><b>#{n}</b></span>
                      <span><small>Posição</small><b>{quadrantName(n)}{isDeciduous(n) ? ' · decíduo' : ''}</b></span>
                    </span>
                    <span className={styles.statusChip} style={{ '--st-color': statusColor(main), '--st-bg': statusBg(main) } as React.CSSProperties}>{statusLabel(main)}{toothMarks(n, d).length > 0 && toothMarks(n, d).every(m => m.planned) ? ' · a realizar' : ''}</span>
                    <span className={styles.toothCardNote}>{d.note?.trim() || NEXT_STEP[main] || 'Acompanhar na próxima revisão'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── Recomendações ── */}
      <section className={`${styles.card} ${styles.recs}`}>
        <h3 className={styles.cardTitle}>Recomendações</h3>
        <div className={styles.recHead}>
          <b>{recTitle}</b>
          <span className={`${styles.riskChip} ${styles[`risk_${risk}`]}`}>{risco}</span>
        </div>
        <p className={styles.recText}>{recText}</p>
        {plannedList.length > 0 && (
          <button type="button" className={styles.recBtn} onClick={() => setBudgetOpen(true)}>Gerar orçamento ({plannedList.length})</button>
        )}
        <button type="button" className={styles.recBtn} onClick={() => router.push('/agenda')}>Agendar consulta</button>
      </section>

      {/* ── Histórico de tratamento ── */}
      <section className={`${styles.card} ${styles.history}`}>
        <h3 className={styles.cardTitle}>Histórico de tratamento</h3>
        {history.length === 0 ? (
          <p className={styles.empty}>As mudanças salvas no odontograma aparecem aqui, com data e profissional.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Data</th><th>Procedimento</th><th>Dente</th><th>Profissional</th><th>Status</th></tr></thead>
              <tbody>
                {[...history].reverse().slice(0, 30).map((h, i) => (
                  <tr key={`${h.at}-${h.tooth}-${h.face ?? ''}-${i}`}>
                    <td>{fmtDate(h.at)}</td>
                    <td>{h.planned ? 'Planejado: ' : ''}{PROCEDURE[h.status] ?? statusLabel(h.status)}{h.face ? ` (${faceOrExtra(h.face)})` : ''}</td>
                    <td>#{h.tooth}</td>
                    <td>{h.by || '—'}</td>
                    <td>{h.planned ? 'A realizar' : DONE.has(h.status) ? 'Concluído' : h.status === 'tratamento' ? 'Em andamento' : h.status === 'extracao' ? 'Indicado' : 'Registrado'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Detalhe do dente (abre ao clicar no número) ── */}
      {detailOpen && selectedTooth !== null && selData && (() => {
        const row = rowOf(selectedTooth)
        const idx = row.indexOf(selectedTooth)
        const dirty = dirtyAny
        const changedHere = changed(selectedTooth)
        const faces = FACE_KEYS.filter(k => selData.surfaces[k] && selData.surfaces[k] !== DEFAULT_STATUS)
        const kind = toothKind(selectedTooth), upper = isUpperTooth(selectedTooth)
        const nRoots = rootCount(kind, upper)
        const rootsOf = (k: 'endo' | 'pin') => selData[k] ?? []
        const toothHist = history.filter(h => h.tooth === selectedTooth).slice(-6).reverse()
        const extraChip = (tool: ToolKey, key: 'endo' | 'pin', i: number, label: string) => {
          const on = rootsOf(key).includes(i)
          const st = ALL_STATUS.find(s => s.key === EXTRA_STATUS_OF[key])!
          return (
            <button key={`${key}${i}`} type="button" aria-pressed={on} disabled={selData.status === 'ausente'} className={panel.extraChip}
              style={{ '--st-color': st.color, '--st-bg': st.bg } as React.CSSProperties}
              onClick={() => toggleExtra(tool, { kind: 'root', root: i })}>{label}</button>
          )
        }
        const roots = Array.from({ length: nRoots }, (_, i) => i)
        return (
          <Modal
            open
            onClose={closeDetail}
            size="lg"
            title={`Dente ${selectedTooth}`}
            subtitle={`${toothPositionName(selectedTooth)} · ${quadrantName(selectedTooth)}${isDeciduous(selectedTooth) ? ' · decíduo' : ''}`}
            leading={<span className={styles.modalThumb}><ToothThumbSvg n={selectedTooth} data={selData} /></span>}
            actions={
              <span className={styles.stepper}>
                <button type="button" className={styles.iconBtn} aria-label="Dente anterior" disabled={idx <= 0} onClick={() => stepTooth(-1)}><Icon name="chevronLeft" size={18} /></button>
                <button type="button" className={styles.iconBtn} aria-label="Próximo dente" disabled={idx >= row.length - 1} onClick={() => stepTooth(1)}><Icon name="chevronRight" size={18} /></button>
              </span>
            }
            footer={
              <>
                {changedHere && <button type="button" className={styles.undoBtn} onClick={undoTooth}>Desfazer alterações</button>}
                {saved && <span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo com sucesso!</span>}
                <button type="button" className={btn.secondary} onClick={closeDetail}>{dirty ? 'Fechar sem salvar' : 'Fechar'}</button>
                <button type="button" className={styles.btnSave} onClick={async () => { if (await handleSave()) closeDetail() }} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </>
            }
          >
            <dl className={styles.facts}>
              <div><dt>Localização</dt><dd>{quadrantName(selectedTooth)} (quadrante {quadrantOf(selectedTooth)})</dd></div>
              <div><dt>Número</dt><dd>#{selectedTooth}</dd></div>
              <div><dt>Condição</dt><dd>{statusLabel(selData.status)}</dd></div>
              {isDeciduous(selectedTooth) && <div><dt>Dentição</dt><dd>Decíduo, será substituído pelo #{successorOf(selectedTooth)}</dd></div>}
            </dl>
            <div className={styles.marks}>
              <p className={styles.miniLabel}>Marcações deste dente</p>
              {toothMarks(selectedTooth, selData).length === 0 ? (
                <p className={styles.marksEmpty}>Nenhuma. O dente está hígido.</p>
              ) : (
                <ul className={styles.markList}>
                  {selData.status !== DEFAULT_STATUS && (
                    <li className={styles.markChip} style={{ '--st-color': statusColor(selData.status), '--st-bg': statusBg(selData.status) } as React.CSSProperties}>
                      <span className={styles.statusDot} style={{ background: statusColor(selData.status) }} />
                      {statusLabel(selData.status)} <small>dente inteiro{selData.planned?.all ? ' · a realizar' : ''}</small>
                      {selData.planned?.all && <button type="button" className={styles.doneBtn} onClick={() => markDone('all')}>Realizado</button>}
                      <button type="button" aria-label={`Tirar ${statusLabel(selData.status)} do dente inteiro`} onClick={() => clearMark(null)}><Icon name="close" size={12} /></button>
                    </li>
                  )}
                  {faces.map(f => (
                    <li key={f} className={styles.markChip} style={{ '--st-color': statusColor(selData.surfaces[f]), '--st-bg': statusBg(selData.surfaces[f]) } as React.CSSProperties}>
                      <span className={styles.statusDot} style={{ background: statusColor(selData.surfaces[f]) }} />
                      {statusLabel(selData.surfaces[f])} <small>face {faceLabel(selectedTooth, f).toLowerCase()}{selData.planned?.[f] ? ' · a realizar' : ''}</small>
                      {selData.planned?.[f] && <button type="button" className={styles.doneBtn} onClick={() => markDone(f)}>Realizado</button>}
                      <button type="button" aria-label={`Tirar ${statusLabel(selData.surfaces[f])} da face ${faceLabel(selectedTooth, f).toLowerCase()}`} onClick={() => clearMark(f)}><Icon name="close" size={12} /></button>
                    </li>
                  ))}
                  {EXTRA_KEYS.filter(k => hasExtra(selData, k)).map(k => {
                    const st = EXTRA_STATUS_OF[k]
                    const where = k === 'bracket' ? 'face vestibular' : (selData[k] ?? []).map(r => rootName(kind, upper, r).toLowerCase()).join(', ')
                    return (
                      <li key={k} className={styles.markChip} style={{ '--st-color': statusColor(st), '--st-bg': statusBg(st) } as React.CSSProperties}>
                        <span className={styles.statusDot} style={{ background: statusColor(st) }} />
                        {statusLabel(st)} <small>{where}{selData.planned?.[k] ? ' · a realizar' : ''}</small>
                        {selData.planned?.[k] && <button type="button" className={styles.doneBtn} onClick={() => markDone(k)}>Realizado</button>}
                        <button type="button" aria-label={`Tirar ${statusLabel(st)}`} onClick={() => clearMark(k)}><Icon name="close" size={12} /></button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className={styles.editor}>
              <div className={styles.facesCol}>
                <div className={`${board.theme} ${panel.figures}`}>
                  <div className={panel.figFront}>
                    <FrontFigure n={selectedTooth} data={selData} />
                    <span className={panel.figCaption}>Vestibular</span>
                  </div>
                  <div className={panel.figOccBox}>
                    <OcclusalFigure n={selectedTooth} data={selData} activeFace={activeSurface} onFace={handleSurfaceClick} />
                    <span className={panel.figCaption}>{activeSurface ? `Face ${faceLabel(selectedTooth, activeSurface).toLowerCase()}` : 'Toque numa face para pintar só ela'}</span>
                  </div>
                </div>
              </div>
              <div className={styles.statusCol}>
                <p className={styles.miniLabel}>{activeSurface ? `Condição da face ${faceLabel(selectedTooth, activeSurface).toLowerCase()}` : 'Condição do dente inteiro'}</p>
                <p className={styles.statusHint}>{activeSurface ? 'Clique de novo na condição marcada para desmarcar a face.' : 'Clique de novo na condição marcada para desmarcar. Hígido limpa o dente e as faces.'}</p>
                <div className={styles.seg} role="group" aria-label="Situação desta marcação">
                  {([[false, 'Existente'], [true, 'A realizar']] as const).map(([v, label]) => {
                    const key: MarkKey = activeSurface ?? 'all'
                    const marked = key === 'all' ? selData.status !== DEFAULT_STATUS : selData.surfaces[key as SurfaceKey] !== DEFAULT_STATUS
                    const on = (marked ? !!selData.planned?.[key] : nextPlanned) === v
                    return <button key={label} type="button" aria-pressed={on} className={`${styles.segBtn} ${on ? styles.segBtnOn : ''}`} onClick={() => setPlanned(v)}>{label}</button>
                  })}
                </div>
                <div className={styles.statusGrid}>
                  {TOOTH_STATUS.map(s => {
                    const isCurr = activeSurface ? selData.surfaces[activeSurface] === s.key : selData.status === s.key
                    return (
                      <button key={s.key} type="button" aria-pressed={isCurr}
                        className={`${styles.statusBtn} ${isCurr ? styles.statusBtnActive : ''}`}
                        style={{ '--st-color': s.color, '--st-bg': s.bg } as React.CSSProperties}
                        onClick={() => applyStatus(s.key)}>
                        <span className={styles.statusDot} style={{ background: s.color }}/>{s.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className={panel.extras}>
              <p className={styles.miniLabel}>Tratamentos no dente</p>
              <div className={panel.extraRow}>
                <span className={panel.extraName}>Canal</span>
                {roots.map(i => extraChip('canal', 'endo', i, nRoots === 1 ? 'Tratado' : `Raiz ${rootName(kind, upper, i).toLowerCase()}`))}
              </div>
              <div className={panel.extraRow}>
                <span className={panel.extraName}>Pino</span>
                {roots.map(i => extraChip('pino', 'pin', i, nRoots === 1 ? 'Com pino' : `Raiz ${rootName(kind, upper, i).toLowerCase()}`))}
              </div>
              <div className={panel.extraRow}>
                <span className={panel.extraName}>Aparelho</span>
                <button type="button" aria-pressed={!!selData.bracket} disabled={selData.status === 'ausente'} className={panel.extraChip}
                  style={{ '--st-color': statusColor('aparelho'), '--st-bg': statusBg('aparelho') } as React.CSSProperties}
                  onClick={() => toggleExtra('aparelho', { kind: 'crown' })}>Braquete</button>
              </div>
              {selData.status === 'ausente' && <p className={styles.statusHint}>Dente ausente não recebe canal, pino nem aparelho.</p>}
            </div>

            <label className={styles.miniLabel} htmlFor="toothNote">Observação do dente</label>
            <textarea
              id="toothNote"
              className={styles.noteTextarea}
              rows={3}
              value={selData.note ?? ''}
              placeholder="Ex: extrair e colocar implante"
              onChange={e => setTeeth(p => ({ ...p, [selectedTooth]: { ...p[selectedTooth], note: e.target.value } }))}
            />

            <div className={panel.extras}>
              <p className={styles.miniLabel}>Histórico do dente</p>
              {toothHist.length === 0 ? (
                <p className={styles.marksEmpty}>Nada salvo ainda para este dente.</p>
              ) : (
                <ul className={panel.toothHist}>
                  {toothHist.map((h, i) => (
                    <li key={`${h.at}-${h.face ?? ''}-${i}`}>
                      <time dateTime={h.at}>{fmtDate(h.at)}</time>
                      <span>{h.planned ? 'Planejado: ' : ''}{PROCEDURE[h.status] ?? statusLabel(h.status)}{h.face ? ` (${faceOrExtra(h.face).toLowerCase()})` : ''} <small>{h.by ? `· ${h.by}` : ''}</small></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Modal>
        )
      })()}

      {facePickTooth !== null && (
        <FacePickerModal
          n={facePickTooth}
          data={teeth[facePickTooth] ?? emptyTooth()}
          tool={activeTool}
          // a vista fica aberta: dá para marcar várias faces antes de fechar em "Concluir"
          onFace={face => applyZone(facePickTooth, { kind: 'face', face })}
          onClose={() => setFacePickTooth(null)}
        />
      )}

      {jsonOpen && (
        <JsonModal
          json={JSON.stringify(serializeOdontogram(teeth, history), null, 2)}
          filename={`odontograma-${new Date().toISOString().slice(0, 10)}.json`}
          onClose={() => setJsonOpen(false)}
        />
      )}

      {budgetOpen && (
        <OrcamentoOdontoModal
          marks={plannedList}
          record={record}
          patient={patient}
          clinicId={clinicId}
          dirty={dirtyAny}
          onClose={() => setBudgetOpen(false)}
          onSaved={onSaved}
        />
      )}

      {/* ── Salvar ── */}
      <div className={styles.saveRow}>
        {dirtyAny&&!saving&&<span className={styles.unsavedMsg}>Alterações não salvas</span>}
        {saved&&<span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo com sucesso!</span>}
        <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving?'Salvando...':'Salvar Odontograma'}
        </button>
      </div>
    </div>
  )
}
