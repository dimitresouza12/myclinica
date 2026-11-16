'use client'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { useProfessionals, useProcedures } from '@/hooks/useClinicData'
import { getSpecialtyConfig } from '@/lib/specialtyConfig'
import { motivoDoErro } from '@/lib/nutri/erros'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { IntegerInput } from '@/components/ui/NumericInput'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import {
  CONFIRM_MODE_LABELS, DEFAULT_ONLINE_SETTINGS, TIMEZONES, parseOnlineSettings, scheduleProblem, settingsToRow, validateOnlineSettings,
  type ConfirmMode, type OnlineBookingSettings,
} from '@/lib/agendamentoOnline/config'
import { slugProblem, slugify } from '@/lib/agendamentoOnline/slug'
import type { Professional } from '@/types'
import styles from './agendamentoOnlineTab.module.css'

interface Loaded {
  available: boolean
  settings: OnlineBookingSettings
  /** professional_id -> duração salva */
  professionals: Record<string, number>
  procedures: string[]
}

const NOTICE_OPTIONS = [0, 1, 2, 4, 8, 12, 24, 48, 72].map(h => ({ value: String(h), label: h === 0 ? 'Sem antecedência mínima' : h === 1 ? '1 hora' : h < 24 ? `${h} horas` : h === 24 ? '1 dia' : `${h / 24} dias` }))
const DAYS_OPTIONS = [7, 14, 30, 60, 90, 180].map(d => ({ value: String(d), label: `${d} dias` }))
const TZ_OPTIONS = TIMEZONES.map(t => ({ value: t.value, label: t.label }))

/** Configurações → Agendamento online: liga o link público, escolhe quem e o que aparece, e as regras de horário. */
export function AgendamentoOnlineTab() {
  const clinic = useAuthStore(s => s.clinic)
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['online-booking', clinic?.id],
    enabled: !!clinic?.id,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Loaded> => {
      const id = clinic!.id
      const [cfg, profs, procs] = await Promise.all([
        supabase.from('clinic_online_booking').select('*').eq('clinic_id', id).maybeSingle(),
        supabase.from('online_booking_professionals').select('professional_id, duration_minutes').eq('clinic_id', id),
        supabase.from('online_booking_procedures').select('procedure_id').eq('clinic_id', id),
      ])
      const err = cfg.error ?? profs.error ?? procs.error
      // tabelas ainda não criadas (migration não aplicada): a tela explica em vez de quebrar
      if (err && motivoDoErro(err) === 'sem_tabela') return { available: false, settings: DEFAULT_ONLINE_SETTINGS, professionals: {}, procedures: [] }
      if (err) throw new Error(err.message)
      return {
        available: true,
        settings: parseOnlineSettings(cfg.data),
        professionals: Object.fromEntries((profs.data ?? []).map(r => [r.professional_id as string, Number(r.duration_minutes)])),
        procedures: (procs.data ?? []).map(r => r.procedure_id as string),
      }
    },
  })

  if (isLoading) return <div className={styles.card}><p className={styles.note}>Carregando...</p></div>
  if (!data) return <div className={styles.card}><p className={styles.note}>Não foi possível carregar as configurações. Tente recarregar a página.</p></div>
  if (!data.available) {
    return (
      <div className={styles.card}>
        <h2 className={styles.title}>Agendamento online</h2>
        <p className={styles.note}>O agendamento online ainda não foi ativado para esta clínica.</p>
      </div>
    )
  }
  return <Form key={clinic?.id} initial={data} clinicId={clinic!.id} clinicName={clinic!.name} clinicType={clinic!.type}
    onSaved={() => queryClient.invalidateQueries({ queryKey: ['online-booking', clinic!.id] })} />
}

function Form({ initial, clinicId, clinicName, clinicType, onSaved }: {
  initial: Loaded; clinicId: string; clinicName: string; clinicType: Professional['specialty_type']; onSaved: () => void
}) {
  const { data: allProfessionals = [] } = useProfessionals(clinicId)
  const { data: allProcedures = [] } = useProcedures(clinicId)
  const procedures = allProcedures.filter(p => p.is_active)

  const [s, setS] = useState<OnlineBookingSettings>(() => ({
    ...initial.settings,
    // primeira vez: sugere o endereço a partir do nome da clínica
    slug: initial.settings.slug || slugify(clinicName),
  }))
  const [durations, setDurations] = useState<Record<string, number>>(initial.professionals)
  const [procIds, setProcIds] = useState<string[]>(initial.procedures)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const defaultDuration = (p: Professional) => p.default_duration_minutes ?? getSpecialtyConfig(p.specialty_type ?? clinicType ?? undefined).defaultDurationMinutes

  const dirty = useMemo(() => {
    // ordem das chaves não conta: compara pela forma canônica
    const canon = (st: OnlineBookingSettings, d: Record<string, number>, pr: string[]) =>
      JSON.stringify([st, Object.entries(d).sort(([a], [b]) => a.localeCompare(b)), [...pr].sort()])
    return canon(s, durations, procIds) !== canon({ ...initial.settings, slug: initial.settings.slug || slugify(clinicName) }, initial.professionals, initial.procedures)
  }, [s, durations, procIds, initial, clinicName])
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const link = `${origin}/agendar/${s.slug.trim() || '...'}`
  const slugError = s.slug.trim() ? slugProblem(s.slug) : null
  const withoutSchedule = allProfessionals.filter(p => durations[p.id] != null && !p.schedule_enabled)
  const noScheduleAll = allProfessionals.length > 0 && allProfessionals.every(p => !p.schedule_enabled)

  function toggleProfessional(p: Professional, on: boolean) {
    setDurations(prev => {
      const next = { ...prev }
      if (on) next[p.id] = defaultDuration(p)
      else delete next[p.id]
      return next
    })
  }
  const toggleProcedure = (id: string, on: boolean) => setProcIds(prev => on ? [...new Set([...prev, id])] : prev.filter(x => x !== id))

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('error', 'Não foi possível copiar. Selecione o endereço e copie manualmente.')
    }
  }

  async function save() {
    const problem = (s.slug.trim() ? slugProblem(s.slug) : null)
      ?? scheduleProblem(Object.keys(durations), allProfessionals)
      ?? validateOnlineSettings(s, { professionals: Object.keys(durations).length })
    if (problem) { setError(problem); return }
    for (const [id, d] of Object.entries(durations)) {
      if (!Number.isInteger(d) || d < 10 || d > 240) {
        const name = allProfessionals.find(p => p.id === id)?.name ?? 'profissional'
        setError(`A duração de ${name} vai de 10 a 240 minutos.`)
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      const { error: e1 } = await supabase.from('clinic_online_booking')
        .upsert({ clinic_id: clinicId, ...settingsToRow(s), updated_at: new Date().toISOString() }, { onConflict: 'clinic_id' })
      if (e1) {
        setError(e1.code === '23505' ? 'Esse endereço já está em uso por outra clínica. Escolha outro.' : `Não foi possível salvar: ${e1.message}`)
        return
      }

      const profRows = Object.entries(durations).map(([professional_id, duration_minutes]) => ({ clinic_id: clinicId, professional_id, duration_minutes }))
      if (profRows.length > 0) {
        const { error: e2 } = await supabase.from('online_booking_professionals').upsert(profRows, { onConflict: 'professional_id' })
        if (e2) { setError(`Não foi possível salvar os profissionais: ${e2.message}`); return }
      }
      const delProf = supabase.from('online_booking_professionals').delete().eq('clinic_id', clinicId)
      const { error: e3 } = await (profRows.length > 0 ? delProf.not('professional_id', 'in', `(${Object.keys(durations).join(',')})`) : delProf)
      if (e3) { setError(`Não foi possível atualizar os profissionais: ${e3.message}`); return }

      const procRows = procIds.map(procedure_id => ({ clinic_id: clinicId, procedure_id }))
      if (procRows.length > 0) {
        const { error: e4 } = await supabase.from('online_booking_procedures').upsert(procRows, { onConflict: 'procedure_id' })
        if (e4) { setError(`Não foi possível salvar os serviços: ${e4.message}`); return }
      }
      const delProc = supabase.from('online_booking_procedures').delete().eq('clinic_id', clinicId)
      const { error: e5 } = await (procRows.length > 0 ? delProc.not('procedure_id', 'in', `(${procIds.join(',')})`) : delProc)
      if (e5) { setError(`Não foi possível atualizar os serviços: ${e5.message}`); return }

      showToast('ok', s.enabled ? 'Agendamento online salvo e ligado' : 'Agendamento online salvo')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.stack}>
      <div className={styles.card}>
        <h2 className={styles.title}>Link público de agendamento</h2>
        <p className={styles.note}>O paciente abre o link no celular, escolhe o horário livre e informa nome e WhatsApp, a qualquer hora. A reserva aparece na Agenda com o selo Online.</p>
        <div className={f.switches}>
          <label className={f.switchRow}>
            <span className={f.switchText}><b>Agendamento online ligado</b><small>Desligado, o link mostra que o agendamento não está disponível.</small></span>
            <span className={f.toggle}>
              <input type="checkbox" checked={s.enabled} onChange={e => setS(p => ({ ...p, enabled: e.target.checked }))} />
              <span />
            </span>
          </label>
        </div>
        <div className={f.field}>
          <label htmlFor="ob-slug">Endereço do link</label>
          <input id="ob-slug" value={s.slug} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            aria-invalid={!!slugError} aria-describedby="ob-slug-hint"
            onChange={e => setS(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} />
          <span id="ob-slug-hint" className={slugError ? f.error : f.hint}>{slugError ?? 'Letras minúsculas sem acento, números e hífen. De 3 a 40 caracteres.'}</span>
        </div>
        <div className={styles.linkRow}>
          <code className={styles.link}>{link}</code>
          <button type="button" className={btn.secondary} onClick={copy} disabled={!s.slug.trim() || !!slugError}>{copied ? 'Copiado' : 'Copiar link'}</button>
        </div>
        {dirty && s.enabled && <p className={styles.note}>Salve para o link refletir estas mudanças.</p>}
      </div>

      <div className={styles.card}>
        <h2 className={styles.title}>Profissionais que aparecem</h2>
        <p className={styles.note}>Só quem estiver marcado aparece no link. A duração é o tempo reservado em cada horário.</p>
        {allProfessionals.length === 0 && <p className={styles.note}>Cadastre um profissional em Equipe para liberar horários.</p>}
        {noScheduleAll && <p className={styles.warn} role="note">Nenhum profissional tem a escala ligada. Ligue a escala de quem vai atender pelo link, na Agenda: só quem tem escala pode ser liberado.</p>}
        <ul className={styles.picks}>
          {allProfessionals.map(p => {
            const on = durations[p.id] != null
            return (
              <li key={p.id} className={styles.pick}>
                <label className={styles.pickMain}>
                  <input type="checkbox" checked={on} disabled={!on && !p.schedule_enabled} onChange={e => toggleProfessional(p, e.target.checked)} />
                  <span><b>{p.name}</b>{p.specialty && <small>{p.specialty}</small>}{!p.schedule_enabled && <small>Sem escala ligada: ligue na Agenda para liberar no link.</small>}</span>
                </label>
                {on && (
                  <div className={`${f.field} ${styles.duration}`}>
                    <label htmlFor={`ob-dur-${p.id}`}>Duração (min)</label>
                    <IntegerInput id={`ob-dur-${p.id}`} value={durations[p.id]} min={10} max={240}
                      onChange={v => setDurations(prev => ({ ...prev, [p.id]: v === '' ? 0 : Number(v) }))} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {withoutSchedule.length > 0 && (
          <p className={styles.warn} role="note">
            {withoutSchedule.map(p => p.name).join(', ')} {withoutSchedule.length === 1 ? 'não tem' : 'não têm'} escala ligada e não pode{withoutSchedule.length === 1 ? '' : 'm'} ficar no link. Desmarque para salvar, ou ligue a escala na Agenda.
          </p>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.title}>Serviços que aparecem</h2>
        <p className={styles.note}>Se marcar algum, o paciente escolhe o serviço antes do horário. Sem nenhum marcado, a reserva sai como Consulta. Os valores não aparecem no link.</p>
        {procedures.length === 0 && <p className={styles.note}>Nenhum procedimento ativo cadastrado.</p>}
        <ul className={styles.picks}>
          {procedures.map(p => (
            <li key={p.id} className={styles.pick}>
              <label className={styles.pickMain}>
                <input type="checkbox" checked={procIds.includes(p.id)} onChange={e => toggleProcedure(p.id, e.target.checked)} />
                <span><b>{p.name}</b>{p.category && <small>{p.category}</small>}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.card}>
        <h2 className={styles.title}>Regras do horário</h2>
        <div className={f.field}>
          <label>Depois de reservar, o horário fica</label>
          <div className={styles.modes} role="radiogroup" aria-label="Situação da reserva">
            {(Object.keys(CONFIRM_MODE_LABELS) as ConfirmMode[]).map(m => (
              <button key={m} type="button" role="radio" aria-checked={s.confirmMode === m}
                className={s.confirmMode === m ? styles.modeOn : styles.mode} onClick={() => setS(p => ({ ...p, confirmMode: m }))}>
                <b>{CONFIRM_MODE_LABELS[m].label}</b>
                <small>{CONFIRM_MODE_LABELS[m].hint}</small>
              </button>
            ))}
          </div>
        </div>
        <div className={f.row2}>
          <div className={f.field}>
            <label>Antecedência mínima</label>
            <SelectMenu variant="field" ariaLabel="Antecedência mínima" value={String(s.minNoticeHours)} options={NOTICE_OPTIONS}
              onChange={v => setS(p => ({ ...p, minNoticeHours: Number(v) }))} />
          </div>
          <div className={f.field}>
            <label>Janela máxima</label>
            <SelectMenu variant="field" ariaLabel="Janela máxima" value={String(s.maxDaysAhead)} options={DAYS_OPTIONS}
              onChange={v => setS(p => ({ ...p, maxDaysAhead: Number(v) }))} />
          </div>
        </div>
        <div className={f.field}>
          <label>Fuso horário da clínica</label>
          <SelectMenu variant="field" ariaLabel="Fuso horário da clínica" value={s.timezone} options={TZ_OPTIONS}
            onChange={v => setS(p => ({ ...p, timezone: v }))} />
        </div>
        <p className={styles.note}>Os horários seguem a grade, o horário de funcionamento e as escalas da Agenda, e respeitam consultas e bloqueios. O que já está agendado nunca é oferecido.</p>
      </div>

      {error && <p className={f.error} role="alert">{error}</p>}
      <div className={styles.saveRow}>
        <button type="button" className={btn.primary} onClick={save} disabled={saving || !dirty}>{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </div>
  )
}
