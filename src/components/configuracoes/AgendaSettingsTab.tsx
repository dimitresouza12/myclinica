'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useSchedules } from '@/hooks/useSchedules'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { buildSlots, settingsToRow, validateSettings, type ExtraSlotPolicy, type ScheduleSettings } from '@/lib/agenda/settings'
import type { Shift } from '@/lib/agenda/availability'
import styles from './agendaSettingsTab.module.css'

const POLICY_OPTIONS: { value: ExtraSlotPolicy; label: string }[] = [
  { value: 'admin_recepcao', label: 'Administrador e recepção' },
  { value: 'admin', label: 'Só administrador' },
  { value: 'none', label: 'Ninguém (só dentro da escala)' },
]
const REMINDER_OPTIONS = [1, 2, 3, 5, 7, 14].map(n => ({ value: String(n), label: n === 1 ? '1 dia' : `${n} dias` }))
// início e fim da grade em horas cheias e meias, de 05:00 a 23:30
const TIME_OPTIONS = buildSlots({ start: '05:00', end: '24:00' }).map(v => ({ value: v, label: v }))

/** Configurações → Agenda: turnos, horário da grade, encaixe fora da escala e lembrete. */
export function AgendaSettingsTab() {
  const clinic = useAuthStore(s => s.clinic)
  const queryClient = useQueryClient()
  const { data, isLoading } = useSchedules(clinic?.id)
  if (isLoading || !data) return <div className={styles.card}><p className={styles.note}>Carregando...</p></div>
  if (!data.available) {
    return (
      <div className={styles.card}>
        <h2 className={styles.title}>Agenda</h2>
        <p className={styles.note}>A escala dos profissionais ainda não foi ativada para esta clínica.</p>
      </div>
    )
  }
  // o formulário nasce das configurações salvas; trocar de clínica remonta tudo
  return <Form key={clinic?.id} initial={data.settings} clinicId={clinic!.id} onSaved={() => queryClient.invalidateQueries({ queryKey: ['schedules', clinic!.id] })} />
}

function Form({ initial, clinicId, onSaved }: { initial: ScheduleSettings; clinicId: string; onSaved: () => void }) {
  const [s, setS] = useState<ScheduleSettings>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = JSON.stringify(s) !== JSON.stringify(initial)

  const setShift = (id: string, patch: Partial<Shift>) => setS(p => ({ ...p, shifts: p.shifts.map(x => x.id === id ? { ...x, ...patch } : x) }))
  const addShift = () => setS(p => ({ ...p, shifts: [...p.shifts, { id: `t-${Math.random().toString(36).slice(2, 8)}`, name: '', start: '08:00', end: '12:00' }] }))
  const removeShift = (id: string) => setS(p => ({ ...p, shifts: p.shifts.filter(x => x.id !== id) }))

  async function save() {
    const problem = validateSettings(s)
    if (problem) { setError(problem); return }
    setSaving(true)
    setError('')
    const { error: e } = await supabase
      .from('clinic_schedule_settings')
      .upsert({ clinic_id: clinicId, ...settingsToRow(s), updated_at: new Date().toISOString() }, { onConflict: 'clinic_id' })
    setSaving(false)
    if (e) { setError(`Não foi possível salvar: ${e.message}`); return }
    showToast('ok', 'Configurações da agenda salvas')
    onSaved()
  }

  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <h2 className={styles.title}>Turnos</h2>
        <p className={styles.note}>Os turnos viram os botões da escala de cada profissional (por exemplo Manhã e Tarde). Mudar o horário de um turno vale para as próximas marcações; o que já foi marcado não muda.</p>
        <ul className={styles.shifts}>
          {s.shifts.map(sh => (
            <li key={sh.id} className={styles.shift}>
              <div className={`${f.field} ${styles.shiftName}`}>
                <label htmlFor={`shift-name-${sh.id}`}>Nome</label>
                <input id={`shift-name-${sh.id}`} value={sh.name} maxLength={24} placeholder="Ex.: Manhã" onChange={e => setShift(sh.id, { name: e.target.value })} />
              </div>
              <div className={f.field}>
                <label htmlFor={`shift-start-${sh.id}`}>Início</label>
                <input id={`shift-start-${sh.id}`} type="time" value={sh.start} onChange={e => setShift(sh.id, { start: e.target.value })} />
              </div>
              <div className={f.field}>
                <label htmlFor={`shift-end-${sh.id}`}>Fim</label>
                <input id={`shift-end-${sh.id}`} type="time" value={sh.end} onChange={e => setShift(sh.id, { end: e.target.value })} />
              </div>
              <button type="button" className={styles.remove} onClick={() => removeShift(sh.id)} disabled={s.shifts.length <= 1} aria-label={`Remover o turno ${sh.name || 'sem nome'}`}>Remover</button>
            </li>
          ))}
        </ul>
        <button type="button" className={btn.secondary} onClick={addShift}>Adicionar turno</button>
      </div>

      <div className={styles.card}>
        <h2 className={styles.title}>Horário da grade</h2>
        <p className={styles.note}>As linhas de horário que a Agenda mostra e oferece ao marcar. Consultas fora desse intervalo continuam aparecendo.</p>
        <div className={f.row2}>
          <div className={f.field}>
            <label>Abre às</label>
            <SelectMenu variant="field" ariaLabel="Abre às" value={s.opening.start} options={TIME_OPTIONS} onChange={v => setS(p => ({ ...p, opening: { ...p.opening, start: v } }))} />
          </div>
          <div className={f.field}>
            <label>Último horário termina às</label>
            <SelectMenu variant="field" ariaLabel="Último horário termina às" value={s.opening.end} options={TIME_OPTIONS} onChange={v => setS(p => ({ ...p, opening: { ...p.opening, end: v } }))} />
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.title}>Encaixe fora da escala</h2>
        <p className={styles.note}>Marcar num horário em que o profissional não atende. Fica registrado na consulta.</p>
        <div className={f.field}>
          <label>Quem pode encaixar</label>
          <SelectMenu variant="field" ariaLabel="Quem pode encaixar" value={s.extraSlotPolicy} options={POLICY_OPTIONS} onChange={v => setS(p => ({ ...p, extraSlotPolicy: v as ExtraSlotPolicy }))} />
        </div>
        <div className={f.switches}>
          <label className={f.switchRow}>
            <span className={f.switchText}><b>Pedir o motivo do encaixe</b><small>Quem encaixa precisa escrever por quê.</small></span>
            <span className={f.toggle}>
              <input type="checkbox" checked={s.extraSlotRequireReason} onChange={e => setS(p => ({ ...p, extraSlotRequireReason: e.target.checked }))} />
              <span />
            </span>
          </label>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.title}>Lembrete de escala</h2>
        <p className={styles.note}>Avisa no sino quando algum profissional tem dia por definir nos próximos dias.</p>
        <div className={f.switches}>
          <label className={f.switchRow}>
            <span className={f.switchText}><b>Lembrar de preencher a escala</b><small>Só vale para profissionais com a escala ligada.</small></span>
            <span className={f.toggle}>
              <input type="checkbox" checked={s.reminderEnabled} onChange={e => setS(p => ({ ...p, reminderEnabled: e.target.checked }))} />
              <span />
            </span>
          </label>
        </div>
        {s.reminderEnabled && (
          <div className={f.field}>
            <label>Avisar quando faltarem até</label>
            <SelectMenu variant="field" ariaLabel="Avisar quando faltarem até" value={String(s.reminderDaysBefore)} options={REMINDER_OPTIONS} onChange={v => setS(p => ({ ...p, reminderDaysBefore: Number(v) }))} />
          </div>
        )}
      </div>

      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={styles.saveRow}>
        <button type="button" className={btn.primary} onClick={save} disabled={saving || !dirty}>{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </div>
  )
}
