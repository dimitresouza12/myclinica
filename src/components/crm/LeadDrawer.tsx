'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Portal } from '@/components/ui/Portal'
import { Avatar } from '@/components/ui/Avatar'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { PHONE_HINT, toInputValue } from '@/lib/phoneFormat'
import { useScrollLock } from '@/hooks/useScrollLock'
import type { CrmMember } from '@/hooks/useCrmLeads'
import {
  LOST_REASONS, SOURCES, STAGES, dateInputToIso, isoToDateInput, leadPhoneLabel, leadTitle, stageLabel,
  validateLeadForm, type Lead, type LeadFormInput, type Source, type Stage,
} from '@/lib/crm/model'
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

  useScrollLock(true)
  useEffect(() => { firstRef.current?.focus() }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
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
        <form className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="lead-title" onSubmit={submit} noValidate>
          <header className={styles.drawerHead}>
            {!creating && <Avatar url={photoUrl} name={title} size={52} className={styles.drawerAvatar} />}
            <div className={styles.drawerWho}>
              <h2 id="lead-title" className={styles.drawerTitle}>{title}</h2>
              {!creating && (
                <>
                  <div className={styles.tags}>
                    <span className={`${styles.stageChip} ${stageClass(lead.stage)}`}><span className={styles.dot} aria-hidden="true" />{stageLabel(lead.stage)}</span>
                    {lead.patient_id && <span className={`${styles.tag} ${styles.tagGood}`}>Paciente cadastrado</span>}
                  </div>
                  {lead.stage_source === 'auto' && lead.stage_note && (
                    <p className={styles.autoNote}><Icon name="info" size={12} />Atualizado automaticamente: {lead.stage_note}</p>
                  )}
                </>
              )}
            </div>
            <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><Icon name="close" size={18} /></button>
          </header>

          <div className={styles.drawerBody}>
            {!creating && (
              <div className={styles.quick}>
                <button type="button" className={styles.btn} onClick={onTalk} disabled={!canEdit}><Icon name="chat" size={16} />Conversar</button>
                <button type="button" className={styles.btn} onClick={onSchedule} disabled={!canEdit || (!lead.patient_id && !canCreatePatient)}><Icon name="calendar" size={16} />Agendar</button>
                {lead.patient_id
                  ? <button type="button" className={styles.btn} onClick={onOpenPatient}><Icon name="patients" size={16} />Abrir prontuário</button>
                  : <button type="button" className={styles.btn} onClick={onConvert} disabled={!canEdit || !canCreatePatient} title={canCreatePatient ? undefined : 'Você não tem permissão para cadastrar pacientes'}><Icon name="patients" size={16} />Cadastrar como paciente</button>}
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="lead-name">Nome</label>
              <input id="lead-name" ref={firstRef} className={styles.input} value={form.name} onChange={e => set('name', e.target.value)} readOnly={readOnly} autoComplete="off" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'lead-name-err' : undefined} />
              {errors.name && <p id="lead-name-err" className={styles.fieldErr} role="alert">{errors.name}</p>}
            </div>

            <div className={styles.field}>
              <label htmlFor="lead-phone">Telefone (WhatsApp)</label>
              {hasConversation && lead ? (
                <>
                  <input id="lead-phone" className={styles.input} value={leadPhoneLabel(lead) || 'Número oculto pelo WhatsApp'} readOnly aria-describedby="lead-phone-hint" />
                  <p id="lead-phone-hint" className={styles.hint}>O telefone vem da conversa do WhatsApp e não pode ser alterado aqui.</p>
                </>
              ) : (
                <>
                  <PhoneInput id="lead-phone" className={styles.input} value={form.phone} onChange={v => set('phone', v)} readOnly={readOnly} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'lead-phone-err' : 'lead-phone-fmt'} />
                  {errors.phone
                    ? <p id="lead-phone-err" className={styles.fieldErr} role="alert">{errors.phone}</p>
                    : <p id="lead-phone-fmt" className={styles.hint}>{PHONE_HINT}</p>}
                </>
              )}
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <span id="lead-source-l" className={styles.labelText}>Origem</span>
                <SelectMenu value={form.source} onChange={v => set('source', v as Source)} options={SOURCE_OPTIONS} />
              </div>
              <div className={styles.field}>
                <span id="lead-owner-l" className={styles.labelText}>Responsável</span>
                <SelectMenu value={form.assignedTo} onChange={v => set('assignedTo', v)} options={[{ value: '', label: 'Sem responsável' }, ...members.map(m => ({ value: m.userId, label: m.name }))]} />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="lead-interest">Interesse</label>
              <input id="lead-interest" className={styles.input} placeholder="Ex.: clareamento, consulta de rotina" value={form.interest} onChange={e => set('interest', e.target.value)} readOnly={readOnly} />
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="lead-value">Valor estimado</label>
                <MoneyInput id="lead-value" className={styles.input} value={form.value} onChange={v => set('value', v)} readOnly={readOnly} aria-invalid={!!errors.value} aria-describedby={errors.value ? 'lead-value-err' : undefined} />
                {errors.value && <p id="lead-value-err" className={styles.fieldErr} role="alert">{errors.value}</p>}
              </div>
              <div className={styles.field}>
                <label htmlFor="lead-followup">Retomar em</label>
                <DateInput id="lead-followup" className={styles.input} value={followUp} onChange={v => { setFollowUp(v); setFollowUpErr('') }} readOnly={readOnly} placeholder={DATE_PLACEHOLDER} autoComplete="off" aria-invalid={!!followUpErr} aria-describedby={followUpErr ? 'lead-followup-err' : undefined} />
                {followUpErr && <p id="lead-followup-err" className={styles.fieldErr} role="alert">{followUpErr}</p>}
              </div>
            </div>

            <div className={styles.field}>
              <span id="lead-stage-l" className={styles.labelText}>Etapa</span>
              <SelectMenu value={stage} onChange={v => setStage(v as Stage)} options={STAGE_OPTIONS} />
            </div>

            {stage === 'perdido' && (
              <div className={styles.field}>
                <span id="lead-lost-l" className={styles.labelText}>Motivo da perda</span>
                <SelectMenu value={lostReason} onChange={setLostReason} options={LOST_OPTIONS} />
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="lead-notes">Observações</label>
              <textarea id="lead-notes" className={`${styles.input} ${styles.textarea}`} rows={4} value={form.notes} onChange={e => set('notes', e.target.value)} readOnly={readOnly} />
            </div>

            {!creating && (
              <p className={styles.meta}>Cadastrado em {new Date(lead.created_at).toLocaleDateString('pt-BR')}</p>
            )}
          </div>

          <footer className={styles.drawerFoot}>
            {error && <p className={styles.formErr} role="alert">{error}</p>}
            <div className={styles.footRow}>
              {!creating && canEdit && (
                <button type="button" className={styles.btnDanger} onClick={onDelete} disabled={saving}><Icon name="trash" size={15} />Excluir</button>
              )}
              <span className={styles.spacer} />
              <button type="button" className={styles.btn} onClick={onClose} disabled={saving}>{canEdit ? 'Cancelar' : 'Fechar'}</button>
              {canEdit && <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Salvando…' : creating ? 'Adicionar lead' : 'Salvar'}</button>}
            </div>
          </footer>
        </form>
      </div>
    </Portal>
  )
}

function stageClass(stage: Stage): string {
  return { novo: styles.stNovo, em_conversa: styles.stConversa, agendado: styles.stAgendado, compareceu: styles.stCompareceu, perdido: styles.stPerdido }[stage]
}
