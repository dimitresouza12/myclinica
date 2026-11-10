'use client'
import { useState } from 'react'
import { LeadCard } from './LeadCard'
import { Icon } from '@/components/ui/Icon'
import { Skeleton } from '@/components/ui/Skeleton'
import { STAGES, formatMoney, groupByStage, stageTotals, type Lead, type Stage } from '@/lib/crm/model'
import styles from './Crm.module.css'

interface Props {
  leads: Lead[]
  ownerNames: Map<string, string>
  unreadByKey: Map<string, number>
  photoByKey: Map<string, string>
  now: Date
  canEdit: boolean
  busyId: string | null
  onOpen: (lead: Lead) => void
  onTalk: (lead: Lead) => void
  onSchedule: (lead: Lead) => void
  onMove: (lead: Lead, stage: Stage) => void
  onAdd: (stage: Stage) => void
}

const COL_CLASS: Record<Stage, string> = {
  novo: styles.stNovo, em_conversa: styles.stConversa, agendado: styles.stAgendado, compareceu: styles.stCompareceu, perdido: styles.stPerdido,
}

export function CrmBoard({ leads, ownerNames, unreadByKey, photoByKey, now, canEdit, busyId, onOpen, onTalk, onSchedule, onMove, onAdd }: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<Stage | null>(null)
  const groups = groupByStage(leads)

  function drop(stage: Stage) {
    const lead = leads.find(l => l.id === dragId)
    setDragId(null); setOverStage(null)
    if (lead && lead.stage !== stage) onMove(lead, stage)
  }

  return (
    <div className={styles.board} role="list" aria-label="Funil de leads">
      {STAGES.map(st => {
        const items = groups[st.key]
        const total = stageTotals(items)
        return (
          <section
            key={st.key}
            role="listitem"
            aria-label={`${st.label}: ${items.length} ${items.length === 1 ? 'lead' : 'leads'}`}
            className={`${styles.col} ${COL_CLASS[st.key]} ${overStage === st.key && dragId ? styles.colOver : ''}`}
            onDragOver={e => { if (!canEdit || !dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overStage !== st.key) setOverStage(st.key) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverStage(s => (s === st.key ? null : s)) }}
            onDrop={e => { e.preventDefault(); drop(st.key) }}
          >
            <header className={styles.colHead}>
              <h3 className={styles.colTitle}><span className={styles.dot} aria-hidden="true" />{st.label}</h3>
              <div className={styles.colHeadRight}>
                <span className={styles.colCount}>{items.length}</span>
                {canEdit && (
                  <button type="button" className={styles.colAdd} onClick={() => onAdd(st.key)} aria-label={`Adicionar lead em ${st.label}`} title="Adicionar lead">
                    <Icon name="plus" size={16} />
                  </button>
                )}
              </div>
              <p className={styles.colValue}>{total.value > 0 ? `${formatMoney(total.value)} em potencial` : st.hint}</p>
            </header>

            <div className={styles.cards}>
              {dragId && overStage === st.key && <p className={styles.colDrop}>Solte aqui</p>}
              {items.length === 0 && !(dragId && overStage === st.key) && <p className={styles.colEmpty}>Nenhum lead nesta etapa</p>}
              {items.map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  ownerName={lead.assigned_to ? ownerNames.get(lead.assigned_to) ?? null : null}
                  photoUrl={lead.phone_key ? photoByKey.get(lead.phone_key) ?? null : null}
                  unread={lead.phone_key ? unreadByKey.get(lead.phone_key) ?? 0 : 0}
                  now={now}
                  canEdit={canEdit}
                  dragging={dragId === lead.id}
                  busy={busyId === lead.id}
                  onOpen={() => onOpen(lead)}
                  onTalk={() => onTalk(lead)}
                  onSchedule={() => onSchedule(lead)}
                  onMove={stage => onMove(lead, stage)}
                  onDragStart={e => { setDragId(lead.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', lead.id) }}
                  onDragEnd={() => { setDragId(null); setOverStage(null) }}
                />
              ))}
            </div>

          </section>
        )
      })}
    </div>
  )
}

/** Quadro em carregamento: as cinco colunas com cartões fantasmas. O contêiner traz aria-busy. */
export function CrmBoardSkeleton() {
  return (
    <div className={styles.board} aria-busy="true" aria-label="Carregando leads">
      {STAGES.map((st, i) => (
        <div key={st.key} className={`${styles.col} ${COL_CLASS[st.key]}`}>
          <div className={styles.colHead}>
            <h3 className={styles.colTitle}><span className={styles.dot} aria-hidden="true" />{st.label}</h3>
          </div>
          <div className={styles.cards}>
            {Array.from({ length: i % 2 === 0 ? 2 : 1 }, (_, k) => (
              <div key={k} className={styles.skelCard}>
                <div className={styles.skelRow}>
                  <Skeleton width={36} height={36} radius="50%" />
                  <div className={styles.skelCol}><Skeleton height={14} width="70%" /><Skeleton height={12} width="45%" /></div>
                </div>
                <Skeleton height={24} width="40%" radius={999} />
                <Skeleton height={40} radius={999} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
