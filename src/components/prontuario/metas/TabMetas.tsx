'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useProfessionals } from '@/hooks/useClinicData'
import { PillTabs } from '@/components/ui/PillTabs'
import { Icon } from '@/components/ui/Icon'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import { hojeBrasil } from '@/lib/brasilDate'
import { councilForProfessional, formatRegistration } from '@/lib/professionalCouncil'
import { AREA_NOME, AREA_PROFILE } from '@/lib/metas/constants'
import * as api from '@/lib/metas/data'
import type { MetasData } from '@/lib/metas/data'
import type { Assessment, AssessmentKind, Goal, GoalLog, GoalResult, MetasArea } from '@/lib/metas/types'
import type { Patient } from '@/types'
import type { AuthClinic } from '@/types'
import { MetasLista } from './MetasLista'
import { RegistroSessao } from './RegistroSessao'
import { Evolucao } from './Evolucao'
import { RelatorioEvolutivo } from './RelatorioEvolutivo'
import { QuadroFonemico } from './QuadroFonemico'
import { ChecklistAvd } from './ChecklistAvd'
import styles from './metas.module.css'

type View = 'sessao' | 'metas' | 'evolucao' | 'relatorio' | 'fonemico' | 'avd'

interface Props {
  patient: Patient
  clinic: AuthClinic
  /** Área em que a aba abre: a do profissional logado, senão a primeira da clínica que usa metas */
  area: MetasArea
  /** Áreas da clínica que usam metas; com mais de uma, a aba mostra o alternador de área */
  areas?: MetasArea[]
  onDirtyChange?: (dirty: boolean) => void
}

type LoadState = 'loading' | 'ok' | 'missing' | 'error'

export function TabMetas({ patient, clinic, area: areaInicial, areas, onDirtyChange }: Props) {
  const [area, setArea] = useState<MetasArea>(areaInicial)
  const [areaInicialVista, setAreaInicialVista] = useState(areaInicial)
  if (areaInicial !== areaInicialVista) { setAreaInicialVista(areaInicial); setArea(areaInicial) }
  const areaOptions = useMemo(() => {
    const list = areas && areas.length > 0 ? areas : [areaInicial]
    return list.includes(areaInicial) ? list : [areaInicial, ...list]
  }, [areas, areaInicial])
  const profile = AREA_PROFILE[area]
  const user = useAuthStore(s => s.user)
  const { data: professionals = [] } = useProfessionals(clinic.id)
  const professionalId = user?.professionalId ?? null
  const professional = professionals.find(p => p.id === professionalId) ?? null

  const [state, setState] = useState<LoadState>('loading')
  const [data, setData] = useState<MetasData>({ goals: [], logs: [], assessments: [] })
  const [view, setViewState] = useState<View | null>(null)
  // as avaliações têm rascunho na tela: depois de abertas ficam montadas (só escondidas) para não perder o que foi marcado
  const [visited, setVisited] = useState<Set<View>>(new Set())
  const [blocked, setBlocked] = useState(false)
  const today = hojeBrasil()

  const apply = useCallback((res: Awaited<ReturnType<typeof api.loadMetas>>) => {
    if (!res.ok) { setState(res.reason === 'missing' ? 'missing' : 'error'); return }
    setData(res.data)
    setState('ok')
  }, [])

  useEffect(() => {
    let alive = true
    void api.loadMetas(patient.id).then(res => { if (alive) apply(res) })
    return () => { alive = false }
  }, [patient.id, apply])

  function retry() {
    setState('loading')
    void api.loadMetas(patient.id).then(apply)
  }
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // rascunho de avaliação aberto (quadro fonêmico / checklist de AVD): trocar de área desmonta a tela e o perde
  const assessmentDirty = useRef(false)
  const handleDirty = useCallback((d: boolean) => { assessmentDirty.current = d; onDirtyChange?.(d) }, [onDirtyChange])

  async function changeArea(next: MetasArea) {
    if (next === area) return
    if (assessmentDirty.current) {
      const ok = await confirmDialog({
        title: 'Descartar alterações?',
        message: 'Há uma avaliação com alterações que ainda não foram salvas. Se trocar de área agora, elas serão perdidas.',
        confirmText: 'Descartar',
        cancelText: 'Continuar editando',
        danger: true,
      })
      if (!ok) return
      handleDirty(false)
    }
    setArea(next)
    setViewState(null)
    setVisited(new Set())
  }

  const goals = useMemo(() => data.goals.filter(g => g.area === area), [data.goals, area])
  const goalIds = useMemo(() => new Set(goals.map(g => g.id)), [goals])
  const logs = useMemo(() => data.logs.filter(l => goalIds.has(l.goal_id)), [data.logs, goalIds])

  const hasActive = goals.some(g => g.status === 'em_andamento')
  const currentView: View = view ?? (hasActive ? 'sessao' : 'metas')
  function setView(v: View) {
    setViewState(v)
    setVisited(prev => (prev.has(v) ? prev : new Set(prev).add(v)))
  }

  function fail(res: { denied: boolean; message: string }, what: string): false {
    if (res.denied) setBlocked(true)
    showToast('error', res.denied
      ? 'Este recurso ainda não está liberado para gravar nesta clínica. Avise o suporte.'
      : `Não foi possível ${what}. Tente de novo.`)
    return false
  }

  const addGoalLocal = (g: Goal) => setData(d => ({ ...d, goals: [...d.goals, g] }))
  const putGoalLocal = (g: Goal) => setData(d => ({ ...d, goals: d.goals.map(x => (x.id === g.id ? g : x)) }))
  const putLogLocal = (l: GoalLog) => setData(d => ({ ...d, logs: d.logs.some(x => x.id === l.id) ? d.logs.map(x => (x.id === l.id ? l : x)) : [...d.logs, l] }))

  async function onCreate(input: api.GoalInput) {
    const res = await api.createGoal({ ...input, clinicId: clinic.id, patientId: patient.id, area, professionalId, sortOrder: goals.length })
    if (!res.ok) return fail(res, 'salvar a meta')
    addGoalLocal(res.data)
    showToast('ok', 'Meta salva.')
    return true
  }

  async function onUpdate(id: string, patch: Parameters<typeof api.updateGoal>[1]) {
    const res = await api.updateGoal(id, patch)
    if (!res.ok) return fail(res, 'salvar a meta')
    putGoalLocal(res.data)
    return true
  }

  async function onSetResult(goalId: string, date: string, result: GoalResult) {
    const existing = logs.filter(l => l.goal_id === goalId && l.log_date === date).slice(-1)[0]
    if (existing?.result === result) return
    const res = existing
      ? await api.updateLog(existing.id, { result })
      : await api.addLog({ clinicId: clinic.id, patientId: patient.id, goalId, date, result, note: null, professionalId })
    if (!res.ok) { fail(res, 'registrar o resultado'); return }
    putLogLocal(res.data)
  }

  async function onSaveNote(logId: string, note: string) {
    const res = await api.updateLog(logId, { note: note || null })
    if (!res.ok) { fail(res, 'salvar a nota'); return }
    putLogLocal(res.data)
  }

  async function onUndo(logId: string) {
    const res = await api.deleteLog(logId)
    if (!res.ok) { fail(res, 'desfazer o registro'); return }
    setData(d => ({ ...d, logs: d.logs.filter(l => l.id !== logId) }))
  }

  async function saveAssessment(kind: AssessmentKind, args: { id?: string; date: string; data: unknown }): Promise<Assessment | null> {
    const res = await api.saveAssessment({ id: args.id, clinicId: clinic.id, patientId: patient.id, kind, date: args.date, data: args.data, professionalId })
    if (!res.ok) { fail(res, 'salvar a avaliação'); return null }
    setData(d => ({ ...d, assessments: d.assessments.some(a => a.id === res.data.id) ? d.assessments.map(a => (a.id === res.data.id ? res.data : a)) : [...d.assessments, res.data] }))
    showToast('ok', 'Avaliação salva.')
    return res.data
  }

  async function deleteAssessment(id: string): Promise<boolean> {
    const ok = await confirmDialog({
      title: 'Excluir avaliação?',
      message: 'Essa avaliação será removida do histórico e do gráfico. Isso não pode ser desfeito.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      danger: true,
    })
    if (!ok) return false
    const res = await api.deleteAssessment(id)
    if (!res.ok) return fail(res, 'excluir a avaliação')
    setData(d => ({ ...d, assessments: d.assessments.filter(a => a.id !== id) }))
    return true
  }

  if (state === 'loading') return <p className={styles.loading}>Carregando...</p>

  if (state === 'missing') {
    return (
      <div className={styles.notice} role="status">
        <Icon name="info" size={18} />
        <div>
          <div className={styles.noticeTitle}>{profile.tabLabel} ainda não está disponível</div>
          Este recurso está sendo liberado e ainda não foi ativado para esta clínica. O restante do prontuário funciona normalmente.
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return <ErrorNotice title="Não foi possível carregar" message="Os dados do plano terapêutico não carregaram. Verifique a conexão e tente de novo." onRetry={retry} />
  }

  const council = councilForProfessional({ specialtyType: professional?.specialty_type ?? area, specialty: professional?.specialty, clinicType: clinic.type })
  const proInfo = professional
    ? { name: professional.name, registration: formatRegistration(council, professional.registration_number) }
    : user?.displayName ? { name: user.displayName, registration: '' } : null

  const tabs: { value: View; label: string }[] = [
    { value: 'sessao', label: 'Registrar sessão' },
    { value: 'metas', label: area === 'fono' || area === 'to' ? `Metas (${profile.planAcronym})` : 'Metas' },
    { value: 'evolucao', label: 'Evolução' },
    ...(area === 'fono' ? [{ value: 'fonemico' as View, label: 'Quadro fonêmico' }] : []),
    ...(area === 'to' ? [{ value: 'avd' as View, label: 'Checklist de AVD' }] : []),
    { value: 'relatorio', label: 'Relatório' },
  ]

  return (
    <div className={styles.wrap}>
      {blocked && (
        <div className={styles.notice} role="status">
          <Icon name="info" size={18} />
          <div>
            <div className={styles.noticeTitle}>Gravação ainda não liberada</div>
            O banco ainda não liberou a gravação do plano terapêutico para esta clínica. O que você marcou agora não foi salvo.
          </div>
        </div>
      )}
      {areaOptions.length > 1 && (
        <PillTabs label="Área do plano terapêutico" value={area} onChange={a => void changeArea(a)}
          options={areaOptions.map(a => ({ value: a, label: AREA_NOME[a] }))} />
      )}
      <PillTabs label="Seções do plano terapêutico" value={currentView} onChange={setView} options={tabs} />

      {currentView === 'sessao' && (
        <RegistroSessao area={area} goals={goals} logs={logs} today={today}
          onSetResult={onSetResult} onSaveNote={onSaveNote} onUndo={onUndo} onGoToMetas={() => setView('metas')} />
      )}
      {currentView === 'metas' && <MetasLista area={area} goals={goals} logs={logs} onCreate={onCreate} onUpdate={onUpdate} />}
      {currentView === 'evolucao' && <Evolucao area={area} goals={goals} logs={logs} />}
      {area === 'fono' && (currentView === 'fonemico' || visited.has('fonemico')) && (
        <div style={{ display: currentView === 'fonemico' ? undefined : 'none' }}>
          <QuadroFonemico today={today} assessments={data.assessments} onDirtyChange={handleDirty}
            onSave={a => saveAssessment('quadro_fonemico', a)} onDelete={deleteAssessment} />
        </div>
      )}
      {area === 'to' && (currentView === 'avd' || visited.has('avd')) && (
        <div style={{ display: currentView === 'avd' ? undefined : 'none' }}>
          <ChecklistAvd today={today} assessments={data.assessments} onDirtyChange={handleDirty}
            onSave={a => saveAssessment('checklist_avd', a)} onDelete={deleteAssessment} />
        </div>
      )}
      {currentView === 'relatorio' && (
        <RelatorioEvolutivo area={area} goals={goals} logs={logs} assessments={data.assessments}
          clinic={{ name: clinic.name, address: clinic.address, phone: clinic.phone }}
          patient={{ name: patient.name, birth_date: patient.birth_date }} professional={proInfo} />
      )}
    </div>
  )
}
