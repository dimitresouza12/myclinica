'use client'
import { useState, useEffect, Suspense } from 'react'
import Image from 'next/image'
import { Newsreader } from 'next/font/google'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import { normalizeUsername } from '@/lib/username'
import { getSpecialtyConfig, CLINIC_TYPE_OPTIONS, CLINIC_TYPE_ICON_OPTIONS } from '@/lib/specialtyConfig'
import { MEDICO_AREA_OPTIONS } from '@/lib/medicoSpecialties'
import type { Clinic, ClinicUser, AuthClinic, AuthUser, ClinicPlan, ClinicType } from '@/types'
import styles from './login.module.css'
import { Icon } from '@/components/ui/Icon'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Serifada só pro título do painel esquerdo (login.module.css usa a CSS var
// abaixo) — o resto do app continua em Inter, herdado do layout global.
const newsreader = Newsreader({ subsets: ['latin'], style: ['italic', 'normal'], weight: ['400', '500'], variable: '--font-newsreader' })

type Mode = 'login' | 'register' | 'quiz'

// Primeira pergunta do quiz usa ícone+cor+label de CLINIC_TYPE_ICON_OPTIONS
// (specialtyConfig.ts) — fonte única, sem lista literal duplicada aqui.
const QUIZ_SPECIALTY_OPTIONS = CLINIC_TYPE_ICON_OPTIONS

const QUIZ_STEPS = [
  {
    question: 'Qual é a especialidade da sua clínica?',
    options: QUIZ_SPECIALTY_OPTIONS,
  },
  {
    question: 'Como você trabalha?',
    options: [
      { value: 'solo',  label: 'Só eu', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      )},
      { value: 'small', label: 'Pequena equipe (2 a 4)', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      )},
      { value: 'large', label: '5 ou mais profissionais', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
      )},
    ],
  },
  {
    question: 'Quantos pacientes atende por mês?',
    options: [
      { value: 'few',    label: 'Até 100 pacientes', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
      )},
      { value: 'medium', label: 'Entre 100 e 300', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      )},
      { value: 'many',   label: 'Mais de 300', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4"/><circle cx="17" cy="7" r="4"/><path d="M21 21v-2a4 4 0 0 0-4-4h-1"/><path d="M13 11h4"/></svg>
      )},
    ],
  },
  {
    question: 'Como você usa financeiro e relatórios?',
    options: [
      { value: 'basic',      label: 'Registro básico de entradas e saídas', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
      )},
      { value: 'financeiro', label: 'Financeiro completo e controle de equipe', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      )},
      { value: 'relatorios', label: 'Relatórios, metas e análise do negócio', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      )},
    ],
  },
  {
    question: 'Quantas unidades você atende?',
    options: [
      { value: 'single', label: 'Só uma', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      )},
      { value: 'multi',  label: 'Mais de uma (ou planejo expandir)', icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><path d="M6 7V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3"/></svg>
      )},
    ],
  },
] as const

function calcPlan(answers: string[]): 'essencial' | 'avancado' | 'completo' {
  const [, team, patients, features, units] = answers
  if (units === 'multi' || team === 'large' || patients === 'many' || features === 'relatorios') return 'completo'
  if (team === 'small' || patients === 'medium' || features === 'financeiro') return 'avancado'
  return 'essencial'
}

const PLAN_INFO: Record<string, { label: string; price: string; why: string; color: string }> = {
  essencial: { label: 'Essencial', price: 'R$ 99/mês',     why: 'Perfeito para profissionais autônomos que precisam organizar agenda e prontuários.',     color: '#0D9488' },
  avancado:  { label: 'Avançado',  price: 'R$ 119,90/mês', why: 'Ideal para equipes em crescimento com controle financeiro e relatórios avançados.',      color: '#0891b2' },
  completo:  { label: 'Completo',  price: 'R$ 129,90/mês', why: 'Feito para clínicas com múltiplas unidades, equipes grandes e gestão completa.',          color: '#7c3aed' },
}

// Fonte única do rótulo de cada área — vem de specialtyConfig.ts, não
// duplicado aqui (era o caso antes; qualquer área nova só precisa ser
// adicionada lá).
const CLINIC_TYPES = CLINIC_TYPE_OPTIONS

type ClinicTypeValue = ClinicType

const PLANS = [
  { value: 'essencial', label: 'Essencial',  price: 'R$ 99/mês',      desc: 'Agenda, prontuário, financeiro básico e 1 usuário' },
  { value: 'avancado',  label: 'Avançado',   price: 'R$ 119,90/mês',  desc: 'Tudo do Essencial + equipe, relatórios e pacientes ilimitados' },
  { value: 'completo',  label: 'Completo',   price: 'R$ 129,90/mês',  desc: 'Tudo do Avançado + multi-clínica e usuários ilimitados' },
] as const

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

function formatCpf(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function LoginContent() {
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
    if (searchParams.get('quiz') === 'true') return 'quiz'
    const planParam = searchParams.get('plan')
    if (planParam === 'essencial' || planParam === 'avancado' || planParam === 'completo') return 'register'
    if (searchParams.get('mode') === 'register') return 'register'
    return 'login'
  })
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  // Quiz state
  const [quizStep, setQuizStep] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<string[]>([])
  const [quizResult, setQuizResult] = useState<'essencial' | 'avancado' | 'completo' | null>(null)
  // Fase antes das QUIZ_STEPS indexadas: primeiro pergunta se a clínica tem
  // mais de uma área (evita a pessoa ficar em dúvida na pergunta de tipo
  // único, que é pulada de vez quando a resposta é "sim"). isMultiSpecialty
  // e selectedSpecialties (declarados mais abaixo) são reaproveitados aqui e
  // seguem populados quando o quiz termina e cai no formulário de cadastro.
  const [quizPhase, setQuizPhase] = useState<'ask-multi' | 'multi-select' | 'medico-area' | 'questions'>('ask-multi')

  function handleQuizAnswer(value: string) {
    const next = [...quizAnswers, value]
    setQuizAnswers(next)
    if (quizStep === 0 && value === 'medico') {
      // Bloco F: próxima pergunta é a sub-área médica, antes de seguir pro resto do quiz.
      setQuizPhase('medico-area')
      return
    }
    if (next.length < QUIZ_STEPS.length) {
      setQuizStep(quizStep + 1)
    } else {
      setQuizResult(calcPlan(next))
    }
  }

  function handleQuizMedicoAreaContinue() {
    if (!medicoArea) return
    if (medicoArea === 'Outra' && !medicoAreaOther.trim()) return
    setQuizPhase('questions')
    setQuizStep(1)
  }

  function handleQuizMultiAnswer(isMulti: boolean) {
    setIsMultiSpecialty(isMulti)
    setQuizPhase(isMulti ? 'multi-select' : 'questions')
  }

  function toggleQuizSpecialty(value: ClinicType) {
    setSelectedSpecialties(prev => {
      const next = prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
      setReg(p => ({ ...p, clinic_type: next[0] ?? '' }))
      return next
    })
  }

  function handleQuizMultiSelectContinue() {
    if (selectedSpecialties.length === 0) return
    setQuizAnswers([selectedSpecialties[0]])
    if (selectedSpecialties.includes('medico')) {
      setQuizPhase('medico-area')
    } else {
      setQuizStep(1)
      setQuizPhase('questions')
    }
  }

  function handleQuizBack() {
    if (quizPhase === 'medico-area') {
      setMedicoArea('')
      setMedicoAreaOther('')
      if (isMultiSpecialty) {
        setQuizPhase('multi-select')
      } else {
        setQuizPhase('questions')
        setQuizAnswers([])
      }
      return
    }
    if (quizPhase === 'multi-select') {
      setQuizPhase('ask-multi')
      setIsMultiSpecialty(null)
      setSelectedSpecialties([])
      return
    }
    if (quizStep === 0) {
      setQuizPhase('ask-multi')
      setIsMultiSpecialty(null)
      return
    }
    if (quizStep === 1 && isMultiSpecialty) {
      setQuizPhase('multi-select')
      setQuizStep(0)
      setQuizAnswers([])
      return
    }
    setQuizStep(s => s - 1)
    setQuizAnswers(a => a.slice(0, -1))
  }

  function startQuiz() {
    setQuizStep(0)
    setQuizAnswers([])
    setQuizResult(null)
    setQuizPhase('ask-multi')
    setIsMultiSpecialty(null)
    setSelectedSpecialties([])
    setMode('quiz')
  }

  function goToRegisterFromQuiz(plan: 'essencial' | 'avancado' | 'completo') {
    const clinicType = quizAnswers[0] as ClinicTypeValue | undefined
    setReg(prev => ({ ...prev, plan, ...(clinicType ? { clinic_type: clinicType } : {}) }))
    setQuizStep(0)
    setQuizAnswers([])
    setQuizResult(null)
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

  // Register state
  const BLANK_REG: RegisterForm = { clinic_type: '', clinic_name: '', admin_name: '', username: '', email: '', password: '', phone: '', cpf: '', plan: 'essencial' }
  const [reg, setReg] = useState<RegisterForm>(() => {
    const planParam = searchParams.get('plan')
    if (planParam === 'essencial' || planParam === 'avancado' || planParam === 'completo') {
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
  // Pergunta fica em primeiro lugar no formulário (antes do tipo de clínica)
  // justamente pra quem tem várias áreas não ficar em dúvida na etapa de tipo
  // único. null = ainda não respondeu (bloqueia avançar pro resto do form).
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
  const needsMedicoArea = isMultiSpecialty === false ? reg.clinic_type === 'medico' : selectedSpecialties.includes('medico')
  // No quiz, a sub-área médica vira uma pergunta extra logo após escolher
  // "Médico" — soma 1 ao total de perguntas só quando ela vai aparecer.
  const medicoAskedInQuiz = quizAnswers[0] === 'medico' || (isMultiSpecialty === true && selectedSpecialties.includes('medico'))
  const QUIZ_TOTAL_DOTS = QUIZ_STEPS.length + 1 + (medicoAskedInQuiz ? 1 : 0)
  const [couponInput, setCouponInput] = useState('')
  const couponUpper = couponInput.trim().toUpperCase()
  const couponValid = couponUpper === 'COPA50'
  const couponInvalid = couponUpper.length > 0 && !couponValid
  const [showTerms, setShowTerms] = useState(false)

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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStep('')

    const cred = credential.trim()
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
        const rpcArg  = isCpf ? { p_cpf: digits } : { p_username: cred.toLowerCase() }

        const { data: foundEmail, error: lookupErr } = await supabase.rpc(rpcName, rpcArg)
        if (lookupErr) { console.error('lookup error:', lookupErr); throw new Error('Erro ao buscar usuário.') }
        if (!foundEmail) throw new Error('Usuário ou senha incorretos.')
        email = foundEmail as string
      }

      setStep('Verificando senha...')
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
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
      const { data: clinicUser, error: cuErr } = await supabase
        .from('clinic_users').select('*, clinics(*)')
        .eq('user_id', authData.user.id).eq('is_active', true)
        .maybeSingle<ClinicUser & { clinics: Clinic }>()
      if (cuErr) { console.error('clinic_users error:', cuErr); throw new Error('Erro ao carregar dados da clínica.') }
      if (!clinicUser) throw new Error('Usuário sem clínica associada. Contate o suporte.')

      // ── Superadmin: sessão independente, sem vínculo com nenhuma clínica ──
      if (clinicUser.is_superadmin) {
        const user: AuthUser = {
          id: clinicUser.user_id, clinicUserId: clinicUser.id, role: 'superadmin', specialtyType: null,
          displayName: clinicUser.display_name, isSuperAdmin: true,
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
      }
      const user: AuthUser = {
        id: clinicUser.user_id, clinicUserId: clinicUser.id, role: clinicUser.role,
        specialtyType: (clinicUser as unknown as { specialty_type: ClinicType | null }).specialty_type ?? null,
        displayName: clinicUser.display_name, isSuperAdmin: clinicUser.is_superadmin,
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

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError('')

    if (!reg.plan)           return setRegError('Selecione o plano.')
    if (isMultiSpecialty === null) return setRegError('Diga se sua clínica atende mais de uma área.')
    if (isMultiSpecialty && selectedSpecialties.length === 0) return setRegError('Marque pelo menos uma área.')
    if (!reg.clinic_type)   return setRegError('Selecione o tipo de clínica.')
    if (needsMedicoArea && !medicoArea) return setRegError('Diga em qual área da medicina você atua.')
    if (needsMedicoArea && medicoArea === 'Outra' && !medicoAreaOther.trim()) return setRegError('Digite a área da medicina.')
    if (founderIsProfessional === null) return setRegError('Diga se você também atende pacientes pessoalmente.')
    if (founderHasTeam === null)        return setRegError('Diga se você vai ter mais gente usando o sistema com você.')
    if (!acceptedTerms)     return setRegError('Você precisa aceitar os Termos de Uso para continuar.')
    const cpfDigits = reg.cpf.replace(/\D/g, '')
    if (cpfDigits.length !== 11) return setRegError('CPF inválido. Digite os 11 dígitos.')
    if (!reg.clinic_name.trim()) return setRegError('Nome da clínica é obrigatório.')
    if (!reg.admin_name.trim())  return setRegError('Seu nome é obrigatório.')
    const usernameClean = normalizeUsername(reg.username)
    if (usernameClean.length < 3 || usernameClean.length > 30) return setRegError('Nome de usuário deve ter 3-30 caracteres (letras minúsculas, números, _ . -).')
    if (!reg.email.trim())       return setRegError('E-mail é obrigatório.')
    if (reg.password.length < 6) return setRegError('Senha deve ter pelo menos 6 caracteres.')

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

        const suggestions = getSpecialtyConfig(reg.clinic_type).procedureSuggestions
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
      if (couponValid) localStorage.setItem('promoCoupon', couponUpper)
      setRegSuccess(true)
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
    <div className={styles.page}>

      {/* ── Coluna esquerda ── */}
      <div className={`${styles.left} ${newsreader.variable}`}>
        <a href="https://myclinica.online" className={styles.leftLogo} style={{ textDecoration: 'none' }}>
          <Image src="/logoMyClinica.png" alt="MyClínica" width={36} height={36} className={styles.leftLogoImg} priority />
          <span className={styles.leftLogoName}>My<strong>Clínica</strong></span>
        </a>

        <p className={styles.leftKicker}>
          Sistema de gestão clínica <span className={styles.leftKickerLine} />
        </p>
        <h1 className={styles.leftHeadline}>
          O cuidado é seu.<br />A <em>burocracia</em> é nossa.
        </h1>
        <p className={styles.leftSub}>
          Agenda, prontuário, financeiro e equipe em um só lugar — para você passar mais tempo com o paciente e menos com a papelada.
        </p>

        <div className={styles.features}>
          <span className={styles.feature}>Agenda</span>
          <span className={styles.feature}>Prontuário eletrônico</span>
          <span className={styles.feature}>Financeiro</span>
          <span className={styles.feature}>Estoque</span>
          <span className={styles.feature}>Equipe</span>
        </div>

        <p className={styles.trust}><strong>+50 clínicas</strong> já usam o MyClínica — odontologia, medicina, fisioterapia, nutrição e mais 5 áreas.</p>

        <svg className={styles.leftPulse} viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 38 H150 l14-26 12 46 14-56 11 36 10-12 h24 l12 12 H600" fill="none" stroke="#4DD9C0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* ── Promoções ── */}
        <div className={styles.promos}>

          {/* Indicação */}
          <div className={styles.promoIndica}>
            <div className={styles.promoIndicaBody}>
              <p className={styles.promoIndicaTag}>Programa de indicação</p>
              <p className={styles.promoIndicaDesc}>
                Foi indicado ou indicou alguém? Entre em contato para efetivar sua vantagem.
              </p>
            </div>
            <a
              href="https://wa.me/5588920020570?text=Olá!%20Gostaria%20de%20efetivar%20minha%20vantagem%20de%20indicação."
              target="_blank"
              rel="noopener noreferrer"
              className={styles.promoIndicaBtn}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M11.99 0C5.373 0 0 5.373 0 11.99c0 2.117.554 4.102 1.523 5.828L0 24l6.335-1.498A11.942 11.942 0 0 0 11.99 24C18.607 24 24 18.627 24 11.99 24 5.373 18.607 0 11.99 0zm0 21.818a9.812 9.812 0 0 1-5.012-1.371l-.36-.214-3.733.882.939-3.619-.235-.372A9.808 9.808 0 0 1 2.18 11.99c0-5.41 4.4-9.81 9.81-9.81 5.41 0 9.81 4.4 9.81 9.81 0 5.41-4.4 9.828-9.81 9.828z"/>
              </svg>
              WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* ── Coluna direita ── */}
      <div className={styles.right}>
      <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.brandLogoRow}>
            <Image src="/logoMyClinica.png" alt="MyClínica" width={34} height={34} className={styles.brandLogoImg} />
            <span className={styles.brandName}>My<strong>Clínica</strong></span>
          </div>
          <p className={styles.brandSub}>Gestão clínica inteligente</p>
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
                  <input id="newPassword" type="password" value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="new-password" />
                </div>
                <div className={styles.field}>
                  <label htmlFor="newPasswordConfirm">Confirmar nova senha</label>
                  <input id="newPasswordConfirm" type="password" value={newPasswordConfirm}
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
            <div className={styles.field}>
              <label htmlFor="credential">Usuário, e-mail ou CPF</label>
              <input id="credential" type="text" value={credential}
                onChange={e => setCredential(e.target.value)}
                placeholder="usuário, email@clinica.com ou 000.000.000-00" required autoComplete="username" />
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Senha</label>
              <input id="password" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password" />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            {step && <p className={styles.step}>{step}</p>}
            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? (step || 'Autenticando...') : 'Entrar'}
            </button>
            <button type="button" className={styles.btnLink} onClick={() => { setShowReset(true); setResetError(''); setResetSent(false) }}>
              Esqueci minha senha
            </button>
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
              /* ── Resultado ── */
              <>
                <div className={styles.quizResultBadge} style={{ background: PLAN_INFO[quizResult].color }}>
                  Recomendado para você
                </div>
                <div className={styles.quizResultCard} style={{ borderColor: PLAN_INFO[quizResult].color }}>
                  <p className={styles.quizResultPlan} style={{ color: PLAN_INFO[quizResult].color }}>
                    {PLAN_INFO[quizResult].label}
                  </p>
                  <p className={styles.quizResultPrice}>{PLAN_INFO[quizResult].price}</p>
                  <p className={styles.quizResultWhy}>{PLAN_INFO[quizResult].why}</p>
                  <button
                    className={styles.btn}
                    style={{ background: PLAN_INFO[quizResult].color, marginTop: '0.5rem' }}
                    onClick={() => goToRegisterFromQuiz(quizResult)}
                  >
                    Começar grátis com plano {PLAN_INFO[quizResult].label} <Icon name="chevronRight" size={13} />
                  </button>
                </div>
                <p className={styles.quizAlt}>Prefere outro plano?</p>
                <div className={styles.quizAltPlans}>
                  {(Object.keys(PLAN_INFO) as Array<'essencial'|'avancado'|'completo'>)
                    .filter(p => p !== quizResult)
                    .map(p => (
                      <button key={p} className={styles.quizAltBtn} onClick={() => goToRegisterFromQuiz(p)}>
                        {PLAN_INFO[p].label} · {PLAN_INFO[p].price}
                      </button>
                    ))
                  }
                </div>
                <button className={styles.btnLink} onClick={() => { setQuizResult(null); setQuizStep(0); setQuizAnswers([]) }}>
                  Refazer questionário
                </button>
              </>
            ) : quizPhase === 'ask-multi' ? (
              /* ── Fase 0: sua clínica atende mais de uma área? ── */
              <>
                <div className={styles.quizProgress}>
                  {Array.from({ length: QUIZ_TOTAL_DOTS }).map((_, i) => (
                    <div key={i} className={`${styles.quizProgressDot} ${i === 0 ? styles.quizProgressDotActive : ''}`} />
                  ))}
                </div>
                <p className={styles.quizStepLabel}>Pergunta 1 de {QUIZ_TOTAL_DOTS}</p>
                <h3 className={styles.quizQuestion}>Sua clínica atende mais de uma área (ex: odontologia e estética)?</h3>
                <div className={styles.quizOptions}>
                  <button className={styles.quizOption} onClick={() => handleQuizMultiAnswer(false)}>
                    <span className={styles.quizOptionLabel}>Não, só uma área</span>
                  </button>
                  <button className={styles.quizOption} onClick={() => handleQuizMultiAnswer(true)}>
                    <span className={styles.quizOptionLabel}>Sim, mais de uma</span>
                  </button>
                </div>
                <button className={styles.btnLink} onClick={() => setMode('login')}>
                  Cancelar
                </button>
              </>
            ) : quizPhase === 'multi-select' ? (
              /* ── Fase 0b: quais áreas (só quando respondeu "sim" acima) ── */
              <>
                <div className={styles.quizProgress}>
                  {Array.from({ length: QUIZ_TOTAL_DOTS }).map((_, i) => (
                    <div key={i} className={`${styles.quizProgressDot} ${i <= 1 ? styles.quizProgressDotActive : ''}`} />
                  ))}
                </div>
                <p className={styles.quizStepLabel}>Pergunta 2 de {QUIZ_TOTAL_DOTS}</p>
                <h3 className={styles.quizQuestion}>Quais áreas?</h3>
                <div className={styles.typeGrid}>
                  {CLINIC_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      className={`${styles.typeCard} ${selectedSpecialties.includes(t.value) ? styles.typeCardActive : ''}`}
                      onClick={() => toggleQuizSpecialty(t.value)}
                    >
                      <span className={styles.typeLabel}>{t.label}</span>
                    </button>
                  ))}
                </div>
                {selectedSpecialties.length > 0 && (
                  <span className={styles.slugHint}>Área principal: {getSpecialtyConfig(selectedSpecialties[0]).roles.find(r => !['recepcao', 'auxiliar', 'admin'].includes(r.value))?.label ?? selectedSpecialties[0]} (a primeira marcada).</span>
                )}
                <button
                  className={styles.btn}
                  style={{ marginTop: '0.75rem' }}
                  disabled={selectedSpecialties.length === 0}
                  onClick={handleQuizMultiSelectContinue}
                >
                  Continuar <Icon name="chevronRight" size={13} />
                </button>
                <button className={styles.btnLink} onClick={handleQuizBack}>
                  <Icon name="chevronLeft" size={13} /> Voltar
                </button>
              </>
            ) : quizPhase === 'medico-area' ? (
              /* ── Bloco F: sub-área médica, logo após escolher "Médico" ── */
              <>
                <div className={styles.quizProgress}>
                  {Array.from({ length: QUIZ_TOTAL_DOTS }).map((_, i) => (
                    <div key={i} className={`${styles.quizProgressDot} ${i <= 2 ? styles.quizProgressDotActive : ''}`} />
                  ))}
                </div>
                <p className={styles.quizStepLabel}>Pergunta 3 de {QUIZ_TOTAL_DOTS}</p>
                <h3 className={styles.quizQuestion}>Em qual área da medicina você atua?</h3>
                <div className={styles.typeGrid}>
                  {MEDICO_AREA_OPTIONS.map(area => (
                    <button
                      key={area}
                      type="button"
                      className={`${styles.typeCard} ${medicoArea === area ? styles.typeCardActive : ''}`}
                      onClick={() => setMedicoArea(area)}
                    >
                      <span className={styles.typeLabel}>{area}</span>
                    </button>
                  ))}
                </div>
                {medicoArea === 'Outra' && (
                  <input
                    className={styles.fieldInput}
                    style={{ marginTop: '0.5rem' }}
                    placeholder="Qual área?"
                    value={medicoAreaOther}
                    onChange={e => setMedicoAreaOther(e.target.value)}
                  />
                )}
                <button
                  className={styles.btn}
                  style={{ marginTop: '0.75rem' }}
                  disabled={!medicoArea || (medicoArea === 'Outra' && !medicoAreaOther.trim())}
                  onClick={handleQuizMedicoAreaContinue}
                >
                  Continuar <Icon name="chevronRight" size={13} />
                </button>
                <button className={styles.btnLink} onClick={handleQuizBack}>
                  <Icon name="chevronLeft" size={13} /> Voltar
                </button>
              </>
            ) : (
              /* ── Perguntas indexadas (QUIZ_STEPS) ── */
              <>
                <div className={styles.quizProgress}>
                  {Array.from({ length: QUIZ_TOTAL_DOTS }).map((_, i) => (
                    <div key={i} className={`${styles.quizProgressDot} ${i <= quizStep + 1 + (medicoAskedInQuiz && quizStep >= 1 ? 1 : 0) ? styles.quizProgressDotActive : ''}`} />
                  ))}
                </div>
                <p className={styles.quizStepLabel}>Pergunta {quizStep + 2 + (medicoAskedInQuiz && quizStep >= 1 ? 1 : 0)} de {QUIZ_TOTAL_DOTS}</p>
                <h3 className={styles.quizQuestion}>{QUIZ_STEPS[quizStep].question}</h3>
                {quizStep === 0 ? (
                  <div className={styles.specialtyGrid}>
                    {QUIZ_STEPS[0].options.map(opt => (
                      <button key={opt.value} type="button" className={styles.specialtyCard} onClick={() => handleQuizAnswer(opt.value)}>
                        <span className={styles.specialtyIcon} style={{ background: `rgba(${opt.color},0.12)`, color: `rgb(${opt.color})` }}>
                          {opt.icon}
                        </span>
                        <span className={styles.typeLabel}>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.quizOptions}>
                    {QUIZ_STEPS[quizStep].options.map(opt => (
                      <button key={opt.value} className={styles.quizOption} onClick={() => handleQuizAnswer(opt.value)}>
                        <span className={styles.quizOptionIcon}>{opt.icon}</span>
                        <span className={styles.quizOptionLabel}>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button className={styles.btnLink} onClick={handleQuizBack}>
                  <Icon name="chevronLeft" size={13} /> Voltar
                </button>
                <button className={styles.btnLink} onClick={() => setMode('login')}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        )}

      </div>
      {mode === 'login' && !showReset && (
        <div className={styles.trialCta} onClick={startQuiz}>
          <div className={styles.trialCtaText}>
            <span className={styles.trialCtaBadge}>7 dias grátis</span>
            <p className={styles.trialCtaHeadline}>Ainda não tem conta?</p>
            <p className={styles.trialCtaSub}>Descubra o plano ideal em 3 perguntas.</p>
          </div>
          <span className={styles.trialCtaBtn}>Começar agora <Icon name="chevronRight" size={13} /></span>
        </div>
      )}

      {/* ── Promoções mobile ── */}
      <div className={styles.promosMobile}>
        <div className={styles.promoIndica}>
          <div className={styles.promoIndicaBody}>
            <p className={styles.promoIndicaTag}>Programa de indicação</p>
            <p className={styles.promoIndicaDesc}>
              Foi indicado ou indicou alguém? Entre em contato para efetivar sua vantagem.
            </p>
          </div>
          <a
            href="https://wa.me/5588920020570?text=Olá!%20Gostaria%20de%20efetivar%20minha%20vantagem%20de%20indicação."
            target="_blank"
            rel="noopener noreferrer"
            className={styles.promoIndicaBtn}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M11.99 0C5.373 0 0 5.373 0 11.99c0 2.117.554 4.102 1.523 5.828L0 24l6.335-1.498A11.942 11.942 0 0 0 11.99 24C18.607 24 24 18.627 24 11.99 24 5.373 18.607 0 11.99 0zm0 21.818a9.812 9.812 0 0 1-5.012-1.371l-.36-.214-3.733.882.939-3.619-.235-.372A9.808 9.808 0 0 1 2.18 11.99c0-5.41 4.4-9.81 9.81-9.81 5.41 0 9.81 4.4 9.81 9.81 0 5.41-4.4 9.828-9.81 9.828z"/>
            </svg>
            WhatsApp
          </a>
        </div>
      </div>

      </div>
      </div>

      {/* ── Modal de Cadastro ── */}
      {mode === 'register' && (
        <div className={styles.registerOverlay} onClick={() => { setMode('quiz'); setRegError('') }}>
          <div className={styles.registerModal} onClick={e => e.stopPropagation()}>
            <div className={styles.registerModalHeader}>
              <div>
                <p className={styles.registerModalTitle}>Criar sua clínica</p>
                {reg.plan && (
                  <p className={styles.registerModalPlan}>
                    Plano {PLANS.find(p => p.value === reg.plan)?.label} · {PLANS.find(p => p.value === reg.plan)?.price}
                  </p>
                )}
              </div>
              <button
                className={styles.registerModalClose}
                onClick={() => { setMode('quiz'); setRegError('') }}
                aria-label="Fechar"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className={styles.registerModalBody}>
              {regSuccess ? (
                <div className={styles.successBox}>
                  <div className={styles.successIcon}><Icon name="checkCircle" size={24} /></div>
                  <h3 className={styles.successTitle}>Clínica criada!</h3>
                  <p className={styles.successMsg}>
                    Sua clínica está pronta. Você tem <strong>7 dias grátis</strong> para explorar tudo.<br /><br />
                    Faça login agora com o e-mail e senha que você acabou de cadastrar.
                  </p>
                  <button className={styles.btnOutline} onClick={() => { setMode('login'); setRegSuccess(false); setReg(BLANK_REG) }}>
                    Fazer login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRegister} className={styles.form}>
                  <p className={styles.dedupHint}>
                    Sua clínica já usa o MyClínica? Não crie uma conta nova — peça para quem administra te cadastrar em <strong>Configurações → Equipe</strong>.
                  </p>

                  <div className={styles.field}>
                    <label>Escolha seu plano *</label>
                    <div className={styles.planGrid}>
                      {PLANS.map(p => (
                        <button
                          key={p.value}
                          type="button"
                          className={`${styles.planCard} ${reg.plan === p.value ? styles.planCardActive : ''}`}
                          onClick={() => setReg(prev => ({ ...prev, plan: p.value }))}
                        >
                          <span className={styles.planLabel}>{p.label}</span>
                          <span className={styles.planPrice}>{p.price}</span>
                          <span className={styles.planDesc}>{p.desc}</span>
                        </button>
                      ))}
                    </div>
                    <span className={styles.slugHint}>7 dias grátis em qualquer plano — sem cartão de crédito</span>
                  </div>

                  <div className={styles.field}>
                    <label>Sua clínica atende mais de uma área (ex: odontologia e estética)? *</label>
                    <div className={styles.statusBtnGroup}>
                      <button
                        type="button"
                        className={`${styles.statusChoiceBtn} ${isMultiSpecialty === false ? styles.statusChoiceBtnActive : ''}`}
                        onClick={() => { setIsMultiSpecialty(false); setSelectedSpecialties([]) }}
                      >
                        Não, só uma área
                      </button>
                      <button
                        type="button"
                        className={`${styles.statusChoiceBtn} ${isMultiSpecialty === true ? styles.statusChoiceBtnActive : ''}`}
                        onClick={() => setIsMultiSpecialty(true)}
                      >
                        Sim, mais de uma
                      </button>
                    </div>
                    <span className={styles.slugHint}>Se sim, marque abaixo todas as áreas que a clínica atende — não precisa ser exato, dá para ajustar depois em Equipe.</span>
                  </div>

                  {isMultiSpecialty === false && (
                    <div className={styles.field}>
                      <label>Tipo de clínica *</label>
                      <div className={styles.typeGrid}>
                        {CLINIC_TYPES.map(t => (
                          <button
                            key={t.value}
                            type="button"
                            className={`${styles.typeCard} ${reg.clinic_type === t.value ? styles.typeCardActive : ''}`}
                            onClick={() => setReg(p => ({ ...p, clinic_type: t.value }))}
                          >
                            <span className={styles.typeLabel}>{t.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {isMultiSpecialty === true && (
                    <div className={styles.field}>
                      <label>Quais áreas? *</label>
                      <div className={styles.typeGrid}>
                        {CLINIC_TYPES.map(t => {
                          const active = selectedSpecialties.includes(t.value)
                          return (
                            <button
                              key={t.value}
                              type="button"
                              className={`${styles.typeCard} ${active ? styles.typeCardActive : ''}`}
                              onClick={() => setSelectedSpecialties(prev => {
                                const next = prev.includes(t.value) ? prev.filter(v => v !== t.value) : [...prev, t.value]
                                setReg(p => ({ ...p, clinic_type: next[0] ?? '' }))
                                return next
                              })}
                            >
                              <span className={styles.typeLabel}>{t.label}</span>
                            </button>
                          )
                        })}
                      </div>
                      {selectedSpecialties.length > 0 && (
                        <span className={styles.slugHint}>Área principal: {getSpecialtyConfig(selectedSpecialties[0]).roles.find(r => !['recepcao', 'auxiliar', 'admin'].includes(r.value))?.label ?? selectedSpecialties[0]} (a primeira marcada — dá pra trocar desmarcando e marcando na outra ordem).</span>
                      )}
                    </div>
                  )}

                  {needsMedicoArea && (
                    <div className={styles.field}>
                      <label>Em qual área da medicina você atua? *</label>
                      <div className={styles.typeGrid}>
                        {MEDICO_AREA_OPTIONS.map(area => (
                          <button
                            key={area}
                            type="button"
                            className={`${styles.typeCard} ${medicoArea === area ? styles.typeCardActive : ''}`}
                            onClick={() => setMedicoArea(area)}
                          >
                            <span className={styles.typeLabel}>{area}</span>
                          </button>
                        ))}
                      </div>
                      {medicoArea === 'Outra' && (
                        <input
                          className={styles.fieldInput}
                          style={{ marginTop: '0.5rem' }}
                          placeholder="Qual área?"
                          value={medicoAreaOther}
                          onChange={e => setMedicoAreaOther(e.target.value)}
                        />
                      )}
                    </div>
                  )}

                  <div className={styles.field}>
                    <label>
                      Você também atende pacientes pessoalmente
                      {reg.clinic_type && ` (é ${getSpecialtyConfig(reg.clinic_type).roles.find(r => !['recepcao', 'auxiliar', 'admin'].includes(r.value))?.label ?? 'profissional'}`}
                      {reg.clinic_type && ', além de administrar)'}?
                    </label>
                    <div className={styles.statusBtnGroup}>
                      <button type="button" className={`${styles.statusChoiceBtn} ${founderIsProfessional === true ? styles.statusChoiceBtnActive : ''}`} onClick={() => setFounderIsProfessional(true)}>Sim</button>
                      <button type="button" className={`${styles.statusChoiceBtn} ${founderIsProfessional === false ? styles.statusChoiceBtnActive : ''}`} onClick={() => setFounderIsProfessional(false)}>Não</button>
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label>Tem outras pessoas que vão usar o sistema com você (ou vai ter em breve)?</label>
                    <div className={styles.statusBtnGroup}>
                      <button type="button" className={`${styles.statusChoiceBtn} ${founderHasTeam === false ? styles.statusChoiceBtnActive : ''}`} onClick={() => setFounderHasTeam(false)}>Só eu por enquanto</button>
                      <button type="button" className={`${styles.statusChoiceBtn} ${founderHasTeam === true ? styles.statusChoiceBtnActive : ''}`} onClick={() => setFounderHasTeam(true)}>Sim, tenho equipe</button>
                    </div>
                    <span className={styles.slugHint}>Você será a pessoa responsável por esta conta e por dar acesso aos demais da equipe.</span>
                  </div>

                  <div className={styles.field}>
                    <label>Nome da clínica *</label>
                    <input
                      type="text"
                      value={reg.clinic_name}
                      onChange={e => setReg(p => ({ ...p, clinic_name: e.target.value }))}
                      placeholder="Ex: Clínica Sorriso"
                      required
                    />
                    {reg.clinic_name && (
                      <span className={styles.slugHint}>myclinica.app/{toSlug(reg.clinic_name)}</span>
                    )}
                  </div>

                  <div className={styles.field}>
                    <label>Seu nome (responsável) *</label>
                    <input
                      type="text"
                      value={reg.admin_name}
                      onChange={e => setReg(p => ({ ...p, admin_name: e.target.value }))}
                      placeholder="Dr. João Silva"
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Nome de usuário (para login) *</label>
                    <input
                      type="text"
                      value={reg.username}
                      onChange={e => setReg(p => ({ ...p, username: normalizeUsername(e.target.value) }))}
                      placeholder="ex: drjoao"
                      autoComplete="username"
                      required
                    />
                    <span className={styles.slugHint}>
                      {reg.username ? `Login: ${reg.username}` : '3-30 caracteres: letras minúsculas, números, _ . -'}
                    </span>
                  </div>

                  <div className={styles.field}>
                    <label>E-mail *</label>
                    <input
                      type="email"
                      value={reg.email}
                      onChange={e => setReg(p => ({ ...p, email: e.target.value }))}
                      placeholder="contato@clinica.com"
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Senha *</label>
                    <input
                      type="password"
                      value={reg.password}
                      onChange={e => setReg(p => ({ ...p, password: e.target.value }))}
                      placeholder="mín. 6 caracteres"
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Telefone</label>
                    <input
                      type="tel"
                      value={reg.phone}
                      onChange={e => setReg(p => ({ ...p, phone: e.target.value }))}
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  <div className={styles.field}>
                    <label>CPF *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={reg.cpf}
                      onChange={e => setReg(p => ({ ...p, cpf: formatCpf(e.target.value) }))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      required
                    />
                    <span className={styles.slugHint}>Você poderá usar o CPF para fazer login</span>
                  </div>

                  <div className={styles.field}>
                    <label>Código promocional</label>
                    <div className={styles.couponRow}>
                      <input
                        type="text"
                        value={couponInput}
                        onChange={e => setCouponInput(e.target.value)}
                        placeholder="Ex: COPA50"
                        maxLength={20}
                        className={couponValid ? styles.inputValid : couponInvalid ? styles.inputInvalid : ''}
                      />
                      {couponValid && <span className={styles.couponBadge}><Icon name="check" size={11} /> 50% na 1ª mensalidade</span>}
                      {couponInvalid && <span className={styles.couponError}>Código inválido</span>}
                    </div>
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
                      {' '}— trial gratuito por 7 dias
                    </span>
                  </label>

                  {regError && <p className={styles.error}>{regError}</p>}
                  <button type="submit" className={styles.btn} disabled={regLoading || !acceptedTerms}>
                    {regLoading ? 'Criando clínica...' : 'Criar minha clínica'}
                  </button>
                  <button type="button" className={styles.btnLink} onClick={() => { setMode('login'); setRegError(''); setRegSuccess(false) }}>
                    Já tenho conta — Entrar
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Terms overlay dentro do modal */}
          {showTerms && (
            <div className={styles.termsOverlay} onClick={() => setShowTerms(false)}>
              <div className={styles.termsModal} onClick={e => e.stopPropagation()}>
                <div className={styles.termsHeader}>
                  <h2 className={styles.termsTitle}>Termos de Uso — My Clinica</h2>
                  <button className={styles.termsClose} onClick={() => setShowTerms(false)}><Icon name="close" size={16} /></button>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }} />}>
      <LoginContent />
    </Suspense>
  )
}
