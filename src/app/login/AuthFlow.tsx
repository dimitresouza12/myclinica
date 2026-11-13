'use client'
import { useState, useEffect, useId, useRef } from 'react'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import { normalizeUsername } from '@/lib/username'
import { getSpecialtyConfig, CLINIC_TYPE_OPTIONS } from '@/lib/specialtyConfig'
import { MEDICO_AREA_OPTIONS } from '@/lib/medicoSpecialties'
import { PLAN_CATALOG } from '@/lib/planCatalog'
import type { Clinic, ClinicUser, AuthClinic, AuthUser, ClinicPlan, ClinicType } from '@/types'
import styles from './login.module.css'
import { Icon } from '@/components/ui/Icon'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { CpfInput } from '@/components/ui/NumericInput'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { cpfInputError, maskLoginCredential } from '@/lib/numericFormat'
import { phoneInputError, caretAfterDigits } from '@/lib/phoneFormat'
import { DemoApp } from '@/components/demo/DemoApp'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Logotype } from '@/components/login/Logotype'
import { LoginShowcase } from '@/components/login/LoginShowcase'
import { LiveTicker } from '@/components/login/LiveTicker'
import { HeartbeatProgress } from '@/components/login/HeartbeatProgress'
import { hasLegacyTrialParams } from '@/lib/legacyTrialLink'

// Fonte da tela de login (título, formulário e vitrine). Variável: um arquivo por estilo.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-jakarta', display: 'swap' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Busca clinic_users direto no PostgREST com o access_token que o
// signInWithPassword já devolveu, em vez de deixar o supabase-js pedir a
// sessão de novo (o que passa pelo navigator.locks e pode ficar preso
// disputando o lock entre abas). Timeout próprio + 1 retry: sem isso, uma
// rede instável trava a tela em "Carregando dados..." para sempre, sem
// mensagem e sem saída (era exatamente o sintoma relatado por uma cliente).
async function fetchClinicUserOnce(accessToken: string, userId: string): Promise<(ClinicUser & { clinics: Clinic; professionals: { id: string }[] }) | null> {
  const url = `${SUPABASE_URL}/rest/v1/clinic_users?select=*,clinics(*),professionals(id)&user_id=eq.${userId}&is_active=eq.true`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) throw new Error(`clinic_users_http_${res.status}`)
  const rows = (await res.json()) as (ClinicUser & { clinics: Clinic; professionals: { id: string }[] })[]
  return rows[0] ?? null
}
async function fetchClinicUserWithRetry(accessToken: string, userId: string) {
  try {
    return await fetchClinicUserOnce(accessToken, userId)
  } catch {
    return await fetchClinicUserOnce(accessToken, userId)
  }
}

type Mode = 'login' | 'register' | 'quiz'

const svgp = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

// A primeira pergunta do quiz (áreas) tem tela própria; estas são as três que decidem o plano.
// `reason` é a frase que o resultado usa para dizer em que resposta ele se baseou.
const QUIZ_STEPS = [
  {
    name: 'Equipe',
    question: 'Quantas pessoas vão usar o sistema?',
    sub: 'Contando com você.',
    options: [
      { value: 'solo',  label: 'Só eu', hint: 'Atendo e organizo tudo sozinho(a)', reason: 'Só você usando o sistema',
        icon: <svg {...svgp}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
      { value: 'small', label: '2 a 4 pessoas', hint: 'Pequena equipe, com recepção ou sócios', reason: 'Equipe de 2 a 4 pessoas',
        icon: <svg {...svgp}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
      { value: 'large', label: '5 ou mais', hint: 'Equipe grande, vários profissionais', reason: 'Equipe de 5 pessoas ou mais',
        icon: <svg {...svgp}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },
      { value: 'multi', label: 'Mais de uma unidade', hint: 'Ou planejo abrir outra em breve', reason: 'Mais de uma unidade',
        icon: <svg {...svgp}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg> },
    ],
  },
  {
    name: 'Pacientes',
    question: 'Quantos pacientes você atende por mês?',
    sub: 'Uma ideia já ajuda, não precisa ser exato.',
    options: [
      { value: 'few',    label: 'Até 100', hint: 'Agenda tranquila, atendimento próximo', reason: 'Até 100 pacientes por mês',
        icon: <svg {...svgp}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> },
      { value: 'medium', label: 'Entre 100 e 300', hint: 'Movimento constante o mês todo', reason: 'Entre 100 e 300 pacientes por mês',
        icon: <svg {...svgp}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
      { value: 'many',   label: 'Mais de 300', hint: 'Alto volume, agenda sempre cheia', reason: 'Mais de 300 pacientes por mês',
        icon: <svg {...svgp}><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4"/><circle cx="17" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-4-4h-1"/></svg> },
    ],
  },
  {
    name: 'Prioridade',
    question: 'O que você mais precisa controlar?',
    sub: 'Escolha o que pesa mais no seu dia.',
    options: [
      { value: 'basic', label: 'Agenda e prontuário', hint: 'Marcar, confirmar e registrar atendimentos', reason: 'Agenda e prontuário em primeiro lugar',
        icon: <svg {...svgp}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg> },
      { value: 'financeiro', label: 'Financeiro e equipe', hint: 'Caixa, comissões e contas da clínica', reason: 'Financeiro e controle de equipe',
        icon: <svg {...svgp}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
      { value: 'relatorios', label: 'Relatórios e metas', hint: 'Números do negócio e crescimento', reason: 'Relatórios, metas e análise do negócio',
        icon: <svg {...svgp}><path d="M18 20V10M12 20V4M6 20v-6"/></svg> },
    ],
  },
] as const

// Mesmos sinais de sempre (tamanho de equipe, volume de pacientes, feature
// desejada, multi-unidade), agora em três respostas: "Mais de uma unidade"
// vem junto com a pergunta de equipe. O antigo bucket "completo" virou
// "ilimitado" e "avancado" virou "completo" (ver planCatalog.ts).
function calcPlan([team, patients, focus]: string[]): typeof QUIZ_PLANS[number] {
  if (team === 'multi' || team === 'large' || patients === 'many' || focus === 'relatorios') return 'ilimitado'
  if (team === 'small' || patients === 'medium' || focus === 'financeiro') return 'completo'
  return 'essencial'
}

// Completo+ fica fora do quiz/cadastro de autoatendimento — é sob consulta.
const QUIZ_PLANS = ['essencial', 'completo', 'ilimitado'] as const

// Fonte única do rótulo de cada área — vem de specialtyConfig.ts, não
// duplicado aqui (era o caso antes; qualquer área nova só precisa ser
// adicionada lá).
const CLINIC_TYPES = CLINIC_TYPE_OPTIONS

type ClinicTypeValue = ClinicType

const PLANS = QUIZ_PLANS.map(value => ({
  value,
  label: PLAN_CATALOG[value].label,
  price: PLAN_CATALOG[value].price,
  desc: PLAN_CATALOG[value].description,
}))

type PlanValue = typeof PLANS[number]['value']

interface RegisterForm {
  clinic_type: ClinicTypeValue | ''
  clinic_name: string
  admin_name: string
  username: string
  email: string
  password: string
  phone: string
  cpf: string
  plan: PlanValue
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const REG_STEP_NAMES = ['Sua clínica', 'Você', 'Acesso'] as const
const REG_STEP_TITLES = [
  ['Conte sobre a clínica', 'Leva menos de 2 minutos. Sem cartão de crédito.'],
  ['Agora, sobre você', 'Você será a pessoa responsável por esta conta.'],
  ['Crie seu acesso', 'É o que você usa para entrar no dia a dia.'],
] as const
/** Pergunta de duas respostas como controle segmentado (cada botão com 44 px ou mais). */
function RegChoice({ legend, hint, value, onChange, options }: {
  legend: string
  hint?: string
  value: boolean | null
  onChange: (v: boolean) => void
  options: { label: string; value: boolean }[]
}) {
  const id = useId()
  return (
    <div className={styles.regField} role="group" aria-labelledby={id}>
      <span id={id} className={styles.regQ}>{legend}</span>
      <div className={styles.regSeg}>
        {options.map(o => (
          <button
            key={o.label}
            type="button"
            aria-pressed={value === o.value}
            className={`${styles.regSegBtn} ${value === o.value ? styles.regSegBtnOn : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <span className={styles.regHint}>{hint}</span>}
    </div>
  )
}

/** Opções em pílulas que quebram de linha (escolha única ou várias, conforme o chamador trata o clique). */
function RegPills({ legend, hideLegend, hint, items, isOn, onToggle, showCheck }: {
  legend: string
  /** a pergunta já é o título da tela: fica só como nome do grupo para leitor de tela */
  hideLegend?: boolean
  hint?: string
  items: { value: string; label: string }[]
  isOn: (value: string) => boolean
  onToggle: (value: string) => void
  showCheck?: boolean
}) {
  const id = useId()
  return (
    <div className={styles.regField} role="group" aria-labelledby={hideLegend ? undefined : id} aria-label={hideLegend ? legend : undefined}>
      {!hideLegend && <span id={id} className={styles.regQ}>{legend}</span>}
      <div className={styles.regPills}>
        {items.map(it => {
          const on = isOn(it.value)
          return (
            <button
              key={it.value}
              type="button"
              aria-pressed={on}
              className={`${styles.regPill} ${on ? styles.regPillOn : ''}`}
              onClick={() => onToggle(it.value)}
            >
              {showCheck && on && <Icon name="check" size={14} />}
              {it.label}
            </button>
          )
        })}
      </div>
      {hint && <span className={styles.regHint}>{hint}</span>}
    </div>
  )
}

/** login: tela de entrar. demo: "Teste grátis", o quiz e o cadastro num modal sobre uma demonstração desfocada do sistema. */
export function AuthFlow({ variant }: { variant: 'login' | 'demo' }) {
  const setSession = useAuthStore((s) => s.setSession)
  const clearSession = useAuthStore((s) => s.clearSession)
  const searchParams = useSearchParams()
  const router = useRouter()

  // ── Recuperação de senha (link do e-mail) ──
  // O link enviado por resetPasswordForEmail volta pra cá com a sessão de
  // recuperação no FRAGMENTO da URL (#access_token=...&type=recovery),
  // não em query param. detectSessionInUrl está desligado no client, então
  // precisamos ler o hash e chamar setSession manualmente antes de deixar
  // a pessoa definir a nova senha. Confirmado testando um link real gerado
  // via admin.generateLink — não é o formato ?code= (PKCE).
  const [recovering, setRecovering] = useState(false)
  const [recoveryChecking, setRecoveryChecking] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [recoverySaving, setRecoverySaving] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  const [recoveryDone, setRecoveryDone] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    if (!hash || !hash.includes('type=recovery')) return
    const params = new URLSearchParams(hash.slice(1))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (!access_token || !refresh_token) return

    setRecoveryChecking(true)
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      setRecoveryChecking(false)
      if (!error) setRecovering(true)
      // Limpa o hash da URL — não deve ficar reutilizável no histórico
      router.replace('/login')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault()
    setRecoveryError('')
    if (newPassword.length < 6) { setRecoveryError('A senha precisa ter no mínimo 6 caracteres.'); return }
    if (newPassword !== newPasswordConfirm) { setRecoveryError('As senhas não coincidem.'); return }
    setRecoverySaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setRecoverySaving(false)
    if (error) { setRecoveryError('Não foi possível salvar a nova senha. Peça um novo link e tente de novo.'); return }
    await supabase.auth.signOut()
    setRecoveryDone(true)
  }

  const [mode, setMode] = useState<Mode>(() => {
    if (variant === 'login') return 'login'
    const planParam = searchParams.get('plan')
    if (planParam === 'essencial' || planParam === 'completo' || planParam === 'ilimitado') return 'register'
    if (searchParams.get('mode') === 'register') return 'register'
    return 'quiz'
  })

  // Links antigos (site, anúncios) para /login?quiz=true, ?plan=... ou ?mode=register agora vão para a demonstração.
  const legacyTrialLink = hasLegacyTrialParams(searchParams)
  useEffect(() => {
    if (variant === 'login' && legacyTrialLink) router.replace(`/experimentar?${searchParams.toString()}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null)
  useDialogFocus(variant === 'demo' ? panelEl : null)
  // vitrine só acima de 860 px (no celular nem chega a montar); abaixo disso entra a faixa "ao vivo"
  const showShowcase = useMediaQuery('(min-width: 861px)')

  function goLogin() {
    if (variant === 'demo') router.push('/login')
    else setMode('login')
  }
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  // Quiz: áreas, sub-área médica (só se "Medicina" estiver marcada) e as três perguntas do plano
  const [quizStep, setQuizStep] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<string[]>([])
  const [quizResult, setQuizResult] = useState<PlanValue | null>(null)
  const [quizPhase, setQuizPhase] = useState<'areas' | 'medico-area' | 'questions'>('areas')
  const quizTitleRef = useRef<HTMLHeadingElement>(null)
  // as respostas de área e plano que o quiz já deu (o cadastro mostra como resumo, sem perguntar de novo)
  const [areasFromQuiz, setAreasFromQuiz] = useState(false)
  const [areasOpen, setAreasOpen] = useState(false)

  function focusQuizTitle() { setTimeout(() => quizTitleRef.current?.focus(), 0) }

  function quizAreasContinue() {
    if (selectedSpecialties.length === 0) return
    setQuizStep(0)
    setQuizPhase(needsMedicoArea ? 'medico-area' : 'questions')
    focusQuizTitle()
  }

  function quizMedicoContinue() {
    if (!medicoArea) return
    if (medicoArea === 'Outra' && !medicoAreaOther.trim()) return
    setQuizStep(0)
    setQuizPhase('questions')
    focusQuizTitle()
  }

  function quizPick(value: string) {
    setQuizAnswers(prev => { const next = [...prev]; next[quizStep] = value; return next })
  }

  function quizNext() {
    if (!quizAnswers[quizStep]) return
    if (quizStep < QUIZ_STEPS.length - 1) { setQuizStep(quizStep + 1); focusQuizTitle() }
    else setQuizResult(calcPlan(quizAnswers))
  }

  function quizBack() {
    if (quizPhase === 'medico-area') { setQuizPhase('areas'); focusQuizTitle(); return }
    if (quizStep > 0) { setQuizStep(quizStep - 1); focusQuizTitle(); return }
    setQuizPhase(needsMedicoArea ? 'medico-area' : 'areas')
    focusQuizTitle()
  }

  function goToRegisterFromQuiz(plan: PlanValue) {
    setReg(prev => ({ ...prev, plan }))
    setAreasFromQuiz(true)
    setAreasOpen(false)
    setQuizResult(null)
    setQuizPhase('areas')
    setQuizStep(0)
    setMode('register')
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${appUrl}/login`,
    })
    setResetLoading(false)
    if (error) { setResetError('E-mail não encontrado ou erro ao enviar. Verifique e tente novamente.'); return }
    setResetSent(true)
  }

  // Login state
  const [credential, setCredential] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState('')
  const [loading, setLoading] = useState(false)
  // true quando o carregamento pós-login estourou o timeout mesmo após o
  // retry — mostra "Tentar novamente" / "Sair e limpar sessão" em vez de só
  // repetir o botão Entrar (o usuário já digitou a senha certa, o problema é
  // a rede, não a credencial).
  const [loginStalled, setLoginStalled] = useState(false)

  // Register state
  const BLANK_REG: RegisterForm = { clinic_type: '', clinic_name: '', admin_name: '', username: '', email: '', password: '', phone: '', cpf: '', plan: 'essencial' }
  const [reg, setReg] = useState<RegisterForm>(() => {
    const planParam = searchParams.get('plan')
    if (planParam === 'essencial' || planParam === 'completo' || planParam === 'ilimitado') {
      return { ...BLANK_REG, plan: planParam }
    }
    return BLANK_REG
  })
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)
  const [regLoading, setRegLoading] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  // Duas perguntas binárias em vez de um "qual seu cargo" de escolha única —
  // cobre o caso mais comum (profissional sozinho, que é admin e atende ao
  // mesmo tempo) sem forçar uma escolha excludente entre as duas coisas.
  const [founderIsProfessional, setFounderIsProfessional] = useState<boolean | null>(null)
  const [founderHasTeam, setFounderHasTeam] = useState<boolean | null>(null)
  // As áreas são sempre uma escolha só (uma ou várias pílulas): "atende mais de
  // uma área" é consequência de marcar mais de uma, não uma pergunta à parte.
  // A clínica também cresce pra multi-área sozinha depois (specialties[])
  // quando um usuário de área nova é criado; isso aqui só define o ponto de
  // partida e liga o seletor de área na hora de criar gente.
  const [isMultiSpecialty, setIsMultiSpecialty] = useState<boolean | null>(null)
  const [selectedSpecialties, setSelectedSpecialties] = useState<ClinicType[]>([])
  // Bloco F: sub-área médica (ex: "Cardiologia") — só perguntada quando
  // 'medico' é a (ou uma das) área(s) escolhida(s). Grava em
  // professionals.specialty do fundador em vez do rótulo genérico
  // "Médico", e é o que faz a ficha do paciente ganhar campos extras
  // (ver medicoSpecialties.ts) além da base de `medico`.
  const [medicoArea, setMedicoArea] = useState('')
  const [medicoAreaOther, setMedicoAreaOther] = useState('')
  const needsMedicoArea = selectedSpecialties.includes('medico')
  const quizTotal = 1 + (needsMedicoArea ? 1 : 0) + QUIZ_STEPS.length

  function setAreas(next: ClinicType[]) {
    setSelectedSpecialties(next)
    setIsMultiSpecialty(next.length === 0 ? null : next.length > 1)
    setReg(p => ({ ...p, clinic_type: next[0] ?? '' }))
  }
  function toggleArea(v: ClinicType) {
    setAreas(selectedSpecialties.includes(v) ? selectedSpecialties.filter(x => x !== v) : [...selectedSpecialties, v])
  }
  const areaLabel = (v: ClinicType) => CLINIC_TYPES.find(t => t.value === v)?.label ?? v
  const principalRole = (v: ClinicType) => getSpecialtyConfig(v).roles.find(r => !['recepcao', 'auxiliar', 'admin'].includes(r.value))?.label ?? areaLabel(v)
  const areasSummary = selectedSpecialties.map(v => {
    const medico = v === 'medico' ? (medicoArea === 'Outra' ? medicoAreaOther.trim() : medicoArea) : ''
    return medico ? `${areaLabel(v)} (${medico})` : areaLabel(v)
  }).reduce((acc, l, i, all) => (i === 0 ? l : i === all.length - 1 ? `${acc} e ${l}` : `${acc}, ${l}`), '')
  const [showTerms, setShowTerms] = useState(false)

  // Cadastro em três etapas (Sua clínica, Você, Acesso) dentro de um diálogo
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1)
  const [planOpen, setPlanOpen] = useState(false)
  const [registerEl, setRegisterEl] = useState<HTMLDivElement | null>(null)
  const regFirstRef = useRef<HTMLInputElement>(null)
  const regTitleRef = useRef<HTMLHeadingElement>(null)
  useDialogFocus(mode === 'register' ? registerEl : null, regFirstRef)

  // Esc fecha primeiro os Termos (se abertos) e depois o cadastro; durante o envio não fecha
  useEffect(() => {
    if (mode !== 'register') return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (showTerms) { setShowTerms(false); return }
      if (regLoading) return
      setMode('quiz'); setRegError(''); setRegStep(1); setPlanOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mode, showTerms, regLoading])

  function closeRegister() {
    if (regLoading) return
    setMode('quiz'); setRegError(''); setRegStep(1); setPlanOpen(false)
  }

  // Troca de etapa: o foco vai para o título da nova etapa (leitor de tela anuncia onde está)
  function changeStep(next: 1 | 2 | 3) {
    setRegStep(next)
    setTimeout(() => regTitleRef.current?.focus(), 0)
  }
  function goPrevStep() {
    setRegError('')
    if (regStep > 1) changeStep((regStep - 1) as 1 | 2 | 3)
  }

  /** Primeira regra quebrada, já com a etapa onde ela mora (mesmas regras e mensagens de sempre). */
  function firstRegisterError(): { step: 1 | 2 | 3; msg: string } | null {
    if (!reg.plan)           return { step: 1, msg: 'Selecione o plano.' }
    if (selectedSpecialties.length === 0) return { step: 1, msg: 'Marque pelo menos uma área.' }
    if (!reg.clinic_type)    return { step: 1, msg: 'Selecione o tipo de clínica.' }
    if (needsMedicoArea && !medicoArea) return { step: 1, msg: 'Diga em qual área da medicina você atua.' }
    if (needsMedicoArea && medicoArea === 'Outra' && !medicoAreaOther.trim()) return { step: 1, msg: 'Digite a área da medicina.' }
    if (!reg.clinic_name.trim()) return { step: 1, msg: 'Nome da clínica é obrigatório.' }
    if (!reg.admin_name.trim())  return { step: 2, msg: 'Seu nome é obrigatório.' }
    const cpfError = cpfInputError(reg.cpf, { required: true })
    if (cpfError) return { step: 2, msg: cpfError }
    const regPhoneError = phoneInputError(reg.phone)
    if (regPhoneError) return { step: 2, msg: regPhoneError }
    if (founderIsProfessional === null) return { step: 2, msg: 'Diga se você também atende pacientes pessoalmente.' }
    if (founderHasTeam === null)        return { step: 2, msg: 'Diga se você vai ter mais gente usando o sistema com você.' }
    if (!reg.email.trim())       return { step: 3, msg: 'E-mail é obrigatório.' }
    const usernameLen = normalizeUsername(reg.username).length
    if (usernameLen < 3 || usernameLen > 30) return { step: 3, msg: 'Nome de usuário deve ter 3-30 caracteres (letras minúsculas, números, _ . -).' }
    if (reg.password.length < 6) return { step: 3, msg: 'Senha deve ter pelo menos 6 caracteres.' }
    if (!acceptedTerms)     return { step: 3, msg: 'Você precisa aceitar os Termos de Uso para continuar.' }
    return null
  }

  // Rate limiting: 5 attempts → 60s lockout (persisted in localStorage)
  function getRateLimitKey(cred: string) { return `rl:${cred.toLowerCase().trim()}` }
  function isRateLimited(cred: string): number {
    try {
      const raw = localStorage.getItem(getRateLimitKey(cred))
      if (!raw) return 0
      const { count, lockedUntil } = JSON.parse(raw)
      if (lockedUntil && Date.now() < lockedUntil) return Math.ceil((lockedUntil - Date.now()) / 1000)
      if (count >= 5) return 60
    } catch { /* ignore */ }
    return 0
  }
  function recordFailure(cred: string) {
    try {
      const key = getRateLimitKey(cred)
      const raw = localStorage.getItem(key)
      const prev = raw ? JSON.parse(raw) : { count: 0 }
      const count = (prev.count ?? 0) + 1
      const lockedUntil = count >= 5 ? Date.now() + 60_000 : prev.lockedUntil
      localStorage.setItem(key, JSON.stringify({ count, lockedUntil }))
    } catch { /* ignore */ }
  }
  function clearRateLimit(cred: string) {
    try { localStorage.removeItem(getRateLimitKey(cred)) } catch { /* ignore */ }
  }

  // O middleware já redireciona no servidor; aqui cobre a navegação client-side: não pinta a tela de login
  // enquanto o router.replace acontece. Fica depois de todos os hooks.
  if (variant === 'login' && legacyTrialLink) {
    return <div className={styles.page} style={{ minHeight: '100dvh' }} />
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.error} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Icon name="alert" size={14} /> Variáveis de ambiente não configuradas.</span>
            <span>NEXT_PUBLIC_SUPABASE_URL: {SUPABASE_URL ? <Icon name="check" size={12} /> : <Icon name="close" size={12} />}</span>
            <span>NEXT_PUBLIC_SUPABASE_ANON_KEY: {SUPABASE_KEY ? <Icon name="check" size={12} /> : <Icon name="close" size={12} />}</span>
          </p>
        </div>
      </div>
    )
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    doLogin()
  }

  async function doLogin(override?: { cred: string; pass: string }) {
    setError('')
    setStep('')
    setLoginStalled(false)

    const cred = (override?.cred ?? credential).trim()
    const pass = override?.pass ?? password
    const secsLocked = isRateLimited(cred)
    if (secsLocked > 0) {
      setError(`Muitas tentativas. Aguarde ${secsLocked}s antes de tentar novamente.`)
      return
    }

    setLoading(true)
    clearSession()

    try {
      let email = cred

      if (!email.includes('@')) {
        setStep('Buscando usuário...')
        const digits = cred.replace(/\D/g, '')
        const isCpf = digits.length === 11

        const rpcName = isCpf ? 'get_email_by_cpf' : 'get_email_by_username'
        // só números que não fecham 11 dígitos são um usuário numérico (a máscara de CPF pode ter posto pontos)
        const rpcArg  = isCpf ? { p_cpf: digits } : { p_username: /^[\d.\-\s]+$/.test(cred) ? digits : cred.toLowerCase() }

        const { data: foundEmail, error: lookupErr } = await supabase.rpc(rpcName, rpcArg)
        if (lookupErr) { console.error('lookup error:', lookupErr); throw new Error('Erro ao buscar usuário.') }
        if (!foundEmail) throw new Error('Usuário ou senha incorretos.')
        email = foundEmail as string
      }

      setStep('Verificando senha...')
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (authErr) {
        recordFailure(cred)
        // Auditoria de falha de login (sem expor o motivo real)
        await audit({
          action: 'auth.login_failed',
          user_id: '00000000-0000-0000-0000-000000000000',
          clinic_id: '00000000-0000-0000-0000-000000000000',
          module: 'auth',
          details: { credential_type: cred.includes('@') ? 'email' : 'username' },
        }).catch(() => {})
        throw new Error('Usuário ou senha incorretos.')
      }

      setStep('Carregando dados...')
      let clinicUser: (ClinicUser & { clinics: Clinic; professionals: { id: string }[] }) | null
      try {
        clinicUser = await fetchClinicUserWithRetry(authData.session.access_token, authData.user.id)
      } catch (fetchErr) {
        console.error('clinic_users fetch error:', fetchErr)
        setLoginStalled(true)
        audit({
          action: 'auth.login_stalled',
          user_id: authData.user.id,
          clinic_id: '00000000-0000-0000-0000-000000000000',
          module: 'auth',
          details: { credential_type: cred.includes('@') ? 'email' : 'username' },
        }).catch(() => {})
        throw new Error('Não conseguimos carregar os dados da clínica. Verifique sua conexão e tente novamente.')
      }
      if (!clinicUser) throw new Error('Usuário sem clínica associada. Contate o suporte.')

      // ── Superadmin: sessão independente, sem vínculo com nenhuma clínica ──
      if (clinicUser.is_superadmin) {
        const user: AuthUser = {
          id: clinicUser.user_id, clinicUserId: clinicUser.id, role: 'superadmin', specialtyType: null,
          displayName: clinicUser.display_name, isSuperAdmin: true, professionalId: null,
        }
        const clinic: AuthClinic = {
          id: '__superadmin__', name: 'Administração',
          type: 'odonto', logo: '', address: '', phone: '',
          color: '#0D9488', slug: '__superadmin__',
          plan: 'plus', maxUsers: null, founderIsProfessional: null, founderHasTeam: null,
          isMultiSpecialty: false, specialties: ['odonto'], status: 'active',
          trialEndsAt: null, gcalConnected: false,
          billingPaid: true, asaasCustomerId: null, asaasSubscriptionId: null,
          billingOverdueSince: null, nextBillingDate: null, monthlyRevenueGoal: null,
          onboardingDismissed: [], onboardingModalSeen: true,
        }
        clearRateLimit(cred)
        setStep('Abrindo painel...')
        setSession(clinic, user)
        window.location.href = '/admin'
        return
      }

      if (!clinicUser.clinics) throw new Error('Usuário sem clínica associada. Contate o suporte.')

      // Bloqueia login se a clínica foi suspensa ou está inativa
      const clinicStatus = clinicUser.clinics.status
      if (clinicStatus === 'suspended') {
        await supabase.auth.signOut()
        throw new Error('Esta clínica está suspensa. Entre em contato com o suporte para regularizar.')
      }
      if (clinicStatus === 'inactive') {
        await supabase.auth.signOut()
        throw new Error('Esta clínica está inativa.')
      }

      const c = clinicUser.clinics as any
      const clinic: AuthClinic = {
        id: clinicUser.clinic_id, name: c.name,
        type: c.clinic_type, logo: c.logo_url ?? '',
        address: c.address ?? '', phone: c.phone ?? '',
        color: c.primary_color ?? '#0D9488', slug: c.slug,
        plan: (c.plan as ClinicPlan) ?? 'essencial',
        maxUsers: c.max_users ?? null,
        founderIsProfessional: c.founder_is_professional ?? null,
        founderHasTeam: c.founder_has_team ?? null,
        isMultiSpecialty: c.is_multi_specialty ?? false,
        specialties: (c.specialties?.length ? c.specialties : [c.clinic_type]) as ClinicType[],
        status: clinicStatus,
        trialEndsAt: c.trial_ends_at ?? null,
        gcalConnected: c.gcal_connected ?? false,
        billingPaid: c.billing_paid ?? false,
        asaasCustomerId: c.asaas_customer_id ?? null,
        asaasSubscriptionId: c.asaas_subscription_id ?? null,
        billingOverdueSince: c.billing_overdue_since ?? null,
        nextBillingDate: c.next_billing_date ?? null,
        monthlyRevenueGoal: c.monthly_revenue_goal ?? null,
        onboardingDismissed: c.onboarding_dismissed ?? [],
        onboardingModalSeen: c.onboarding_modal_seen ?? false,
        // clinics(*) já traz demo_mode quando a coluna existe; sem ela vem undefined
        demoMode: c.demo_mode === true,
      }
      const user: AuthUser = {
        id: clinicUser.user_id, clinicUserId: clinicUser.id, role: clinicUser.role,
        specialtyType: (clinicUser as unknown as { specialty_type: ClinicType | null }).specialty_type ?? null,
        displayName: clinicUser.display_name, isSuperAdmin: clinicUser.is_superadmin,
        professionalId: clinicUser.professionals?.[0]?.id ?? null,
        // select=* traz avatar_data quando a coluna existe; sem ela vem undefined
        avatarData: (clinicUser as unknown as { avatar_data?: string | null }).avatar_data ?? null,
      }

      clearRateLimit(cred)
      setStep('Abrindo painel...')
      setSession(clinic, user)
      // Auditoria de login bem-sucedido
      await audit({
        action: 'auth.login',
        user_id: clinicUser.user_id,
        clinic_id: clinicUser.clinic_id,
        module: 'auth',
        details: { role: clinicUser.role },
      }).catch(() => {})
      window.location.href = '/dashboard'
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg === 'Invalid login credentials' ? 'Usuário ou senha incorretos.' : msg)
      setStep('')
      setLoading(false)
    }
  }

  // Saída de emergência de uma sessão travada em "Carregando dados..." —
  // limpa o token local (que pode estar preso num lock entre abas) e devolve
  // o usuário para um login limpo, sem precisar fechar o navegador.
  async function handleClearStalledSession() {
    setLoading(true)
    try {
      // Corrida contra um timeout curto: signOut() passa pelo mesmo cliente
      // que travou — não pode ser o único caminho de saída também.
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('signout_timeout')), 5_000)),
      ])
    } catch {
      // mesmo se o signOut falhar/travar (ex: rede), limpar a sessão local
      // abaixo já resolve — não deixar essa etapa travar a saída
    }
    clearSession()
    setLoginStalled(false)
    setError('')
    setStep('')
    setLoading(false)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError('')

    // etapas 1 e 2: só valida a etapa atual e avança
    if (regStep < 3) {
      const err = firstRegisterError()
      if (err && err.step <= regStep) return setRegError(err.msg)
      changeStep((regStep + 1) as 1 | 2 | 3)
      return
    }
    // etapa 3: confere tudo; se a falha é de uma etapa anterior, volta para ela
    const err = firstRegisterError()
    if (err) {
      if (err.step !== regStep) changeStep(err.step)
      return setRegError(err.msg)
    }
    const usernameClean = normalizeUsername(reg.username)

    setRegLoading(true)
    try {
      const slug = toSlug(reg.clinic_name)

      // 1. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: reg.email.trim(),
        password: reg.password,
        options: { data: { display_name: reg.admin_name.trim() } },
      })
      if (authErr) throw new Error(authErr.message)
      if (!authData.user) throw new Error('Falha ao criar usuário.')

      // Se o Supabase exige confirmação de e-mail, não há sessão — limpa o órfão
      // e orienta o usuário a desabilitar a confirmação de e-mail nas configurações
      if (!authData.session) {
        await fetch('/api/auth/cleanup-orphan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: authData.user.id }),
        }).catch(() => {})
        throw new Error('Erro de configuração: confirmação de e-mail está ativada no servidor. Contate o suporte.')
      }

      // 2. Create clinic + admin via SECURITY DEFINER RPC (bypasses RLS atomically)
      const { error: rpcErr } = await supabase.rpc('register_clinic_and_admin', {
        p_clinic_name: reg.clinic_name.trim(),
        p_slug: slug,
        p_clinic_type: reg.clinic_type,
        p_phone: reg.phone.trim(),
        p_admin_name: reg.admin_name.trim(),
        p_username: usernameClean,
        p_email: reg.email.trim(),
        p_plan: reg.plan,
        p_cpf: reg.cpf.replace(/\D/g, '') || null,
      })
      if (rpcErr) {
        // Limpa o usuário órfão — aguarda para garantir que o e-mail seja liberado antes de exibir o erro
        await fetch('/api/auth/cleanup-orphan', {
          method: 'POST',
          headers: { authorization: `Bearer ${authData.session.access_token}` },
        }).catch(() => {})
        console.error('register_clinic_and_admin error:', rpcErr)
        if (rpcErr.message.includes('slug_taken')) throw new Error('Já existe uma clínica com esse nome. Tente um nome diferente.')
        if (rpcErr.message.includes('username_taken')) throw new Error('Esse nome de usuário já está em uso. Escolha outro.')
        if (rpcErr.message.includes('username_invalid')) throw new Error('Nome de usuário inválido. Use 3-30 caracteres (letras minúsculas, números, _ . -).')
        if (rpcErr.message.includes('user_already_linked')) throw new Error('Este e-mail já está vinculado a uma clínica.')
        if (rpcErr.message.includes('cpf_taken')) throw new Error('Este CPF já está cadastrado. Tente fazer login.')
        if (rpcErr.message.includes('cpf_invalid')) throw new Error('CPF inválido. Verifique e tente novamente.')
        throw new Error(`Erro ao criar clínica: ${rpcErr.message}`)
      }

      // 3. Semeia procedimentos comuns da especialidade — preço fica a definir (0).
      // Best-effort: se falhar, a clínica já foi criada normalmente e o usuário
      // pode cadastrar procedimentos manualmente depois.
      try {
        const { data: newClinic } = await supabase
          .from('clinics')
          .select('id')
          .eq('slug', slug)
          .single()

        // Guarda as respostas do fundador — a RPC de cadastro não está
        // versionada (só existe no banco hospedado), então gravamos com um
        // update simples logo depois, ainda com a sessão do fundador ativa
        // (ele já é admin da própria clínica).
        if (newClinic?.id) {
          await supabase.from('clinics').update({
            founder_is_professional: founderIsProfessional,
            founder_has_team: founderHasTeam,
            is_multi_specialty: isMultiSpecialty,
            specialties: isMultiSpecialty && selectedSpecialties.length ? selectedSpecialties : [reg.clinic_type],
          }).eq('id', newClinic.id)

          // Dentista/profissional sozinho já nasce agendável, sem precisar
          // se cadastrar de novo em Equipe.
          if (founderIsProfessional) {
            const { data: ownClinicUser } = await supabase
              .from('clinic_users')
              .select('id')
              .eq('clinic_id', newClinic.id)
              .eq('user_id', authData.user.id)
              .maybeSingle()
            if (ownClinicUser?.id) {
              await supabase.from('professionals').insert([{
                clinic_id: newClinic.id,
                name: reg.admin_name.trim(),
                specialty: reg.clinic_type === 'medico' && medicoArea
                  ? (medicoArea === 'Outra' ? (medicoAreaOther.trim() || null) : medicoArea)
                  : getSpecialtyConfig(reg.clinic_type || undefined).roles.find(r => !['recepcao', 'auxiliar', 'admin'].includes(r.value))?.label ?? null,
                specialty_type: reg.clinic_type || null,
                clinic_user_id: ownClinicUser.id,
              }])
              // O admin também é o profissional — mesmo sendo cargo
              // 'admin' (acesso total), guardar a área dele já deixa o
              // prontuário abrir na ficha certa sem precisar perguntar.
              await supabase.from('clinic_users').update({ specialty_type: reg.clinic_type || null }).eq('id', ownClinicUser.id)
            }
          }
        }

        const suggestions = getSpecialtyConfig(reg.clinic_type || undefined).procedureSuggestions
        if (newClinic?.id && suggestions?.length) {
          await supabase.from('procedures').insert(
            suggestions.map(s => ({
              clinic_id: newClinic.id,
              name: s.name,
              category: s.category,
              price: 0,
              is_active: true,
            }))
          )
        }
      } catch {
        // não bloqueia o cadastro — ausência de procedimentos pré-cadastrados
        // não impede o uso da clínica
      }

      await supabase.auth.signOut()
      setRegSuccess(true)
      // entra direto no sistema com a conta que acabou de criar
      void doLogin({ cred: reg.email.trim(), pass: reg.password })
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err)
      const lower = raw.toLowerCase()
      let friendly = raw
      if (raw === 'User already registered') friendly = 'Este e-mail já está cadastrado.'
      else if (lower.includes('rate limit') || lower.includes('rate-limit')) friendly = 'Muitas tentativas de cadastro neste momento. Aguarde alguns minutos e tente novamente — ou use um e-mail diferente.'
      else if (lower.includes('email') && lower.includes('valid')) friendly = 'E-mail inválido.'
      setRegError(friendly)
    } finally {
      setRegLoading(false)
    }
  }

  return (
    <div className={`${jakarta.variable} ${styles.page} ${variant === 'demo' ? styles.pageDemo : ''}`}>

      {variant === 'demo' ? (
        <>
          <div className={styles.demoStage}><DemoApp /></div>
        </>
      ) : (
        <>
          <div className={styles.bg} aria-hidden="true"><i /><i /><i /></div>
          <div className={styles.left}>
            <h1 className={styles.leftHeadline}>O cuidado é seu.<br /><em>A burocracia é nossa.</em></h1>
            {showShowcase ? <LoginShowcase /> : <LiveTicker />}
          </div>
        </>
      )}

      {/* ── Coluna direita ── */}
      <div className={styles.right}>
      <div className={styles.wrap}>
      <div
        ref={setPanelEl}
        className={styles.card}
        {...(variant === 'demo' ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Teste grátis por 7 dias', tabIndex: -1 } : {})}
      >
        <div className={styles.brand}>
          {variant === 'login' ? (
            <a href="https://myclinica.online" className={styles.brandLink} aria-label="MyClínica, site"><Logotype className={styles.brandLogotype} /></a>
          ) : (
            <Logotype className={styles.brandLogotype} />
          )}
        </div>

        {recoveryChecking ? (
          <div className={styles.form}>
            <p className={styles.resetDesc}>Validando seu link...</p>
          </div>
        ) : recovering ? (
          <div className={styles.form}>
            {recoveryDone ? (
              <div className={styles.successBox}>
                <div className={styles.successIcon}><Icon name="checkCircle" size={24} /></div>
                <h3 className={styles.successTitle}>Senha alterada!</h3>
                <p className={styles.successMsg}>Sua senha foi atualizada. Faça login com a nova senha.</p>
                <button className={styles.btnOutline} onClick={() => { setRecovering(false); setRecoveryDone(false) }}>
                  Fazer login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSetNewPassword} className={styles.form}>
                <p className={styles.resetDesc}>Escolha sua nova senha.</p>
                <div className={styles.field}>
                  <label htmlFor="newPassword">Nova senha</label>
                  <PasswordInput id="newPassword" value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="new-password" />
                </div>
                <div className={styles.field}>
                  <label htmlFor="newPasswordConfirm">Confirmar nova senha</label>
                  <PasswordInput id="newPasswordConfirm" value={newPasswordConfirm}
                    onChange={e => setNewPasswordConfirm(e.target.value)}
                    placeholder="••••••••" required autoComplete="new-password" />
                </div>
                {recoveryError && <p className={styles.error}>{recoveryError}</p>}
                <button type="submit" className={styles.btn} disabled={recoverySaving}>
                  {recoverySaving ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </form>
            )}
          </div>
        ) : mode === 'login' && showReset ? (
          <div className={styles.form}>
            {resetSent ? (
              <div className={styles.successBox}>
                <div className={styles.successIcon}><Icon name="mail" size={24} /></div>
                <h3 className={styles.successTitle}>E-mail enviado!</h3>
                <p className={styles.successMsg}>Verifique sua caixa de entrada e siga o link para redefinir sua senha.</p>
                <button className={styles.btnOutline} onClick={() => { setShowReset(false); setResetSent(false); setResetEmail('') }}>
                  Voltar ao login
                </button>
              </div>
            ) : (
              <form onSubmit={handleReset} className={styles.form}>
                <p className={styles.resetDesc}>Digite seu e-mail cadastrado e enviaremos um link para redefinir sua senha.</p>
                <div className={styles.field}>
                  <label htmlFor="resetEmail">E-mail</label>
                  <input id="resetEmail" type="email" value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    placeholder="email@clinica.com" required autoComplete="email" />
                </div>
                {resetError && <p className={styles.error}>{resetError}</p>}
                <button type="submit" className={styles.btn} disabled={resetLoading}>
                  {resetLoading ? 'Enviando...' : 'Enviar link de redefinição'}
                </button>
                <button type="button" className={styles.btnLink} onClick={() => { setShowReset(false); setResetError('') }}>
                  Voltar ao login
                </button>
              </form>
            )}
          </div>
        ) : mode === 'login' ? (
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.formHead}>
              <h2 className={styles.formTitle}>Entrar</h2>
              <p className={styles.formSub}>Bom te ver de novo.</p>
            </div>
            <div className={styles.field}>
              <label htmlFor="credential">Usuário, e-mail ou CPF</label>
              <input id="credential" type="text" value={credential}
                onChange={e => {
                  // números viram CPF na hora (123.456.789-09); letras ou @ voltam ao texto livre
                  const el = e.target
                  const next = maskLoginCredential(el.value, credential)
                  if (next !== el.value) {
                    const digitsBeforeCaret = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, '').length
                    const wasCpf = /^[\d.\-\s]*$/.test(next)
                    requestAnimationFrame(() => {
                      const pos = wasCpf ? caretAfterDigits(next, digitsBeforeCaret) : Math.min(next.length, el.selectionStart ?? next.length)
                      el.setSelectionRange(pos, pos)
                    })
                  }
                  setCredential(next)
                }}
                placeholder="usuário, email@clinica.com ou 000.000.000-00" required autoComplete="username" />
            </div>
            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label htmlFor="password">Senha</label>
                <button type="button" className={styles.inlineLink} onClick={() => { setShowReset(true); setResetError(''); setResetSent(false) }}>
                  Esqueci a senha
                </button>
              </div>
              <PasswordInput id="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password" />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            {step && <p className={styles.step}>{step}</p>}
            {loginStalled ? (
              <div className={styles.stalledActions}>
                <button type="submit" className={styles.btn} disabled={loading}>
                  {loading ? (step || 'Tentando...') : 'Tentar novamente'}
                </button>
                <button type="button" className={styles.btnSecondary} disabled={loading} onClick={handleClearStalledSession}>
                  Sair e limpar sessão
                </button>
              </div>
            ) : (
              <button type="submit" className={styles.btn} disabled={loading}>
                {loading ? (step || 'Autenticando...') : <>Entrar <Icon name="chevronRight" size={15} /></>}
              </button>
            )}
            <div className={styles.or}>ainda não usa?</div>
            <button type="button" className={styles.btnGhost} onClick={() => router.push('/experimentar')}>
              Testar 7 dias grátis
            </button>
            <a
              href="https://wa.me/5588920020570?text=Olá!%20Gostaria%20de%20efetivar%20minha%20vantagem%20de%20indicação."
              target="_blank"
              rel="noopener noreferrer"
              className={styles.referral}
            >
              Foi indicado ou indicou alguém? Fale com a gente
            </a>
            <p className={styles.madeby}>
              feito por{' '}
              <a href="https://otimizai.net.br" target="_blank" rel="noopener noreferrer" className={styles.madebyLink}>
                Otimiza AÍ
              </a>
            </p>
          </form>
        ) : null}

        {mode === 'quiz' && (
          <div className={styles.quiz}>
            {quizResult ? (
              /* ── Resultado: o plano e em que respostas ele se baseia ── */
              <>
                <HeartbeatProgress total={quizTotal} step={quizTotal + 1} />
                <div>
                  <h3 tabIndex={-1} ref={quizTitleRef} className={styles.quizQuestion}>Montamos o seu plano</h3>
                  <p className={styles.quizSub}>Com base no que você respondeu.</p>
                </div>
                <div className={styles.quizRec}>
                  <span className={styles.quizRecTag}>Recomendado para você</span>
                  <span className={styles.quizRecName}>{PLANS.find(p => p.value === quizResult)?.label}</span>
                  <span className={styles.quizRecPrice}>{PLANS.find(p => p.value === quizResult)?.price} · 7 dias grátis</span>
                  <ul className={styles.quizWhy}>
                    {QUIZ_STEPS.map((st, i) => {
                      const opt = st.options.find(o => o.value === quizAnswers[i])
                      return opt ? <li key={st.name}><Icon name="check" size={14} />{opt.reason}</li> : null
                    })}
                    {selectedSpecialties.length > 1 && (
                      <li><Icon name="check" size={14} />{areasSummary} na mesma clínica</li>
                    )}
                  </ul>
                </div>
                <button className={styles.btn} onClick={() => goToRegisterFromQuiz(quizResult)}>
                  Começar grátis com o {PLANS.find(p => p.value === quizResult)?.label} <Icon name="chevronRight" size={16} />
                </button>
                <p className={styles.quizAlt}>Prefere outro plano?</p>
                <div className={styles.quizAltPlans}>
                  {PLANS.filter(p => p.value !== quizResult).map(p => (
                    <button key={p.value} type="button" className={styles.quizAltBtn} onClick={() => goToRegisterFromQuiz(p.value)}>
                      <b>{p.label}</b><small>{p.price}</small>
                    </button>
                  ))}
                </div>
                <button type="button" className={styles.btnLink} onClick={() => { setQuizResult(null); setQuizPhase('areas'); setQuizStep(0); focusQuizTitle() }}>
                  Refazer perguntas
                </button>
              </>
            ) : (() => {
              const pos = quizPhase === 'areas' ? 1 : quizPhase === 'medico-area' ? 2 : 1 + (needsMedicoArea ? 1 : 0) + quizStep + 1
              const stepName = quizPhase === 'areas' ? 'Sua clínica' : quizPhase === 'medico-area' ? 'Medicina' : QUIZ_STEPS[quizStep].name
              const title = quizPhase === 'areas' ? 'Quais áreas a clínica atende?' : quizPhase === 'medico-area' ? 'Em qual área da medicina você atua?' : QUIZ_STEPS[quizStep].question
              const sub = quizPhase === 'areas' ? 'Marque uma ou mais. Dá para ajustar depois.' : quizPhase === 'medico-area' ? 'Isso deixa a ficha do paciente com os campos certos.' : QUIZ_STEPS[quizStep].sub
              const canContinue = quizPhase === 'areas' ? selectedSpecialties.length > 0
                : quizPhase === 'medico-area' ? !!medicoArea && (medicoArea !== 'Outra' || !!medicoAreaOther.trim())
                : !!quizAnswers[quizStep]
              const onContinue = quizPhase === 'areas' ? quizAreasContinue : quizPhase === 'medico-area' ? quizMedicoContinue : quizNext
              const last = quizPhase === 'questions' && quizStep === QUIZ_STEPS.length - 1
              return (
                <>
                  <div className={styles.quizMeta}><b>{pos} de {quizTotal}</b><span>{stepName}</span></div>
                  <HeartbeatProgress total={quizTotal} step={pos} />
                  <div>
                    <h3 tabIndex={-1} ref={quizTitleRef} className={styles.quizQuestion}>{title}</h3>
                    <p className={styles.quizSub}>{sub}</p>
                  </div>

                  {quizPhase === 'areas' && (
                    <>
                      <RegPills
                        legend={title}
                        hideLegend
                        hint={selectedSpecialties.length > 0 ? `Área principal: ${principalRole(selectedSpecialties[0])}${selectedSpecialties.length > 1 ? ', a primeira marcada' : ''}.` : undefined}
                        items={CLINIC_TYPES.map(t => ({ value: t.value, label: t.label }))}
                        isOn={v => selectedSpecialties.includes(v as ClinicType)}
                        showCheck
                        onToggle={v => toggleArea(v as ClinicType)}
                      />
                    </>
                  )}

                  {quizPhase === 'medico-area' && (
                    <>
                      <RegPills
                        legend={title}
                        hideLegend
                        items={MEDICO_AREA_OPTIONS.map(a => ({ value: a, label: a }))}
                        isOn={v => medicoArea === v}
                        onToggle={v => setMedicoArea(v)}
                      />
                      {medicoArea === 'Outra' && (
                        <div className={styles.field}>
                          <label htmlFor="quizMedicoOther">Qual área?</label>
                          <input id="quizMedicoOther" value={medicoAreaOther} onChange={e => setMedicoAreaOther(e.target.value)} placeholder="Ex: Reumatologia" />
                        </div>
                      )}
                    </>
                  )}

                  {quizPhase === 'questions' && (
                    <div className={styles.quizOptions} role="group" aria-label={title}>
                      {QUIZ_STEPS[quizStep].options.map(opt => {
                        const on = quizAnswers[quizStep] === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={on}
                            className={`${styles.quizOpt} ${on ? styles.quizOptOn : ''}`}
                            onClick={() => quizPick(opt.value)}
                          >
                            <span className={styles.quizOptIcon}>{opt.icon}</span>
                            <span className={styles.quizOptText}><b>{opt.label}</b><small>{opt.hint}</small></span>
                            <span className={styles.quizRadio} aria-hidden="true" />
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className={styles.quizBtns}>
                    {pos > 1 && <button type="button" className={styles.regBack} onClick={quizBack}>Voltar</button>}
                    <button type="button" className={styles.btn} disabled={!canContinue} onClick={onContinue}>
                      {last ? 'Ver meu plano' : 'Continuar'} <Icon name="chevronRight" size={16} />
                    </button>
                  </div>
                  <p className={styles.regNote}>
                    Já tem conta?{' '}
                    <button type="button" className={styles.regNoteLink} onClick={goLogin}>Entrar</button>
                  </p>
                </>
              )
            })()}
          </div>
        )}

      </div>
      </div>
      </div>

      {/* ── Modal de Cadastro ── */}
      {mode === 'register' && (
        <div className={styles.registerOverlay} ref={setRegisterEl}>
          <div
            className={styles.registerModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="regTitle"
          >
            <div className={styles.regHead}>
              <div className={styles.regTop}>
                <Logotype className={styles.regLogotype} />
                <button type="button" className={styles.registerModalClose} onClick={closeRegister} aria-label="Fechar">
                  <Icon name="close" size={20} />
                </button>
              </div>
              {!regSuccess && (
                <div className={styles.regSteps}>
                  <ol className={styles.regStepNames} aria-label="Etapas do cadastro">
                    {REG_STEP_NAMES.map((name, i) => {
                      const n = i + 1
                      const state = n < regStep ? 'done' : n === regStep ? 'on' : ''
                      return (
                        <li
                          key={name}
                          className={`${styles.regStepName} ${state === 'done' ? styles.regStepDone : ''} ${state === 'on' ? styles.regStepOn : ''}`}
                          aria-current={n === regStep ? 'step' : undefined}
                        >
                          <span className={styles.regStepNum}>{state === 'done' ? <Icon name="check" size={11} /> : n}</span>
                          {name}
                        </li>
                      )
                    })}
                  </ol>
                  <HeartbeatProgress total={REG_STEP_NAMES.length} step={regStep} />
                </div>
              )}
            </div>

            {regSuccess ? (
              <div className={styles.regBody}>
                <div className={styles.successBox}>
                  <div className={styles.successIcon}><Icon name="checkCircle" size={24} /></div>
                  <h3 className={styles.successTitle}>Clínica criada!</h3>
                  <p className={styles.successMsg}>
                    Sua clínica está pronta. Você tem <strong>7 dias grátis</strong> para explorar tudo.<br /><br />
                    {error ? 'Não conseguimos entrar automaticamente. Faça login com o e-mail e a senha que você acabou de cadastrar.' : 'Entrando no sistema…'}
                  </p>
                  {error && (
                    <button className={styles.btnOutline} onClick={() => { setRegSuccess(false); setReg(BLANK_REG); setRegStep(1); goLogin() }}>
                      Fazer login
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegister} className={styles.regForm} noValidate>
                <div className={styles.regBody}>
                  <div className={styles.regTitleBlock}>
                    <h2 id="regTitle" ref={regTitleRef} tabIndex={-1} className={styles.regTitle}>{REG_STEP_TITLES[regStep - 1][0]}</h2>
                    <p className={styles.regSub}>{REG_STEP_TITLES[regStep - 1][1]}</p>
                  </div>

                  {regStep === 1 && (
                    <>
                      {planOpen ? (
                        <div className={styles.regField} role="group" aria-label="Escolha seu plano">
                          <div className={styles.regPlanList}>
                            {PLANS.map(p => (
                              <button
                                key={p.value}
                                type="button"
                                aria-pressed={reg.plan === p.value}
                                className={`${styles.regPlanOpt} ${reg.plan === p.value ? styles.regPlanOptOn : ''}`}
                                onClick={() => { setReg(prev => ({ ...prev, plan: p.value })); setPlanOpen(false) }}
                              >
                                <span className={styles.regPlanOptText}><b>{p.label}</b><small>{p.desc}</small></span>
                                <span className={styles.regPlanOptPrice}>{p.price}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className={styles.regPlan}>
                          <div className={styles.regPlanText}>
                            <b>Plano {PLANS.find(p => p.value === reg.plan)?.label} · {PLANS.find(p => p.value === reg.plan)?.price}</b>
                            <small>7 dias grátis, sem cartão de crédito</small>
                          </div>
                          <button type="button" className={styles.regPlanChange} onClick={() => setPlanOpen(true)}>Trocar</button>
                        </div>
                      )}

                      {areasFromQuiz && !areasOpen && selectedSpecialties.length > 0 ? (
                        <div className={styles.regPlan}>
                          <div className={styles.regPlanText}>
                            <b>{areasSummary}</b>
                            <small>Área principal: {principalRole(selectedSpecialties[0])}</small>
                          </div>
                          <button type="button" className={styles.regPlanChange} onClick={() => setAreasOpen(true)}>Alterar</button>
                        </div>
                      ) : (
                        <>
                          <RegPills
                            legend="Quais áreas a clínica atende?"
                            hint={selectedSpecialties.length > 1
                              ? `Área principal: ${principalRole(selectedSpecialties[0])}, a primeira marcada. Para trocar, desmarque e marque na outra ordem. Dá para ajustar depois em Equipe.`
                              : 'Marque uma ou mais. Dá para ajustar depois em Equipe.'}
                            items={CLINIC_TYPES.map(t => ({ value: t.value, label: t.label }))}
                            isOn={v => selectedSpecialties.includes(v as ClinicType)}
                            showCheck
                            onToggle={v => toggleArea(v as ClinicType)}
                          />

                          {needsMedicoArea && (
                            <>
                              <RegPills
                                legend="Em qual área da medicina você atua?"
                                items={MEDICO_AREA_OPTIONS.map(a => ({ value: a, label: a }))}
                                isOn={v => medicoArea === v}
                                onToggle={v => setMedicoArea(v)}
                              />
                              {medicoArea === 'Outra' && (
                                <div className={styles.field}>
                                  <label htmlFor="regMedicoOther">Qual área?</label>
                                  <input id="regMedicoOther" value={medicoAreaOther} onChange={e => setMedicoAreaOther(e.target.value)} placeholder="Ex: Reumatologia" />
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}

                      <div className={styles.field}>
                        <label htmlFor="regClinicName">Nome da clínica</label>
                        <input
                          id="regClinicName"
                          ref={regFirstRef}
                          type="text"
                          value={reg.clinic_name}
                          onChange={e => setReg(p => ({ ...p, clinic_name: e.target.value }))}
                          placeholder="Ex: Clínica Sorriso"
                          autoComplete="organization"
                        />
                      </div>

                      <p className={styles.regAside}>
                        Sua clínica já usa o MyClínica? Não crie uma conta nova: peça a quem administra para te cadastrar em <strong>Configurações → Equipe</strong>.
                      </p>
                    </>
                  )}

                  {regStep === 2 && (
                    <>
                      <div className={styles.field}>
                        <label htmlFor="regAdminName">Seu nome</label>
                        <input
                          id="regAdminName"
                          type="text"
                          value={reg.admin_name}
                          onChange={e => setReg(p => ({ ...p, admin_name: e.target.value }))}
                          placeholder="Dr. João Silva"
                          autoComplete="name"
                        />
                      </div>

                      <div className={styles.regRow2}>
                        <div className={styles.field}>
                          <label htmlFor="regCpf">CPF</label>
                          <CpfInput id="regCpf" value={reg.cpf} onChange={v => setReg(p => ({ ...p, cpf: v }))} />
                          <span className={styles.regHint}>Também serve para entrar</span>
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="regPhone">Telefone</label>
                          <PhoneInput id="regPhone" value={reg.phone} onChange={v => setReg(p => ({ ...p, phone: v }))} />
                          <span className={styles.regHint}>Opcional</span>
                        </div>
                      </div>

                      <RegChoice
                        legend="Você também atende pacientes?"
                        hint={`Marque Sim se você é ${getSpecialtyConfig(reg.clinic_type || undefined).roles.find(r => !['recepcao', 'auxiliar', 'admin'].includes(r.value))?.label ?? 'profissional'}, além de administrar a clínica.`}
                        value={founderIsProfessional}
                        onChange={setFounderIsProfessional}
                        options={[{ label: 'Sim', value: true }, { label: 'Não', value: false }]}
                      />

                      <RegChoice
                        legend="Mais gente vai usar o sistema com você?"
                        hint="Você será a pessoa responsável pela conta e dá acesso aos demais depois, em Equipe."
                        value={founderHasTeam}
                        onChange={setFounderHasTeam}
                        options={[{ label: 'Só eu por enquanto', value: false }, { label: 'Sim, tenho equipe', value: true }]}
                      />
                    </>
                  )}

                  {regStep === 3 && (
                    <>
                      <div className={styles.field}>
                        <label htmlFor="regEmail">E-mail</label>
                        <input
                          id="regEmail"
                          type="email"
                          value={reg.email}
                          onChange={e => setReg(p => ({ ...p, email: e.target.value }))}
                          placeholder="contato@clinica.com"
                          autoComplete="email"
                        />
                      </div>

                      <div className={styles.field}>
                        <label htmlFor="regUsername">Nome de usuário</label>
                        <input
                          id="regUsername"
                          type="text"
                          value={reg.username}
                          onChange={e => setReg(p => ({ ...p, username: normalizeUsername(e.target.value) }))}
                          placeholder="ex: drjoao"
                          autoComplete="username"
                        />
                        <span className={styles.regHint}>Letras minúsculas, números, _ . - (3 a 30 caracteres).</span>
                      </div>

                      <div className={styles.field}>
                        <label htmlFor="regPassword">Senha</label>
                        <PasswordInput
                          id="regPassword"
                          value={reg.password}
                          onChange={e => setReg(p => ({ ...p, password: e.target.value }))}
                          placeholder="mín. 6 caracteres"
                          autoComplete="new-password"
                        />
                      </div>

                      <label className={styles.termsCheck}>
                        <input
                          type="checkbox"
                          checked={acceptedTerms}
                          onChange={e => setAcceptedTerms(e.target.checked)}
                        />
                        <span>
                          Li e aceito os{' '}
                          <button type="button" className={styles.termsLink} onClick={() => setShowTerms(true)}>
                            Termos de Uso
                          </button>
                          , trial gratuito por 7 dias
                        </span>
                      </label>
                    </>
                  )}
                </div>

                <div className={styles.regFoot}>
                  {regError && <p className={styles.error} role="alert">{regError}</p>}
                  <div className={styles.regBtnRow}>
                    {regStep > 1 && (
                      <button type="button" className={styles.regBack} onClick={goPrevStep} disabled={regLoading}>Voltar</button>
                    )}
                    <button key={`go-${regStep}`} type="submit" className={styles.btn} disabled={regLoading}>
                      {regStep < 3
                        ? <>Continuar <Icon name="chevronRight" size={16} /></>
                        : regLoading ? 'Criando clínica...' : 'Criar minha clínica'}
                    </button>
                  </div>
                  {regStep === 1 ? (
                    <p className={styles.regNote}>
                      Já tem conta?{' '}
                      <button type="button" className={styles.regNoteLink} onClick={() => { setRegError(''); setRegSuccess(false); goLogin() }}>Entrar</button>
                    </p>
                  ) : regStep === 3 ? (
                    <p className={styles.regNote}>Sem cartão de crédito. Cancele quando quiser.</p>
                  ) : null}
                </div>
              </form>
            )}
          </div>

          {/* Terms overlay dentro do modal */}
          {showTerms && (
            <div className={styles.termsOverlay} onClick={() => setShowTerms(false)}>
              <div className={styles.termsModal} role="dialog" aria-modal="true" aria-labelledby="termsTitle" onClick={e => e.stopPropagation()}>
                <div className={styles.termsHeader}>
                  <h2 id="termsTitle" className={styles.termsTitle}>Termos de Uso — My Clinica</h2>
                  <button className={styles.termsClose} onClick={() => setShowTerms(false)} aria-label="Fechar"><Icon name="close" size={16} /></button>
                </div>
                <div className={styles.termsBody}>
                  <p className={styles.termsDate}>Versão vigente: maio de 2026</p>
                  <h3>1. Aceitação dos Termos</h3>
                  <p>Ao se cadastrar na plataforma My Clinica, você declara ter lido, compreendido e concordado com estes Termos de Uso. Caso não concorde com qualquer disposição, não prossiga com o cadastro.</p>
                  <h3>2. Descrição do Serviço</h3>
                  <p>My Clinica é uma plataforma SaaS de gestão clínica que oferece funcionalidades de agenda, prontuário eletrônico, financeiro, estoque, CRM e integrações com ferramentas externas.</p>
                  <h3>3. Período de Teste Gratuito (Trial)</h3>
                  <p>Ao realizar o cadastro, você terá acesso gratuito à plataforma por <strong>7 (sete) dias corridos</strong>, contados a partir da aprovação do cadastro pelo administrador. Durante o trial, todas as funcionalidades do plano contratado estarão disponíveis sem custo.</p>
                  <p>Após o encerramento do período de teste, o acesso será mantido somente mediante contratação de um dos planos pagos disponíveis. Não há cobrança automática ao término do trial — o acesso simplesmente será suspenso até a regularização.</p>
                  <h3>4. Planos e Pagamentos</h3>
                  <p>Os planos disponíveis (Básico e Plus) possuem valores e condições definidos na página de planos da plataforma. Os preços podem ser alterados mediante aviso prévio de 30 dias. O não pagamento dentro do prazo acordado pode resultar na suspensão do acesso.</p>
                  <h3>5. Dados e Privacidade</h3>
                  <p>Os dados inseridos na plataforma (pacientes, prontuários, financeiro) são de propriedade da clínica cadastrada. A My Clinica não compartilha, vende ou utiliza esses dados para fins comerciais. As informações são armazenadas de forma segura, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).</p>
                  <p>O usuário é responsável por manter a confidencialidade de suas credenciais de acesso e por todas as ações realizadas em sua conta.</p>
                  <h3>6. Responsabilidades do Usuário</h3>
                  <p>O usuário compromete-se a utilizar a plataforma exclusivamente para fins lícitos, não praticar engenharia reversa, não compartilhar acessos não autorizados e manter os dados dos pacientes em conformidade com as normas do Conselho Federal de sua categoria profissional.</p>
                  <h3>7. Disponibilidade do Serviço</h3>
                  <p>A My Clinica envidará esforços para manter a plataforma disponível 24 horas por dia, 7 dias por semana. Interrupções programadas para manutenção serão comunicadas com antecedência. Não nos responsabilizamos por indisponibilidades causadas por falhas de infraestrutura de terceiros (provedores de nuvem, internet).</p>
                  <h3>8. Cancelamento</h3>
                  <p>O usuário pode solicitar o cancelamento da conta a qualquer momento pelo suporte. Dados poderão ser exportados mediante solicitação antes do encerramento definitivo da conta. Após o cancelamento, os dados serão mantidos por 30 dias e então excluídos.</p>
                  <h3>9. Limitação de Responsabilidade</h3>
                  <p>A My Clinica não se responsabiliza por decisões clínicas tomadas com base nas informações registradas na plataforma. O sistema é uma ferramenta de gestão, não substitui o julgamento profissional do usuário.</p>
                  <h3>10. Alterações nos Termos</h3>
                  <p>Estes termos podem ser atualizados periodicamente. O usuário será notificado por e-mail sobre mudanças relevantes. O uso continuado da plataforma após a notificação implica aceitação das novas condições.</p>
                  <h3>11. Contato</h3>
                  <p>Dúvidas sobre estes termos podem ser enviadas para o suporte da My Clinica.</p>
                </div>
                <div className={styles.termsFooter}>
                  <button
                    className={styles.btn}
                    onClick={() => { setAcceptedTerms(true); setShowTerms(false) }}
                  >
                    Li e aceito os Termos de Uso
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
