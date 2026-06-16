'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { connectGoogleCalendar, disconnectGoogleCalendar, isGCalConnected } from '@/lib/googleCalendar'
import type { AuthClinic, ClinicDocumentTemplate, DocumentTemplateType, ClinicUser, UserRole } from '@/types'
import styles from './configuracoes.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { showToast } from '@/components/ui/Toast'
import { Portal } from '@/components/ui/Portal'

const DOC_TEMPLATE_TYPES: { type: DocumentTemplateType; label: string }[] = [
  { type: 'receita_comum',             label: 'Receita Comum' },
  { type: 'receita_especial',          label: 'Receita Especial' },
  { type: 'declaracao_comparecimento', label: 'Declaração de Comparecimento' },
  { type: 'atestado',                  label: 'Atestado' },
]

const ROLE_LABELS: Record<UserRole, string> = {
  recepcao:   'Recepção',
  dentista:   'Dentista',
  medico:     'Médico',
  admin:      'Admin',
  superadmin: 'Superadmin',
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB

/** Redimensiona e recorta a imagem para quadrado 400x400 via Canvas */
function processLogoImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const size = 400
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      // Recorte centralizado (object-fit: cover)
      const src = Math.min(img.width, img.height)
      const sx = (img.width - src) / 2
      const sy = (img.height - src) / 2
      ctx.drawImage(img, sx, sy, src, src, 0, 0, size, size)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Falha ao processar imagem'))
      }, 'image/png', 0.92)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')) }
    img.src = url
  })
}

function planLabel(plan: string | undefined): string {
  switch (plan) {
    case 'essencial':    return 'Essencial — R$99/mês'
    case 'avancado':     return 'Avançado — R$119,90/mês'
    case 'completo':     return 'Completo — R$129,90/mês'
    case 'completo_plus':return 'Completo+'
    case 'plus':         return 'Plus'
    default:             return 'Essencial — R$99/mês'
  }
}

function normalizeUsername(raw: string) {
  return raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_.-]/g, '')
}

// Módulos disponíveis para controle de permissão
const MODULES = [
  { key: 'dashboard',     label: 'Dashboard',     icon: '' },
  { key: 'pacientes',     label: 'Pacientes',      icon: '' },
  { key: 'agenda',        label: 'Agenda',         icon: '' },
  { key: 'financeiro',    label: 'Financeiro',     icon: '' },
  { key: 'estoque',       label: 'Estoque',        icon: '' },
  { key: 'equipe',        label: 'Equipe',         icon: '' },
  { key: 'crm',           label: 'CRM',            icon: '' },
  { key: 'configuracoes', label: 'Configurações',  icon: '' },
]

interface ModulePermForm {
  can_view: boolean
  can_edit: boolean
  metadata: Record<string, unknown>
}
type PermissionsForm = Record<string, ModulePermForm>

// Opções extras configuráveis por módulo
const MODULE_EXTRAS: Record<string, { key: string; label: string }[]> = {
  financeiro: [
    { key: 'show_totals', label: 'Ver totais e gráficos financeiros' },
  ],
}

function defaultPermissions(): PermissionsForm {
  return Object.fromEntries(MODULES.map(m => {
    const extras = MODULE_EXTRAS[m.key] ?? []
    const defaultMeta = Object.fromEntries(extras.map(e => [e.key, true]))
    return [m.key, { can_view: true, can_edit: true, metadata: defaultMeta }]
  }))
}

interface UserForm {
  display_name: string
  username: string
  email: string
  password: string
  role: UserRole
}
const BLANK_USER: UserForm = { display_name: '', username: '', email: '', password: '', role: 'recepcao' }

function ConfiguracoesContent() {
  const { clinic, user, setSession, setClinicLogo } = useAuthStore()
  const [name, setName] = useState(clinic?.name ?? '')
  const [address, setAddress] = useState(clinic?.address ?? '')
  const [phone, setPhone] = useState(clinic?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError,   setBillingError]   = useState('')
  const [changingDay,    setChangingDay]     = useState(false)
  const [dueDayInput,    setDueDayInput]     = useState('')
  const [dueDayMsg,      setDueDayMsg]       = useState<{ ok: boolean; text: string } | null>(null)

  const PLAN_PRICES: Record<string, { label: string; price: string; value: number }> = {
    essencial:     { label: 'Essencial',   price: 'R$99,00/mês',      value: 99      },
    avancado:      { label: 'Avançado',    price: 'R$119,90/mês',     value: 119.90  },
    completo:      { label: 'Completo',    price: 'R$129,90/mês',     value: 129.90  },
    completo_plus: { label: 'Completo+',   price: 'R$199,00/mês',     value: 199     },
  }
  const planInfo = PLAN_PRICES[clinic?.plan ?? ''] ?? PLAN_PRICES.essencial

  async function handleSubscribe() {
    if (!clinic) return
    setBillingLoading(true)
    setBillingError('')
    try {
      const res  = await fetch('/api/asaas/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: clinic.id, clinicName: clinic.name }),
      })
      const data = await res.json()
      if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer')
      else setBillingError(data.error ?? 'Não foi possível gerar o link de pagamento.')
    } catch {
      setBillingError('Erro de conexão. Tente novamente.')
    } finally {
      setBillingLoading(false)
    }
  }

  async function handleAnticipate() {
    if (!clinic) return
    setBillingLoading(true)
    setBillingError('')
    try {
      const res  = await fetch('/api/asaas/billing-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: clinic.id, action: 'anticipate' }),
      })
      const data = await res.json()
      if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer')
      else setBillingError(data.error ?? 'Não foi possível localizar o pagamento.')
    } catch {
      setBillingError('Erro de conexão. Tente novamente.')
    } finally {
      setBillingLoading(false)
    }
  }

  async function handleChangeDueDay() {
    if (!clinic) return
    const day = parseInt(dueDayInput, 10)
    if (isNaN(day) || day < 1 || day > 28) {
      setDueDayMsg({ ok: false, text: 'Escolha um dia entre 1 e 28.' }); return
    }
    setBillingLoading(true)
    setDueDayMsg(null)
    try {
      const res  = await fetch('/api/asaas/billing-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: clinic.id, action: 'change_due_day', day }),
      })
      const data = await res.json()
      if (data.ok) {
        setDueDayMsg({ ok: true, text: data.nextDueDate ? `Próximo vencimento: ${new Date(data.nextDueDate + 'T12:00:00').toLocaleDateString('pt-BR')}` : data.message ?? 'Dia de preferência salvo.' })
        setChangingDay(false)
        setDueDayInput('')
      } else {
        setDueDayMsg({ ok: false, text: data.error ?? 'Erro ao alterar vencimento.' })
      }
    } catch {
      setDueDayMsg({ ok: false, text: 'Erro de conexão. Tente novamente.' })
    } finally {
      setBillingLoading(false)
    }
  }

  const trialExpired    = clinic?.trialEndsAt ? new Date() > new Date(clinic.trialEndsAt) : false
  const isLate          = trialExpired && !clinic?.billingPaid && !!clinic?.asaasCustomerId
  const neverSubscribed = trialExpired && !clinic?.billingPaid && !clinic?.asaasCustomerId
  const daysLeft        = clinic?.trialEndsAt && !trialExpired
    ? Math.ceil((new Date(clinic.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    : null

  function formatBillingDate(dateStr: string | null | undefined) {
    if (!dateStr) return null
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMsg, setLogoMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [gcalConnected, setGcalConnected] = useState(isGCalConnected(clinic?.gcalConnected))
  const [gcalLoading, setGcalLoading] = useState(false)
  const [gcalError, setGcalError] = useState('')

  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const [docTemplates, setDocTemplates] = useState<ClinicDocumentTemplate[]>([])
  const [docUploading, setDocUploading] = useState<DocumentTemplateType | null>(null)
  const [docMsg, setDocMsg] = useState<{ type: DocumentTemplateType; ok: boolean } | null>(null)
  const docInputRefs = useRef<Partial<Record<DocumentTemplateType, HTMLInputElement | null>>>({})

  // ── Gestão de usuários ──────────────────────────────────────
  const isAdmin = user?.role === 'admin'
  const [clinicUsers, setClinicUsers] = useState<ClinicUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<ClinicUser | null>(null)
  const [userForm, setUserForm] = useState<UserForm>(BLANK_USER)
  const [userSaving, setUserSaving] = useState(false)
  const [userMsg, setUserMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [editIsActive, setEditIsActive] = useState(true)
  const [permissionsForm, setPermissionsForm] = useState<PermissionsForm>(defaultPermissions())
  const [confirmModal, setConfirmModal] = useState<{ type: 'deactivate' | 'reactivate' | 'delete'; user: ClinicUser } | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  useEffect(() => {
    if (!clinic?.id) return
    supabase.from('clinic_document_templates').select('*').eq('clinic_id', clinic.id)
      .then(({ data }) => setDocTemplates((data ?? []) as ClinicDocumentTemplate[]))
  }, [clinic?.id])

  useEffect(() => {
    if (!clinic?.id || !isAdmin) return
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id, isAdmin])

  async function loadUsers() {
    if (!clinic?.id) return
    setUsersLoading(true)
    const { data } = await supabase
      .from('clinic_users')
      .select('*')
      .eq('clinic_id', clinic.id)
      .eq('is_superadmin', false)
      .order('created_at')
    setClinicUsers((data ?? []) as ClinicUser[])
    setUsersLoading(false)
  }

  function openNewUser() {
    setEditingUser(null)
    setUserForm(BLANK_USER)
    setPermissionsForm(defaultPermissions())
    setUserMsg(null)
    setShowUserModal(true)
  }

  async function openEditUser(u: ClinicUser) {
    setEditingUser(u)
    setUserForm({ display_name: u.display_name, username: u.username, email: u.email ?? '', password: '', role: u.role as UserRole })
    setEditIsActive(u.is_active ?? true)
    setUserMsg(null)
    // Carrega permissões existentes do banco
    const perms = defaultPermissions()
    const { data } = await supabase
      .from('clinic_user_permissions')
      .select('module, can_view, can_edit, metadata')
      .eq('clinic_user_id', u.id)
    if (data && data.length > 0) {
      // Tem permissões salvas — sobrescreve os defaults
      for (const p of data) {
        if (perms[p.module] !== undefined) {
          perms[p.module] = {
            can_view: p.can_view,
            can_edit: p.can_edit,
            metadata: (p.metadata as Record<string, unknown>) ?? {},
          }
        }
      }
    }
    setPermissionsForm(perms)
    setShowUserModal(true)
  }

  function closeUserModal() {
    setShowUserModal(false)
    setEditingUser(null)
    setUserForm(BLANK_USER)
    setPermissionsForm(defaultPermissions())
    setUserMsg(null)
  }

  async function handleConfirmAction() {
    if (!confirmModal) return
    setConfirmLoading(true)
    const { type, user: target } = confirmModal
    try {
      if (type === 'delete') {
        const { error } = await supabase.rpc('delete_clinic_member', { p_member_id: target.id })
        if (error) {
          const msg = error.message.includes('cannot_delete_self') ? 'Você não pode excluir sua própria conta.'
            : 'Erro ao excluir usuário: ' + error.message
          alert(msg)
        } else {
          await loadUsers()
        }
      } else {
        const isActive = type === 'reactivate'
        const { error } = await supabase.rpc('update_clinic_member', {
          p_member_id:    target.id,
          p_role:         target.role,
          p_is_active:    isActive,
          p_display_name: target.display_name,
        })
        if (error) {
          alert('Erro: ' + error.message)
        } else {
          await loadUsers()
        }
      }
    } finally {
      setConfirmLoading(false)
      setConfirmModal(null)
    }
  }

  async function savePermissions(memberId: string, perms: PermissionsForm) {
    const payload = Object.entries(perms).map(([module, p]) => ({
      module,
      can_view: p.can_view,
      can_edit: p.can_edit,
      metadata: p.metadata ?? {},
    }))
    await supabase.rpc('save_clinic_member_permissions', {
      p_member_id:   memberId,
      p_permissions: payload,
    })
  }

  async function handleSaveUser() {
    setUserMsg(null)
    if (!userForm.display_name.trim()) return setUserMsg({ type: 'error', text: 'Nome é obrigatório.' })
    if (!userForm.username.trim())     return setUserMsg({ type: 'error', text: 'Usuário é obrigatório.' })

    setUserSaving(true)

    if (editingUser) {
      // Atualizar membro existente
      const { error } = await supabase.rpc('update_clinic_member', {
        p_member_id:    editingUser.id,
        p_role:         userForm.role,
        p_is_active:    editIsActive,
        p_display_name: userForm.display_name.trim(),
      })
      if (error) {
        const msg = error.message.includes('cannot_deactivate_self')
          ? 'Você não pode desativar sua própria conta.'
          : 'Erro ao atualizar usuário: ' + error.message
        setUserMsg({ type: 'error', text: msg })
      } else {
        await savePermissions(editingUser.id, permissionsForm)
        closeUserModal()
        await loadUsers()
        showToast('ok', 'Usuário atualizado com sucesso!')
      }
    } else {
      // Criar novo membro
      if (!userForm.email.trim())      { setUserSaving(false); return setUserMsg({ type: 'error', text: 'E-mail é obrigatório.' }) }
      if (userForm.password.length < 6) { setUserSaving(false); return setUserMsg({ type: 'error', text: 'Senha deve ter pelo menos 6 caracteres.' }) }

      const { data: newCuId, error } = await supabase.rpc('create_clinic_member', {
        p_email:        userForm.email.trim().toLowerCase(),
        p_password:     userForm.password,
        p_display_name: userForm.display_name.trim(),
        p_username:     normalizeUsername(userForm.username),
        p_role:         userForm.role,
      })
      if (error) {
        const msg = error.message.includes('email_taken')    ? 'Este e-mail já está em uso.'
          : error.message.includes('username_taken')         ? 'Este nome de usuário já está em uso.'
          : error.message.includes('username_invalid')       ? 'Nome de usuário inválido (3-30 chars: letras, números, _ . -).'
          : 'Erro ao criar usuário: ' + error.message
        setUserMsg({ type: 'error', text: msg })
      } else {
        if (newCuId) await savePermissions(newCuId as string, permissionsForm)
        closeUserModal()
        await loadUsers()
        showToast('ok', 'Usuário criado com sucesso!')
      }
    }
    setUserSaving(false)
  }

  function initials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  }

  // ── Restante dos handlers (logo, gcal, senha, docs) ─────────
  async function handleDocUpload(type: DocumentTemplateType, file: File) {
    if (!clinic?.id) return
    setDocUploading(type)
    setDocMsg(null)
    const isPdf = file.type === 'application/pdf'
    const ext = isPdf ? 'pdf' : file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${clinic.id}/${type}.${ext}`
    const { error: upErr } = await supabase.storage.from('document-templates').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { setDocUploading(null); setDocMsg({ type, ok: false }); return }
    const { data: urlData } = supabase.storage.from('document-templates').getPublicUrl(path)
    const pdf_url = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('clinic_document_templates').upsert({ clinic_id: clinic.id, type, pdf_url }, { onConflict: 'clinic_id,type' })
    setDocTemplates(prev => {
      const rest = prev.filter(t => t.type !== type)
      return [...rest, { id: '', clinic_id: clinic.id, type, pdf_url, created_at: '', updated_at: '' }]
    })
    setDocUploading(null)
    setDocMsg({ type, ok: true })
    setTimeout(() => setDocMsg(null), 3000)
  }

  async function handleLogoUpload(file: File) {
    if (!clinic?.id) return
    setLogoMsg(null)
    if (!file.type.startsWith('image/')) {
      setLogoMsg({ ok: false, text: 'Selecione um arquivo de imagem (PNG, JPG, SVG).' })
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoMsg({ ok: false, text: 'Arquivo maior que 2 MB. Otimize a imagem antes de enviar.' })
      return
    }
    setLogoUploading(true)
    try {
      // Redimensiona e recorta para 400x400 PNG antes do upload
      const processed = await processLogoImage(file)
      const path = `${clinic.id}/logo.png`
      const { error: upErr } = await supabase.storage.from('clinic-logos').upload(path, processed, { upsert: true, contentType: 'image/png' })
      if (upErr) {
        setLogoMsg({ ok: false, text: 'Erro no upload: ' + upErr.message })
        return
      }
      const { data: urlData } = supabase.storage.from('clinic-logos').getPublicUrl(path)
      const publicUrl = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('clinics').update({ logo_url: publicUrl }).eq('id', clinic.id)
      setClinicLogo(publicUrl)
      setLogoMsg({ ok: true, text: 'Logo atualizada!' })
      setTimeout(() => setLogoMsg(null), 3000)
    } catch {
      setLogoMsg({ ok: false, text: 'Erro ao processar imagem. Tente outro arquivo.' })
    } finally {
      setLogoUploading(false)
    }
  }

  async function handleLogoRemove() {
    if (!clinic?.id) return
    if (!confirm('Remover a logo da clínica?')) return
    await supabase.from('clinics').update({ logo_url: null }).eq('id', clinic.id)
    setClinicLogo('')
    setLogoMsg({ ok: true, text: 'Logo removida.' })
    setTimeout(() => setLogoMsg(null), 3000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!clinic) return
    setSaving(true)
    await supabase.from('clinics').update({ name, address, phone }).eq('id', clinic.id)
    setSession({ ...clinic, name, address, phone }, user!)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    setSaving(false)
  }

  async function handleConnectGCal() {
    setGcalError('')
    setGcalLoading(true)
    try {
      await connectGoogleCalendar()
      setGcalConnected(true)
      setSession({ ...clinic!, gcalConnected: true } as AuthClinic, user!)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setGcalError(msg)
    } finally {
      setGcalLoading(false)
    }
  }

  async function handleDisconnectGCal() {
    await disconnectGoogleCalendar(clinic?.id)
    setGcalConnected(false)
    setSession({ ...clinic!, gcalConnected: false } as AuthClinic, user!)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (pwNew.length < 6) return setPwMsg({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' })
    if (pwNew !== pwConfirm) return setPwMsg({ type: 'error', text: 'As senhas não coincidem.' })
    setPwSaving(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const email = userData.user?.email
      if (email && pwCurrent) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: pwCurrent })
        if (signInErr) {
          setPwMsg({ type: 'error', text: 'Senha atual incorreta.' })
          setPwSaving(false)
          return
        }
      }
      const { error } = await supabase.auth.updateUser({ password: pwNew })
      if (error) throw error
      setPwMsg({ type: 'ok', text: 'Senha alterada com sucesso!' })
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
    } catch (err: unknown) {
      setPwMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao alterar senha.' })
    } finally {
      setPwSaving(false)
    }
  }

  const hasClientId = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Configurações</h1>

      {/* ── Plano & Faturamento ── */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Plano & Faturamento</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

          {/* Linha plano + status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '0.2rem' }}>Plano atual</p>
              <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {planInfo.label} — {planInfo.price}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {clinic?.billingPaid && !clinic?.billingOverdueSince && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#D1FAE5', color: '#065F46', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>
                  ✓ Ativo
                </span>
              )}
              {isLate && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#FEF3C7', color: '#92400E', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>
                  ⚠ Pagamento atrasado
                </span>
              )}
              {!!clinic?.billingOverdueSince && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#FEE2E2', color: '#991B1B', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>
                  Em atraso
                </span>
              )}
              {daysLeft !== null && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#DBEAFE', color: '#1E40AF', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>
                  Teste — {daysLeft}d restantes
                </span>
              )}
              {neverSubscribed && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#FEE2E2', color: '#991B1B', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>
                  Trial encerrado
                </span>
              )}
            </div>
          </div>

          {/* Data do próximo pagamento */}
          {clinic?.billingPaid && clinic?.nextBillingDate && (
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '0.2rem' }}>Próximo vencimento</p>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {formatBillingDate(clinic.nextBillingDate)}
              </p>
            </div>
          )}

          {/* Mudar dia do vencimento */}
          {clinic?.billingPaid && (
            <div>
              {!changingDay ? (
                <button
                  style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  onClick={() => { setChangingDay(true); setDueDayMsg(null) }}
                >
                  Mudar dia do vencimento
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>Novo dia de vencimento (1–28):</p>
                  <input
                    type="number"
                    min={1} max={28}
                    value={dueDayInput}
                    onChange={e => setDueDayInput(e.target.value)}
                    style={{ width: '4rem', padding: '0.3rem 0.5rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.9rem' }}
                    placeholder="15"
                  />
                  <button className={styles.btnSave} style={{ padding: '0.35rem 0.9rem', fontSize: '0.82rem' }} onClick={handleChangeDueDay} disabled={billingLoading}>
                    {billingLoading ? 'Salvando...' : 'Confirmar'}
                  </button>
                  <button
                    style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => { setChangingDay(false); setDueDayInput(''); setDueDayMsg(null) }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
              {dueDayMsg && (
                <p style={{ fontSize: '0.8rem', marginTop: '0.4rem', color: dueDayMsg.ok ? '#065F46' : '#DC2626' }}>
                  {dueDayMsg.ok ? '✓ ' : '⚠ '}{dueDayMsg.text}
                </p>
              )}
            </div>
          )}

          {/* Erro geral de billing */}
          {billingError && (
            <p style={{ fontSize: '0.82rem', color: '#DC2626' }}>⚠ {billingError}</p>
          )}

          {/* Botões de ação */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {(isLate || neverSubscribed) && (
              <button className={styles.btnSave} onClick={handleSubscribe} disabled={billingLoading}>
                {billingLoading ? 'Aguarde...' : `Assinar agora — ${planInfo.price}`}
              </button>
            )}
            {clinic?.billingPaid && (
              <button className={styles.btnSave} onClick={handleAnticipate} disabled={billingLoading}>
                {billingLoading ? 'Aguarde...' : 'Antecipar pagamento'}
              </button>
            )}
            {!!clinic?.billingOverdueSince && (
              <button className={styles.btnSave} onClick={handleSubscribe} disabled={billingLoading}>
                {billingLoading ? 'Aguarde...' : 'Regularizar pagamento'}
              </button>
            )}
          </div>

        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Dados da Clínica</h2>
        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.field}>
            <label>Nome da Clínica</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Telefone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <div className={styles.field}>
            <label>Endereço</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className={styles.saveRow}>
            {saved && <span className={styles.savedMsg}>✓ Salvo!</span>}
            <button type="submit" className={styles.btnSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>
      </div>

      {/* Logo da Clínica */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Logo da Clínica</h2>
        <p className={styles.gcalDesc}>
          A logo aparece no topo do painel e no cabeçalho de prontuários, contratos, receitas e atestados impressos.
          Recomendado: PNG/SVG com fundo transparente, até 2 MB.
        </p>
        <div className={styles.logoRow}>
          <div className={styles.logoPreview}>
            {clinic?.logo
              ? <img src={clinic.logo} alt="Logo da clínica" />
              : <span className={styles.logoPlaceholder}>Sem logo</span>
            }
          </div>
          <div className={styles.logoActions}>
            <button
              className={styles.btnSave}
              disabled={logoUploading}
              onClick={() => logoInputRef.current?.click()}
            >
              {logoUploading ? 'Enviando...' : clinic?.logo ? 'Trocar Logo' : 'Enviar Logo'}
            </button>
            {clinic?.logo && (
              <button
                className={styles.btnDisconnect}
                disabled={logoUploading}
                onClick={handleLogoRemove}
              >
                Remover
              </button>
            )}
            {logoMsg && (
              <span className={logoMsg.ok ? styles.savedMsg : styles.pwError}>{logoMsg.text}</span>
            )}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              ref={logoInputRef}
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) handleLogoUpload(file)
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Usuários da Clínica (só admin) ─────────────────── */}
      {isAdmin && (
        <div className={styles.card}>
          <div className={styles.usersHeader}>
            <h2 className={styles.usersTitle}>Usuários da Clínica</h2>
            <button className={styles.btnAddUser} onClick={openNewUser}>
              + Novo Usuário
            </button>
          </div>

          {usersLoading ? (
            <p className={styles.gcalDesc}>Carregando...</p>
          ) : (
            <div className={styles.usersList}>
              {clinicUsers.map(u => (
                <div key={u.id} className={styles.userRow}>
                  <div className={styles.userAvatar}>{initials(u.display_name)}</div>
                  <div className={styles.userInfo}>
                    <div className={styles.userName}>{u.display_name}</div>
                    <div className={styles.userMeta}>@{u.username}{u.email ? ` · ${u.email}` : ''}</div>
                  </div>
                  <div className={styles.userBadges}>
                    {u.user_id === user?.id && <span className={styles.selfBadge}>Você</span>}
                    <span className={styles.roleChip}>{ROLE_LABELS[u.role as UserRole] ?? u.role}</span>
                    <span className={`${styles.statusDot} ${u.is_active ? styles.statusDotActive : styles.statusDotInactive}`} title={u.is_active ? 'Ativo' : 'Inativo'} />
                  </div>
                  {u.user_id !== user?.id && (
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className={styles.btnEditUser} onClick={() => openEditUser(u)}>Editar</button>
                      {u.is_active
                        ? <button className={styles.btnDeactivate} onClick={() => setConfirmModal({ type: 'deactivate', user: u })}>Desativar</button>
                        : <button className={styles.btnReactivate} onClick={() => setConfirmModal({ type: 'reactivate', user: u })}>Reativar</button>
                      }
                    </div>
                  )}
                </div>
              ))}
              {clinicUsers.length === 0 && (
                <p className={styles.gcalDesc}>Nenhum usuário encontrado.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Google Calendar */}
      <div className={styles.card}>
        <div className={styles.gcalHeader}>
          <div>
            <h2 className={styles.cardTitle} style={{ marginBottom: '0.25rem' }}>Google Calendar</h2>
            <p className={styles.gcalDesc}>Sincronize sua agenda com o Google Calendar para ver e criar eventos diretamente.</p>
          </div>
          <div className={styles.gcalLogo}>📅</div>
        </div>

        {!hasClientId ? (
          <div className={styles.gcalWarning}>
            <strong>⚠️ NEXT_PUBLIC_GOOGLE_CLIENT_ID não configurado.</strong><br />
            Adicione o Client ID OAuth2 do Google nas variáveis de ambiente do EasyPanel para ativar esta integração.
          </div>
        ) : gcalConnected ? (
          <div className={styles.gcalConnected}>
            <span className={styles.gcalDot} />
            <span>Conta Google conectada</span>
            <button className={styles.btnDisconnect} onClick={handleDisconnectGCal}>Desconectar</button>
          </div>
        ) : (
          <div className={styles.gcalConnect}>
            {gcalError && <p className={styles.gcalError}>{gcalError}</p>}
            <button className={styles.btnGConnect} onClick={handleConnectGCal} disabled={gcalLoading}>
              {gcalLoading ? 'Conectando...' : 'Conectar Google Calendar'}
            </button>
            <p className={styles.gcalHint}>Você será redirecionado para autenticar sua conta Google.</p>
          </div>
        )}
      </div>

      {/* Modelos de Documentos */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Modelos de Documentos</h2>
        <p className={styles.gcalDesc}>Faça upload do PDF com seu papel timbrado. Ele será usado como fundo ao emitir receitas e atestados no prontuário.</p>
        <div className={styles.docTemplateList}>
          {DOC_TEMPLATE_TYPES.map(({ type, label }) => {
            const existing = docTemplates.find(t => t.type === type)
            const uploading = docUploading === type
            const msg = docMsg?.type === type ? docMsg : null
            return (
              <div key={type} className={styles.docTemplateRow}>
                <span className={styles.docTemplateLabel}>{label}</span>
                <div className={styles.docTemplateActions}>
                  {existing
                    ? <span className={styles.docTemplateStatus}>✓ Modelo cadastrado</span>
                    : <span className={styles.docTemplateStatusEmpty}>Sem modelo</span>
                  }
                  {msg?.ok && <span className={styles.docTemplateSaved}>Salvo!</span>}
                  {msg && !msg.ok && <span className={styles.docTemplateError}>Erro no upload</span>}
                  <button
                    className={styles.btnDocUpload}
                    disabled={uploading}
                    onClick={() => docInputRefs.current[type]?.click()}
                  >
                    {uploading ? 'Enviando...' : existing ? 'Trocar PDF' : 'Enviar PDF'}
                  </button>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    style={{ display: 'none' }}
                    ref={el => { docInputRefs.current[type] = el }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) handleDocUpload(type, file)
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Segurança</h2>
        <form onSubmit={handleChangePassword} className={styles.form}>
          <div className={styles.field}>
            <label>Senha atual</label>
            <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className={styles.field}>
            <label>Nova senha</label>
            <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" />
          </div>
          <div className={styles.field}>
            <label>Confirmar nova senha</label>
            <input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          {pwMsg && (
            <p className={pwMsg.type === 'ok' ? styles.savedMsg : styles.pwError}>{pwMsg.text}</p>
          )}
          <div className={styles.saveRow}>
            <button type="submit" className={styles.btnSave} disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}>
              {pwSaving ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Informações da Conta</h2>
        <div className={styles.infoGrid}>
          <InfoRow label="Usuário" value={user?.displayName ?? '-'} />
          <InfoRow label="Função" value={ROLE_LABELS[user?.role as UserRole] ?? user?.role ?? '-'} />
          <InfoRow label="Clínica ID" value={clinic?.id ?? '-'} mono />
          <InfoRow label="Plano" value={planLabel(clinic?.plan)} />
        </div>
      </div>

      {/* ── Modal de confirmação (desativar/reativar/excluir) ── */}
      {confirmModal && (
        <Portal>
        <div className={styles.overlay} onClick={() => !confirmLoading && setConfirmModal(null)}>
          <div className={styles.modal} style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>
                {confirmModal.type === 'delete'     ? '🗑 Excluir usuário'    :
                 confirmModal.type === 'deactivate' ? '⏸ Desativar usuário'  :
                                                      '▶ Reativar usuário'}
              </h2>
              <button className={styles.btnClose} onClick={() => setConfirmModal(null)} disabled={confirmLoading}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {confirmModal.type === 'delete' && <>
                  Tem certeza que deseja <strong>excluir permanentemente</strong> o usuário <strong>{confirmModal.user.display_name}</strong>?
                  <br /><br />
                  <span style={{ color: '#DC2626', fontSize: '0.82rem' }}>
                    ⚠️ Esta ação não pode ser desfeita. O acesso ao sistema será removido imediatamente.
                  </span>
                </>}
                {confirmModal.type === 'deactivate' && <>
                  Tem certeza que deseja <strong>desativar</strong> o usuário <strong>{confirmModal.user.display_name}</strong>?
                  <br /><br />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    O usuário não conseguirá mais fazer login. Os dados serão preservados e você poderá reativar depois.
                  </span>
                </>}
                {confirmModal.type === 'reactivate' && <>
                  Deseja <strong>reativar</strong> o usuário <strong>{confirmModal.user.display_name}</strong>?
                  <br /><br />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    O usuário voltará a ter acesso ao sistema com as permissões anteriores.
                  </span>
                </>}
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setConfirmModal(null)} disabled={confirmLoading}>Cancelar</button>
              <button
                className={confirmModal.type === 'delete' ? styles.btnDelete : confirmModal.type === 'reactivate' ? styles.btnReactivate : styles.btnDeactivate}
                onClick={handleConfirmAction}
                disabled={confirmLoading}
                style={{ minWidth: 100 }}
              >
                {confirmLoading ? 'Aguarde...' :
                  confirmModal.type === 'delete'     ? 'Sim, excluir'   :
                  confirmModal.type === 'deactivate' ? 'Sim, desativar' :
                                                       'Sim, reativar'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ── Modal de criação/edição de usuário ──────────────── */}
      {showUserModal && (
        <Portal>
        <div className={styles.overlay} onClick={closeUserModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingUser ? '✎ Editar Usuário' : '+ Novo Usuário'}</h2>
              <button className={styles.btnClose} onClick={closeUserModal}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Nome completo *</label>
                <input
                  value={userForm.display_name}
                  onChange={e => setUserForm(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="Ex: Ana Paula"
                />
              </div>
              <div className={styles.field}>
                <label>Nome de usuário (login) *</label>
                <input
                  value={userForm.username}
                  onChange={e => setUserForm(p => ({ ...p, username: normalizeUsername(e.target.value) }))}
                  placeholder="ex: anapaula"
                  disabled={!!editingUser}
                />
                {!editingUser && (
                  <span className={styles.hint}>3-30 caracteres: letras minúsculas, números, _ . -</span>
                )}
              </div>
              {!editingUser && (
                <>
                  <div className={styles.field}>
                    <label>E-mail *</label>
                    <input
                      type="email"
                      value={userForm.email}
                      onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="atendente@clinica.com"
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Senha *</label>
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="mín. 6 caracteres"
                    />
                  </div>
                </>
              )}
              <div className={styles.field}>
                <label>Função</label>
                <select value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value as UserRole }))}>
                  <option value="recepcao">Recepção</option>
                  <option value="dentista">Dentista</option>
                  <option value="medico">Médico</option>
                  <option value="admin">Admin (acesso total)</option>
                </select>
              </div>

              {/* Permissões por módulo — só para não-admins */}
              {userForm.role !== 'admin' && (
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '0.625rem' }}>
                    Permissões por módulo
                  </p>
                  <div className={styles.permTable}>
                    <div className={styles.permHeader}>
                      <span className={styles.permModuleCol}>Módulo</span>
                      <span className={styles.permCheckCol}>Ver</span>
                      <span className={styles.permCheckCol}>Editar</span>
                    </div>
                    {MODULES.map(m => {
                      const perm = permissionsForm[m.key] ?? { can_view: true, can_edit: true, metadata: {} }
                      const extras = MODULE_EXTRAS[m.key] ?? []
                      return (
                        <div key={m.key}>
                          <div className={styles.permRow}>
                            <span className={styles.permModuleCol}>
                              <span className={styles.permIcon}>{m.icon}</span>
                              {m.label}
                            </span>
                            <span className={styles.permCheckCol}>
                              <input
                                type="checkbox"
                                className={styles.permCheck}
                                checked={perm.can_view}
                                onChange={e => setPermissionsForm(prev => ({
                                  ...prev,
                                  [m.key]: { ...prev[m.key], can_view: e.target.checked, can_edit: e.target.checked ? prev[m.key].can_edit : false }
                                }))}
                              />
                            </span>
                            <span className={styles.permCheckCol}>
                              <input
                                type="checkbox"
                                className={styles.permCheck}
                                checked={perm.can_edit}
                                disabled={!perm.can_view}
                                onChange={e => setPermissionsForm(prev => ({
                                  ...prev,
                                  [m.key]: { ...prev[m.key], can_edit: e.target.checked }
                                }))}
                              />
                            </span>
                          </div>
                          {/* Opções extras do módulo (ex: Ver totais no Financeiro) */}
                          {perm.can_view && extras.map(extra => (
                            <label key={extra.key} className={styles.permExtra}>
                              <input
                                type="checkbox"
                                className={styles.permCheck}
                                checked={(perm.metadata?.[extra.key] as boolean) ?? true}
                                onChange={e => setPermissionsForm(prev => ({
                                  ...prev,
                                  [m.key]: {
                                    ...prev[m.key],
                                    metadata: { ...prev[m.key].metadata, [extra.key]: e.target.checked }
                                  }
                                }))}
                              />
                              <span>{extra.label}</span>
                            </label>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                  <p className={styles.permHint}>
                    Admin tem acesso total e não precisa de permissões individuais.
                    Desmarcar &quot;Ver&quot; também remove o &quot;Editar&quot;.
                  </p>
                </div>
              )}

              {editingUser && (
                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>Usuário ativo</span>
                  <label className={styles.toggleSwitch}>
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={e => setEditIsActive(e.target.checked)}
                    />
                    <span className={styles.toggleSlider} />
                  </label>
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              {editingUser && (
                <button
                  className={styles.btnDelete}
                  onClick={() => { closeUserModal(); setConfirmModal({ type: 'delete', user: editingUser }) }}
                >
                  🗑 Excluir
                </button>
              )}
              <button className={styles.btnCancel} onClick={closeUserModal}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleSaveUser} disabled={userSaving}>
                {userSaving ? 'Salvando...' : (editingUser ? 'Salvar alterações' : 'Criar usuário')}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  )
}

export default function ConfiguracoesPage() {
  return <PermissionGuard module="configuracoes"><ConfiguracoesContent /></PermissionGuard>
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={`${styles.infoValue} ${mono ? styles.mono : ''}`}>{value}</span>
    </div>
  )
}
