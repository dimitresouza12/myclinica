'use client'
import { useMemo, useState } from 'react'
import { DatePicker } from '@/components/ui/DatePicker'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import {
  cellKey, cycleCell, MARCA_LABEL, MARCA_SIGLA, POSICOES, QUADRO_CONSOANTES, resumoFonemico, sanitizeCells,
  type FonemaAvaliacaoData, type FonemaCells, type Marca,
} from '@/lib/metas/fonemas'
import { brDate } from '@/lib/metas/relatorio'
import type { SeriesPoint } from '@/lib/metas/progress'
import type { Assessment } from '@/lib/metas/types'
import { ProgressChart } from './ProgressChart'
import styles from './metas.module.css'

interface Props {
  today: string
  assessments: Assessment[]
  onSave: (args: { id?: string; date: string; data: FonemaAvaliacaoData }) => Promise<Assessment | null>
  onDelete: (id: string) => Promise<boolean>
  onDirtyChange: (dirty: boolean) => void
}

const MARCA_CLASS: Record<Marca, string> = { c: styles.fonC, s: styles.fonS, o: styles.fonO, d: styles.fonD }
const fmtPcc = (v: number | null) => (v === null ? '-' : `${String(v).replace('.', ',')}%`)

export function QuadroFonemico({ today, assessments, onSave, onDelete, onDirtyChange }: Props) {
  const list = useMemo(() => assessments.filter(a => a.kind === 'quadro_fonemico').sort((a, b) => a.assessed_on.localeCompare(b.assessed_on)), [assessments])
  const [selectedId, setSelectedId] = useState<string | 'novo'>(() => list[list.length - 1]?.id ?? 'novo')
  const current = list.find(a => a.id === selectedId)
  const [cells, setCells] = useState<FonemaCells>(() => sanitizeCells((current?.data as FonemaAvaliacaoData | undefined)?.cells))
  const [date, setDate] = useState(current?.assessed_on ?? today)
  const [note, setNote] = useState((current?.data as FonemaAvaliacaoData | undefined)?.note ?? '')
  const [dirty, setDirtyState] = useState(false)
  const [saving, setSaving] = useState(false)

  function setDirty(v: boolean) { setDirtyState(v); onDirtyChange(v) }

  // trocar de avaliação (ou abrir "Nova avaliação") sobrescreve a tela: antes, confirma se há alteração não salva
  async function trocar(id: string | 'novo') {
    if (id === selectedId) return
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Descartar alterações?',
        message: 'Há alterações nesta avaliação que ainda não foram salvas. Se trocar agora, elas serão perdidas.',
        confirmText: 'Descartar',
        cancelText: 'Continuar editando',
        danger: true,
      })
      if (!ok) return
    }
    load(id)
  }

  function load(id: string | 'novo') {
    const a = list.find(x => x.id === id)
    const d = a?.data as FonemaAvaliacaoData | undefined
    setSelectedId(id)
    setCells(sanitizeCells(d?.cells))
    setDate(a?.assessed_on ?? today)
    setNote(d?.note ?? '')
    setDirty(false)
  }

  const resumo = resumoFonemico(cells)
  const serie: SeriesPoint[] = useMemo(() => {
    const pts: SeriesPoint[] = []
    for (const a of list) {
      const pcc = resumoFonemico(sanitizeCells((a.data as FonemaAvaliacaoData).cells)).pcc
      if (pcc !== null) pts.push({ date: a.assessed_on, score: pcc })
    }
    return pts
  }, [list])

  async function save() {
    setSaving(true)
    const saved = await onSave({ id: current?.id, date, data: { cells, ...(note.trim() ? { note: note.trim() } : {}) } })
    setSaving(false)
    if (saved) { setSelectedId(saved.id); setDirty(false) }
  }

  async function remove() {
    if (!current) return
    if (await onDelete(current.id)) load('novo')
  }

  const options = [
    ...list.map(a => ({ value: a.id, label: `Avaliação de ${brDate(a.assessed_on)}` })).reverse(),
    { value: 'novo', label: 'Nova avaliação' },
  ]

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>Quadro fonêmico</div>
          <div className={styles.sub}>Toque na célula para marcar. Célula em branco = não avaliada, e não entra na conta.</div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="fon-sel">Avaliação</label>
            <SelectMenu id="fon-sel" variant="field" value={selectedId} onChange={v => void trocar(v)} options={options} />
          </div>
          <div className={styles.field}>
            <label htmlFor="fon-data">Data da avaliação</label>
            <DatePicker id="fon-data" value={date} max={today} onChange={v => { if (v) { setDate(v); setDirty(true) } }} />
          </div>
        </div>
        <div className={styles.legend} aria-label="Legenda">
          {(['c', 's', 'o', 'd'] as Marca[]).map(m => <span key={m}><b className={MARCA_CLASS[m]}>{MARCA_SIGLA[m]}</b>{MARCA_LABEL[m]}</span>)}
        </div>
      </div>

      {QUADRO_CONSOANTES.map(g => (
        <div key={g.nome} className={`${styles.card} ${styles.fonGroup}`}>
          <div className={styles.fonGroupName}>{g.nome}</div>
          <div className={styles.fonTable}>
            <span />
            {POSICOES.map(p => <span key={p.key} className={styles.fonHead}>{p.label}</span>)}
            {g.consoantes.map(c => (
              <FonRow key={c.ipa} ipa={c.ipa} exemplo={c.exemplo} cells={cells} onTap={pos => { setCells(prev => cycleCell(prev, c.ipa, pos)); setDirty(true) }} />
            ))}
          </div>
        </div>
      ))}

      <div className={styles.card}>
        <div className={styles.title}>Resultado</div>
        <div className={styles.statGrid}>
          <div className={styles.stat}><div className={styles.statVal}>{fmtPcc(resumo.pcc)}</div><div className={styles.statLbl}>Consoantes corretas (PCC)</div></div>
          {POSICOES.map(p => (
            <div key={p.key} className={styles.stat}><div className={styles.statVal}>{fmtPcc(resumoFonemico(cells, p.key).pcc)}</div><div className={styles.statLbl}>{p.label}</div></div>
          ))}
          <div className={styles.stat}><div className={styles.statVal}>{resumo.avaliadas}</div><div className={styles.statLbl}>Posições avaliadas</div></div>
          <div className={styles.stat}><div className={styles.statVal}>{resumo.omitidas} / {resumo.substituidas} / {resumo.distorcidas}</div><div className={styles.statLbl}>Omitidas / subst. / distorc.</div></div>
        </div>
        <div className={styles.last}>PCC = consoantes marcadas como corretas dividido pelas posições avaliadas.</div>
        <div className={styles.field}>
          <label htmlFor="fon-nota">Observações</label>
          <textarea id="fon-nota" className={styles.textarea} value={note} maxLength={1000} onChange={e => { setNote(e.target.value); setDirty(true) }} placeholder="Ex.: material usado, contexto da coleta (nomeação, repetição, fala espontânea)" />
        </div>
        <div className={styles.btnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving || (!dirty && !!current) || resumo.avaliadas === 0} onClick={save}>
            {saving ? 'Salvando...' : current ? 'Salvar alterações' : 'Salvar avaliação'}
          </button>
          {current && <button type="button" className={styles.btn} onClick={remove}>Excluir esta avaliação</button>}
        </div>
      </div>

      {serie.length > 1 && (
        <div className={styles.card}>
          <div className={styles.title}>PCC por avaliação</div>
          <ProgressChart series={serie} label="Percentual de consoantes corretas por avaliação" height={180} />
        </div>
      )}
    </div>
  )
}

function FonRow({ ipa, exemplo, cells, onTap }: { ipa: string; exemplo: string; cells: FonemaCells; onTap: (pos: (typeof POSICOES)[number]['key']) => void }) {
  return (
    <>
      <div className={styles.fonSym}><span className={styles.fonIpa}>/{ipa}/</span><span className={styles.fonEx}>{exemplo}</span></div>
      {POSICOES.map(p => {
        const m = cells[cellKey(ipa, p.key)]
        return (
          <button key={p.key} type="button"
            className={`${styles.fonCell} ${m ? MARCA_CLASS[m] : ''}`}
            aria-label={`/${ipa}/ ${p.label.toLowerCase()}: ${m ? MARCA_LABEL[m].toLowerCase() : 'não avaliado'}`}
            onClick={() => onTap(p.key)}>
            {m ? MARCA_SIGLA[m] : ''}
          </button>
        )
      })}
    </>
  )
}
