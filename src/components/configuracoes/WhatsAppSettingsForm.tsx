'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { whatsappApi } from './whatsappApi'
import {
  validateSettings, KNOWN_VARS, MAX_TEMPLATE, MAX_REPLY, DEFAULT_MESSAGE_TEMPLATE,
  type WhatsAppSettings,
} from '@/lib/whatsapp/settings'
import { renderMessage } from '@/lib/whatsapp/message'
import { zonedTimeToUtc } from '@/lib/whatsapp/window'
import styles from './WhatsAppSettingsForm.module.css'

const TIME_OPTIONS = Array.from({ length: 35 }, (_, i) => {
  const mins = 5 * 60 + i * 30
  const v = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  return { value: v, label: v }
})
const HOURS_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} ${i === 0 ? 'hora' : 'horas'} antes`,
}))

const VAR_HINTS: Record<(typeof KNOWN_VARS)[number], string> = {
  paciente: 'Primeiro nome',
  clinica: 'Nome da clínica',
  data: 'hoje, amanhã…',
  hora: '14h30',
  profissional: 'Nome do profissional',
  com_profissional: ' com Dra. Ana',
}

/** No WhatsApp, *texto* aparece em negrito: a prévia mostra do mesmo jeito. */
function WhatsAppText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
        /^\*[^*\n]+\*$/.test(part) ? <strong key={i}>{part.slice(1, -1)}</strong> : <span key={i}>{part}</span>,
      )}
    </>
  )
}

/** Consulta de exemplo para a prévia: amanhã às 14h no fuso da clínica. */
function sampleAppointmentAt(tz: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.now() + 86_400_000))
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value)
  return zonedTimeToUtc(n('year'), n('month'), n('day'), 14, 0, tz)
}

export function WhatsAppSettingsForm({ connected }: { connected: boolean }) {
  const [form, setForm] = useState<WhatsAppSettings | null>(null)
  const [saved, setSaved] = useState<WhatsAppSettings | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const templateRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let alive = true
    whatsappApi<WhatsAppSettings>('/api/whatsapp/settings')
      .then(s => { if (alive) { setForm(s); setSaved(s) } })
      .catch(e => { if (alive) setLoadError(e instanceof Error ? e.message : 'Não foi possível carregar as configurações') })
    return () => { alive = false }
  }, [])

  const set = <K extends keyof WhatsAppSettings>(key: K, value: WhatsAppSettings[K]) => {
    setForm(f => (f ? { ...f, [key]: value } : f))
    setMsg(null)
  }

  const dirty = !!form && !!saved && JSON.stringify(form) !== JSON.stringify(saved)
  const validation = useMemo(() => (form ? validateSettings(form) : null), [form])

  const previews = useMemo(() => {
    if (!form) return []
    const base = {
      paciente: 'Maria da Silva',
      clinica: 'Sua Clínica',
      profissional: 'Dra. Ana',
      appointmentAt: sampleAppointmentAt(form.timezone),
      now: new Date(),
      timezone: form.timezone,
    }
    const confirm = { label: 'Confirmação', text: renderMessage(form.messageTemplate, base, { askReply: true }) }
    return form.confirmMode === 'ambos'
      ? [confirm, { label: 'Lembrete no dia', text: renderMessage(form.messageTemplate, base, { askReply: false }) }]
      : [confirm]
  }, [form])

  function insertVar(name: string) {
    const el = templateRef.current
    if (!form || !el) return
    const token = `{${name}}`
    const start = el.selectionStart ?? form.messageTemplate.length
    const end = el.selectionEnd ?? start
    const next = form.messageTemplate.slice(0, start) + token + form.messageTemplate.slice(end)
    set('messageTemplate', next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length) })
  }

  async function handleSave() {
    if (!form) return
    const v = validateSettings(form)
    if (!v.ok) { setMsg({ ok: false, text: v.error }); return }
    setSaving(true); setMsg(null)
    try {
      const s = await whatsappApi<WhatsAppSettings>('/api/whatsapp/settings', { method: 'PUT', body: v.value })
      setForm(s); setSaved(s)
      setMsg({ ok: true, text: 'Configurações salvas.' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não foi possível salvar' })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <div className={styles.card}><p className={styles.error} role="alert">{loadError}</p></div>
  if (!form) return <div className={styles.card}><p className={styles.muted}>Carregando configurações…</p></div>

  const canToggle = connected || form.confirmEnabled

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Confirmação automática de consultas</h2>
          <p className={styles.desc}>
            O sistema avisa o paciente pelo WhatsApp e, quando ele responde SIM, a consulta passa para confirmada na Agenda.
            Se responde NÃO, a recepção recebe o aviso para remarcar.
          </p>
        </div>
        <label className={`${styles.switch} ${!canToggle ? styles.switchDisabled : ''}`}>
          <input
            type="checkbox"
            role="switch"
            checked={form.confirmEnabled}
            disabled={!canToggle}
            onChange={e => set('confirmEnabled', e.target.checked)}
          />
          <span className={styles.track}><span className={styles.thumb} /></span>
          <span className={styles.switchText}>{form.confirmEnabled ? 'Ligada' : 'Desligada'}</span>
        </label>
      </div>
      {!connected && !form.confirmEnabled && (
        <p className={styles.hint}>Conecte o WhatsApp da clínica acima para poder ligar a confirmação automática.</p>
      )}

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Quando enviar</legend>

        <label className={`${styles.option} ${form.confirmMode === 'vespera' ? styles.optionOn : ''}`}>
          <input type="radio" name="wa-mode" checked={form.confirmMode === 'vespera'} onChange={() => set('confirmMode', 'vespera')} />
          <span className={styles.optionBody}>
            <strong>Na véspera da consulta</strong>
            <span className={styles.optionLine}>Enviar às
              <span className={styles.inline}><SelectMenu value={form.vesperaSendTime} onChange={v => set('vesperaSendTime', v)} options={TIME_OPTIONS} /></span>
            </span>
          </span>
        </label>

        <label className={`${styles.option} ${form.confirmMode === 'no_dia' ? styles.optionOn : ''}`}>
          <input type="radio" name="wa-mode" checked={form.confirmMode === 'no_dia'} onChange={() => set('confirmMode', 'no_dia')} />
          <span className={styles.optionBody}>
            <strong>No dia da consulta</strong>
            <span className={styles.optionLine}>Enviar
              <span className={styles.inline}><SelectMenu value={String(form.noDiaHoursBefore)} onChange={v => set('noDiaHoursBefore', Number(v))} options={HOURS_OPTIONS} /></span>
            </span>
          </span>
        </label>

        <label className={`${styles.option} ${form.confirmMode === 'ambos' ? styles.optionOn : ''}`}>
          <input type="radio" name="wa-mode" checked={form.confirmMode === 'ambos'} onChange={() => set('confirmMode', 'ambos')} />
          <span className={styles.optionBody}>
            <strong>Os dois</strong>
            <span className={styles.optionSub}>Confirmação na véspera e um lembrete no dia (o lembrete não pede resposta).</span>
          </span>
        </label>

        {form.confirmMode === 'ambos' && (
          <div className={styles.twoCols}>
            <div className={styles.field}>
              <span className={styles.label}>Confirmação na véspera, às</span>
              <SelectMenu value={form.vesperaSendTime} onChange={v => set('vesperaSendTime', v)} options={TIME_OPTIONS} />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Lembrete no dia</span>
              <SelectMenu value={String(form.noDiaHoursBefore)} onChange={v => set('noDiaHoursBefore', Number(v))} options={HOURS_OPTIONS} />
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Horário permitido para envio</legend>
        <div className={styles.twoCols}>
          <div className={styles.field}>
            <span className={styles.label}>Das</span>
            <SelectMenu value={form.windowStart} onChange={v => set('windowStart', v)} options={TIME_OPTIONS} />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Até as</span>
            <SelectMenu value={form.windowEnd} onChange={v => set('windowEnd', v)} options={TIME_OPTIONS} />
          </div>
        </div>
        <p className={styles.hint}>Nenhuma mensagem sai fora desse horário. O que cair de madrugada espera a janela abrir.</p>

        <span className={styles.label}>Consulta marcada depois do horário de envio</span>
        <label className={styles.radioRow}>
          <input type="radio" name="wa-late" checked={form.lateBookingPolicy === 'enviar_agora'} onChange={() => set('lateBookingPolicy', 'enviar_agora')} />
          Enviar assim que possível
        </label>
        <label className={styles.radioRow}>
          <input type="radio" name="wa-late" checked={form.lateBookingPolicy === 'nao_enviar'} onChange={() => set('lateBookingPolicy', 'nao_enviar')} />
          Não enviar
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Mensagem</legend>
        <label className={styles.label} htmlFor="wa-template">Texto enviado ao paciente</label>
        <textarea
          id="wa-template"
          ref={templateRef}
          className={styles.textarea}
          rows={4}
          maxLength={MAX_TEMPLATE}
          value={form.messageTemplate}
          onChange={e => set('messageTemplate', e.target.value)}
        />
        <div className={styles.chips} aria-label="Inserir variável">
          {KNOWN_VARS.map(v => (
            <button key={v} type="button" className={styles.chip} onClick={() => insertVar(v)} title={VAR_HINTS[v]}>{`{${v}}`}</button>
          ))}
          <button type="button" className={styles.chipGhost} onClick={() => set('messageTemplate', DEFAULT_MESSAGE_TEMPLATE)}>Restaurar texto padrão</button>
        </div>
        <p className={styles.hint}>
          A frase pedindo para responder SIM ou NÃO é adicionada automaticamente e não pode ser removida: é ela que permite ao sistema entender a resposta.
        </p>

        <div className={styles.previews} aria-live="polite">
          {previews.map(p => (
            <div key={p.label} className={styles.previewWrap}>
              <span className={styles.previewLabel}>Prévia: {p.label}</span>
              <div className={styles.bubble}><WhatsAppText text={p.text} /></div>
            </div>
          ))}
        </div>

        <div className={styles.twoCols}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="wa-yes">Resposta quando o paciente confirma</label>
            <input id="wa-yes" className={styles.input} maxLength={MAX_REPLY} value={form.replyYesText} onChange={e => set('replyYesText', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="wa-no">Resposta quando o paciente pede para remarcar</label>
            <input id="wa-no" className={styles.input} maxLength={MAX_REPLY} value={form.replyNoText} onChange={e => set('replyNoText', e.target.value)} />
          </div>
        </div>
      </fieldset>

      {msg && <p className={msg.ok ? styles.ok : styles.error} role="status">{msg.text}</p>}
      {!msg && validation && !validation.ok && dirty && <p className={styles.error}>{validation.error}</p>}

      <div className={styles.actions}>
        <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !dirty || (!!validation && !validation.ok)}>
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
        {dirty && !saving && <span className={styles.muted}>Há alterações não salvas.</span>}
      </div>
    </div>
  )
}
