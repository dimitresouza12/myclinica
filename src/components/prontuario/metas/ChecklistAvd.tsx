'use client'
import { useMemo, useState } from 'react'
import { DatePicker } from '@/components/ui/DatePicker'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'
import { NIVEIS_AVD, novoChecklistPadrao, resumoAvd, sanitizeChecklist, type ChecklistAvdData, type NivelAvd } from '@/lib/metas/avd'
import { brDate } from '@/lib/metas/relatorio'
import type { SeriesPoint } from '@/lib/metas/progress'
import type { Assessment } from '@/lib/metas/types'
import { ProgressChart } from './ProgressChart'
import styles from './metas.module.css'

interface Props {
  today: string
  assessments: Assessment[]
  onSave: (args: { id?: string; date: string; data: ChecklistAvdData }) => Promise<Assessment | null>
  onDelete: (id: string) => Promise<boolean>
  onDirtyChange: (dirty: boolean) => void
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2))

export function ChecklistAvd({ today, assessments, onSave, onDelete, onDirtyChange }: Props) {
  const list = useMemo(() => assessments.filter(a => a.kind === 'checklist_avd').sort((a, b) => a.assessed_on.localeCompare(b.assessed_on)), [assessments])
  const [selectedId, setSelectedId] = useState<string | 'novo'>(() => list[list.length - 1]?.id ?? 'novo')
  const current = list.find(a => a.id === selectedId)
  const [data, setData] = useState<ChecklistAvdData>(() => current ? sanitizeChecklist(current.data) : novoChecklistPadrao(newId))
  const [date, setDate] = useState(current?.assessed_on ?? today)
  const [dirty, setDirtyState] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  function setDirty(v: boolean) { setDirtyState(v); onDirtyChange(v) }
  function change(next: ChecklistAvdData) { setData(next); setDirty(true) }

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
    setSelectedId(id)
    if (a) { setData(sanitizeChecklist(a.data)); setDate(a.assessed_on) }
    else {
      // nova avaliação parte da lista de itens da última (sem os níveis), para reavaliar o mesmo conjunto
      const last = list[list.length - 1]
      const base = last ? sanitizeChecklist(last.data) : novoChecklistPadrao(newId)
      setData({ items: base.items.map(i => ({ id: i.id, label: i.label })) })
      setDate(today)
    }
    setDirty(false)
  }

  const resumo = resumoAvd(data)
  const serie: SeriesPoint[] = useMemo(() => {
    const pts: SeriesPoint[] = []
    for (const a of list) {
      const r = resumoAvd(sanitizeChecklist(a.data))
      if (r.indice !== null) pts.push({ date: a.assessed_on, score: r.indice })
    }
    return pts
  }, [list])

  const setNivel = (id: string, nivel: NivelAvd) =>
    change({ ...data, items: data.items.map(i => i.id === id ? (i.nivel === nivel ? { id: i.id, label: i.label } : { ...i, nivel }) : i) })

  async function save() {
    setSaving(true)
    const clean: ChecklistAvdData = { ...data, items: data.items.filter(i => i.label.trim()).map(i => ({ ...i, label: i.label.trim() })) }
    const saved = await onSave({ id: current?.id, date, data: clean })
    setSaving(false)
    if (saved) { setSelectedId(saved.id); setData(clean); setDirty(false) }
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
          <div className={styles.title}>Checklist de independência (AVD)</div>
          <div className={styles.sub}>Modelo simples e editável, não é uma escala padronizada. Toque no nível de cada atividade.</div>
        </div>
        <button type="button" className={styles.btn} onClick={() => setEditing(v => !v)} aria-pressed={editing}>{editing ? 'Concluir edição dos itens' : 'Editar itens'}</button>
      </div>

      <div className={styles.card}>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label htmlFor="avd-sel">Avaliação</label>
            <SelectMenu id="avd-sel" variant="field" value={selectedId} onChange={v => void trocar(v)} options={options} />
          </div>
          <div className={styles.field}>
            <label htmlFor="avd-data">Data da avaliação</label>
            <DatePicker id="avd-data" value={date} max={today} onChange={v => { if (v) { setDate(v); setDirty(true) } }} />
          </div>
        </div>
        <div className={styles.legendLv}>
          {NIVEIS_AVD.map(n => `${n.short}: ${n.label} (${n.score}%)`).join(' · ')}
        </div>
      </div>

      <div className={styles.card}>
        {data.items.length === 0 && <div className={styles.empty}>Nenhum item. Toque em &quot;Editar itens&quot; para adicionar.</div>}
        {data.items.map(item => (
          <div key={item.id} className={styles.avdItem}>
            <div className={styles.avdHead}>
              {editing ? (
                <input className={styles.input} value={item.label} maxLength={120} aria-label="Nome da atividade"
                  onChange={e => change({ ...data, items: data.items.map(i => i.id === item.id ? { ...i, label: e.target.value } : i) })} />
              ) : (
                <span className={styles.avdLabel}>{item.label}</span>
              )}
              {editing && (
                <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnIcon}`} aria-label={`Remover ${item.label}`}
                  onClick={() => change({ ...data, items: data.items.filter(i => i.id !== item.id) })}>
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
            {!editing && (
              <div className={styles.levels} role="group" aria-label={`Nível em ${item.label}`}>
                {NIVEIS_AVD.map(n => (
                  <button key={n.key} type="button" className={styles.lvBtn} aria-pressed={item.nivel === n.key} onClick={() => setNivel(item.id, n.key)} title={n.label}>
                    {n.short}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {editing && (
          <button type="button" className={styles.btn} onClick={() => change({ ...data, items: [...data.items, { id: newId(), label: '' }] })}>
            <Icon name="plus" size={16} /> Adicionar atividade
          </button>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.statGrid}>
          <div className={styles.stat}><div className={styles.statVal}>{resumo.indice === null ? '-' : `${resumo.indice}%`}</div><div className={styles.statLbl}>Índice de independência</div></div>
          <div className={styles.stat}><div className={styles.statVal}>{resumo.avaliados} / {resumo.total}</div><div className={styles.statLbl}>Itens avaliados</div></div>
          <div className={styles.stat}><div className={styles.statVal}>{resumo.independentes}</div><div className={styles.statLbl}>Independentes</div></div>
        </div>
        <div className={styles.last}>O índice é a média simples dos níveis marcados; itens sem nível ficam fora da conta.</div>
        <div className={styles.field}>
          <label htmlFor="avd-nota">Observações</label>
          <textarea id="avd-nota" className={styles.textarea} value={data.note ?? ''} maxLength={1000} onChange={e => change({ ...data, note: e.target.value })} placeholder="Ex.: ambiente, adaptações usadas, quem respondeu" />
        </div>
        <div className={styles.btnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving || (!dirty && !!current) || resumo.avaliados === 0} onClick={save}>
            {saving ? 'Salvando...' : current ? 'Salvar alterações' : 'Salvar avaliação'}
          </button>
          {current && <button type="button" className={styles.btn} onClick={remove}>Excluir esta avaliação</button>}
        </div>
      </div>

      {serie.length > 1 && (
        <div className={styles.card}>
          <div className={styles.title}>Índice por avaliação</div>
          <ProgressChart series={serie} label="Índice de independência por avaliação" height={180} />
        </div>
      )}
    </div>
  )
}
