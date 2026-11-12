'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/usePermissions'
import { formatDate } from '@/lib/utils'
import { getSpecialtyConfig, specialtyRoleLabel, roleForSpecialty, CLINIC_TYPE_OPTIONS } from '@/lib/specialtyConfig'
import { isClinicalRole, isMultiArea, defaultProfessionalArea, clinicalRoleForArea, specialtyPlaceholder, specialtyHint, specialtyOptions } from '@/lib/clinicAreas'
import { registerClinicArea } from '@/lib/registerClinicArea'
import { presetPermissions } from '@/lib/permissionPresets'
import { normalizeUsername } from '@/lib/username'
import { professionalLimitFor } from '@/lib/planCatalog'
import { councilForProfessional, registrationFieldLabel } from '@/lib/professionalCouncil'
import { useProfessionalRqeColumn } from '@/lib/professionalColumns'
import type { Professional, UserRole, ClinicType } from '@/types'
import styles from './equipe.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { Modal } from '@/components/ui/Modal'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { CredentialsConfirmModal } from '@/components/ui/CredentialsConfirmModal'
import { showToast } from '@/components/ui/Toast'
import { Icon } from '@/components/ui/Icon'
import { IntegerInput } from '@/components/ui/NumericInput'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusDot } from '@/components/ui/StatusDot'
import { MoreMenu } from '@/components/ui/MoreMenu'
import { avatarTone } from '@/lib/ui/avatarTone'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import t from '@/components/ui/table.module.css'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { PasswordInput } from '@/components/ui/PasswordInput'

interface ProfessionalRow extends Professional {
  clinic_users: { role: UserRole; is_active: boolean; specialty_type: ClinicType | null } | null
}

interface NewProf {
  name: string
  specialty: string
  specialty_type: ClinicType | ''
  // Duração padrão de agendamento deste profissional, em minutos —
  // texto vazio = herda da área (Bloco D). Guardado como string pra
  // aceitar campo em branco sem virar 0.
  defaultDuration: string
  // CRO/CRM/CRMV/CRP... — texto livre, formato varia por conselho. Usado
  // pra preencher automaticamente documentos como a Receita de Controle
  // Especial (ver TabDocumentos.tsx).
  registrationNumber: string
  // RQE (só médicos) — texto livre; só vai pro banco se a coluna professionals.rqe existir.
  rqe: string
  hasAccess: boolean
  role: UserRole
  username: string
  email: string
  password: string
}
const BLANK: NewProf = { name: '', specialty: '', specialty_type: '', defaultDuration: '', registrationNumber: '', rqe: '', hasAccess: false, role: 'recepcao', username: '', email: '', password: '' }

const ROLE_LABELS_FALLBACK: Record<string, string> = {
  recepcao: 'Recepção', auxiliar: 'Auxiliar', dentista: 'Dentista', medico: 'Médico',
  profissional: 'Profissional', admin: 'Admin', superadmin: 'Superadmin',
}

// RPC ainda não aplicada no banco (migration pendente): PostgREST devolve PGRST202/404 ou 42883.
function isMissingRpc(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message ?? '').toLowerCase()
  return error.code === 'PGRST202' || error.code === '42883'
    || msg.includes('does not exist') || msg.includes('could not find the function') || msg.includes('not found')
}

const MISSING_RPC_MSG = 'Recurso indisponível: aplique a atualização do banco.'

// Traduz os códigos de erro das funções de acesso (create/link/reset/unlink) para mensagens claras.
function accessErrorMessage(error: { message?: string; code?: string }, fallbackPrefix: string): string {
  if (isMissingRpc(error)) return MISSING_RPC_MSG
  const m = error.message ?? ''
  if (m.includes('not_authorized'))          return 'Você não tem permissão para fazer isso.'
  if (m.includes('cannot_grant_admin'))      return 'Só um administrador pode criar ou promover acessos de administrador.'
  if (m.includes('cannot_grant_permission')) return 'Você não pode conceder permissões acima das suas.'
  if (m.includes('email_invalid'))           return 'E-mail inválido.'
  if (m.includes('cannot_reactivate_member')) return 'Só o administrador pode reativar um acesso desativado.'
  if (m.includes('target_shared_account'))   return 'Este usuário também pertence a outra clínica; peça ao administrador.'
  if (m.includes('cannot_modify_higher'))    return 'Este usuário tem permissões acima das suas; só o administrador pode alterá-lo.'
  if (m.includes('cannot_modify_admin'))     return 'Só um administrador pode alterar um administrador.'
  if (m.includes('cannot_modify_self'))      return 'Você não pode alterar o seu próprio acesso.'
  if (m.includes('professional_already_linked')) return 'Este profissional já tem acesso ao sistema.'
  if (m.includes('professional_not_linked')) return 'Este profissional não tem acesso ao sistema.'
  if (m.includes('cannot_deactivate_last_admin')) return 'Não é possível desativar o último administrador da clínica.'
  if (m.includes('cannot_demote_last_admin')) return 'Não é possível remover o último administrador da clínica.'
  if (m.includes('member_not_found'))        return 'Usuário não encontrado.'
  if (m.includes('professional_not_found'))  return 'Profissional não encontrado.'
  if (m.includes('email_taken'))             return 'Este e-mail já está em uso.'
  if (m.includes('username_taken'))          return 'Este nome de usuário já está em uso.'
  if (m.includes('username_invalid'))        return 'Nome de usuário inválido (3-30 chars: letras, números, _ . -).'
  if (m.includes('weak_password'))           return 'Senha fraca: use pelo menos 8 caracteres.'
  if (m.includes('user_limit_reached'))      return 'Limite de usuários do plano atingido. Fale com o suporte para migrar de plano.'
  return `${fallbackPrefix}: ${m}`
}

type PermRow = { module: string; can_view: boolean; can_edit: boolean; metadata: Record<string, unknown> }

// A função de salvar permissões substitui tudo: se o alvo já tem permissões gravadas, manda o estado
// completo atual (não só o preset) para não apagar níveis; sem nada gravado, usa o preset do cargo.
async function permissionsPayloadFor(memberId: string, role: UserRole): Promise<PermRow[]> {
  const { data } = await supabase
    .from('clinic_user_permissions')
    .select('module, can_view, can_edit, metadata')
    .eq('clinic_user_id', memberId)
  if (data && data.length > 0) {
    return data.map(r => ({ module: r.module, can_view: r.can_view, can_edit: r.can_edit, metadata: (r.metadata as Record<string, unknown>) ?? {} }))
  }
  return Object.entries(presetPermissions(role)).map(([module, p]) => ({
    module, can_view: p.can_view, can_edit: p.can_edit, metadata: p.metadata ?? {},
  }))
}

function EquipeContent() {
  const { clinic, user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin
  // "Editar" = cadastrar, alterar e remover profissionais; sem ele a tela é só de consulta
  const { canEdit } = usePermissions('equipe')
  const [professionals, setProfessionals] = useState<ProfessionalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewProf>(BLANK)
  // Conselho (rótulo do campo de registro) segue a área escolhida no formulário.
  const formCouncil = councilForProfessional({ specialtyType: form.specialty_type || null, specialty: form.specialty, clinicType: clinic && !isMultiArea(clinic) ? clinic.type : null })
  const rqeColumnExists = useProfessionalRqeColumn()
  const formAreaIsMedico = form.specialty_type === 'medico'
  const showRqeField = rqeColumnExists && formAreaIsMedico
  const rqePayload = showRqeField ? { rqe: form.rqe.trim() || null } : {}
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [activeUserCount, setActiveUserCount] = useState(0)
  const [createdCredentials, setCreatedCredentials] = useState<{ displayName: string; username: string; email: string; password: string; reset?: boolean } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProfessionalRow | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  // Profissional em edição — quando setado, handleSave faz UPDATE em vez de
  // criar um novo. Além dos campos de `professionals`, o bloco de acesso permite
  // criar o login (se não tem), redefinir a senha ou remover o acesso.
  // Permissões finas continuam em Configurações → Equipe.
  const [editingProf, setEditingProf] = useState<ProfessionalRow | null>(null)
  // Usuário/e-mail do login vinculado (busca separada: pode não estar legível dependendo da permissão)
  const [accessInfo, setAccessInfo] = useState<{ username: string | null; email: string | null } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [accessBusy, setAccessBusy] = useState(false)
  const hasLogin = !!editingProf?.clinic_user_id

  // Limite é por PROFISSIONAL cadastrado (com ou sem login) — recepção e
  // auxiliar não contam mais pro teto do plano (reestruturação de planos:
  // Completo passou a limitar profissionais, não logins). Mas TODO salvamento
  // nesta tela sem login (form.hasAccess=false) sempre cria um profissional
  // — "só agenda" só faz sentido pra gente clínica — daí `isClinicalRole`
  // só entrar em jogo quando tem login (aí sim pode ser recepção/auxiliar).
  const professionalLimit = professionalLimitFor(clinic?.plan, clinic?.maxUsers)
  const professionalLimitReached = professionalLimit !== null && professionals.length >= professionalLimit
  const willCreateProfessional = !form.hasAccess || isClinicalRole(form.role)
  const blockedByProfessionalLimit = professionalLimitReached && willCreateProfessional

  useEffect(() => {
    if (!clinic?.id) return
    // Reset estado ao trocar de clínica
    setProfessionals([])
    setLoading(true)
    loadData()
    if (isAdmin) loadUserCount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  async function loadData() {
    if (!clinic) return
    const { data } = await supabase
      .from('professionals')
      .select('*, clinic_users(role, is_active, specialty_type)')
      .eq('clinic_id', clinic.id)
      .order('name')
    setProfessionals((data ?? []) as unknown as ProfessionalRow[])
    setLoading(false)
  }

  async function loadUserCount() {
    if (!clinic) return
    const { count } = await supabase
      .from('clinic_users')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinic.id)
      .eq('is_active', true)
      .eq('is_superadmin', false)
    setActiveUserCount(count ?? 0)
  }

  function openNewModal() {
    if (!canEdit) return
    // A área de atuação sempre aparece, com as 9 áreas (a clínica pode cadastrar profissional de
    // qualquer uma). Clínica de uma área só já abre com a área dela marcada; clínica multi-área
    // abre sem área, pra pessoa escolher de propósito (specialty_type vazio = ficha/agenda por
    // área nunca resolvem a área do profissional). O cargo do login acompanha a área escolhida.
    const area = clinic ? defaultProfessionalArea(clinic) : ''
    setForm({ ...BLANK, specialty_type: area, role: clinicalRoleForArea(area) })
    setEditingProf(null)
    setAccessInfo(null)
    setNewPassword('')
    setErrorMsg(null)
    setShowModal(true)
  }

  function openEditModal(p: ProfessionalRow) {
    if (!canEdit) return
    setForm({
      ...BLANK,
      name: p.name,
      specialty: p.specialty ?? '',
      // Cadastro antigo sem área: em clínica de uma área só, vale a da clínica.
      specialty_type: (p.specialty_type ?? (clinic ? defaultProfessionalArea(clinic) : '')) as ClinicType | '',
      defaultDuration: p.default_duration_minutes != null ? String(p.default_duration_minutes) : '',
      registrationNumber: p.registration_number ?? '',
      rqe: p.rqe ?? '',
      hasAccess: !!p.clinic_user_id,
      role: p.clinic_users?.role ?? clinicalRoleForArea((p.specialty_type ?? (clinic ? defaultProfessionalArea(clinic) : '')) as ClinicType | ''),
    })
    setEditingProf(p)
    setAccessInfo(null)
    setNewPassword('')
    setErrorMsg(null)
    setShowModal(true)
    if (p.clinic_user_id) {
      supabase.from('clinic_users').select('username, email').eq('id', p.clinic_user_id).maybeSingle()
        .then(({ data }) => { if (data) setAccessInfo({ username: data.username ?? null, email: data.email ?? null }) })
    }
  }

  async function handleSave() {
    if (!clinic || !form.name.trim()) return
    setErrorMsg(null)

    if (editingProf) {
      // Marcou "vai acessar o sistema" num profissional que ainda não tem login: valida antes de gravar.
      const linkingLogin = !editingProf.clinic_user_id && form.hasAccess
      if (linkingLogin) {
        if (!form.username.trim()) return setErrorMsg('Nome de usuário é obrigatório.')
        if (!form.email.trim())    return setErrorMsg('E-mail é obrigatório.')
        if (form.password.length < 8) return setErrorMsg('Senha deve ter pelo menos 8 caracteres.')
      }
      setSaving(true)
      const { error } = await supabase.from('professionals').update({
        name: form.name.trim(),
        specialty: form.specialty || null,
        specialty_type: form.specialty_type || null,
        default_duration_minutes: form.defaultDuration ? Number(form.defaultDuration) : null,
        registration_number: form.registrationNumber.trim() || null,
        ...rqePayload,
      }).eq('id', editingProf.id).eq('clinic_id', clinic.id)
      if (error) { setSaving(false); setErrorMsg('Erro ao salvar profissional: ' + error.message); return }
      // Profissional com login vinculado — resincroniza o nome de exibição
      // também no login, senão diverge do que aparece em Configurações → Equipe.
      // Se a área mudou, o login acompanha (specialty_type e, quando é cargo clínico, o cargo da área).
      if (editingProf.clinic_user_id && editingProf.clinic_users) {
        const loginRole = editingProf.clinic_users.role
        const areaChanged = !!form.specialty_type && form.specialty_type !== editingProf.clinic_users.specialty_type
        await supabase.rpc('update_clinic_member', {
          p_member_id: editingProf.clinic_user_id,
          p_role: areaChanged && isClinicalRole(loginRole) ? roleForSpecialty(form.specialty_type as ClinicType) : loginRole,
          p_is_active: editingProf.clinic_users.is_active,
          p_display_name: form.name.trim(),
          ...(areaChanged ? { p_specialty_type: form.specialty_type } : {}),
        })
      }
      if (form.specialty_type) await registerClinicArea(form.specialty_type)

      if (linkingLogin) {
        const email = form.email.trim().toLowerCase()
        const username = normalizeUsername(form.username)
        const { data: linked, error: linkErr } = await supabase.rpc('link_professional_login', {
          p_professional_id: editingProf.id,
          p_email: email,
          p_password: form.password,
          p_username: username,
          p_role: form.role,
          p_specialty_type: form.specialty_type || null,
        })
        if (linkErr) {
          setSaving(false)
          loadData()
          return setErrorMsg(accessErrorMessage(linkErr, 'Erro ao criar o acesso'))
        }
        // A função pode devolver o id do login ou um objeto; se não vier, busca no profissional.
        let cuId: string | null = typeof linked === 'string' ? linked
          : (linked && typeof linked === 'object' ? ((linked as { clinic_user_id?: string; id?: string }).clinic_user_id ?? (linked as { id?: string }).id ?? null) : null)
        if (!cuId) {
          const { data: row } = await supabase.from('professionals').select('clinic_user_id').eq('id', editingProf.id).maybeSingle()
          cuId = row?.clinic_user_id ?? null
        }
        const { error: permErr } = cuId
          ? await supabase.rpc('save_clinic_member_permissions', { p_member_id: cuId, p_permissions: await permissionsPayloadFor(cuId, form.role) })
          : { error: { message: 'login sem id' } }
        setCreatedCredentials({ displayName: form.name.trim(), username, email, password: form.password })
        if (permErr) showToast('error', 'Acesso criado, mas houve erro ao salvar as permissões. Ajuste em Configurações → Equipe.')
        loadUserCount()
      }

      setSaving(false)
      setShowModal(false)
      setForm(BLANK)
      setEditingProf(null)
      loadData()
      return
    }

    // Só bloqueia quando este salvamento específico vai criar um profissional
    // de verdade (sem login = sempre; com login = só cargo clínico) — recepção
    // e auxiliar com login não esbarram nesse teto. Checagem no cliente só
    // pra mensagem amigável; quem garante o limite de verdade é o trigger
    // no banco (enforce_clinic_professional_limit).
    if (willCreateProfessional && !form.specialty_type) {
      return setErrorMsg('Escolha a área de atuação do profissional.')
    }
    if (blockedByProfessionalLimit) {
      return setErrorMsg(`Seu plano permite até ${professionalLimit} ${professionalLimit === 1 ? 'profissional' : 'profissionais'}. Fale com o suporte para migrar de plano ou liberar uma exceção.`)
    }
    setSaving(true)

    if (!form.hasAccess) {
      const { error } = await supabase.from('professionals').insert([{
        clinic_id: clinic.id,
        name: form.name.trim(),
        specialty: form.specialty || null,
        specialty_type: form.specialty_type || null,
        default_duration_minutes: form.defaultDuration ? Number(form.defaultDuration) : null,
        registration_number: form.registrationNumber.trim() || null,
        ...rqePayload,
      }])
      setSaving(false)
      if (error) { setErrorMsg('Erro ao salvar profissional: ' + error.message); return }
      if (form.specialty_type) await registerClinicArea(form.specialty_type)
      setShowModal(false)
      setForm(BLANK)
      loadData()
      return
    }

    // Criando também o login — mesma validação usada em Configurações →
    // Equipe. Login em si não tem limite de plano (só profissional tem,
    // checado acima antes dos dois caminhos).
    if (!form.username.trim()) { setSaving(false); return setErrorMsg('Nome de usuário é obrigatório.') }
    if (!form.email.trim())    { setSaving(false); return setErrorMsg('E-mail é obrigatório.') }
    if (form.password.length < 8) { setSaving(false); return setErrorMsg('Senha deve ter pelo menos 8 caracteres.') }

    const { data: newCuId, error } = await supabase.rpc('create_clinic_member', {
      p_email:        form.email.trim().toLowerCase(),
      p_password:     form.password,
      p_display_name: form.name.trim(),
      p_username:     normalizeUsername(form.username),
      p_role:         form.role,
      // Recepção/auxiliar não têm área (não atendem paciente).
      p_specialty_type: (willCreateProfessional && form.specialty_type) || null,
    })
    if (error) {
      setSaving(false)
      const msg = accessErrorMessage(error, 'Erro ao criar login')
      return setErrorMsg(msg)
    }

    const permPayload = Object.entries(presetPermissions(form.role)).map(([module, p]) => ({
      module, can_view: p.can_view, can_edit: p.can_edit, metadata: p.metadata ?? {},
    }))
    const { error: permErr } = await supabase.rpc('save_clinic_member_permissions', {
      p_member_id: newCuId, p_permissions: permPayload,
    })

    // Recepção/auxiliar com login não precisa de linha em `professionals`
    // (não atende paciente, não conta pro limite de profissionais do plano).
    const profErr = isClinicalRole(form.role)
      ? (await supabase.from('professionals').insert([{
          clinic_id: clinic.id,
          name: form.name.trim(),
          specialty: form.specialty || null,
          specialty_type: form.specialty_type || null,
          default_duration_minutes: form.defaultDuration ? Number(form.defaultDuration) : null,
          registration_number: form.registrationNumber.trim() || null,
        ...rqePayload,
          clinic_user_id: newCuId,
        }])).error
      : null
    if (willCreateProfessional && form.specialty_type) await registerClinicArea(form.specialty_type)

    setSaving(false)
    if (profErr) { setErrorMsg('Login criado, mas houve erro ao vincular na agenda: ' + profErr.message); return }

    setCreatedCredentials({
      displayName: form.name.trim(),
      username: normalizeUsername(form.username),
      email: form.email.trim().toLowerCase(),
      password: form.password,
    })
    if (permErr) showToast('error', 'Login criado, mas houve erro ao salvar as permissões. Ajuste em Configurações → Equipe.')
    setShowModal(false)
    setForm(BLANK)
    loadData()
    loadUserCount()
  }

  async function handleResetPassword() {
    if (!editingProf?.clinic_user_id) return
    if (newPassword.length < 8) return setErrorMsg('A nova senha deve ter pelo menos 8 caracteres.')
    setErrorMsg(null)
    setAccessBusy(true)
    const { error } = await supabase.rpc('reset_clinic_member_password', {
      p_clinic_user_id: editingProf.clinic_user_id,
      p_password: newPassword,
    })
    setAccessBusy(false)
    if (error) return setErrorMsg(accessErrorMessage(error, 'Erro ao redefinir a senha'))
    setCreatedCredentials({
      displayName: editingProf.name,
      username: accessInfo?.username ?? '',
      email: accessInfo?.email ?? '',
      password: newPassword,
      reset: true,
    })
    setNewPassword('')
  }

  async function handleRemoveAccess() {
    if (!editingProf?.clinic_user_id) return
    const ok = await confirmDialog({
      title: isAdmin ? `Remover o acesso de ${editingProf.name}?` : `Desativar o acesso de ${editingProf.name}?`,
      message: 'A pessoa deixa de conseguir entrar no sistema. O cadastro na agenda e os registros passados são mantidos.',
      confirmText: isAdmin ? 'Remover acesso' : 'Desativar acesso',
      danger: true,
    })
    if (!ok) return
    setErrorMsg(null)
    setAccessBusy(true)
    const { error } = await supabase.rpc('unlink_professional_login', { p_professional_id: editingProf.id })
    setAccessBusy(false)
    if (error) return setErrorMsg(accessErrorMessage(error, 'Erro ao remover o acesso'))
    showToast('ok', isAdmin ? 'Acesso removido.' : 'Acesso desativado.')
    setShowModal(false)
    setForm(BLANK)
    setEditingProf(null)
    loadData()
    loadUserCount()
  }

  async function handleDelete(p: ProfessionalRow) {
    if (!canEdit) return
    if (!p.clinic_user_id) {
      if (!(await confirmDialog({ title: `Remover ${p.name}?`, message: 'O profissional é removido da equipe. Os agendamentos e registros passados são mantidos, mas ficam sem profissional atribuído. Esta ação não pode ser desfeita.', confirmText: 'Remover', danger: true }))) return
      await supabase.from('professionals').delete().eq('id', p.id).eq('clinic_id', clinic!.id)
      loadData()
      return
    }
    // Profissional com login vinculado — pergunta explícita em vez de
    // remover tudo direto (o FK já protege o login de sumir sozinho, mas
    // o admin precisa decidir o que fazer com ele).
    setDeleteTarget(p)
  }

  async function removeOnlyFromAgenda() {
    if (!deleteTarget || !clinic) return
    setDeleteLoading(true)
    await supabase.from('professionals').delete().eq('id', deleteTarget.id).eq('clinic_id', clinic.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    loadData()
  }

  async function removeAndDeactivateAccess() {
    if (!deleteTarget || !clinic) return
    setDeleteLoading(true)
    if (deleteTarget.clinic_user_id) {
      await supabase.rpc('update_clinic_member', { p_member_id: deleteTarget.clinic_user_id, p_is_active: false })
    }
    await supabase.from('professionals').delete().eq('id', deleteTarget.id).eq('clinic_id', clinic.id)
    setDeleteLoading(false)
    setDeleteTarget(null)
    loadData()
    loadUserCount()
  }

  const withAccess = professionals.filter(p => p.clinic_user_id).length
  const agendaOnly = professionals.length - withAccess

  return (
    <div className={styles.page}>
      <PageHeader
        title="Equipe"
        subtitle={professionalLimit === null
          ? `${professionals.length} ${professionals.length === 1 ? 'profissional' : 'profissionais'} (plano sem limite)`
          : `${professionals.length} de ${professionalLimit} ${professionalLimit === 1 ? 'profissional' : 'profissionais'} do plano`}
        actions={<button type="button" className={btn.primary} onClick={openNewModal} disabled={!canEdit} title={canEdit ? undefined : 'Seu perfil só pode visualizar'}><Icon name="plus" size={15} /> Novo profissional</button>}
      />

      <div className={styles.stats}>
        <StatCard
          title="Profissionais"
          value={professionals.length}
          hint={professionalLimit === null ? 'plano sem limite' : `limite do plano: ${professionalLimit}`}
          delta={professionalLimitReached ? { label: 'limite', bad: true } : undefined}
        />
        <StatCard title="Com acesso ao sistema" value={withAccess} hint="têm login próprio" />
        <StatCard title="Só na agenda" value={agendaOnly} hint="aparecem na agenda, sem login" />
        {isAdmin && <StatCard title="Logins ativos" value={activeUserCount} hint="inclui recepção e auxiliar, sem limite" />}
      </div>

      <Card flush title="Profissionais">
        {loading ? <p className={styles.loading}>Carregando...</p> : (
          <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
            <table className={`${t.table} resp-table`}>
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th>Acesso</th>
                  <th>Cadastrado em</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {professionals.length === 0 ? (
                  <tr><td colSpan={4} className={t.empty}>Nenhum profissional cadastrado.</td></tr>
                ) : professionals.map(p => (
                  <tr key={p.id} className={`${canEdit ? t.clickable : ''} ${styles.row}`} onClick={() => openEditModal(p)}>
                    <td>
                      <div className={styles.person}>
                        <Avatar name={p.name} size={36} className={`${styles.avatar} ${styles[`tone${avatarTone(p.name)}`]}`} />
                        <div className={styles.who}>
                          <span className={styles.name}>{p.name}</span>
                          <span className={styles.sub}>{p.specialty ?? 'Sem especialidade'}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Acesso">
                      {p.clinic_user_id ? (
                        p.clinic_users && !p.clinic_users.is_active
                          ? <StatusDot tone="bad">Acesso desativado</StatusDot>
                          : <StatusDot tone="ok">
                              Tem acesso{p.clinic_users?.role ? `, ${p.clinic_users.specialty_type ? specialtyRoleLabel(p.clinic_users.specialty_type) : (ROLE_LABELS_FALLBACK[p.clinic_users.role] ?? p.clinic_users.role)}` : ''}
                            </StatusDot>
                      ) : (
                        <StatusDot tone="idle">Só agenda</StatusDot>
                      )}
                    </td>
                    <td data-label="Cadastrado em" className={t.muted}>{formatDate(p.created_at, true)}</td>
                    <td className={styles.actionsCell}>
                      <div className={t.rowActions} onClick={e => e.stopPropagation()}>
                        {canEdit && (
                          <MoreMenu
                            label={`Mais ações de ${p.name}`}
                            items={[
                              { label: 'Editar', icon: 'edit', onClick: () => openEditModal(p) },
                              { label: 'Remover', icon: 'trash', danger: true, onClick: () => handleDelete(p) },
                            ]}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingProf ? 'Editar Profissional' : 'Novo Profissional'}
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={() => setShowModal(false)}>Cancelar</button>
            <button type="button" className={btn.primary} onClick={handleSave} disabled={saving || !form.name.trim() || (!editingProf && blockedByProfessionalLimit)}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        {!editingProf && blockedByProfessionalLimit && (
          <p className={f.hint}>
            Limite de profissionais do plano atingido ({professionals.length}/{professionalLimit}). Fale com o suporte para migrar de plano ou liberar uma exceção
            {!form.hasAccess ? '' : ' — recepção e auxiliar continuam sem limite, mude o cargo abaixo'}.
          </p>
        )}
        <div className={f.field}>
          <label>Nome *</label>
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        </div>
        <div className={f.field}>
          <label>Área de atuação{!form.hasAccess || isClinicalRole(form.role) ? ' *' : ''}</label>
          <SelectMenu
            variant="field"
            ariaLabel="Área de atuação"
            placeholder="Selecione a área"
            value={form.specialty_type}
            onChange={v => setForm(p => {
              const area = v as ClinicType
              // Troca a área: o cargo clínico do login acompanha, e uma especialidade que era só
              // sugestão da área anterior (ex: Ortodontia) não fica pra trás na nova.
              const wasSuggestion = !!p.specialty_type && getSpecialtyConfig(p.specialty_type).professionalSpecialties.includes(p.specialty)
              return {
                ...p,
                specialty_type: area,
                role: isClinicalRole(p.role) ? roleForSpecialty(area) : p.role,
                specialty: wasSuggestion ? '' : p.specialty,
              }
            })}
            options={CLINIC_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          />
          <p className={f.hint}>Define o conselho profissional, as especialidades disponíveis e a duração padrão.</p>
        </div>
        <div className={f.field}>
          <label>Especialidade</label>
          <SelectMenu
            variant="field"
            ariaLabel="Especialidade"
            placeholder={specialtyPlaceholder(form.specialty_type)}
            disabled={!form.specialty_type}
            value={form.specialty}
            onChange={v => setForm(p => ({ ...p, specialty: v }))}
            options={specialtyOptions(form.specialty_type, form.specialty)}
          />
          {specialtyHint(form.specialty_type) && <p className={f.hint}>{specialtyHint(form.specialty_type)}</p>}
        </div>

        <div className={f.field}>
          <label>Duração padrão do atendimento (min)</label>
          <IntegerInput
            min={5}
            max={720}
            value={form.defaultDuration}
            onChange={(v) => setForm((p) => ({ ...p, defaultDuration: v }))}
            placeholder={`Padrão da área (${getSpecialtyConfig(form.specialty_type || clinic?.type).defaultDurationMinutes} min)`}
          />
        </div>

        <div className={f.field}>
          <label>{registrationFieldLabel(formCouncil)}</label>
          <input
            value={form.registrationNumber}
            onChange={(e) => setForm((p) => ({ ...p, registrationNumber: e.target.value }))}
            placeholder={formCouncil.code ? `Ex: ${formCouncil.code}-SP 12345` : 'Ex: número do registro'}
          />
          <p className={f.hint}>Preenche automaticamente documentos como a Receita de Controle Especial.</p>
        </div>

        {showRqeField && (
          <div className={f.field}>
            <label>RQE (Registro de Qualificação de Especialista)</label>
            <input
              value={form.rqe}
              onChange={(e) => setForm((p) => ({ ...p, rqe: e.target.value }))}
              placeholder="Ex: 12345"
            />
            <p className={f.hint}>Opcional. Aparece ao lado do CRM nos documentos, só quando preenchido.</p>
          </div>
        )}

        <div className={styles.accessSection}>
          {hasLogin ? (
            <>
              <div className={f.field}>
                <label>Acesso ao sistema</label>
                {editingProf?.clinic_users && !editingProf.clinic_users.is_active
                  ? <StatusDot tone="bad">Acesso desativado</StatusDot>
                  : <StatusDot tone="ok">Tem acesso</StatusDot>}
              </div>
              <div className={styles.accessMeta}>
                {editingProf?.clinic_users?.role && (
                  <span><b>Cargo:</b> {editingProf.clinic_users.specialty_type ? specialtyRoleLabel(editingProf.clinic_users.specialty_type) : (ROLE_LABELS_FALLBACK[editingProf.clinic_users.role] ?? editingProf.clinic_users.role)}</span>
                )}
                {accessInfo?.username && <span><b>Usuário:</b> {accessInfo.username}</span>}
                {accessInfo?.email && <span><b>E-mail:</b> {accessInfo.email}</span>}
              </div>
              <div className={f.field}>
                <label>Nova senha</label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="mín. 8 caracteres"
                />
              </div>
              <div className={styles.accessActions}>
                <button type="button" className={btn.secondary} onClick={handleResetPassword} disabled={accessBusy || newPassword.length < 8}>
                  Redefinir senha
                </button>
                <button type="button" className={btn.danger} onClick={handleRemoveAccess} disabled={accessBusy}>
                  {isAdmin ? 'Remover acesso' : 'Desativar acesso'}
                </button>
              </div>
              <p className={f.hint}>As permissões deste acesso são ajustadas em Configurações → Equipe, por quem é administrador.</p>
            </>
          ) : (
            <>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={form.hasAccess}
                  onChange={(e) => setForm(p => ({ ...p, hasAccess: e.target.checked }))}
                />
                <span>Este profissional vai acessar o sistema?</span>
              </label>

              {form.hasAccess && (
                <>
                  <div className={f.field}>
                    <label>Cargo</label>
                    {/* A área vem do campo "Área de atuação" acima; aqui só se decide se a pessoa atende
                        paciente (cargo clínico da área) ou se é recepção/auxiliar. Administrador só
                        aparece para quem já é administrador. */}
                    <SelectMenu
                      variant="field"
                      ariaLabel="Cargo"
                      value={isClinicalRole(form.role) ? 'clinico' : form.role}
                      onChange={v => setForm(p => ({
                        ...p,
                        role: v === 'clinico' ? clinicalRoleForArea(p.specialty_type) : (v as UserRole),
                      }))}
                      options={[
                        { value: 'clinico', label: form.specialty_type ? specialtyRoleLabel(form.specialty_type) : 'Profissional da área', group: 'Atende pacientes' },
                        { value: 'recepcao', label: 'Recepção', group: 'Sem atendimento' },
                        { value: 'auxiliar', label: 'Auxiliar', group: 'Sem atendimento' },
                        ...(isAdmin ? [{ value: 'admin', label: 'Administrador', group: 'Gestão' }] : []),
                      ]}
                    />
                  </div>
                  <div className={f.field}>
                    <label>Nome de usuário (login) *</label>
                    <input
                      value={form.username}
                      onChange={(e) => setForm(p => ({ ...p, username: normalizeUsername(e.target.value) }))}
                      placeholder="ex: mariasilva"
                    />
                  </div>
                  <div className={f.field}>
                    <label>E-mail *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="profissional@clinica.com"
                    />
                  </div>
                  <div className={f.field}>
                    <label>Senha *</label>
                    <PasswordInput
                      value={form.password}
                      onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="mín. 8 caracteres"
                    />
                  </div>
                  <p className={f.hint}>As permissões vêm pré-marcadas pro cargo — dá pra ajustar depois em Configurações → Equipe.</p>
                </>
              )}
            </>
          )}
        </div>

        {errorMsg && <p className={f.error}>{errorMsg}</p>}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!deleteLoading) setDeleteTarget(null) }}
        size="sm"
        title={`Remover ${deleteTarget?.name ?? ''}`}
        footer={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
            <button type="button" className={btn.primary} onClick={removeOnlyFromAgenda} disabled={deleteLoading}>
              Remover só da agenda (mantém o login)
            </button>
            <button type="button" className={btn.danger} onClick={removeAndDeactivateAccess} disabled={deleteLoading}>
              Remover da agenda e desativar o acesso
            </button>
            <button type="button" className={btn.secondary} onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Cancelar</button>
          </div>
        }
      >
        <p>Esse profissional também tem login no sistema. O que você quer fazer?</p>
      </Modal>

      {createdCredentials && (
        <CredentialsConfirmModal
          displayName={createdCredentials.displayName}
          username={createdCredentials.username}
          email={createdCredentials.email}
          password={createdCredentials.password}
          title={createdCredentials.reset ? `Nova senha de ${createdCredentials.displayName}` : undefined}
          onClose={() => setCreatedCredentials(null)}
        />
      )}
    </div>
  )
}

export default function EquipePage() {
  return <PermissionGuard module="equipe"><EquipeContent /></PermissionGuard>
}
