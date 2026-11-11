'use client'
import { useState } from 'react'
import { DatePicker } from '@/components/ui/DatePicker'
import { AREA_PROFILE, RESULT_ORDER } from '@/lib/metas/constants'
import { goalProgress, logsOfGoal } from '@/lib/metas/progress'
import { brDate } from '@/lib/metas/relatorio'
import type { Goal, GoalLog, GoalResult, MetasArea } from '@/lib/metas/types'
import styles from './metas.module.css'

interface Props {
  area: MetasArea
  goals: Goal[]
  logs: GoalLog[]
  today: string
  onSetResult: (goalId: string, date: string, result: GoalResult) => Promise<void>
  onSaveNote: (logId: string, note: string) => Promise<void>
  onUndo: (logId: string) => Promise<void>
  onGoToMetas: () => void
}

const RES_CLASS: Record<GoalResult, string> = { adquirido: styles.resOk, com_pista: styles.resWait, nao_adquirido: styles.resBad }

function NoteField({ log, onSave }: { log: GoalLog; onSave: (logId: string, note: string) => Promise<void> }) {
  const [text, setText] = useState(log.note ?? '')
  return (
    <div className={styles.noteBox}>
      <label className={styles.label} htmlFor={`nota-${log.id}`}>Nota curta (opcional)</label>
      <textarea
        id={`nota-${log.id}`} className={styles.textarea} style={{ minHeight: 44 }} rows={2} maxLength={280}
        value={text} onChange={e => setText(e.target.value)}
        onBlur={() => { if (text.trim() !== (log.note ?? '').trim()) void onSave(log.id, text.trim()) }}
        placeholder="Ex.: precisou de modelo na 2ª tentativa"
      />
    </div>
  )
}

export function RegistroSessao({ area, goals, logs, today, onSetResult, onSaveNote, onUndo, onGoToMetas }: Props) {
  const profile = AREA_PROFILE[area]
  const [date, setDate] = useState(today)
  // gravação por meta: tocar em metas diferentes em sequência grava em paralelo, sem descartar nenhum toque
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const active = goals.filter(g => g.status === 'em_andamento')

  async function pick(goalId: string, result: GoalResult) {
    if (busy.has(goalId)) return
    setBusy(prev => new Set(prev).add(goalId))
    try {
      await onSetResult(goalId, date, result)
    } finally {
      setBusy(prev => { const next = new Set(prev); next.delete(goalId); return next })
    }
  }

  if (active.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.empty}>
          Não há metas em andamento. Cadastre as metas do plano para registrar as sessões.
          <div style={{ marginTop: 12 }}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onGoToMetas}>Ir para as metas</button>
          </div>
        </div>
      </div>
    )
  }

  const doneToday = active.filter(g => logs.some(l => l.goal_id === g.id && l.log_date === date)).length

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>Registrar sessão</div>
          <div className={styles.sub}>{doneToday} de {active.length} metas registradas neste dia. Cada toque já salva.</div>
        </div>
        <div className={styles.dateRow}>
          <label className={styles.label} htmlFor="metas-data">Data</label>
          <DatePicker id="metas-data" value={date} onChange={v => v && setDate(v)} max={today} />
        </div>
      </div>

      <div className={styles.list}>
        {active.map(g => {
          const own = logsOfGoal(logs, g.id)
          const current = own.filter(l => l.log_date === date).slice(-1)[0]
          const before = own.filter(l => l.log_date < date).slice(-1)[0]
          const prog = goalProgress(own)
          return (
            <div key={g.id} className={styles.card}>
              <div>
                <div className={styles.cardTitle}>{g.title}</div>
                <div className={styles.meta}>{[g.domain, g.criterion].filter(Boolean).join(' · ')}</div>
              </div>
              <div className={styles.results} role="group" aria-label={`Resultado de ${g.title}`}>
                {RESULT_ORDER.map(r => (
                  <button
                    key={r} type="button" disabled={busy.has(g.id)}
                    aria-pressed={current?.result === r}
                    className={`${styles.resBtn} ${RES_CLASS[r]}`}
                    onClick={() => pick(g.id, r)}
                  >
                    {profile.resultLabel[r]}
                  </button>
                ))}
              </div>
              {current && profile.allowSessionNote && <NoteField key={current.id} log={current} onSave={onSaveNote} />}
              <div className={styles.row}>
                <span className={styles.last}>
                  {before ? `Sessão anterior (${brDate(before.log_date)}): ${profile.resultLabel[before.result]}.` : 'Primeiro registro desta meta.'}
                  {prog.percent !== null ? ` Progresso: ${prog.percent}%.` : ''}
                </span>
                <span className={styles.spacer} />
                {current && (
                  <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => onUndo(current.id)}>Desfazer</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
