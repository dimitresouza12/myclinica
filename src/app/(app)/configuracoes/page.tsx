'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { connectGoogleCalendar, disconnectGoogleCalendar, isGCalConnected } from '@/lib/googleCalendar'
import type { AuthClinic, ClinicDocumentTemplate, DocumentTemplateType, ClinicUser, UserRole, AuditLog, ClinicType } from '@/types'
import { mergeSpecialtyConfigs, specialtyRoleLabel, roleForSpecialty, CLINIC_TYPE_OPTIONS } from '@/lib/specialtyConfig'
import { hasWhatsApp, userLimitFor } from '@/lib/planGates'
import { MODULES, MODULE_EXTRAS, presetPermissions, blankPermissions, type PermissionsForm } from '@/lib/permissionPresets'
import { normalizeUsername } from '@/lib/username'
import { audit } from '@/lib/audit'
import styles from './configuracoes.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { showToast } from '@/components/ui/Toast'
import { Portal } from '@/components/ui/Portal'
import { CredentialsConfirmModal } from '@/components/ui/CredentialsConfirmModal'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'

const ROLE_LABELS: Record<UserRole, string> = {
  recepcao:     'Recepção',
  auxiliar:     'Auxiliar',
  dentista:     'Dentista',
  medico:       'Médico',
  profissional: 'Profissional',
  admin:        'Admin',
  superadmin:   'Superadmin',
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

interface UserForm {
  display_name: string
  username: string
  email: string
  password: string
  role: UserRole
  specialty_type: ClinicType | ''
}
const BLANK_USER: UserForm = { display_name: '', username: '', email: '', password: '', role: 'recepcao', specialty_type: '' }

function ConfiguracoesContent() {
  const { clinic, user, setSession, setClinicLogo, addClinicSpecialty } = useAuthStore()
  // Clínica multi-área usa a união das áreas que ela já tem (specialties[]),
  // não só a principal — senão o cargo dropdown ficaria travado na área do
  // cadastro mesmo depois de ela ganhar profissionais de outras áreas.
  const specialty = mergeSpecialtyConfigs(clinic?.specialties?.length ? clinic.specialties : [clinic?.type ?? 'odonto'])
  const clinicAreaOptions = CLINIC_TYPE_OPTIONS.filter(o => (clinic?.specialties?.length ? clinic.specialties : [clinic?.type ?? 'odonto']).includes(o.value))
  const DOC_TEMPLATE_TYPES = specialty.documents
  const roleLabel = (role: string) => specialty.roles.find(r => r.value === role)?.label ?? ROLE_LABELS[role as UserRole] ?? role
  // Rótulo de um membro específico: se ele tem área salva (specialty_type),
  // isso manda — é o que diferencia "Nutricionista" de "Esteticista" quando
  // os dois têm o mesmo cargo genérico 'profissional' no banco.
  const memberRoleLabel = (u: { role: UserRole; specialty_type: ClinicType | null }) =>
    u.specialty_type ? specialtyRoleLabel(u.specialty_type) : roleLabel(u.role)
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [tab, setTab] = useState<'geral' | 'equipe' | 'plano' | 'documentos' | 'integracoes' | 'conta' | 'auditoria'>(
    initialTab === 'equipe' ? 'equipe' : 'geral'
  )
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
  const [showUpgrade,    setShowUpgrade]     = useState(false)

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
  // Inclui isSuperAdmin — igual a usePermissions.ts e AppSidebar.tsx.
  // Sem isso, um superadmin não via as abas Equipe/Auditoria aqui.
  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'geral', label: 'Geral' },
    ...(isAdmin ? [{ key: 'equipe' as const, label: 'Equipe' }] : []),
    { key: 'plano', label: 'Plano' },
    { key: 'documentos', label: 'Documentos' },
    { key: 'integracoes', label: 'Integrações' },
    { key: 'conta', label: 'Conta' },
    ...(isAdmin ? [{ key: 'auditoria' as const, label: 'Auditoria' }] : []),
  ]
  const [clinicUsers, setClinicUsers] = useState<ClinicUser[]>([])
  const activeUserCount = clinicUsers.filter(u => u.is_active && !u.is_superadmin).length
  const userLimit = userLimitFor(clinic?.plan, clinic?.maxUsers)
  const [usersLoading, setUsersLoading] = useState(false)
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<ClinicUser | null>(null)
  const [userForm, setUserForm] = useState<UserForm>(BLANK_USER)
  const [userSaving, setUserSaving] = useState(false)
  const [userMsg, setUserMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [editIsActive, setEditIsActive] = useState(true)
  const [permissionsForm, setPermissionsForm] = useState<PermissionsForm>(presetPermissions(BLANK_USER.role))
  const [confirmModal, setConfirmModal] = useState<{ type: 'deactivate' | 'reactivate' | 'delete'; user: ClinicUser } | null>(null)
  const [createdCredentials, setCreatedCredentials] = useState<{ displayName: string; username: string; email: string; password: string } | null>(null)
  const [createProfessional, setCreateProfessional] = useState(false)
  const [professionalSpecialty, setProfessionalSpecialty] = useState('')
  const [confirmLoading, setConfirmLoading] = useState(false)

  // ── Auditoria ────────────────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditModuleFilter, setAuditModuleFilter] = useState('')
  const auditLoadedRef = useRef(false)

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

  // Carrega auditoria só na primeira vez que a aba é aberta (evita puxar o
  // histórico inteiro sem o admin ter pedido).
  useEffect(() => {
    if (tab !== 'auditoria' || !clinic?.id || auditLoadedRef.current) return
    auditLoadedRef.current = true
    loadAuditLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, clinic?.id])

  async function loadAuditLogs() {
    if (!clinic?.id) return
    setAuditLoading(true)
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('created_at', { ascending: false })
      .limit(200)
    setAuditLogs((data ?? []) as AuditLog[])
    setAuditLoading(false)
  }

  const AUDIT_ACTION_LABELS: Record<string, string> = {
    'auth.login': 'Login', 'auth.logout': 'Logout', 'auth.login_failed': 'Falha de login',
    'patient.create': 'Paciente criado', 'patient.update': 'Paciente atualizado', 'patient.delete': 'Paciente excluído',
    'prontuario.view': 'Prontuário visualizado', 'prontuario.update': 'Prontuário atualizado',
    'financial.create': 'Lançamento criado', 'financial.delete': 'Lançamento excluído',
    'user.create': 'Usuário criado', 'user.update': 'Usuário atualizado', 'user.delete': 'Usuário excluído',
    'user.deactivate': 'Usuário desativado', 'user.reactivate': 'Usuário reativado',
    'stock.movement': 'Movimentação de estoque',
  }
  function auditUserName(userId: string | null) {
    if (!userId) return 'Sistema'
    return clinicUsers.find(u => u.user_id === userId)?.display_name ?? userId.slice(0, 8)
  }
  const auditModules = Array.from(new Set(auditLogs.map(l => l.module))).sort()
  const filteredAuditLogs = auditModuleFilter ? auditLogs.filter(l => l.module === auditModuleFilter) : auditLogs

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
    setPermissionsForm(presetPermissions(BLANK_USER.role))
    setCreateProfessional(false)
    setProfessionalSpecialty('')
    setUserMsg(null)
    setShowUserModal(true)
  }

  async function openEditUser(u: ClinicUser) {
    setEditingUser(u)
    setUserForm({ display_name: u.display_name, username: u.username, email: u.email ?? '', password: '', role: u.role as UserRole, specialty_type: u.specialty_type ?? '' })
    setEditIsActive(u.is_active ?? true)
    setUserMsg(null)
    // Carrega permissões existentes do banco — parte de tudo desmarcado
    // (blankPermissions), não de um preset, pra tela mostrar a verdade do
    // que está salvo em vez de um "chute" por cargo.
    const perms = blankPermissions()
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
    setPermissionsForm(presetPermissions(BLANK_USER.role))
    setCreateProfessional(false)
    setProfessionalSpecialty('')
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
          if (user && clinic) audit({ action: 'user.delete', user_id: user.id, clinic_id: clinic.id, module: 'configuracoes', resource_id: target.id })
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
          alert(error.message.includes('user_limit_reached')
            ? 'Limite de usuários do plano atingido. Desative outro usuário ou fale com o suporte para migrar de plano.'
            : 'Erro: ' + error.message)
        } else {
          if (user && clinic) audit({ action: isActive ? 'user.reactivate' : 'user.deactivate', user_id: user.id, clinic_id: clinic.id, module: 'configuracoes', resource_id: target.id })
          await loadUsers()
        }
      }
    } finally {
      setConfirmLoading(false)
      setConfirmModal(null)
    }
  }

  // Devolve o erro (ou null) em vez de engolir — antes, se o RPC falhasse,
  // o usuário ficava sem NENHUMA permissão salva e ninguém era avisado.
  async function savePermissions(memberId: string, perms: PermissionsForm): Promise<string | null> {
    const payload = Object.entries(perms).map(([module, p]) => ({
      module,
      can_view: p.can_view,
      can_edit: p.can_edit,
      metadata: p.metadata ?? {},
    }))
    const { error } = await supabase.rpc('save_clinic_member_permissions', {
      p_member_id:   memberId,
      p_permissions: payload,
    })
    return error ? error.message : null
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
        p_specialty_type: userForm.specialty_type || null,
        p_clear_specialty_type: !userForm.specialty_type,
      })
      if (error) {
        const msg = error.message.includes('cannot_deactivate_self')
          ? 'Você não pode desativar sua própria conta.'
          : 'Erro ao atualizar usuário: ' + error.message
        setUserMsg({ type: 'error', text: msg })
      } else {
        if (userForm.specialty_type) addClinicSpecialty(userForm.specialty_type)
        const permErr = await savePermissions(editingUser.id, permissionsForm)
        if (user && clinic) audit({ action: 'user.update', user_id: user.id, clinic_id: clinic.id, module: 'configuracoes', resource_id: editingUser.id })
        closeUserModal()
        await loadUsers()
        // O usuário em si foi salvo — só as permissões falharam. Avisa
        // explicitamente em vez de deixar a pessoa achando que deu tudo
        // certo enquanto o cargo fica sem nenhum acesso configurado.
        if (permErr) showToast('error', 'Usuário salvo, mas houve erro ao salvar as permissões. Reabra e confira.')
        else showToast('ok', 'Usuário atualizado com sucesso!')
      }
    } else {
      // Criar novo membro
      if (!userForm.email.trim())      { setUserSaving(false); return setUserMsg({ type: 'error', text: 'E-mail é obrigatório.' }) }
      if (userForm.password.length < 6) { setUserSaving(false); return setUserMsg({ type: 'error', text: 'Senha deve ter pelo menos 6 caracteres.' }) }
      // Checagem no cliente só pra dar a mensagem certa — quem garante o
      // limite de verdade é o trigger no banco (enforce_clinic_user_limit).
      if (userLimit !== null && activeUserCount >= userLimit) {
        setUserSaving(false)
        return setUserMsg({ type: 'error', text: `Seu plano permite até ${userLimit} usuário${userLimit > 1 ? 's' : ''}. Fale com o suporte para migrar de plano ou liberar uma exceção.` })
      }

      const { data: newCuId, error } = await supabase.rpc('create_clinic_member', {
        p_email:        userForm.email.trim().toLowerCase(),
        p_password:     userForm.password,
        p_display_name: userForm.display_name.trim(),
        p_username:     normalizeUsername(userForm.username),
        p_role:         userForm.role,
        p_specialty_type: userForm.specialty_type || null,
      })
      if (error) {
        const msg = error.message.includes('email_taken')    ? 'Este e-mail já está em uso.'
          : error.message.includes('username_taken')         ? 'Este nome de usuário já está em uso.'
          : error.message.includes('username_invalid')       ? 'Nome de usuário inválido (3-30 chars: letras, números, _ . -).'
          : error.message.includes('user_limit_reached')     ? 'Limite de usuários do plano atingido. Fale com o suporte para migrar de plano.'
          : 'Erro ao criar usuário: ' + error.message
        setUserMsg({ type: 'error', text: msg })
      } else {
        if (userForm.specialty_type) addClinicSpecialty(userForm.specialty_type)
        const permErr = newCuId ? await savePermissions(newCuId as string, permissionsForm) : null
        if (user && clinic) audit({ action: 'user.create', user_id: user.id, clinic_id: clinic.id, module: 'configuracoes', resource_id: newCuId as string | undefined })
        // Caminho inverso do que existe em Equipe: criar um usuário com
        // cargo clínico aqui também pode já deixá-lo agendável, sem
        // precisar cadastrar a mesma pessoa de novo em outra tela.
        if (createProfessional && newCuId && clinic) {
          const { error: profErr } = await supabase.from('professionals').insert([{
            clinic_id: clinic.id,
            name: userForm.display_name.trim(),
            specialty: professionalSpecialty || null,
            specialty_type: userForm.specialty_type || null,
            clinic_user_id: newCuId,
          }])
          if (profErr) showToast('error', 'Usuário criado, mas houve erro ao vincular na agenda: ' + profErr.message)
        }
        // Guarda os dados ANTES de fechar o modal (que limpa userForm) —
        // sem essa tela o admin não tinha como confirmar se anotou certo.
        setCreatedCredentials({
          displayName: userForm.display_name.trim(),
          username: normalizeUsername(userForm.username),
          email: userForm.email.trim().toLowerCase(),
          password: userForm.password,
        })
        closeUserModal()
        await loadUsers()
        if (permErr) showToast('error', 'Usuário criado, mas houve erro ao salvar as permissões. Reabra e confira.')
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
    if (!(await confirmDialog({ message: 'Remover a logo da clínica?', confirmText: 'Remover', danger: true }))) return
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

      <div className={styles.tabs}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`${styles.tabBtn} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Plano & Faturamento ── */}
      {tab === 'plano' && (
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.75rem', background: '#D1FAE5', color: '#065F46', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>
                  <Icon name="check" size={12} /> Ativo
                </span>
              )}
              {isLate && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.75rem', background: '#FEF3C7', color: '#92400E', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>
                  <Icon name="alert" size={12} /> Pagamento atrasado
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

          {/* Upgrade de plano */}
          {!showUpgrade ? (
            <button
              onClick={() => setShowUpgrade(true)}
              style={{ alignSelf: 'flex-start', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              Fazer upgrade de plano
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>Selecione o plano desejado e entraremos em contato:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.5rem' }}>
                {(Object.entries(PLAN_PRICES) as [string, { label: string; price: string }][]).map(([slug, info]) => {
                  const isCurrent = slug === (clinic?.plan ?? 'essencial')
                  const waMsgText = `Olá! Gostaria de fazer upgrade do meu plano para *${info.label}* (${info.price}). Minha clínica é *${clinic?.name}*.`
                  return (
                    <a
                      key={slug}
                      href={isCurrent ? undefined : `https://wa.me/5588920020570?text=${encodeURIComponent(waMsgText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={isCurrent ? (e) => e.preventDefault() : undefined}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: '0.15rem',
                        padding: '0.65rem 0.85rem',
                        border: `2px solid ${isCurrent ? 'var(--teal)' : 'var(--border)'}`,
                        borderRadius: '8px',
                        background: isCurrent ? 'var(--teal-light, #f0faf8)' : 'var(--bg-primary)',
                        cursor: isCurrent ? 'default' : 'pointer',
                        textDecoration: 'none',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 700, color: isCurrent ? 'var(--teal)' : 'var(--text-primary)' }}>
                        {info.label}{isCurrent ? <Icon name="check" size={12} /> : ''}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{info.price}</span>
                      {!isCurrent && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 600, marginTop: '0.15rem' }}>Solicitar via WhatsApp <Icon name="chevronRight" size={11} /></span>}
                    </a>
                  )
                })}
              </div>
              <button
                onClick={() => setShowUpgrade(false)}
                style={{ alignSelf: 'flex-start', fontSize: '0.78rem', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Vencimento do plano — assinante usa nextBillingDate, trial usa trialEndsAt */}
          {(clinic?.nextBillingDate || clinic?.trialEndsAt) && (() => {
            const isPaid = !!clinic?.nextBillingDate
            const label  = isPaid
              ? 'Próximo vencimento'
              : trialExpired ? 'Trial encerrado em' : 'Trial válido até'
            const dateStr = isPaid
              ? formatBillingDate(clinic.nextBillingDate!)
              : new Date(clinic!.trialEndsAt! + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
            const color = !isPaid && trialExpired ? '#991B1B' : 'var(--text-primary)'
            return (
              <div>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '0.2rem' }}>{label}</p>
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color }}>{dateStr}</p>
              </div>
            )
          })()}

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
                <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', marginTop: '0.4rem', color: dueDayMsg.ok ? '#065F46' : '#DC2626' }}>
                  {dueDayMsg.ok ? <Icon name="check" size={13} /> : <Icon name="alert" size={13} />}{dueDayMsg.text}
                </p>
              )}
            </div>
          )}

          {/* Erro geral de billing */}
          {billingError && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', color: '#DC2626' }}><Icon name="alert" size={13} /> {billingError}</p>
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
      )}

      {tab === 'geral' && (
      <>
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
            {saved && <span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo!</span>}
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
      </>
      )}

      {/* ── Usuários da Clínica (só admin) ─────────────────── */}
      {tab === 'equipe' && isAdmin && (
        <div className={styles.card}>
          <div className={styles.usersHeader}>
            <div>
              <h2 className={styles.usersTitle}>Usuários da Clínica</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                {userLimit === null ? `${activeUserCount} usuário${activeUserCount !== 1 ? 's' : ''} · plano sem limite` : `${activeUserCount} de ${userLimit} usuário${userLimit > 1 ? 's' : ''} do plano`}
              </p>
            </div>
            <button className={styles.btnAddUser} onClick={openNewUser} disabled={userLimit !== null && activeUserCount >= userLimit} title={userLimit !== null && activeUserCount >= userLimit ? 'Limite de usuários do plano atingido' : undefined}>
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
                    <span className={styles.roleChip}>{memberRoleLabel(u)}</span>
                    <span className={`${styles.statusDot} ${u.is_active ? styles.statusDotActive : styles.statusDotInactive}`} title={u.is_active ? 'Ativo' : 'Inativo'} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className={styles.btnEditUser} onClick={() => openEditUser(u)}>Editar</button>
                    {/* Desativar/reativar a própria conta é bloqueado pela RPC
                        (cannot_deactivate_self) — nem mostra o botão pra evitar
                        o usuário bater nesse erro à toa. Editar (nome, função)
                        continua liberado pra própria conta. */}
                    {u.user_id !== user?.id && (
                      u.is_active
                        ? <button className={styles.btnDeactivate} onClick={() => setConfirmModal({ type: 'deactivate', user: u })}>Desativar</button>
                        : <button className={styles.btnReactivate} onClick={() => setConfirmModal({ type: 'reactivate', user: u })}>Reativar</button>
                    )}
                  </div>
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
      {tab === 'integracoes' && (
      <div className={styles.card}>
        <div className={styles.gcalHeader}>
          <div>
            <h2 className={styles.cardTitle} style={{ marginBottom: '0.25rem' }}>Google Calendar</h2>
            <p className={styles.gcalDesc}>Sincronize sua agenda com o Google Calendar para ver e criar eventos diretamente.</p>
          </div>
          <div className={styles.gcalLogo}><Icon name="calendar" size={20} /></div>
        </div>

        {!hasClientId ? (
          <div className={styles.gcalWarning}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Icon name="alert" size={14} /> NEXT_PUBLIC_GOOGLE_CLIENT_ID não configurado.</strong><br />
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
      )}

      {/* Modelos de Documentos */}
      {tab === 'documentos' && (
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
                    ? <span className={styles.docTemplateStatus}><Icon name="check" size={12} /> Modelo cadastrado</span>
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
      )}

      {tab === 'conta' && (
      <>
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
          <InfoRow label="Função" value={user?.role ? roleLabel(user.role) : '-'} />
          <InfoRow label="Clínica ID" value={clinic?.id ?? '-'} mono />
          <InfoRow label="Plano" value={planLabel(clinic?.plan)} />
        </div>
      </div>
      </>
      )}

      {tab === 'auditoria' && (
        <div className={styles.card}>
          <div className={styles.usersHeader}>
            <h2 className={styles.usersTitle}>Auditoria</h2>
            {auditModules.length > 0 && (
              <SelectMenu
                value={auditModuleFilter}
                onChange={setAuditModuleFilter}
                options={[{ value: '', label: 'Todos os módulos' }, ...auditModules.map(m => ({ value: m, label: m }))]}
              />
            )}
          </div>
          <p className={styles.gcalDesc}>Últimas {auditLogs.length} ações registradas nesta clínica. A cobertura de log ainda é parcial — nem toda ação do sistema é registrada hoje.</p>
          {auditLoading ? (
            <p className={styles.gcalDesc}>Carregando...</p>
          ) : filteredAuditLogs.length === 0 ? (
            <p className={styles.gcalDesc}>Nenhum registro de auditoria encontrado.</p>
          ) : (
            <div className={styles.auditList}>
              {filteredAuditLogs.map(log => (
                <div key={log.id} className={styles.auditRow}>
                  <div className={styles.auditMain}>
                    <span className={styles.auditAction}>{AUDIT_ACTION_LABELS[log.action] ?? log.action}</span>
                    <span className={styles.auditUser}>{auditUserName(log.user_id)}</span>
                    <span className={styles.auditModule}>{log.module}</span>
                  </div>
                  <span className={styles.auditDate}>{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal de confirmação (desativar/reativar/excluir) ── */}
      {confirmModal && (
        <Portal>
        <div className={styles.overlay} onClick={() => !confirmLoading && setConfirmModal(null)}>
          <div className={styles.modal} style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {confirmModal.type === 'delete' ? <><Icon name="trash" size={16} /> Excluir usuário</> :
                 confirmModal.type === 'deactivate' ? <><Icon name="pause" size={16} /> Desativar usuário</> :
                 <><Icon name="play" size={16} /> Reativar usuário</>}
              </h2>
              <button className={styles.btnClose} onClick={() => setConfirmModal(null)} disabled={confirmLoading}><Icon name="close" size={18} /></button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {confirmModal.type === 'delete' && <>
                  Tem certeza que deseja <strong>excluir permanentemente</strong> o usuário <strong>{confirmModal.user.display_name}</strong>?
                  <br /><br />
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#DC2626', fontSize: '0.82rem' }}>
                    <Icon name="alert" size={13} /> Esta ação não pode ser desfeita. O acesso ao sistema será removido imediatamente.
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

      {createdCredentials && (
        <CredentialsConfirmModal
          displayName={createdCredentials.displayName}
          username={createdCredentials.username}
          email={createdCredentials.email}
          password={createdCredentials.password}
          onClose={() => setCreatedCredentials(null)}
        />
      )}

      {/* ── Modal de criação/edição de usuário ──────────────── */}
      {showUserModal && (
        <Portal>
        <div className={styles.overlay} onClick={closeUserModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{editingUser ? 'Editar Usuário' : '+ Novo Usuário'}</h2>
              <button className={styles.btnClose} onClick={closeUserModal}><Icon name="close" size={18} /></button>
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
                <label>{clinic?.isMultiSpecialty ? 'Função / Área de atuação' : 'Função'}</label>
                {clinic?.isMultiSpecialty ? (
                  // Clínica multi-área: a área ESCOLHE o cargo sozinha
                  // (roleForSpecialty) — evita "Esteticista" e "Nutricionista"
                  // aparecerem como a mesma opção genérica "Profissional".
                  <select
                    value={userForm.specialty_type || userForm.role}
                    onChange={e => {
                      const v = e.target.value
                      const isArea = CLINIC_TYPE_OPTIONS.some(o => o.value === v)
                      const role = isArea ? roleForSpecialty(v as ClinicType) : (v as UserRole)
                      const specialty_type = isArea ? (v as ClinicType) : ''
                      setUserForm(p => ({ ...p, role, specialty_type }))
                      if (!editingUser) setPermissionsForm(presetPermissions(role))
                    }}
                  >
                    <option value="recepcao">Recepção</option>
                    <option value="auxiliar">Auxiliar</option>
                    <option value="admin">Admin (acesso total)</option>
                    <optgroup label="Área de atuação">
                      {clinicAreaOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </optgroup>
                  </select>
                ) : (
                  <select
                    value={userForm.role}
                    onChange={e => {
                      const role = e.target.value as UserRole
                      setUserForm(p => ({ ...p, role }))
                      // Preset de permissões só é reaplicado ao criar um usuário
                      // novo — em edição, trocar o cargo não deve descartar
                      // permissões já salvas e customizadas pelo admin.
                      if (!editingUser) setPermissionsForm(presetPermissions(role))
                    }}
                  >
                    {specialty.roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                )}
                {!editingUser && userForm.role !== 'admin' && (
                  <span className={styles.hint}>Permissões abaixo já vêm pré-marcadas pro cargo — ajuste se precisar.</span>
                )}
              </div>

              {!editingUser && !['recepcao', 'auxiliar', 'admin'].includes(userForm.role) && (
                <div className={styles.field}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, cursor: 'pointer' }}>
                    <input type="checkbox" checked={createProfessional} onChange={e => setCreateProfessional(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#4DD9C0' }} />
                    Também cadastrar na agenda (deixa esse cargo agendável)
                  </label>
                  {createProfessional && (
                    <input
                      value={professionalSpecialty}
                      onChange={e => setProfessionalSpecialty(e.target.value)}
                      placeholder="Especialidade (opcional)"
                      style={{ marginTop: '0.5rem' }}
                    />
                  )}
                </div>
              )}

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
                    {MODULES.filter(m => !m.plusOnly || hasWhatsApp(clinic?.plan)).map(m => {
                      const perm = permissionsForm[m.key] ?? { can_view: false, can_edit: false, metadata: {} }
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

              {editingUser && editingUser.user_id !== user?.id && (
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
              {editingUser && editingUser.user_id !== user?.id && (
                <button
                  className={styles.btnDelete}
                  onClick={() => { closeUserModal(); setConfirmModal({ type: 'delete', user: editingUser }) }}
                >
                  <Icon name="trash" size={13} /> Excluir
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
  return <PermissionGuard module="configuracoes"><Suspense fallback={null}><ConfiguracoesContent /></Suspense></PermissionGuard>
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={`${styles.infoValue} ${mono ? styles.mono : ''}`}>{value}</span>
    </div>
  )
}
