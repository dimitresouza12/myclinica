'use client'
import type { DragEvent, MouseEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import { initialsOf } from '@/lib/whatsapp/inbox'
import {
  STAGES, elapsedLabel, followUpLabel, formatMoney, isFollowUpDue, isStale,
  leadPhoneLabel, leadTitle, sourceLabel, type Lead, type Stage,
} from '@/lib/crm/model'
import styles from './Crm.module.css'

interface Props {
  lead: Lead
  ownerName: string | null
  photoUrl: string | null
  unread: number
  now: Date
  canEdit: boolean
  dragging: boolean
  busy: boolean
  onOpen: () => void
  onTalk: () => void
  onSchedule: () => void
  onMove: (stage: Stage) => void
  onDragStart: (e: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

const SOURCE_TAG: Record<string, string> = {
  instagram: styles.tagInfo, anuncio: styles.tagWarn, indicacao: styles.tagGood, google: styles.tagBad,
}

export function LeadCard({ lead, ownerName, photoUrl, unread, now, canEdit, dragging, busy, onOpen, onTalk, onSchedule, onMove, onDragStart, onDragEnd }: Props) {
  const title = leadTitle(lead)
  const phone = leadPhoneLabel(lead)
  const stale = isStale(lead, now)
  const due = isFollowUpDue(lead, now)
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn() }

  return (
    <article
      className={`${styles.card} ${dragging ? styles.cardDragging : ''}`}
      draggable={canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      <div className={styles.cardTop}>
        <Avatar url={photoUrl} name={title} size={36} className={styles.cardAvatar} />
        <div className={styles.cardWho}>
          <button type="button" className={styles.cardName} onClick={stop(onOpen)}>{title}</button>
          {lead.interest
            ? <span className={styles.cardSub}>{lead.interest}</span>
            : phone && title !== phone ? <span className={styles.cardSub}>{phone}</span> : null}
        </div>
        {unread > 0 && <span className={styles.unread} title={`${unread} ${unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`}>{unread}</span>}
      </div>

      <div className={styles.tags}>
        <span className={`${styles.tag} ${SOURCE_TAG[lead.source] ?? ''}`}>{sourceLabel(lead.source)}</span>
        {lead.patient_id && <span className={`${styles.tag} ${styles.tagGood}`}>Paciente</span>}
        {lead.stage === 'perdido' && lead.lost_reason && <span className={styles.tag}>{lead.lost_reason}</span>}
        {lead.next_contact_at && lead.stage !== 'perdido' && lead.stage !== 'compareceu' && (
          <span className={`${styles.tag} ${due ? styles.tagWarn : ''}`}>
            <Icon name="calendar" size={11} />{followUpLabel(lead.next_contact_at, now)}
          </span>
        )}
        {lead.estimated_value != null && lead.estimated_value > 0 && <span className={styles.tag}>{formatMoney(lead.estimated_value)}</span>}
      </div>

      <div className={styles.cardFoot}>
        {ownerName
          ? <><span className={styles.owner} title={`Responsável: ${ownerName}`}>{initialsOf(ownerName)}</span><span className={styles.ownerName}>{ownerName.split(' ')[0]}</span></>
          : null}
        <span className={`${styles.age} ${stale ? styles.ageStale : ''}`}>
          <Icon name="clock" size={12} />{elapsedLabel(lead.stage_changed_at, now)}
        </span>
      </div>

      {lead.stage_source === 'auto' && lead.stage_note && (
        <p className={styles.autoNote} title="O funil atualizou este cartão sozinho"><Icon name="info" size={11} />{lead.stage_note}</p>
      )}

      <div className={styles.cardActs}>
        <button type="button" className={styles.btnSm} onClick={stop(onTalk)} disabled={busy || !canEdit} title={canEdit ? undefined : 'Você não tem permissão para conversar'}>
          <Icon name="chat" size={14} />Conversar
        </button>
        <button type="button" className={styles.btnSm} onClick={stop(onSchedule)} disabled={busy || !canEdit} title={canEdit ? undefined : 'Você não tem permissão para agendar'}>
          <Icon name="calendar" size={14} />Agendar
        </button>
      </div>

      {/* arrastar não funciona no toque: no celular a etapa muda por aqui */}
      {canEdit && (
        <label className={styles.moveRow} onClick={e => e.stopPropagation()}>
          <span>Mover para</span>
          <select
            className={styles.moveSelect}
            value={lead.stage}
            onChange={e => onMove(e.target.value as Stage)}
            aria-label={`Mover ${title} para outra etapa`}
          >
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      )}
    </article>
  )
}
