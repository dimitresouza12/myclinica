import { Card } from '@/components/ui/Card'
import { StatusDot } from '@/components/ui/StatusDot'
import type { DaySummary } from '@/lib/agenda/view'
import styles from './agendaSidebar.module.css'

export interface SidebarProfessional { id: string; name: string; initials: string; color: string; count: number }

interface Props {
  professionals: SidebarProfessional[]
  /** consultas sem profissional no período; a linha só aparece se houver */
  unassignedCount: number
  hiddenIds: Set<string>
  onToggle: (id: string) => void
  /** abre a agenda só desse profissional */
  onFocus: (id: string) => void
  /** profissional cuja agenda exclusiva está aberta */
  focusedId: string | null
  /** o que o contador de cada profissional conta ("na semana", "no dia", "no mês") */
  today: DaySummary
}

/** Profissionais com caixa de seleção (mostra ou esconde na grade), o nome que abre a agenda só dele e o resumo de hoje. */
export function AgendaSidebar({ professionals, unassignedCount, hiddenIds, onToggle, onFocus, focusedId, today }: Props) {
  const rows: { id: string; name: string; initials: string; color: string; count: number }[] = [...professionals]
  if (unassignedCount > 0 || hiddenIds.has('')) rows.push({ id: '', name: 'Sem profissional', initials: '–', color: 'var(--text-tertiary)', count: unassignedCount })
  const lines: { tone: 'ok' | 'wait' | 'idle' | 'warn'; text: string }[] = []
  if (today.confirmado) lines.push({ tone: 'ok', text: `${today.confirmado} ${today.confirmado === 1 ? 'confirmada' : 'confirmadas'}` })
  if (today.agendado) lines.push({ tone: 'wait', text: `${today.agendado} aguardando confirmação` })
  if (today.concluido) lines.push({ tone: 'idle', text: `${today.concluido} ${today.concluido === 1 ? 'concluída' : 'concluídas'}` })
  if (today.faltou) lines.push({ tone: 'warn', text: `${today.faltou} ${today.faltou === 1 ? 'falta' : 'faltas'}` })

  return (
    <>
      {professionals.length > 1 && (
        <Card title="Profissionais" actions={<span className={styles.meta}>{professionals.length}</span>}>
          <ul className={styles.profs}>
            {rows.map(p => {
              const on = !hiddenIds.has(p.id)
              return (
                <li key={p.id || 'none'}>
                  <label className={styles.prof}>
                    <input type="checkbox" className={styles.check} checked={on} onChange={() => onToggle(p.id)} />
                    <span className={styles.box} aria-hidden="true" />
                    <span className={styles.avatar} style={{ background: p.color }}>{p.initials}</span>
                    <span className={styles.who}>
                      {p.id ? (
                        <button
                          type="button"
                          className={`${styles.nameBtn}${focusedId === p.id ? ` ${styles.nameBtnOn}` : ''}`}
                          title={`Ver só a agenda de ${p.name}`}
                          onClick={e => { e.preventDefault(); onFocus(p.id) }}
                        >{p.name}</button>
                      ) : (
                        <span className={styles.name}>{p.name}</span>
                      )}
                      <span className={styles.count}>{p.count} {p.count === 1 ? 'consulta' : 'consultas'}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
      <Card title="Hoje">
        <div className={styles.todayBig}>
          <span className={styles.num}>{today.total}</span>
          <small>{today.total === 1 ? 'consulta' : 'consultas'}</small>
        </div>
        {lines.length > 0 ? (
          <ul className={styles.lines}>
            {lines.map(l => <li key={l.text}><StatusDot tone={l.tone}>{l.text}</StatusDot></li>)}
          </ul>
        ) : (
          <p className={styles.none}>Nenhuma consulta marcada para hoje.</p>
        )}
      </Card>
    </>
  )
}
