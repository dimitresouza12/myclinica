'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient, MedicalRecord } from '@/types'
import styles from './TabOdontograma.module.css'
import { Icon } from '@/components/ui/Icon'

// ── Status ──────────────────────────────────────────────────────
export const TOOTH_STATUS = [
  { key: 'higido',     label: 'Hígido',       color: '#10b981', bg: '#d1fae5' },
  { key: 'cariado',    label: 'Cariado',       color: '#ef4444', bg: '#fee2e2' },
  { key: 'restaurado', label: 'Restaurado',    color: '#3b82f6', bg: '#dbeafe' },
  { key: 'ausente',    label: 'Ausente',       color: '#6b7280', bg: '#f3f4f6' },
  { key: 'implante',   label: 'Implante',      color: '#f59e0b', bg: '#fef3c7' },
  { key: 'coroa',      label: 'Coroa',         color: '#14b8a6', bg: '#ccfbf1' },
  { key: 'tratamento', label: 'Em Tratamento', color: '#ec4899', bg: '#fce7f3' },
  { key: 'fraturado',  label: 'Fraturado',     color: '#ea580c', bg: '#ffedd5' },
  { key: 'selante',    label: 'Selante',       color: '#7c3aed', bg: '#ede9fe' },
  { key: 'extracao',   label: 'Extração Indicada', color: '#b91c1c', bg: '#fecaca' },
  { key: 'protese',    label: 'Prótese',       color: '#0891b2', bg: '#cffafe' },
]
function statusColor(k: string) { return TOOTH_STATUS.find(s => s.key === k)?.color ?? '#10b981' }
function statusBg(k: string)    { return TOOTH_STATUS.find(s => s.key === k)?.bg    ?? '#d1fae5' }

// ── FDI ─────────────────────────────────────────────────────────
const UPPER = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28]
const LOWER = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38]
const DEFAULT_STATUS = 'higido'
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
type SurfaceKey = 'v'|'l'|'m'|'d'|'o'
const SURFACES: {key:SurfaceKey;label:string;x:number;y:number;w:number;h:number}[] = [
  {key:'v',label:'V',x:13,y:2, w:14,h:12},
  {key:'l',label:'L',x:13,y:26,w:14,h:12},
  {key:'m',label:'M',x:2, y:13,w:12,h:14},
  {key:'d',label:'D',x:26,y:13,w:12,h:14},
  {key:'o',label:'O',x:13,y:13,w:14,h:14},
]

interface ToothData { status: string; surfaces: Record<SurfaceKey,string>; note?: string }
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

// ── Props / Main ──────────────────────────────────────────────────
interface Props { record: MedicalRecord|null; patient: Patient; clinicId: string; onSaved: ()=>void }

export function TabOdontograma({ record, patient, clinicId, onSaved }: Props) {
  const [teeth, setTeeth]             = useState<Record<number,ToothData>>({})
  const [selectedTooth, setSelected]  = useState<number|null>(null)
  const [activeSurface, setActiveSurf]= useState<SurfaceKey|null>(null)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)

  useEffect(() => {
    const raw = (record?.odontogram??{}) as Record<string,unknown>
    const loaded: Record<number,ToothData> = {}
    for (const num of [...UPPER,...LOWER]) {
      const v = raw[num]
      if (!v) loaded[num]=emptyTooth()
      else if (typeof v==='string') loaded[num]={...emptyTooth(),status:v}
      else loaded[num]={...emptyTooth(),...(v as Partial<ToothData>)}
    }
    setTeeth(loaded)
  }, [record])

  function handleToothClick(num: number) {
    if (selectedTooth===num) {
      setSelected(null); setActiveSurf(null); return
    }
    setSelected(num); setActiveSurf(null)
  }
  function handleSurfaceClick(s: SurfaceKey) {
    if (selectedTooth===null) return
    setActiveSurf(prev => prev===s ? null : s)
  }
  // Aplicar status nunca fecha o painel — dá pra escrever a observação ou
  // pintar outra face em seguida sem reabrir. Só fecha ao clicar de novo
  // no mesmo dente, em outro dente, ou no X.
  function applyStatus(status: string) {
    if (selectedTooth===null) return
    if (activeSurface) {
      setTeeth(p=>({...p,[selectedTooth]:{...p[selectedTooth],surfaces:{...p[selectedTooth].surfaces,[activeSurface]:status}}}))
      setActiveSurf(null)
    } else {
      setTeeth(p=>({...p,[selectedTooth]:{...p[selectedTooth],status}}))
    }
  }
  async function handleSave() {
    setSaving(true)
    const payload={clinic_id:clinicId,patient_id:patient.id,
      odontogram:teeth as Record<string,{status:string;surfaces?:Record<string,string>}>,
      updated_at:new Date().toISOString()}
    if (record?.id) await supabase.from('medical_records').update(payload).eq('id',record.id)
    else await supabase.from('medical_records').insert([payload])
    setSaved(true); setTimeout(()=>setSaved(false),2500)
    setSaving(false); onSaved()
  }

  const selData = selectedTooth!==null ? teeth[selectedTooth] : null

  return (
    <div className={styles.wrap}>
      {/* Arcade */}
      <div className={styles.arcade} data-hscroll>
        <div className={styles.arcadeLabel}>Superior</div>
        <div className={styles.teethRow}>
          {UPPER.map(n=><ToothSVG key={n} num={n} data={teeth[n]??emptyTooth()} selected={selectedTooth===n} onClick={()=>handleToothClick(n)}/>)}
        </div>
        <div className={styles.midline}/>
        <div className={styles.teethRow}>
          {LOWER.map(n=><ToothSVG key={n} num={n} data={teeth[n]??emptyTooth()} selected={selectedTooth===n} onClick={()=>handleToothClick(n)}/>)}
        </div>
        <div className={styles.arcadeLabel}>Inferior</div>
      </div>

      {/* Selection panel */}
      {selectedTooth!==null && selData && (
        <div className={styles.selPanel}>
          <div className={styles.selPanelHeader}>
            <span className={styles.selPanelTitle}>Dente {selectedTooth}</span>
            <button type="button" className={styles.selPanelClose} onClick={()=>{setSelected(null);setActiveSurf(null)}}><Icon name="close" size={16} /></button>
          </div>
          <div className={styles.selPanelBody}>
            <div className={styles.selPanelLeft}>
              <p className={styles.selPanelSub}>Faces</p>
              <SurfaceDiagram data={selData} activeSurface={activeSurface} onSurfaceClick={handleSurfaceClick}/>
              <p className={styles.selPanelHint}>{activeSurface?`Face: ${SURFACES.find(s=>s.key===activeSurface)?.label} — clique de novo pra desmarcar`:'Clique numa face pra pintar só ela'}</p>
            </div>
            <div className={styles.selPanelRight}>
              <p className={styles.selPanelSub}>{activeSurface?`Status da face ${SURFACES.find(s=>s.key===activeSurface)?.label}`:'Status do dente inteiro'}</p>
              <div className={styles.statusGrid}>
                {TOOTH_STATUS.map(s=>{
                  const isCurr=activeSurface?selData.surfaces[activeSurface]===s.key:selData.status===s.key
                  return (
                    <button key={s.key} type="button"
                      className={`${styles.statusBtn} ${isCurr?styles.statusBtnActive:''}`}
                      style={{'--st-color':s.color,'--st-bg':s.bg} as React.CSSProperties}
                      onClick={()=>applyStatus(s.key)}>
                      <span className={styles.statusDot} style={{background:s.color}}/>{s.label}
                    </button>
                  )
                })}
              </div>
              {!activeSurface && (
                <div className={styles.noteField}>
                  <p className={styles.selPanelSub}>Observação do dente</p>
                  <textarea
                    className={styles.noteTextarea}
                    rows={2}
                    value={selData.note ?? ''}
                    placeholder="Ex: extrair e colocar implante"
                    onChange={e => setTeeth(p => ({ ...p, [selectedTooth]: { ...p[selectedTooth], note: e.target.value } }))}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend}>
        {TOOTH_STATUS.map(s=>(
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{background:s.color}}/>{s.label}
          </span>
        ))}
      </div>

      {/* Save */}
      <div className={styles.saveRow}>
        {saved&&<span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo com sucesso!</span>}
        <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving?'Salvando...':'Salvar Odontograma'}
        </button>
      </div>
    </div>
  )
}
