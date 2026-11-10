'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Patient, MedicalRecord, OdontogramHistoryEntry } from '@/types'
import styles from './TabOdontograma.module.css'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import btn from '@/components/ui/button.module.css'
import { ArcadaImagem, type ToothLook, type ArcadaView } from './odontograma/ArcadaImagem'
import {
  TOOTH_STATUS, DEFAULT_STATUS, UPPER, LOWER, ALL_TEETH, FACE_NAME,
  statusColor, statusBg, statusLabel, toothMarks, plannedMarks, type SurfaceKey, type MarkKey,
} from '@/lib/odontograma'
import { OrcamentoOdontoModal } from './odontograma/OrcamentoOdontoModal'

// ── FDI ─────────────────────────────────────────────────────────
function isUpper(n: number) { return n >= 11 && n <= 28 }

// ── Anatomy: viewBox 0 0 56 96 ────────────────────────────────
// Estilo "atlas anatômico": silhueta clínica com mamelões/cúspides,
// linha cervical (junção coroa-raiz) e canal radicular sutil.
// Crown ≈ y=2–54; Root ≈ y=44–93. Upper teeth displayed scaleY(-1).
// Um único conjunto de formas serve upper/lower (espelhado via scaleY).

interface ToothAnatomy {
  crown: string
  root: string
  cervix?: string   // linha cervical — junção visível coroa/raiz
  detail?: string   // mamelões, cúspides, sulco central
  canal?: string     // canal radicular, traço fino e sutil
}

type ToothType = 'ci'|'li'|'ca'|'pm1'|'pm2'|'mo1'|'mo2'|'wi'

function toothType(num: number): ToothType {
  const p = num % 10
  if (p === 1) return 'ci'
  if (p === 2) return 'li'
  if (p === 3) return 'ca'
  if (p === 4) return 'pm1'
  if (p === 5) return 'pm2'
  if (p === 6) return 'mo1'
  if (p === 7) return 'mo2'
  return 'wi'
}

const TOOTH: Record<ToothType, ToothAnatomy> = {
  ci: {
    crown:  'M 10,9 C 10,4 14,2 28,2 C 42,2 46,4 46,9 C 46,24 44,40 41,49 C 38,53 33,55 28,55 C 23,55 18,53 15,49 C 12,40 10,24 10,9 Z',
    root:   'M 17,44 C 15,60 18,76 28,91 C 38,76 41,60 39,44 Z',
    cervix: 'M 13,48 Q 28,54 43,48',
    detail: 'M 20,5 L 20,16 M 28,4 L 28,18 M 36,5 L 36,16',
    canal:  'M 28,56 L 28,84',
  },
  li: {
    crown:  'M 13,9 C 13,4 16,2 28,2 C 40,2 43,4 43,9 C 43,24 41,39 39,48 C 36,52 32,54 28,54 C 24,54 20,52 17,48 C 15,39 13,24 13,9 Z',
    root:   'M 19,43 C 17,58 20,73 28,87 C 36,73 39,58 37,43 Z',
    cervix: 'M 16,47 Q 28,53 40,47',
    detail: 'M 22,5 L 22,15 M 28,4 L 28,17 M 34,5 L 34,15',
    canal:  'M 28,55 L 28,81',
  },
  ca: {
    crown:  'M 11,21 C 11,13 14,8 19,5 L 28,1 L 37,5 C 42,8 45,13 45,21 C 45,32 43,45 40,51 C 37,55 33,57 28,57 C 23,57 19,55 16,51 C 13,45 11,32 11,21 Z',
    root:   'M 18,46 C 15,62 19,79 28,93 C 37,79 41,62 38,46 Z',
    cervix: 'M 14,50 Q 28,56 42,50',
    detail: 'M 28,2 L 28,48 M 13,24 L 26,5 M 43,24 L 30,5',
    canal:  'M 28,58 L 28,86',
  },
  pm1: {
    crown:  'M 11,17 C 11,11 14,7 18,7 C 22,7 24,11 25,15 L 28,16 L 31,15 C 32,11 34,7 38,7 C 42,7 45,11 45,17 C 45,30 43,42 41,48 C 38,52 33,54 28,54 C 23,54 18,52 15,48 C 13,42 11,30 11,17 Z',
    root:   'M 17,45 C 14,57 13,70 16,82 Q 18,87 21,80 Q 23,69 26,64 L 28,63 L 30,64 Q 33,69 35,80 Q 38,87 40,82 C 43,70 42,57 39,45 Z',
    cervix: 'M 14,47 Q 28,53 42,47',
    detail: 'M 25,15 Q 28,20 31,15 M 28,18 L 28,46',
    canal:  'M 22,56 L 20,76 M 34,56 L 36,76',
  },
  pm2: {
    crown:  'M 11,17 C 11,11 14,7 18,7 C 22,7 24,11 25,15 L 28,16 L 31,15 C 32,11 34,7 38,7 C 42,7 45,11 45,17 C 45,30 43,42 41,48 C 38,52 33,54 28,54 C 23,54 18,52 15,48 C 13,42 11,30 11,17 Z',
    root:   'M 18,45 C 16,60 19,76 28,89 C 37,76 40,60 38,45 Z',
    cervix: 'M 14,47 Q 28,53 42,47',
    detail: 'M 25,15 Q 28,20 31,15 M 28,18 L 28,46',
    canal:  'M 28,56 L 28,83',
  },
  mo1: {
    crown:  'M 6,17 C 6,11 9,7 13,7 C 17,7 19,11 20,15 L 24,16 L 28,13 L 32,16 L 36,15 C 37,11 39,7 43,7 C 47,7 50,11 50,17 C 50,31 48,42 45,48 C 41,52 35,54 28,54 C 21,54 15,52 11,48 C 8,42 6,31 6,17 Z',
    root:   'M 10,45 C 7,57 6,71 10,83 Q 13,88 16,80 Q 18,68 22,63 L 25,62 Q 26,73 28,78 Q 30,73 31,62 L 34,63 Q 38,68 40,80 Q 43,88 46,83 C 50,71 49,57 46,45 Z',
    cervix: 'M 9,47 Q 28,54 47,47',
    detail: 'M 20,15 Q 28,21 36,15 M 28,15 L 28,47 M 9,28 Q 28,34 47,28',
    canal:  'M 15,57 L 13,76 M 28,57 L 28,73 M 41,57 L 43,76',
  },
  mo2: {
    crown:  'M 8,17 C 8,11 11,7 15,7 C 18,7 20,11 21,15 L 24,16 L 28,13 L 32,16 L 35,15 C 36,11 38,7 41,7 C 45,7 48,11 48,17 C 48,30 46,42 43,48 C 39,52 34,54 28,54 C 22,54 17,52 13,48 C 10,42 8,30 8,17 Z',
    root:   'M 12,45 C 9,57 8,70 12,81 Q 15,86 17,79 Q 19,68 23,63 L 25,62 Q 26,72 28,77 Q 30,72 31,62 L 33,63 Q 37,68 39,79 Q 41,86 44,81 C 48,70 47,57 44,45 Z',
    cervix: 'M 11,47 Q 28,54 45,47',
    detail: 'M 21,15 Q 28,21 35,15 M 28,15 L 28,47 M 11,28 Q 28,34 45,28',
    canal:  'M 17,57 L 15,74 M 28,57 L 28,71 M 39,57 L 41,74',
  },
  wi: {
    crown:  'M 8,17 C 8,11 11,7 15,7 C 18,7 20,11 21,15 L 24,16 L 28,13 L 32,16 L 35,15 C 36,11 38,7 41,7 C 45,7 48,11 48,17 C 48,30 46,42 43,48 C 39,52 34,54 28,54 C 22,54 17,52 13,48 C 10,42 8,30 8,17 Z',
    root:   'M 13,45 C 10,58 12,72 28,86 C 44,72 46,58 43,45 Z',
    cervix: 'M 11,47 Q 28,54 45,47',
    detail: 'M 21,15 Q 28,21 35,15 M 28,15 L 28,47',
    canal:  'M 28,56 L 28,80',
  },
}

function getAnatomy(num: number): ToothAnatomy {
  return TOOTH[toothType(num)]
}

// ── Surface data ─────────────────────────────────────────────────
const SURFACES: {key:SurfaceKey;label:string;x:number;y:number;w:number;h:number}[] = [
  {key:'v',label:'V',x:13,y:2, w:14,h:12},
  {key:'l',label:'L',x:13,y:26,w:14,h:12},
  {key:'m',label:'M',x:2, y:13,w:12,h:14},
  {key:'d',label:'D',x:26,y:13,w:12,h:14},
  {key:'o',label:'O',x:13,y:13,w:14,h:14},
]

interface ToothData { status: string; surfaces: Record<SurfaceKey,string>; note?: string; planned?: Partial<Record<MarkKey, boolean>> }
// tira as chaves falsas para o dente ficar igual ao que veio do banco
function withPlanned(d: ToothData, key: MarkKey, on: boolean): ToothData {
  const planned = { ...d.planned }
  if (on) planned[key] = true; else delete planned[key]
  return { ...d, planned: Object.keys(planned).length ? planned : undefined }
}
function emptyTooth(): ToothData {
  return { status: DEFAULT_STATUS, surfaces: {v:'higido',l:'higido',m:'higido',d:'higido',o:'higido'}, note: '' }
}

// ── Atlas anatômico ToothSVG ────────────────────────────────────────
// Estilo atlas clínico: marfim quase branco quando hígido, contorno e
// tinta leve na cor do estado quando não, linha cervical + mamelões +
// canal radicular sutis — legível a 30px na arcada inteira.
function ToothSVG({ num, data, selected, onClick }: {
  num: number; data: ToothData; selected: boolean; onClick: () => void
}) {
  const upper  = isUpper(num)
  const { crown, root, cervix, detail, canal } = getAnatomy(num)
  const status = data.status
  const absent = status === 'ausente'
  const higido = status === 'higido'
  const ink    = higido ? '#8A8272' : statusColor(status)
  const g      = `t${num}`

  return (
    <button type="button"
      className={`${styles.toothBtn} ${selected ? styles.toothBtnSelected : ''}`}
      onClick={onClick}
      title={`Dente ${num} — ${TOOTH_STATUS.find(s=>s.key===status)?.label ?? status}`}
    >
      <svg viewBox="0 0 56 96" className={styles.toothSvg}
        style={{ transform: upper ? 'scaleY(-1)' : 'none' }}>
        <defs>
          {/* Corpo do esmalte: marfim quase branco */}
          <linearGradient id={`bo${g}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#EDE7D8"/>
            <stop offset="34%"  stopColor="#FEFDFA"/>
            <stop offset="72%"  stopColor="#F8F4E9"/>
            <stop offset="100%" stopColor="#E7E0CF"/>
          </linearGradient>
          {/* Raiz: cemento levemente mais amarelado */}
          <linearGradient id={`rr${g}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#E6DECB"/>
            <stop offset="40%"  stopColor="#F7F2E5"/>
            <stop offset="100%" stopColor="#E0D7C2"/>
          </linearGradient>
        </defs>

        {absent ? (
          <>
            <path d={root} fill="none" stroke="#B3AC9A" strokeWidth="0.9" strokeDasharray="3,2.5"/>
            <path d={crown} fill="none" stroke="#B3AC9A" strokeWidth="1.1" strokeDasharray="3,2.5"/>
            <path d="M 16,14 L 40,42 M 40,14 L 16,42" stroke="#B3AC9A" strokeWidth="2.2" strokeLinecap="round"/>
          </>
        ) : (
          <>
            {/* Raiz */}
            <path d={root} fill={`url(#rr${g})`} stroke={ink} strokeWidth="0.9" strokeLinejoin="round"/>
            {canal && <path d={canal} fill="none" stroke={ink} strokeWidth="0.55" strokeLinecap="round" opacity="0.4"/>}
            {/* Coroa */}
            <path d={crown} fill={`url(#bo${g})`} stroke={ink} strokeWidth="1.1" strokeLinejoin="round"/>
            {/* Tinta do estado clínico */}
            {!higido && <path d={crown} fill={statusColor(status)} opacity="0.17"/>}
            {/* Mamelões / cúspides / sulco central */}
            {detail && <path d={detail} fill="none" stroke={ink} strokeWidth="0.6" strokeLinecap="round" opacity="0.4"/>}
            {/* Linha cervical — junção coroa/raiz */}
            {cervix && <path d={cervix} fill="none" stroke={ink} strokeWidth="0.8" strokeLinecap="round" opacity="0.55"/>}
          </>
        )}

        {/* SELECTION RING */}
        {selected && (
          <path d={crown} fill="none" stroke="#4DD9C0" strokeWidth="3" strokeLinejoin="round" opacity="0.88"/>
        )}
      </svg>
      <span className={styles.toothNumber}>
        {num}
        {data.note?.trim() && <span className={styles.noteMarker} title="Tem observação" />}
      </span>
    </button>
  )
}

// ── Surface diagram ───────────────────────────────────────────────
function SurfaceDiagram({ data, activeSurface, onSurfaceClick }: {
  data: ToothData; activeSurface: SurfaceKey|null; onSurfaceClick:(s:SurfaceKey)=>void
}) {
  return (
    <svg viewBox="0 0 40 40" className={styles.surfaceDiagram}>
      {SURFACES.map(s => (
        <rect key={s.key} x={s.x} y={s.y} width={s.w} height={s.h} rx="2"
          fill={statusBg(data.surfaces[s.key]??DEFAULT_STATUS)}
          stroke={activeSurface===s.key?'#4DD9C0':statusColor(data.surfaces[s.key]??DEFAULT_STATUS)}
          strokeWidth={activeSurface===s.key?2.4:1.4}
          style={{cursor:'pointer'}} onClick={()=>onSurfaceClick(s.key)}/>
      ))}
      {SURFACES.map(s => (
        <text key={s.key+'t'} x={s.x+s.w/2} y={s.y+s.h/2+3.5} textAnchor="middle"
          fontSize="7" fontWeight="700" fill={statusColor(data.surfaces[s.key]??DEFAULT_STATUS)}
          style={{pointerEvents:'none',userSelect:'none'}}>{s.label}</text>
      ))}
    </svg>
  )
}

// ── Textos clínicos por dente ──────────────────────────────────────
const POSITION_NAME = ['', 'Incisivo central', 'Incisivo lateral', 'Canino', '1º pré-molar', '2º pré-molar', '1º molar', '2º molar', '3º molar (siso)']
const QUADRANT_NAME = ['', 'Superior direito', 'Superior esquerdo', 'Inferior esquerdo', 'Inferior direito']
// o que fazer com cada condição (usado nos cartões e nas recomendações; regra fixa, não é IA)
const NEXT_STEP: Record<string, string> = {
  cariado: 'Restauração recomendada', fraturado: 'Avaliar restauração ou coroa', extracao: 'Agendar a extração',
  tratamento: 'Continuar o tratamento', implante: 'Acompanhar o implante', coroa: 'Revisar a coroa na manutenção',
  restaurado: 'Acompanhar a restauração', selante: 'Acompanhar o selante', protese: 'Revisar a prótese',
  ausente: 'Avaliar reposição (implante ou prótese)',
}
// nome do procedimento no histórico
const PROCEDURE: Record<string, string> = {
  higido: 'Marcado como hígido', cariado: 'Cárie registrada', restaurado: 'Restauração', ausente: 'Ausência registrada',
  implante: 'Implante', coroa: 'Coroa', tratamento: 'Início de tratamento', fraturado: 'Fratura registrada',
  selante: 'Selante', extracao: 'Extração indicada', protese: 'Prótese',
}
const DONE = new Set(['higido', 'restaurado', 'implante', 'coroa', 'selante', 'protese'])
const URGENT = new Set(['cariado', 'fraturado', 'extracao', 'tratamento'])

function toothAlterations(d: ToothData): string[] {
  const out: string[] = []
  if (d.status !== DEFAULT_STATUS) out.push(d.status)
  for (const k of Object.keys(d.surfaces) as SurfaceKey[]) {
    const v = d.surfaces[k]
    if (v && v !== DEFAULT_STATUS && !out.includes(v)) out.push(v)
  }
  return out
}
function affectedFaces(d: ToothData) {
  return SURFACES.filter(s => d.surfaces[s.key] && d.surfaces[s.key] !== DEFAULT_STATUS)
}
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(' de ', ' ').replace('.', '')

/** Miniatura do dente (coroa do desenho 2D) para os cartões. */
function ToothThumb({ num, status }: { num: number; status: string }) {
  const { crown, detail } = getAnatomy(num)
  const ink = status === DEFAULT_STATUS ? '#8A8272' : statusColor(status)
  return (
    <span className={styles.thumb} aria-hidden="true">
      <svg viewBox="0 0 56 60" style={{ transform: isUpper(num) ? 'scaleY(-1)' : undefined }}>
        <path d={crown} fill="#FBF8F1" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        {status !== DEFAULT_STATUS && <path d={crown} fill={statusColor(status)} opacity="0.22" />}
        {detail && <path d={detail} fill="none" stroke={ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />}
      </svg>
    </span>
  )
}

// ── Props / Main ──────────────────────────────────────────────────
interface Props { record: MedicalRecord|null; patient: Patient; clinicId: string; onSaved: ()=>void; onDirtyChange?: (dirty: boolean) => void }

function readTeeth(raw: Record<string, unknown>): Record<number, ToothData> {
  const loaded: Record<number, ToothData> = {}
  for (const num of ALL_TEETH) {
    const v = raw[num]
    if (!v) loaded[num] = emptyTooth()
    else if (typeof v === 'string') loaded[num] = { ...emptyTooth(), status: v }
    else loaded[num] = { ...emptyTooth(), ...(v as Partial<ToothData>), surfaces: { ...emptyTooth().surfaces, ...((v as Partial<ToothData>).surfaces ?? {}) } }
  }
  return loaded
}

export function TabOdontograma({ record, patient, clinicId, onSaved, onDirtyChange }: Props) {
  const router = useRouter()
  const userName = useAuthStore(s => s.user?.displayName ?? '')
  const [teeth, setTeeth]             = useState<Record<number,ToothData>>({})
  const [savedTeeth, setSavedTeeth]   = useState<Record<number,ToothData>>({})
  const [history, setHistory]         = useState<OdontogramHistoryEntry[]>([])
  const [selectedTooth, setSelected]  = useState<number|null>(null)
  const [hoverTooth, setHover]        = useState<number|null>(null)
  const [activeSurface, setActiveSurf]= useState<SurfaceKey|null>(null)
  const [mode, setMode]               = useState<'plano'|'historico'>('plano')
  const [zoom, setZoom]               = useState(0)
  const [view, setView]               = useState<ArcadaView>('frente')
  const [noImages, setNoImages]       = useState(false)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [detailOpen, setDetailOpen]   = useState(false)
  const [nextPlanned, setNextPlanned] = useState(false)
  const [budgetOpen, setBudgetOpen]   = useState(false)

  // O prontuário recarrega o registro quando QUALQUER aba salva. Só reaplica aqui se o odontograma
  // mudou de fato; senão salvar o faceograma apagaria o que foi marcado aqui e ainda não foi salvo.
  const loadedKey = useRef<string | null>(null)
  useEffect(() => {
    const key = JSON.stringify(record?.odontogram ?? null)
    if (key === loadedKey.current) return
    loadedKey.current = key
    const raw = (record?.odontogram ?? {}) as Record<string, unknown>
    const loaded = readTeeth(raw)
    setTeeth(loaded)
    setSavedTeeth(loaded)
    setHistory(Array.isArray(raw._history) ? (raw._history as OdontogramHistoryEntry[]) : [])
  }, [record])

  function selectTooth(num: number | null) {
    setSelected(num); setActiveSurf(null)
  }
  // clicar num dente (na arcada ou na análise) abre o detalhe dele num modal
  function openTooth(num: number) {
    selectTooth(num); setDetailOpen(true)
  }
  function closeDetail() { setDetailOpen(false) }
  // anterior/próximo dente da mesma arcada, de dentro do modal
  function stepTooth(dir: -1 | 1) {
    if (selectedTooth === null) return
    const row = UPPER.includes(selectedTooth) ? UPPER : LOWER
    const next = row[row.indexOf(selectedTooth) + dir]
    if (next === undefined) return
    if (view === 'frente' && next % 10 === 8) setView('cima')
    selectTooth(next)
  }
  function handleSurfaceClick(s: SurfaceKey) {
    if (selectedTooth===null) return
    setActiveSurf(prev => prev===s ? null : s)
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
      setTeeth(p=>({...p,[n]:{...p[n],status:DEFAULT_STATUS,surfaces:emptyTooth().surfaces,planned:undefined}}))
    } else {
      setTeeth(p=>{
        const next = p[n].status===status?DEFAULT_STATUS:status
        return {...p,[n]:withPlanned({...p[n],status:next}, 'all', next!==DEFAULT_STATUS && nextPlanned)}
      })
    }
  }
  // "existente" ou "a realizar" da marcação que está em foco (dente inteiro ou a face escolhida)
  function setPlanned(on: boolean) {
    setNextPlanned(on)
    if (selectedTooth===null) return
    const n = selectedTooth
    const key: MarkKey = activeSurface ?? 'all'
    setTeeth(p=>{
      const d = p[n]
      const marked = key==='all' ? d.status!==DEFAULT_STATUS : d.surfaces[key]!==DEFAULT_STATUS
      return marked ? {...p,[n]:withPlanned(d,key,on)} : p
    })
  }
  // marca como feito um procedimento que estava no plano
  function markDone(key: MarkKey) {
    if (selectedTooth===null) return
    const n = selectedTooth
    setTeeth(p=>({...p,[n]:withPlanned(p[n],key,false)}))
  }
  // tira uma marcação só (o dente inteiro ou uma face)
  function clearMark(face: SurfaceKey | null) {
    if (selectedTooth===null) return
    const n = selectedTooth
    setTeeth(p=>face
      ? {...p,[n]:withPlanned({...p[n],surfaces:{...p[n].surfaces,[face]:DEFAULT_STATUS}}, face, false)}
      : {...p,[n]:withPlanned({...p[n],status:DEFAULT_STATUS}, 'all', false)})
  }
  // volta o dente ao que estava no último salvamento
  function undoTooth() {
    if (selectedTooth===null) return
    const n = selectedTooth
    setTeeth(p=>({...p,[n]:savedTeeth[n] ?? emptyTooth()}))
    setActiveSurf(null)
  }
  function toothChanged(n: number) {
    const a = teeth[n], b = savedTeeth[n]
    if (!a || !b) return false
    return a.status!==b.status || (a.note??'')!==(b.note??'') ||
      (Object.keys(a.surfaces) as SurfaceKey[]).some(k=>a.surfaces[k]!==b.surfaces[k]) ||
      (['all','v','l','m','d','o'] as MarkKey[]).some(k=>!!a.planned?.[k]!==!!b.planned?.[k])
  }
  const dirtyAny = ALL_TEETH.some(toothChanged)
  // avisa o prontuário, que pergunta antes de fechar com alterações não salvas
  useEffect(() => { onDirtyChange?.(dirtyAny) }, [dirtyAny, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // o que mudou desde o último salvamento vira linhas do histórico
  function pendingEntries(): OdontogramHistoryEntry[] {
    const at = new Date().toISOString()
    const out: OdontogramHistoryEntry[] = []
    for (const num of ALL_TEETH) {
      const now = teeth[num], before = savedTeeth[num]
      if (!now || !before) continue
      const planned = (d: ToothData, k: MarkKey, status: string) => status !== DEFAULT_STATUS && !!d.planned?.[k]
      if (now.status !== before.status || planned(now, 'all', now.status) !== planned(before, 'all', before.status)) {
        out.push({ at, tooth: num, status: now.status, by: userName, ...(planned(now, 'all', now.status) ? { planned: true } : {}) })
      }
      for (const k of Object.keys(now.surfaces) as SurfaceKey[]) {
        if (now.surfaces[k] !== before.surfaces[k] || planned(now, k, now.surfaces[k]) !== planned(before, k, before.surfaces[k])) {
          out.push({ at, tooth: num, face: k, status: now.surfaces[k], by: userName, ...(planned(now, k, now.surfaces[k]) ? { planned: true } : {}) })
        }
      }
    }
    return out
  }

  async function handleSave() {
    setSaving(true)
    const nextHistory = [...history, ...pendingEntries()]
    const payload={clinic_id:clinicId,patient_id:patient.id,
      odontogram:{ ...teeth, _history: nextHistory } as MedicalRecord['odontogram'],
      updated_at:new Date().toISOString()}
    if (record?.id) await supabase.from('medical_records').update(payload).eq('id',record.id)
    else await supabase.from('medical_records').insert([payload])
    setHistory(nextHistory)
    setSavedTeeth(teeth)
    setSaved(true); setTimeout(()=>setSaved(false),2500)
    setSaving(false); onSaved()
  }

  // aparência de cada dente na arcada
  const looks = useMemo(() => {
    const touched = new Set(history.map(h => h.tooth))
    const out: Record<number, ToothLook> = {}
    for (const num of ALL_TEETH) {
      const d = teeth[num] ?? emptyTooth()
      const ghost = d.status === 'ausente'
      if (mode === 'historico') { out[num] = { color: touched.has(num) ? '#2BC4A9' : null, ghost }; continue }
      // o que já existe manda na cor; o que só está planejado aparece mais suave e tracejado
      const marks = toothMarks(num, d)
      const main = marks.find(m => !m.planned) ?? marks[0]
      out[num] = { color: ghost || !main ? null : statusColor(main.status), ghost, planned: !!main?.planned }
    }
    return out
  }, [teeth, history, mode])

  const analysis = ALL_TEETH.filter(n => teeth[n] && (toothAlterations(teeth[n]).length > 0 || teeth[n].note?.trim()))
  const urgent = ALL_TEETH.filter(n => teeth[n] && toothAlterations(teeth[n]).some(a => URGENT.has(a)))
  const risk = urgent.some(n => toothAlterations(teeth[n]).some(a => a === 'extracao' || a === 'fraturado')) || urgent.length >= 3
    ? 'alto' : urgent.length > 0 ? 'moderado' : 'baixo'
  // legenda: só as condições que aparecem neste odontograma, com a contagem de dentes
  const legend = TOOTH_STATUS.filter(s => s.key !== DEFAULT_STATUS)
    .map(s => ({ ...s, count: ALL_TEETH.filter(n => teeth[n] && toothAlterations(teeth[n]).includes(s.key)).length }))
    .filter(s => s.count > 0)
  const plannedList = plannedMarks(teeth)
  const byStatus = (k: string) => ALL_TEETH.filter(n => teeth[n] && toothAlterations(teeth[n]).includes(k))

  const selData = selectedTooth!==null ? teeth[selectedTooth] : null
  const hoverData = hoverTooth !== null ? teeth[hoverTooth] : null

  // teclado no palco: setas andam pelos dentes, para cima e para baixo trocam de arcada
  function onStageKey(e: React.KeyboardEvent) {
    const cur = selectedTooth ?? 11
    const row = UPPER.includes(cur) ? UPPER : LOWER
    const i = row.indexOf(cur)
    let next: number | null = null
    if (e.key === 'ArrowRight') next = row[Math.min(row.length - 1, i + 1)]
    else if (e.key === 'ArrowLeft') next = row[Math.max(0, i - 1)]
    else if (e.key === 'ArrowDown' && row === UPPER) next = LOWER[i]
    else if (e.key === 'ArrowUp' && row === LOWER) next = UPPER[i]
    else if ((e.key === 'Enter' || e.key === ' ') && selectedTooth !== null) { setDetailOpen(true); e.preventDefault(); return }
    else if (e.key === 'Escape' && selectedTooth !== null) { selectTooth(null); e.preventDefault(); return }
    if (next !== null) {
      e.preventDefault()
      if (view === 'frente' && next % 10 === 8) setView('cima')
      selectTooth(next)
    }
  }

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

  return (
    <div className={styles.board}>
      {/* ── Palco da arcada ── */}
      <section className={styles.stageCard}>
        <div className={styles.viewTabs} role="group" aria-label="Ângulo da arcada">
          <button type="button" aria-pressed={view === 'frente'} className={`${styles.viewTab} ${view === 'frente' ? styles.viewTabOn : ''}`} onClick={() => setView('frente')}>Frente</button>
          <button type="button" aria-pressed={view === 'cima'} className={`${styles.viewTab} ${view === 'cima' ? styles.viewTabOn : ''}`} onClick={() => setView('cima')}>Vista de cima</button>
        </div>
        <div className={styles.modeTabs} role="group" aria-label="Visão da arcada">
          <button type="button" aria-pressed={mode === 'plano'} className={`${styles.modeTab} ${mode === 'plano' ? styles.modeTabOn : ''}`} onClick={() => setMode('plano')}>Plano de tratamento</button>
          <button type="button" aria-pressed={mode === 'historico'} className={`${styles.modeTab} ${mode === 'historico' ? styles.modeTabOn : ''}`} onClick={() => setMode('historico')}>Histórico</button>
        </div>

        {noImages ? (
          <div className={styles.arcade} data-hscroll>
            <div className={styles.teethRow}>
              {UPPER.map(n=><ToothSVG key={n} num={n} data={teeth[n]??emptyTooth()} selected={selectedTooth===n} onClick={()=>openTooth(n)}/>)}
            </div>
            <div className={styles.midline}/>
            <div className={styles.teethRow}>
              {LOWER.map(n=><ToothSVG key={n} num={n} data={teeth[n]??emptyTooth()} selected={selectedTooth===n} onClick={()=>openTooth(n)}/>)}
            </div>
          </div>
        ) : (
          <>
            <div className={styles.zoom}>
              <button type="button" className={styles.zoomBtn} aria-label="Aproximar" onClick={() => setZoom(z => Math.min(1, z + 0.15))}><span aria-hidden="true">+</span></button>
              <input
                type="range" min={0} max={100} value={Math.round(zoom * 100)}
                onChange={e => setZoom(Number(e.target.value) / 100)}
                className={styles.zoomRange} aria-label="Aproximar a arcada"
              />
              <button type="button" className={styles.zoomBtn} aria-label="Afastar" onClick={() => setZoom(z => Math.max(0, z - 0.15))}><span aria-hidden="true">−</span></button>
            </div>
            <div
              className={styles.stage}
              tabIndex={0}
              role="application"
              aria-roledescription="arcada dentária"
              aria-label="Arcada dentária. Setas escolhem o dente, Enter abre o detalhe, para cima e para baixo trocam de arcada, Esc tira a seleção."
              onKeyDown={onStageKey}
            >
              <ArcadaImagem
                view={view}
                looks={looks}
                selected={selectedTooth}
                hovered={hoverTooth}
                zoom={zoom}
                onPick={openTooth}
                onHover={setHover}
                onUnavailable={() => setNoImages(true)}
              />
              {hoverTooth !== null && hoverData && (
                <div className={styles.hoverTip} aria-hidden="true">
                  <b>{hoverTooth}</b> {POSITION_NAME[hoverTooth % 10]} · {statusLabel(toothAlterations(hoverData)[0] ?? hoverData.status)}
                </div>
              )}
            </div>
            <div className={styles.stageFoot}>
              <span className={styles.sideLabel}>Direito do paciente</span>
              <span className={styles.stageHint}>{view === 'frente' ? 'Clique num dente para ver e editar. Os sisos aparecem na vista de cima.' : 'Clique num dente para ver e editar'}</span>
              <span className={styles.sideLabel}>Esquerdo</span>
            </div>
          </>
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
              {plannedList.length > 0 && <li><span className={styles.legendDot} data-planned="true" />A realizar, contorno tracejado <small>{plannedList.length}</small></li>}
              <li className={styles.legendNone}>Hígido: sem cor</li>
            </>
          )}
        </ul>
        <p className={styles.srOnly} aria-live="polite">
          {selectedTooth !== null && selData ? `Dente ${selectedTooth}, ${POSITION_NAME[selectedTooth % 10]}, ${statusLabel(selData.status)}` : ''}
        </p>
      </section>

      {/* ── Análise dos dentes ── */}
      <section className={`${styles.card} ${styles.analysis}`}>
        <h3 className={styles.cardTitle}>Análise dos dentes</h3>
        {analysis.length === 0 ? (
          <p className={styles.empty}>Nenhum dente com alteração. Clique num dente da arcada para registrar.</p>
        ) : (
          <ul className={styles.analysisList}>
            {analysis.map(n => {
              const d = teeth[n]
              const alt = toothAlterations(d)
              const main = alt[0] ?? d.status
              return (
                <li key={n}>
                  <button type="button" className={`${styles.toothCard} ${selectedTooth === n ? styles.toothCardOn : ''}`} onClick={() => openTooth(n)}>
                    <ToothThumb num={n} status={main} />
                    <span className={styles.toothCardGrid}>
                      <span><small>Dente</small><b>#{n}</b></span>
                      <span><small>Posição</small><b>{QUADRANT_NAME[Math.floor(n / 10)]}</b></span>
                    </span>
                    <span className={styles.statusChip} style={{ '--st-color': statusColor(main), '--st-bg': statusBg(main) } as React.CSSProperties}>{statusLabel(main)}{toothMarks(n, d).every(m => m.planned) ? ' · a realizar' : ''}</span>
                    <span className={styles.toothCardNote}>{d.note?.trim() || NEXT_STEP[main] || 'Acompanhar na próxima revisão'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
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
                    <td>{h.planned ? 'Planejado: ' : ''}{PROCEDURE[h.status] ?? statusLabel(h.status)}{h.face ? ` (${FACE_NAME[h.face as SurfaceKey] ?? h.face})` : ''}</td>
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

      {/* ── Detalhe do dente (abre ao clicar no dente) ── */}
      {detailOpen && selectedTooth !== null && selData && (() => {
        const row = UPPER.includes(selectedTooth) ? UPPER : LOWER
        const idx = row.indexOf(selectedTooth)
        const dirty = dirtyAny
        const changedHere = toothChanged(selectedTooth)
        const faces = affectedFaces(selData)
        return (
          <Modal
            open
            onClose={closeDetail}
            size="lg"
            title={`Dente ${selectedTooth}`}
            subtitle={`${POSITION_NAME[selectedTooth % 10]} · ${QUADRANT_NAME[Math.floor(selectedTooth / 10)]}`}
            leading={<span className={styles.modalThumb}><ToothThumb num={selectedTooth} status={toothAlterations(selData)[0] ?? selData.status} /></span>}
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
                <button type="button" className={styles.btnSave} onClick={async () => { await handleSave(); closeDetail() }} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </>
            }
          >
            <dl className={styles.facts}>
              <div><dt>Localização</dt><dd>{QUADRANT_NAME[Math.floor(selectedTooth / 10)]} (quadrante {Math.floor(selectedTooth / 10)})</dd></div>
              <div><dt>Número</dt><dd>#{selectedTooth}</dd></div>
              <div><dt>Condição</dt><dd>{statusLabel(selData.status)}</dd></div>
            </dl>
            <div className={styles.marks}>
              <p className={styles.miniLabel}>Marcações deste dente</p>
              {selData.status === DEFAULT_STATUS && faces.length === 0 ? (
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
                    <li key={f.key} className={styles.markChip} style={{ '--st-color': statusColor(selData.surfaces[f.key]), '--st-bg': statusBg(selData.surfaces[f.key]) } as React.CSSProperties}>
                      <span className={styles.statusDot} style={{ background: statusColor(selData.surfaces[f.key]) }} />
                      {statusLabel(selData.surfaces[f.key])} <small>face {FACE_NAME[f.key].toLowerCase()}{selData.planned?.[f.key] ? ' · a realizar' : ''}</small>
                      {selData.planned?.[f.key] && <button type="button" className={styles.doneBtn} onClick={() => markDone(f.key)}>Realizado</button>}
                      <button type="button" aria-label={`Tirar ${statusLabel(selData.surfaces[f.key])} da face ${FACE_NAME[f.key].toLowerCase()}`} onClick={() => clearMark(f.key)}><Icon name="close" size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={styles.editor}>
              <div className={styles.facesCol}>
                <SurfaceDiagram data={selData} activeSurface={activeSurface} onSurfaceClick={handleSurfaceClick}/>
                <p className={styles.facesHint}>{activeSurface ? `Face ${FACE_NAME[activeSurface]}` : 'Toque numa face para pintar só ela'}</p>
              </div>
              <div className={styles.statusCol}>
                <p className={styles.miniLabel}>{activeSurface ? `Condição da face ${FACE_NAME[activeSurface].toLowerCase()}` : 'Condição do dente inteiro'}</p>
                <p className={styles.statusHint}>{activeSurface ? 'Clique de novo na condição marcada para desmarcar a face.' : 'Clique de novo na condição marcada para desmarcar. Hígido limpa o dente e as faces.'}</p>
                <div className={styles.seg} role="group" aria-label="Situação desta marcação">
                  {([[false, 'Existente'], [true, 'A realizar']] as const).map(([v, label]) => {
                    const key: MarkKey = activeSurface ?? 'all'
                    const marked = key === 'all' ? selData.status !== DEFAULT_STATUS : selData.surfaces[key] !== DEFAULT_STATUS
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
            <label className={styles.miniLabel} htmlFor="toothNote">Observação do dente</label>
            <textarea
              id="toothNote"
              className={styles.noteTextarea}
              rows={3}
              value={selData.note ?? ''}
              placeholder="Ex: extrair e colocar implante"
              onChange={e => setTeeth(p => ({ ...p, [selectedTooth]: { ...p[selectedTooth], note: e.target.value } }))}
            />
          </Modal>
        )
      })()}

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
