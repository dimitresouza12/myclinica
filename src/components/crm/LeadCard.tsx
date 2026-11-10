'use client'
import type { DragEvent, MouseEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { initialsOf } from '@/lib/whatsapp/inbox'
import {
  STAGES, elapsedLabel, followUpLabel, formatMoney, isFollowUpDue, isStale,
  leadPhoneLabel, leadTitle, sourceLabel, type Lead, type Stage,
} from '@/lib/crm/model'
import styles from './Crm.module.css'
import { SelectMenu } from '@/components/ui/SelectMenu'

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

const SOURCE_TONE: Record<string, BadgeTone> = {
  instagram: 'info', anuncio: 'warning', indicacao: 'success',
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
      tabIndex={-1}
      // foca o cartão ao abrir: é para onde o foco volta quando o painel fecha
      onClick={e => { e.currentTarget.focus({ preventScroll: true }); onOpen() }}
    >
      <div className={styles.cardTop}>
        <Avatar url={photoUrl} name={title} size={36} className={styles.cardAvatar} />
        <div className={styles.cardWho}>
          <button type="button" className={styles.cardName} onClick={stop(onOpen)}>
            <span className={styles.cardTitle}>{title}</span>
            {lead.interest
              ? <span className={styles.cardSub}>{lead.interest}</span>
              : phone && title !== phone ? <span className={styles.cardSub}>{phone}</span> : null}
          </button>
        </div>
        {unread > 0 && <span className={styles.unread} title={`${unread} ${unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`}>{unread}</span>}
      </div>

      <div className={styles.tags}>
        <Badge tone={SOURCE_TONE[lead.source] ?? 'neutral'} dot={lead.source in SOURCE_TONE}>{sourceLabel(lead.source)}</Badge>
        {lead.patient_id && <Badge tone="success">Paciente</Badge>}
        {lead.stage === 'perdido' && lead.lost_reason && <Badge dot={false}>{lead.lost_reason}</Badge>}
        {lead.next_contact_at && lead.stage !== 'perdido' && lead.stage !== 'compareceu' && (
          <Badge tone={due ? 'warning' : 'neutral'} dot={false}>
            <Icon name="calendar" size={11} />{followUpLabel(lead.next_contact_at, now)}
          </Badge>
        )}
        {lead.estimated_value != null && lead.estimated_value > 0 && <Badge dot={false}>{formatMoney(lead.estimated_value)}</Badge>}
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
        <Button icon="chat" onClick={stop(onTalk)} disabled={busy || !canEdit} title={canEdit ? undefined : 'Você não tem permissão para conversar'}>Conversar</Button>
        <Button icon="calendar" onClick={stop(onSchedule)} disabled={busy || !canEdit} title={canEdit ? undefined : 'Você não tem permissão para agendar'}>Agendar</Button>
      </div>

      {/* arrastar não funciona no toque: no celular a etapa muda por aqui */}
      {canEdit && (
        <label className={styles.moveRow} onClick={e => e.stopPropagation()}>
          <span>Mover para</span>
          <SelectMenu
            className={styles.moveMenu}
            value={lead.stage}
            onChange={v => onMove(v as Stage)}
            ariaLabel={`Mover ${title} para outra etapa`}
            options={STAGES.map(s => ({ value: s.key, label: s.label }))}
          />
        </label>
      )}
    </article>
  )
}
