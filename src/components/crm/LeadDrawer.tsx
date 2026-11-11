'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Portal } from '@/components/ui/Portal'
import { Avatar } from '@/components/ui/Avatar'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { PHONE_HINT, toInputValue } from '@/lib/phoneFormat'
import { useScrollLock } from '@/hooks/useScrollLock'
import { usePermissions } from '@/hooks/usePermissions'
import { patientOpenLabel } from '@/lib/pacientes/cadastro'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import type { CrmMember } from '@/hooks/useCrmLeads'
import {
  LOST_REASONS, SOURCES, STAGES, dateInputToIso, isoToDateInput, leadPhoneLabel, leadTitle, stageLabel,
  validateLeadForm, type Lead, type LeadFormInput, type Source, type Stage,
} from '@/lib/crm/model'
import f from '@/components/ui/modalForm.module.css'
import styles from './Crm.module.css'
import { MoneyInput, DateInput } from '@/components/ui/NumericInput'
import { dateBRToISO, dateInputError, isoToDateBR, DATE_PLACEHOLDER } from '@/lib/numericFormat'

export interface LeadSaveValues {
  fields: Extract<ReturnType<typeof validateLeadForm>, { ok: true }>['value']
  stage: Stage
  lostReason: string | null
  nextContactAt: string | null
}

interface Props {
  /** null = lead novo */
  lead: Lead | null
  initialStage: Stage
  members: CrmMember[]
  photoUrl: string | null
  /** já existe conversa de WhatsApp com este telefone: o número não pode mudar (quebraria o vínculo) */
  hasConversation: boolean
  canEdit: boolean
  canCreatePatient: boolean
  saving: boolean
  error: string
  onSave: (values: LeadSaveValues) => void
  onClose: () => void
  onTalk: () => void
  onSchedule: () => void
  onConvert: () => void
  onOpenPatient: () => void
  onDelete: () => void
}

const SOURCE_OPTIONS = SOURCES.map(s => ({ value: s.key, label: s.label }))
const STAGE_OPTIONS = STAGES.map(s => ({ value: s.key, label: s.label }))
const LOST_OPTIONS = [{ value: '', label: 'Sem motivo informado' }, ...LOST_REASONS.map(r => ({ value: r, label: r }))]

export function LeadDrawer({
  lead, initialStage, members, photoUrl, hasConversation, canEdit, canCreatePatient, saving, error,
  onSave, onClose, onTalk, onSchedule, onConvert, onOpenPatient, onDelete,
}: Props) {
  const creating = !lead
  const openLabel = patientOpenLabel(usePermissions('prontuario').canView)
  const [form, setForm] = useState<LeadFormInput>(() => ({
    name: lead?.name ?? '',
    phone: toInputValue(lead?.phone),
    source: (lead?.source ?? 'outro') as Source,
    interest: lead?.interest ?? '',
    value: lead?.estimated_value != null ? String(lead.estimated_value) : '',
    notes: lead?.notes ?? '',
    assignedTo: lead?.assigned_to ?? '',
  }))
  const [stage, setStage] = useState<Stage>(lead?.stage ?? initialStage)
  const [lostReason, setLostReason] = useState(lead?.lost_reason ?? '')
  // a data é digitada como dd/mm/aaaa (só números); internamente continua aaaa-mm-dd
  const [followUp, setFollowUp] = useState(isoToDateBR(isoToDateInput(lead?.next_contact_at)))
  const [followUpErr, setFollowUpErr] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof LeadFormInput, string>>>({})
  const firstRef = useRef<HTMLInputElement>(null)

  const [panelEl, setPanelEl] = useState<HTMLFormElement | null>(null)
  useScrollLock(true)
  useDialogFocus(panelEl, firstRef)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // uma confirmação aberta por cima é quem responde ao Esc
      if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof LeadFormInput>(k: K, v: LeadFormInput[K]) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => ({ ...e, [k]: undefined }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    // com conversa, o telefone vem do WhatsApp e fica como está
    const locked = hasConversation && !!lead
    const r = validateLeadForm(form, { phoneLocked: locked })
    if (!r.ok) { setErrors(r.errors); return }
    const dateErr = dateInputError(followUp, { allowFuture: true })
    if (dateErr) { setFollowUpErr(dateErr); return }
    // mantém a chave original quando o telefone não pode mudar (ex.: contato com número oculto)
    const fields = locked && lead ? { ...r.value, phone: lead.phone, phone_key: lead.phone_key } : r.value
    onSave({ fields, stage, lostReason: stage === 'perdido' ? lostReason || null : null, nextContactAt: dateInputToIso(dateBRToISO(followUp, { allowFuture: true }) ?? '') })
  }

  const title = creating ? 'Novo lead' : leadTitle(lead)
  const readOnly = !canEdit

  return (
    <Portal>
      <div className={styles.drawerOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <form ref={setPanelEl} tabIndex={-1} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="lead-title" onSubmit={submit} noValidate>
          <header className={styles.drawerHead}>
            {!creating && <Avatar url={photoUrl} name={title} size={52} className={styles.drawerAvatar} />}
            <div className={styles.drawerWho}>
              <h2 id="lead-title" className={styles.drawerTitle}>{title}</h2>
              {!creating && (
                <>
                  <div className={styles.tags}>
                    <Badge tone={STAGE_TONE[lead.stage]}>{stageLabel(lead.stage)}</Badge>
                    {lead.patient_id && <Badge tone="success">Paciente cadastrado</Badge>}
                  </div>
                  {lead.stage_source === 'auto' && lead.stage_note && (
                    <p className={styles.autoNote}><Icon name="info" size={12} />Atualizado automaticamente: {lead.stage_note}</p>
                  )}
                </>
              )}
            </div>
            <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Fechar"><Icon name="close" size={18} /></button>
          </header>

          <div className={styles.drawerBody}>
            {!creating && (
              <div className={styles.quick}>
                <Button icon="chat" onClick={onTalk} disabled={!canEdit}>Conversar</Button>
                <Button icon="calendar" onClick={onSchedule} disabled={!canEdit || (!lead.patient_id && !canCreatePatient)}>Agendar</Button>
                {lead.patient_id
                  ? <Button icon="patients" onClick={onOpenPatient}>{openLabel}</Button>
                  : <Button icon="patients" onClick={onConvert} disabled={!canEdit || !canCreatePatient} title={canCreatePatient ? undefined : 'Você não tem permissão para cadastrar pacientes'}>Cadastrar como paciente</Button>}
              </div>
            )}

            <div className={f.field}>
              <label htmlFor="lead-name">Nome</label>
              <input id="lead-name" ref={firstRef} value={form.name} onChange={e => set('name', e.target.value)} readOnly={readOnly} autoComplete="off" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'lead-name-err' : undefined} />
              {errors.name && <p id="lead-name-err" className={styles.fieldErr} role="alert">{errors.name}</p>}
            </div>

            <div className={f.field}>
              <label htmlFor="lead-phone">Telefone (WhatsApp)</label>
              {hasConversation && lead ? (
                <>
                  <input id="lead-phone" value={leadPhoneLabel(lead) || 'Número oculto pelo WhatsApp'} readOnly aria-describedby="lead-phone-hint" />
                  <p id="lead-phone-hint" className={f.hint}>O telefone vem da conversa do WhatsApp e não pode ser alterado aqui.</p>
                </>
              ) : (
                <>
                  <PhoneInput id="lead-phone" value={form.phone} onChange={v => set('phone', v)} readOnly={readOnly} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'lead-phone-err' : 'lead-phone-fmt'} />
                  {errors.phone
                    ? <p id="lead-phone-err" className={styles.fieldErr} role="alert">{errors.phone}</p>
                    : <p id="lead-phone-fmt" className={f.hint}>{PHONE_HINT}</p>}
                </>
              )}
            </div>

            <div className={styles.fieldRow}>
              <div className={f.field}>
                <label htmlFor="lead-source">Origem</label>
                <SelectMenu id="lead-source" variant="field" value={form.source} onChange={v => set('source', v as Source)} options={SOURCE_OPTIONS} />
              </div>
              <div className={f.field}>
                <label htmlFor="lead-owner">Responsável</label>
                <SelectMenu id="lead-owner" variant="field" value={form.assignedTo} onChange={v => set('assignedTo', v)} options={[{ value: '', label: 'Sem responsável' }, ...members.map(m => ({ value: m.userId, label: m.name }))]} />
              </div>
            </div>

            <div className={f.field}>
              <label htmlFor="lead-interest">Interesse</label>
              <input id="lead-interest" placeholder="Ex.: clareamento, consulta de rotina" value={form.interest} onChange={e => set('interest', e.target.value)} readOnly={readOnly} />
            </div>

            <div className={styles.fieldRow}>
              <div className={f.field}>
                <label htmlFor="lead-value">Valor estimado</label>
                <MoneyInput id="lead-value" value={form.value} onChange={v => set('value', v)} readOnly={readOnly} aria-invalid={!!errors.value} aria-describedby={errors.value ? 'lead-value-err' : undefined} />
                {errors.value && <p id="lead-value-err" className={styles.fieldErr} role="alert">{errors.value}</p>}
              </div>
              <div className={f.field}>
                <label htmlFor="lead-followup">Retomar em</label>
                <DateInput id="lead-followup" value={followUp} onChange={v => { setFollowUp(v); setFollowUpErr('') }} readOnly={readOnly} placeholder={DATE_PLACEHOLDER} autoComplete="off" aria-invalid={!!followUpErr} aria-describedby={followUpErr ? 'lead-followup-err' : undefined} />
                {followUpErr && <p id="lead-followup-err" className={styles.fieldErr} role="alert">{followUpErr}</p>}
              </div>
            </div>

            <div className={f.field}>
              <label htmlFor="lead-stage">Etapa</label>
              <SelectMenu id="lead-stage" variant="field" value={stage} onChange={v => setStage(v as Stage)} options={STAGE_OPTIONS} />
            </div>

            {stage === 'perdido' && (
              <div className={f.field}>
                <label htmlFor="lead-lost">Motivo da perda</label>
                <SelectMenu id="lead-lost" variant="field" value={lostReason} onChange={setLostReason} options={LOST_OPTIONS} />
              </div>
            )}

            <div className={f.field}>
              <label htmlFor="lead-notes">Observações</label>
              <textarea id="lead-notes" rows={4} value={form.notes} onChange={e => set('notes', e.target.value)} readOnly={readOnly} />
            </div>

            {!creating && (
              <p className={styles.meta}>Cadastrado em {new Date(lead.created_at).toLocaleDateString('pt-BR')}</p>
            )}
          </div>

          <footer className={styles.drawerFoot}>
            {error && <p className={f.error} role="alert">{error}</p>}
            <div className={styles.footRow}>
              {!creating && canEdit && (
                <Button variant="ghost" icon="trash" className={styles.deleteBtn} onClick={onDelete} disabled={saving}>Excluir</Button>
              )}
              <span className={styles.spacer} />
              <Button onClick={onClose} disabled={saving}>{canEdit ? 'Cancelar' : 'Fechar'}</Button>
              {canEdit && <Button type="submit" variant="primary" loading={saving}>{saving ? 'Salvando…' : creating ? 'Adicionar lead' : 'Salvar'}</Button>}
            </div>
          </footer>
        </form>
      </div>
    </Portal>
  )
}

const STAGE_TONE: Record<Stage, BadgeTone> = {
  novo: 'neutral', em_conversa: 'info', agendado: 'brand', compareceu: 'success', perdido: 'danger',
}
