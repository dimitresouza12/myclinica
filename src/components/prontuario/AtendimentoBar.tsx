'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { useAtendimentoSchema } from '@/hooks/useAtendimentoSchema'
import { isAdmin } from '@/lib/professionalScope'
import { brasilDayRange, hojeBrasil } from '@/lib/brasilDate'
import { runFlowAction } from '@/lib/atendimento/api'
import { finishAttendance } from '@/lib/atendimento/finish'
import { stageOf, type FlowFields } from '@/lib/atendimento/status'
import { consultMs, elapsedMs, formatBrasilTime, formatClock, formatMinutes, waitMs } from '@/lib/atendimento/time'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { SelectMenu } from '@/components/ui/SelectMenu'
import btn from '@/components/ui/button.module.css'
import styles from './AtendimentoBar.module.css'

interface Row extends FlowFields {
  id: string
  status: string | null
  scheduled_at: string
  professional_id: string | null
  procedure_name: string | null
  professionals?: { name?: string | null } | null
}

interface Props {
  patientId: string
  clinicId: string
  /** avisa a página quando há atendimento em andamento (aviso ao sair) */
  onRunningChange?: (running: boolean) => void
}

/**
 * Iniciar / finalizar atendimento no topo do prontuário. Vinculado ao agendamento de hoje do paciente com o profissional logado.
 * O cronômetro é calculado a partir de started_at (gravado no banco), então retoma sozinho se a página recarregar, e só existe
 * aqui, na tela do profissional: nada disso vai para o portal ou link do paciente. Finalizar NÃO trava a evolução.
 */
export function AtendimentoBar({ patientId, clinicId, onRunningChange }: Props) {
  const { user } = useAuthStore()
  const { canEdit } = usePermissions('agenda')
  const { available, checked } = useAtendimentoSchema()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // quem opera o atendimento é o profissional (ou o administrador); a recepção usa a fila da Agenda
  const myProfessionalId = user?.professionalId ?? null
  const enabled = canEdit && (!!myProfessionalId || isAdmin(user))

  const load = useCallback(async () => {
    const range = brasilDayRange(hojeBrasil())
    if (!range) return
    let q = supabase
      .from('appointments')
      .select('id, status, scheduled_at, professional_id, procedure_name, arrived_at, called_at, started_at, finished_at, professionals(name)')
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .neq('status', 'bloqueado')
      .gte('scheduled_at', range.start)
      .lte('scheduled_at', range.end)
      .order('scheduled_at', { ascending: true })
    if (myProfessionalId) q = q.eq('professional_id', myProfessionalId)
    const { data, error } = await q
    if (error) { setLoadError(true); return }
    setLoadError(false)
    setRows((data ?? []) as unknown as Row[])
  }, [clinicId, patientId, myProfessionalId])

  useEffect(() => {
    if (!available || !enabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [available, enabled, load])

  const running = useMemo(() => (rows ?? []).find(r => stageOf(r) === 'in_progress') ?? null, [rows])
  const candidates = useMemo(() => {
    const open = (rows ?? []).filter(r => { const s = stageOf(r); return s === 'waiting' || s === 'scheduled' })
    // quem já chegou vem primeiro
    return [...open].sort((a, b) => Number(stageOf(b) === 'waiting') - Number(stageOf(a) === 'waiting') || a.scheduled_at.localeCompare(b.scheduled_at))
  }, [rows])
  const lastDone = useMemo(() => [...(rows ?? [])].filter(r => stageOf(r) === 'done').sort((a, b) => (b.finished_at ?? b.scheduled_at).localeCompare(a.finished_at ?? a.scheduled_at))[0] ?? null, [rows])
  const selected = candidates.find(c => c.id === chosen) ?? candidates[0] ?? null
  const isRunning = !!running

  useEffect(() => { onRunningChange?.(isRunning) }, [isRunning, onRunningChange])
  useEffect(() => () => onRunningChange?.(false), [onRunningChange])

  // relógio: a cada segundo com atendimento em andamento; a cada 30 s só para atualizar o "aguardando há"
  useEffect(() => {
    if (!available || !enabled) return
    const id = window.setInterval(() => setNow(Date.now()), isRunning ? 1000 : 30000)
    return () => window.clearInterval(id)
  }, [available, enabled, isRunning])

  const patchRow = (id: string, patch: Partial<Row>) => setRows(prev => (prev ?? []).map(r => (r.id === id ? { ...r, ...patch } as Row : r)))
  const refreshOthers = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['agenda', clinicId] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard', clinicId] }),
  ])
  const ctx = { clinicId, userId: user?.id ?? null }

  async function start() {
    if (!selected || busy) return
    setBusy(true)
    try {
      const res = await runFlowAction(ctx, selected, 'start')
      if (!res.ok) { showToast('error', res.error); await load(); return }
      patchRow(selected.id, res.patch as Partial<Row>)
      setNow(Date.now())
      void refreshOthers()
    } finally { setBusy(false) }
  }

  async function call() {
    if (!selected || busy) return
    setBusy(true)
    try {
      const res = await runFlowAction(ctx, selected, 'call')
      if (!res.ok) { showToast('error', res.error); await load(); return }
      patchRow(selected.id, res.patch as Partial<Row>)
      showToast('ok', 'Paciente chamado na fila.')
      void refreshOthers()
    } finally { setBusy(false) }
  }

  async function finish() {
    if (!running || busy) return
    const go = await confirmDialog({
      title: 'Finalizar atendimento',
      message: 'O atendimento será marcado como atendido e o tempo de consulta ficará registrado. A evolução continua editável depois.',
      confirmText: 'Finalizar atendimento',
      cancelText: 'Continuar atendendo',
    })
    if (!go) return
    setBusy(true)
    try {
      const out = await finishAttendance(ctx, running.id)
      if (out.status === 'error') { showToast('error', out.message); await load(); return }
      if (out.status === 'cancelled') return
      patchRow(running.id, { ...out.patch, status: 'concluido' } as Partial<Row>)
      await Promise.all([
        refreshOthers(),
        queryClient.invalidateQueries({ queryKey: ['packages', clinicId] }),
        ...(out.creditUsed ? [queryClient.invalidateQueries({ queryKey: ['patient-credits', clinicId] })] : []),
      ])
    } finally { setBusy(false) }
  }

  if (!checked || !enabled) return null
  if (!available) {
    return isAdmin(user)
      ? <p className={styles.note}>O fluxo de atendimento será ativado quando a atualização do banco (20261119_atendimento_fluxo) for aplicada.</p>
      : null
  }
  if (rows === null) return loadError ? <p className={styles.note}>Não foi possível carregar o atendimento de hoje.</p> : null

  const nowDate = new Date(now)

  if (running) {
    return (
      <div className={`${styles.bar} ${styles.barRunning}`} role="group" aria-label="Atendimento em andamento">
        <div className={styles.info}>
          <span className={styles.state}>Em atendimento desde {formatBrasilTime(running.started_at)}</span>
          <span className={styles.sub}>{running.procedure_name ?? 'Consulta'}</span>
        </div>
        <span className={styles.timer} role="timer" aria-live="off" title="Visível só para você">
          {formatClock(elapsedMs(running.started_at, nowDate) ?? 0)}
        </span>
        <button type="button" className={`${btn.base} ${btn.primary} ${styles.action}`} onClick={finish} disabled={busy}>
          Finalizar atendimento
        </button>
      </div>
    )
  }

  if (candidates.length === 0) {
    const done = lastDone && lastDone.started_at && lastDone.finished_at
    return (
      <div className={styles.bar} role="group" aria-label="Atendimento">
        <div className={styles.info}>
          {lastDone ? (
            <>
              <span className={styles.state}>Atendido às {formatBrasilTime(lastDone.finished_at ?? lastDone.scheduled_at)}</span>
              {done && <span className={styles.sub}>Duração {formatMinutes(consultMs(lastDone.started_at, lastDone.finished_at) ?? 0)}. A evolução continua editável.</span>}
            </>
          ) : (
            <>
              <span className={styles.state}>Nenhum agendamento hoje para este paciente</span>
              <span id="atend-hint" className={styles.sub}>Crie o agendamento na Agenda para iniciar o atendimento.</span>
            </>
          )}
        </div>
        {!lastDone && (
          <button type="button" className={`${btn.base} ${btn.primary} ${styles.action}`} disabled aria-describedby="atend-hint">
            Iniciar atendimento
          </button>
        )}
      </div>
    )
  }

  const waitingFor = selected && stageOf(selected) === 'waiting' ? waitMs(selected.arrived_at, null, nowDate) : null
  return (
    <div className={styles.bar} role="group" aria-label="Atendimento">
      <div className={styles.info}>
        <span className={styles.state}>
          {selected && stageOf(selected) === 'waiting'
            ? `Paciente aguardando${waitingFor !== null ? ` há ${formatMinutes(waitingFor)}` : ''}`
            : `Consulta às ${formatBrasilTime(selected?.scheduled_at)}`}
        </span>
        <span className={styles.sub}>{selected?.procedure_name ?? 'Consulta'}{selected?.called_at ? ` · chamado às ${formatBrasilTime(selected.called_at)}` : ''}</span>
      </div>
      {candidates.length > 1 && selected && (
        <SelectMenu
          className={styles.pick}
          ariaLabel="Escolher o agendamento de hoje"
          value={selected.id}
          onChange={setChosen}
          options={candidates.map(c => ({
            value: c.id,
            label: `${formatBrasilTime(c.scheduled_at)} · ${c.procedure_name ?? 'Consulta'}${stageOf(c) === 'waiting' ? ' (aguardando)' : ''}`,
          }))}
        />
      )}
      {selected && stageOf(selected) === 'waiting' && (
        <button type="button" className={`${btn.base} ${btn.secondary} ${styles.action}`} onClick={call} disabled={busy}>
          Chamar paciente
        </button>
      )}
      <button type="button" className={`${btn.base} ${btn.primary} ${styles.action}`} onClick={start} disabled={busy || !selected}>
        Iniciar atendimento
      </button>
    </div>
  )
}
