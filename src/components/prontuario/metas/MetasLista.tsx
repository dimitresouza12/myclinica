'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { DatePicker } from '@/components/ui/DatePicker'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { AREA_PROFILE, STATUS_LABEL, STATUS_ORDER } from '@/lib/metas/constants'
import { goalProgress, logsOfGoal } from '@/lib/metas/progress'
import type { Goal, GoalLog, GoalStatus, MetasArea } from '@/lib/metas/types'
import type { GoalInput } from '@/lib/metas/data'
import { brDate } from '@/lib/metas/relatorio'
import styles from './metas.module.css'

interface Props {
  area: MetasArea
  goals: Goal[]
  logs: GoalLog[]
  onCreate: (input: GoalInput) => Promise<boolean>
  onUpdate: (id: string, patch: Partial<GoalInput> & { status?: GoalStatus }) => Promise<boolean>
}

const statusChip = (s: GoalStatus) => (s === 'atingida' ? styles.chipOk : s === 'em_andamento' ? '' : s === 'suspensa' ? styles.chipWait : styles.chipBad)

function GoalForm({ area, initial, showStatus, onSave, onCancel }: {
  area: MetasArea
  initial?: Goal
  showStatus: boolean
  onSave: (input: GoalInput, status?: GoalStatus) => Promise<boolean>
  onCancel: () => void
}) {
  const p = AREA_PROFILE[area]
  const [title, setTitle] = useState(initial?.title ?? '')
  const [domain, setDomain] = useState(initial?.domain ?? '')
  const [criterion, setCriterion] = useState(initial?.criterion ?? '')
  const [target, setTarget] = useState(initial?.target_date ?? '')
  const [status, setStatus] = useState<GoalStatus>(initial?.status ?? 'em_andamento')
  const [saving, setSaving] = useState(false)
  const listId = `dom-${area}`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    const ok = await onSave({ title: title.trim(), domain: domain.trim() || null, criterion: criterion.trim() || null, target_date: target || null }, showStatus ? status : undefined)
    setSaving(false)
    if (ok) onCancel()
  }

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor={`${listId}-t`}>Título da meta</label>
        <input id={`${listId}-t`} className={styles.input} value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder={p.titlePlaceholder} required />
      </div>
      <div className={styles.grid2}>
        <div className={styles.field}>
          <label htmlFor={`${listId}-d`}>Área / domínio</label>
          <input id={`${listId}-d`} className={styles.input} value={domain} list={listId} maxLength={80} onChange={e => setDomain(e.target.value)} placeholder="Escolha ou digite" />
          <datalist id={listId}>{p.domains.map(d => <option key={d} value={d} />)}</datalist>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${listId}-p`}>Prazo</label>
          <DatePicker id={`${listId}-p`} value={target} onChange={setTarget} placeholder="Sem prazo" />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${listId}-c`}>Critério de êxito</label>
        <textarea id={`${listId}-c`} className={styles.textarea} value={criterion} maxLength={400} onChange={e => setCriterion(e.target.value)} placeholder={p.criterionPlaceholder} />
      </div>
      {showStatus && (
        <div className={styles.field}>
          <label htmlFor={`${listId}-s`}>Situação</label>
          <SelectMenu id={`${listId}-s`} variant="field" value={status} onChange={v => setStatus(v as GoalStatus)} options={STATUS_ORDER.map(s => ({ value: s, label: STATUS_LABEL[s] }))} />
        </div>
      )}
      <div className={styles.btnRow}>
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!title.trim() || saving}>{saving ? 'Salvando...' : 'Salvar meta'}</button>
        <button type="button" className={styles.btn} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

export function MetasLista({ area, goals, logs, onCreate, onUpdate }: Props) {
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const open = goals.filter(g => g.status === 'em_andamento' || g.status === 'suspensa')
  const done = goals.filter(g => g.status === 'atingida' || g.status === 'cancelada')

  function renderGoal(g: Goal) {
    if (editingId === g.id) {
      return (
        <GoalForm key={g.id} area={area} initial={g} showStatus onCancel={() => setEditingId(null)}
          onSave={(input, status) => onUpdate(g.id, { ...input, ...(status ? { status } : {}) })} />
      )
    }
    const prog = goalProgress(logsOfGoal(logs, g.id))
    return (
      <div key={g.id} className={styles.card}>
        <div className={styles.row}>
          <span className={styles.cardTitle} style={{ flex: 1, minWidth: 0 }}>{g.title}</span>
          <span className={`${styles.chip} ${statusChip(g.status)}`}>{STATUS_LABEL[g.status]}</span>
          <button type="button" className={`${styles.btn} ${styles.btnGhost} ${styles.btnIcon}`} aria-label={`Editar a meta ${g.title}`} onClick={() => { setCreating(false); setEditingId(g.id) }}>
            <Icon name="edit" size={16} />
          </button>
        </div>
        <div className={styles.meta}>
          {[g.domain, g.target_date ? `Prazo ${brDate(g.target_date)}` : null].filter(Boolean).join(' · ') || 'Sem área definida'}
        </div>
        {g.criterion && <div className={styles.meta}>Critério: {g.criterion}</div>}
        <div className={styles.row}>
          <div className={styles.bar} style={{ flex: 1 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.percent ?? 0} aria-label="Progresso da meta">
            <div className={styles.barFill} style={{ width: `${prog.percent ?? 0}%` }} />
          </div>
          <span className={styles.pct}>{prog.percent === null ? 'Sem registros' : `${prog.percent}%`}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>{AREA_PROFILE[area].planTitle}</div>
          <div className={styles.sub}>Defina as metas uma vez; a cada sessão basta tocar no resultado.</div>
        </div>
        {!creating && (
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { setEditingId(null); setCreating(true) }}>
            <Icon name="plus" size={16} /> Nova meta
          </button>
        )}
      </div>

      {creating && <GoalForm area={area} showStatus={false} onCancel={() => setCreating(false)} onSave={input => onCreate(input)} />}

      {goals.length === 0 && !creating && (
        <div className={styles.empty}>Nenhuma meta cadastrada ainda. Toque em &quot;Nova meta&quot; para começar o plano.</div>
      )}

      <div className={styles.list}>{open.map(renderGoal)}</div>

      {done.length > 0 && (
        <>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setShowClosed(v => !v)} aria-expanded={showClosed}>
            {showClosed ? 'Ocultar' : 'Mostrar'} metas atingidas e encerradas ({done.length})
          </button>
          {showClosed && <div className={styles.list}>{done.map(renderGoal)}</div>}
        </>
      )}
    </div>
  )
}
