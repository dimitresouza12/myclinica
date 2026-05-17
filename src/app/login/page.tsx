'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { Clinic, ClinicUser, AuthClinic, AuthUser } from '@/types'
import styles from './login.module.css'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

type Mode = 'login' | 'register'

const CLINIC_TYPES = [
  { value: 'odonto',   label: 'Odontologia', emoji: '🦷' },
  { value: 'medico',   label: 'Medicina',    emoji: '🩺' },
  { value: 'estetica', label: 'Estética',    emoji: '✨' },
  { value: 'vet',      label: 'Veterinária', emoji: '🐾' },
] as const

type ClinicTypeValue = typeof CLINIC_TYPES[number]['value']

const PLANS = [
  { value: 'basico', label: 'Básico', desc: 'Agenda, pacientes, financeiro e estoque', emoji: '🌱' },
  { value: 'plus',   label: 'Plus',   desc: 'Tudo do Básico + CRM e integração WhatsApp IA', emoji: '⭐' },
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
  plan: PlanValue
}

function normalizeUsername(raw: string) {
  return raw
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_.-]/g, '')
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
  const [mode, setMode] = useState<Mode>(() =>
    searchParams.get('mode') === 'register' ? 'register' : 'login'
  )
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/login`,
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
  const BLANK_REG: RegisterForm = { clinic_type: '', clinic_name: '', admin_name: '', username: '', email: '', password: '', phone: '', plan: 'basico' }
  const [reg, setReg] = useState<RegisterForm>(BLANK_REG)
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState(false)
  const [regLoading, setRegLoading] = useState(false)

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
          <p className={styles.error}>
            ⚠️ Variáveis de ambiente não configuradas.<br />
            NEXT_PUBLIC_SUPABASE_URL: {SUPABASE_URL ? '✓' : '✗'}<br />
            NEXT_PUBLIC_SUPABASE_ANON_KEY: {SUPABASE_KEY ? '✓' : '✗'}
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
        const { data: foundEmail, error: lookupErr } = await supabase
          .rpc('get_email_by_username', { p_username: email.toLowerCase() })
        if (lookupErr) { console.error('lookup error:', lookupErr); throw new Error('Erro ao buscar usuário.') }
        if (!foundEmail) throw new Error('Usuário ou senha incorretos.')
        email = foundEmail as string
      }

      setStep('Verificando senha...')
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) {
        recordFailure(cred)
        throw new Error('Usuário ou senha incorretos.')
      }

      setStep('Carregando clínica...')
      const { data: clinicUser, error: cuErr } = await supabase
        .from('clinic_users').select('*, clinics(*)')
        .eq('user_id', authData.user.id).eq('is_active', true)
        .maybeSingle<ClinicUser & { clinics: Clinic }>()
      if (cuErr) { console.error('clinic_users error:', cuErr); throw new Error('Erro ao carregar dados da clínica.') }
      if (!clinicUser || !clinicUser.clinics) throw new Error('Usuário sem clínica associada. Contate o suporte.')

      // Bloqueia login se a clínica ainda está aguardando aprovação ou foi suspensa
      const clinicStatus = clinicUser.clinics.status
      if (clinicStatus === 'pending') {
        await supabase.auth.signOut()
        throw new Error('Sua clínica está aguardando aprovação do administrador. Você receberá um aviso quando for liberada.')
      }
      if (clinicStatus === 'suspended') {
        await supabase.auth.signOut()
        throw new Error('Esta clínica está suspensa. Entre em contato com o suporte para regularizar.')
      }
      if (clinicStatus === 'inactive') {
        await supabase.auth.signOut()
        throw new Error('Esta clínica está inativa.')
      }

      const clinic: AuthClinic = {
        id: clinicUser.clinic_id, name: clinicUser.clinics.name,
        type: clinicUser.clinics.clinic_type, logo: clinicUser.clinics.logo_url ?? '',
        address: clinicUser.clinics.address ?? '', phone: clinicUser.clinics.phone ?? '',
        color: clinicUser.clinics.primary_color ?? '#0D9488', slug: clinicUser.clinics.slug,
        plan: (clinicUser.clinics.plan === 'plus' ? 'plus' : 'basico'),
        status: clinicStatus,
        trialEndsAt: clinicUser.clinics.trial_ends_at ?? null,
        gcalConnected: clinicUser.clinics.gcal_connected ?? false,
      }
      const user: AuthUser = {
        id: clinicUser.user_id, role: clinicUser.role,
        displayName: clinicUser.display_name, isSuperAdmin: clinicUser.is_superadmin,
      }

      clearRateLimit(cred)
      setStep('Abrindo painel...')
      setSession(clinic, user)
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
    if (!reg.clinic_type)   return setRegError('Selecione o tipo de clínica.')
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
      if (!authData.session) {
        // Email confirmation required by Supabase Auth — user must confirm before clinic can be linked
        throw new Error('Confirme seu e-mail para concluir o cadastro e depois faça login.')
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
      })
      if (rpcErr) {
        console.error('register_clinic_and_admin error:', rpcErr)
        if (rpcErr.message.includes('slug_taken')) throw new Error('Já existe uma clínica com esse nome. Tente um nome diferente.')
        if (rpcErr.message.includes('username_taken')) throw new Error('Esse nome de usuário já está em uso. Escolha outro.')
        if (rpcErr.message.includes('username_invalid')) throw new Error('Nome de usuário inválido. Use 3-30 caracteres (letras minúsculas, números, _ . -).')
        if (rpcErr.message.includes('user_already_linked')) throw new Error('Este e-mail já está vinculado a uma clínica.')
        throw new Error('Erro ao criar clínica. Tente novamente.')
      }

      await supabase.auth.signOut()
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
      <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandName}>My<strong>Clinica</strong></span>
          <p className={styles.brandSub}>Gestão clínica inteligente</p>
        </div>

        <div className={styles.modeTabs}>
          <button className={`${styles.modeTab} ${mode === 'login' ? styles.modeTabActive : ''}`} onClick={() => setMode('login')}>
            Entrar
          </button>
          <button className={`${styles.modeTab} ${mode === 'register' ? styles.modeTabActive : ''}`} onClick={() => { setMode('register'); setRegError(''); setRegSuccess(false) }}>
            Cadastrar
          </button>
        </div>

        {mode === 'login' && showReset ? (
          <div className={styles.form}>
            {resetSent ? (
              <div className={styles.successBox}>
                <div className={styles.successIcon}>✉️</div>
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
              <label htmlFor="credential">Usuário ou E-mail</label>
              <input id="credential" type="text" value={credential}
                onChange={e => setCredential(e.target.value)}
                placeholder="usuario ou email@clinica.com" required autoComplete="username" />
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
          </form>
        ) : regSuccess ? (
          <div className={styles.successBox}>
            <div className={styles.successIcon}>⏳</div>
            <h3 className={styles.successTitle}>Solicitação enviada!</h3>
            <p className={styles.successMsg}>
              Seu cadastro foi recebido e está <strong>aguardando aprovação</strong> do administrador.<br /><br />
              Você poderá acessar o painel assim que sua clínica for aprovada — basta tentar fazer login novamente.
            </p>
            <button className={styles.btnOutline} onClick={() => { setMode('login'); setRegSuccess(false); setReg(BLANK_REG) }}>
              Voltar ao login
            </button>
          </div>
        ) : (
          <form onSubmit={handleRegister} className={styles.form}>
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
                    <span className={styles.planEmoji}>{p.emoji}</span>
                    <span className={styles.planLabel}>{p.label}</span>
                    <span className={styles.planDesc}>{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>

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
                    <span className={styles.typeEmoji}>{t.emoji}</span>
                    <span className={styles.typeLabel}>{t.label}</span>
                  </button>
                ))}
              </div>
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

            {regError && <p className={styles.error}>{regError}</p>}
            <p className={styles.regNote}>Ao criar sua conta você concorda com os termos de uso. Plano trial gratuito por 7 dias</p>
            <button type="submit" className={styles.btn} disabled={regLoading}>
              {regLoading ? 'Criando clínica...' : 'Criar minha clínica'}
            </button>
          </form>
        )}
      </div>
      <p className={styles.madeby}>
        feito por{' '}
        <a href="https://otimizai.net.br" target="_blank" rel="noopener noreferrer" className={styles.madebyLink}>
          Otimiza AÍ
        </a>
      </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }} />}>
      <LoginContent />
    </Suspense>
  )
}
