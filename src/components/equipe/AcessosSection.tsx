'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import type { ClinicUser, UserRole, ClinicType } from '@/types'
import { roleOrAreaValue, specialtyOptions, specialtyPlaceholder, isClinicalRole } from '@/lib/clinicAreas'
import { registerClinicArea } from '@/lib/registerClinicArea'
import { specialtyRoleLabel, roleForSpecialty, CLINIC_TYPE_OPTIONS, mergeSpecialtyConfigs } from '@/lib/specialtyConfig'
import { hasWhatsAppAI } from '@/lib/planGates'
import { professionalLimitFor } from '@/lib/planCatalog'
import { MODULES, MODULE_EXTRAS, presetPermissions, blankPermissions, type PermissionsForm } from '@/lib/permissionPresets'
import { clearAllModules, markAllModules, permissionSummary, permissionWarnings, restoreRolePreset } from '@/lib/permissionSummary'
import { normalizeUsername } from '@/lib/username'
import { audit } from '@/lib/audit'
import { useTeamDirectory } from '@/hooks/useTeamChat'
import styles from './acessosSection.module.css'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { CredentialsConfirmModal } from '@/components/ui/CredentialsConfirmModal'
import { showToast } from '@/components/ui/Toast'

const ROLE_LABELS: Record<UserRole, string> = {
  recepcao:     'Recepção',
  auxiliar:     'Auxiliar',
  dentista:     'Dentista',
  medico:       'Médico',
  profissional: 'Profissional',
  admin:        'Admin',
  superadmin:   'Superadmin',
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

interface Props {
  /** Profissionais da agenda da clínica (o limite do plano conta só eles, não os logins). */
  professionalCount: number
  /** Muda quando a página altera logins por fora (ex.: criar ou remover acesso de profissional): recarrega a lista. */
  reloadKey?: number
  /** Chamado depois de qualquer mudança aqui que pode alterar o que a página mostra (profissionais, contagem de logins). */
  onChanged?: () => void
}

/**
 * Acessos e permissões: logins da clínica (recepção, auxiliar, profissionais, admins) e o que cada um acessa.
 * Só para administrador: quem renderiza decide, e as RPCs continuam validando no banco.
 */
export function AcessosSection({ professionalCount, reloadKey = 0, onChanged }: Props) {
  const { clinic, user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin
  // Clínica multi-área usa a união das áreas que ela já tem (specialties[]),
  // não só a principal — senão o cargo dropdown ficaria travado na área do
  // cadastro mesmo depois de ela ganhar profissionais de outras áreas.
  const specialty = mergeSpecialtyConfigs(clinic?.specialties?.length ? clinic.specialties : [clinic?.type ?? 'odonto'])
  const roleLabel = (role: string) => specialty.roles.find(r => r.value === role)?.label ?? ROLE_LABELS[role as UserRole] ?? role
  // Rótulo de um membro específico: se ele tem área salva (specialty_type),
  // isso manda — é o que diferencia "Nutricionista" de "Esteticista" quando
  // os dois têm o mesmo cargo genérico 'profissional' no banco.
  const memberRoleLabel = (u: { role: UserRole; specialty_type: ClinicType | null }) =>
    u.specialty_type ? specialtyRoleLabel(u.specialty_type) : roleLabel(u.role)

  const { data: teamDir } = useTeamDirectory(clinic?.id)
  const avatarByUser = useMemo(() => new Map((teamDir ?? []).map(d => [d.clinic_user_id, d.avatar_data ?? null])), [teamDir])

  const [clinicUsers, setClinicUsers] = useState<ClinicUser[]>([])
  const activeUserCount = clinicUsers.filter(u => u.is_active && !u.is_superadmin).length
  // Login (clinic_users) não tem limite de plano — só profissional
  // (professionals) tem, e a contagem vem da página.
  const professionalLimit = professionalLimitFor(clinic?.plan, clinic?.maxUsers)
  const professionalLimitReached = professionalLimit !== null && professionalCount >= professionalLimit
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

  useEffect(() => {
    if (!clinic?.id || !isAdmin) return
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id, isAdmin, reloadKey])

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

  // Traduz o erro cru dos RPCs de membros (raise exception 'codigo') pra português.
  function memberErrorMessage(raw: string, fallbackPrefix: string): string {
    const known: Array<[string, string]> = [
      ['cannot_delete_self', 'Você não pode excluir sua própria conta.'],
      ['cannot_deactivate_self', 'Você não pode desativar sua própria conta.'],
      ['cannot_delete_last_admin', 'Não é possível excluir o último administrador da clínica.'],
      ['cannot_demote_last_admin', 'Não é possível remover o último administrador da clínica.'],
      ['cannot_deactivate_last_admin', 'Não é possível desativar o último administrador da clínica.'],
      ['member_not_found', 'Usuário não encontrado.'],
      ['user_limit_reached', 'Limite de usuários do plano atingido. Desative outro usuário ou fale com o suporte para migrar de plano.'],
      ['email_taken', 'Este e-mail já está em uso.'],
      ['username_taken', 'Este nome de usuário já está em uso.'],
      ['username_invalid', 'Nome de usuário inválido (3-30 chars: letras, números, _ . -).'],
      ['unauthorized', 'Você não tem permissão para realizar esta ação.'],
      ['not_authorized', 'Você não tem permissão para realizar esta ação.'],
      ['cannot_modify_admin', 'Só um administrador pode alterar um administrador.'],
      ['cannot_modify_self', 'Você não pode alterar o seu próprio acesso.'],
      ['cannot_grant_admin', 'Só um administrador pode conceder o cargo de administrador.'],
      ['cannot_grant_permission', 'Você não pode conceder permissões acima das suas.'],
      ['weak_password', 'Senha fraca: use pelo menos 8 caracteres.'],
      ['email_invalid', 'E-mail inválido.'],
      ['cannot_reactivate_member', 'Só o administrador pode reativar um acesso desativado.'],
      ['target_shared_account', 'Este usuário também pertence a outra clínica; peça ao administrador.'],
      ['cannot_modify_higher', 'Este usuário tem permissões acima das suas; só o administrador pode alterá-lo.'],
    ]
    for (const [code, text] of known) if (raw.includes(code)) return text
    return fallbackPrefix + 'tente novamente em instantes.'
  }

  async function handleConfirmAction() {
    if (!confirmModal) return
    setConfirmLoading(true)
    const { type, user: target } = confirmModal
    try {
      if (type === 'delete') {
        const { error } = await supabase.rpc('delete_clinic_member', { p_member_id: target.id })
        if (error) {
          const msg = memberErrorMessage(error.message, 'Não foi possível excluir o usuário: ')
          showToast('error', msg)
        } else {
          if (user && clinic) audit({ action: 'user.delete', user_id: user.id, clinic_id: clinic.id, module: 'configuracoes', resource_id: target.id })
          await loadUsers()
          onChanged?.()
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
          showToast('error', memberErrorMessage(error.message, 'Não foi possível concluir a ação: '))
        } else {
          if (user && clinic) audit({ action: isActive ? 'user.reactivate' : 'user.deactivate', user_id: user.id, clinic_id: clinic.id, module: 'configuracoes', resource_id: target.id })
          await loadUsers()
          onChanged?.()
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
        const msg = memberErrorMessage(error.message, 'Não foi possível atualizar o usuário: ')
        setUserMsg({ type: 'error', text: msg })
      } else {
        if (userForm.specialty_type) await registerClinicArea(userForm.specialty_type)
        const permErr = await savePermissions(editingUser.id, permissionsForm)
        if (user && clinic) audit({ action: 'user.update', user_id: user.id, clinic_id: clinic.id, module: 'configuracoes', resource_id: editingUser.id })
        closeUserModal()
        await loadUsers()
        onChanged?.()
        // O usuário em si foi salvo — só as permissões falharam. Avisa
        // explicitamente em vez de deixar a pessoa achando que deu tudo
        // certo enquanto o cargo fica sem nenhum acesso configurado.
        if (permErr) showToast('error', 'Usuário salvo, mas houve erro ao salvar as permissões. Reabra e confira.')
        else showToast('ok', 'Usuário atualizado com sucesso!')
      }
    } else {
      // Criar novo membro
      if (!userForm.email.trim())      { setUserSaving(false); return setUserMsg({ type: 'error', text: 'E-mail é obrigatório.' }) }
      if (userForm.password.length < 8) { setUserSaving(false); return setUserMsg({ type: 'error', text: 'Senha deve ter pelo menos 8 caracteres.' }) }
      // Login em si não tem limite de plano. Só quem marca "também cadastrar
      // na agenda" vira profissional de verdade — checagem no cliente só pra
      // dar a mensagem certa, quem garante o limite é o trigger no banco
      // (enforce_clinic_professional_limit).
      if (createProfessional && professionalLimitReached) {
        setUserSaving(false)
        return setUserMsg({ type: 'error', text: `Seu plano permite até ${professionalLimit} ${professionalLimit === 1 ? 'profissional' : 'profissionais'}. Fale com o suporte para migrar de plano ou liberar uma exceção.` })
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
        const msg = memberErrorMessage(error.message, 'Não foi possível criar o usuário: ')
        setUserMsg({ type: 'error', text: msg })
      } else {
        if (userForm.specialty_type) await registerClinicArea(userForm.specialty_type)
        const permErr = newCuId ? await savePermissions(newCuId as string, permissionsForm) : null
        if (user && clinic) audit({ action: 'user.create', user_id: user.id, clinic_id: clinic.id, module: 'configuracoes', resource_id: newCuId as string | undefined })
        // Criar um usuário com cargo clínico aqui também pode já deixá-lo
        // agendável, sem precisar cadastrar a mesma pessoa de novo na lista
        // de profissionais.
        if (createProfessional && newCuId && clinic) {
          const { error: profErr } = await supabase.from('professionals').insert([{
            clinic_id: clinic.id,
            name: userForm.display_name.trim(),
            specialty: professionalSpecialty || null,
            specialty_type: userForm.specialty_type || null,
            clinic_user_id: newCuId,
          }])
          if (profErr) showToast('error', profErr.message.includes('professional_limit_reached')
            ? 'Usuário criado, mas o limite de profissionais do plano foi atingido — não deu pra vincular na agenda.'
            : 'Usuário criado, mas houve erro ao vincular na agenda: ' + profErr.message)
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
        // A página precisa recontar profissionais (se um foi vinculado) e logins.
        onChanged?.()
        if (permErr) showToast('error', 'Usuário criado, mas houve erro ao salvar as permissões. Reabra e confira.')
      }
    }
    setUserSaving(false)
  }

  if (!isAdmin) return null

  return (
    <>
      <Card
        title="Acessos e permissões"
        actions={
          <button type="button" className={btn.primary} onClick={openNewUser}>
            <Icon name="plus" size={15} /> Novo usuário
          </button>
        }
      >
        <p className={styles.sub}>
          {activeUserCount} login{activeUserCount !== 1 ? 's' : ''} ativo{activeUserCount !== 1 ? 's' : ''} (sem limite)
          {' · '}
          {professionalLimit === null
            ? `${professionalCount} ${professionalCount === 1 ? 'profissional' : 'profissionais'} (plano sem limite)`
            : `${professionalCount} de ${professionalLimit} ${professionalLimit === 1 ? 'profissional' : 'profissionais'} do plano`}
        </p>

        {usersLoading ? (
          <p className={styles.loading}>Carregando...</p>
        ) : (
          <div className={styles.list}>
            {clinicUsers.map(u => (
              <div key={u.id} className={styles.row}>
                <UserAvatar name={u.display_name} avatar={avatarByUser.get(u.id)} size={36} />
                <div className={styles.info}>
                  <div className={styles.name}>{u.display_name}</div>
                  <div className={styles.meta}>@{u.username}{u.email ? ` · ${u.email}` : ''}</div>
                </div>
                <div className={styles.badges}>
                  {u.user_id === user?.id && <Badge tone="brand" dot={false}>Você</Badge>}
                  <Badge tone="neutral" dot={false}>{memberRoleLabel(u)}</Badge>
                  <span className={`${styles.dot} ${u.is_active ? styles.dotActive : styles.dotInactive}`} title={u.is_active ? 'Ativo' : 'Inativo'} />
                </div>
                <div className={styles.actions}>
                  <button type="button" className={btn.secondary} onClick={() => openEditUser(u)}>Editar</button>
                  {/* Desativar/reativar a própria conta é bloqueado pela RPC
                      (cannot_deactivate_self) — nem mostra o botão pra evitar
                      o usuário bater nesse erro à toa. Editar (nome, função)
                      continua liberado pra própria conta. */}
                  {u.user_id !== user?.id && (
                    u.is_active
                      ? <button type="button" className={`${btn.secondary} ${styles.dangerText}`} onClick={() => setConfirmModal({ type: 'deactivate', user: u })}>Desativar</button>
                      : <button type="button" className={btn.secondary} onClick={() => setConfirmModal({ type: 'reactivate', user: u })}>Reativar</button>
                  )}
                </div>
              </div>
            ))}
            {clinicUsers.length === 0 && (
              <p className={styles.loading}>Nenhum usuário encontrado.</p>
            )}
          </div>
        )}
      </Card>

      {/* ── Confirmação de desativar, reativar e excluir ── */}
      <Modal
        open={!!confirmModal}
        onClose={() => { if (!confirmLoading) setConfirmModal(null) }}
        size="sm"
        title={confirmModal?.type === 'delete' ? 'Excluir usuário' : confirmModal?.type === 'deactivate' ? 'Desativar usuário' : 'Reativar usuário'}
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={() => setConfirmModal(null)} disabled={confirmLoading}>Cancelar</button>
            <button
              type="button"
              className={confirmModal?.type === 'delete' ? btn.danger : btn.primary}
              onClick={handleConfirmAction}
              disabled={confirmLoading}
            >
              {confirmLoading ? 'Aguarde...' :
                confirmModal?.type === 'delete'     ? 'Sim, excluir'   :
                confirmModal?.type === 'deactivate' ? 'Sim, desativar' :
                                                      'Sim, reativar'}
            </button>
          </>
        }
      >
        {confirmModal && (
          <>
            <p className={f.lead}>
              {confirmModal.type === 'delete' && <>Tem certeza que deseja <strong>excluir permanentemente</strong> o usuário <strong>{confirmModal.user.display_name}</strong>?</>}
              {confirmModal.type === 'deactivate' && <>Tem certeza que deseja <strong>desativar</strong> o usuário <strong>{confirmModal.user.display_name}</strong>?</>}
              {confirmModal.type === 'reactivate' && <>Deseja <strong>reativar</strong> o usuário <strong>{confirmModal.user.display_name}</strong>?</>}
            </p>
            {confirmModal.type === 'delete' && (
              <p className={`${f.note} ${f.noteDanger}`}>
                <Icon name="alert" size={14} /> Esta ação não pode ser desfeita. O acesso ao sistema será removido imediatamente.
              </p>
            )}
            {confirmModal.type === 'deactivate' && (
              <p className={f.note}>O usuário não conseguirá mais fazer login. Os dados serão preservados e você poderá reativar depois.</p>
            )}
            {confirmModal.type === 'reactivate' && (
              <p className={f.note}>O usuário voltará a ter acesso ao sistema com as permissões anteriores.</p>
            )}
          </>
        )}
      </Modal>

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
      <Modal
        open={showUserModal}
        onClose={closeUserModal}
        title={editingUser ? 'Editar usuário' : 'Novo usuário'}
        footer={
          <>
            {editingUser && editingUser.user_id !== user?.id && (
              <button
                type="button"
                className={`${btn.secondary} ${styles.footerDelete}`}
                onClick={() => { closeUserModal(); setConfirmModal({ type: 'delete', user: editingUser }) }}
              >
                <Icon name="trash" size={13} /> Excluir
              </button>
            )}
            <button type="button" className={btn.secondary} onClick={closeUserModal}>Cancelar</button>
            <button type="button" className={btn.primary} onClick={handleSaveUser} disabled={userSaving}>
              {userSaving ? 'Salvando...' : (editingUser ? 'Salvar' : 'Criar usuário')}
            </button>
          </>
        }
      >
        {userMsg?.type === 'error' && <p className={f.error} role="alert">{userMsg.text}</p>}
        <div className={f.field}>
          <label>Nome completo *</label>
          <input
            value={userForm.display_name}
            onChange={e => setUserForm(p => ({ ...p, display_name: e.target.value }))}
            placeholder="Ex: Ana Paula"
          />
        </div>
        <div className={f.field}>
          <label>Nome de usuário (login) *</label>
          <input
            value={userForm.username}
            onChange={e => setUserForm(p => ({ ...p, username: normalizeUsername(e.target.value) }))}
            placeholder="ex: anapaula"
            disabled={!!editingUser}
          />
          {!editingUser && (
            <span className={f.hint}>3-30 caracteres: letras minúsculas, números, _ . -</span>
          )}
        </div>
        {!editingUser && (
          <>
            <div className={f.field}>
              <label>E-mail *</label>
              <input
                type="email"
                value={userForm.email}
                onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))}
                placeholder="atendente@clinica.com"
              />
            </div>
            <div className={f.field}>
              <label>Senha *</label>
              <PasswordInput
                value={userForm.password}
                onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                placeholder="mín. 8 caracteres"
              />
            </div>
          </>
        )}
        <div className={f.field}>
          <label>Função / Área de atuação</label>
          {/* A área ESCOLHE o cargo sozinha (roleForSpecialty) — evita "Esteticista" e "Nutricionista"
              aparecerem como a mesma opção genérica "Profissional". Sempre com as 9 áreas: a clínica
              pode cadastrar profissional de qualquer uma, mesmo tendo nascido com uma só. */}
          <SelectMenu
            variant="field"
            ariaLabel="Função ou área de atuação"
            value={roleOrAreaValue(userForm.role, userForm.specialty_type, clinic?.type ?? 'odonto')}
            onChange={v => {
              const isArea = CLINIC_TYPE_OPTIONS.some(o => o.value === v)
              const role = isArea ? roleForSpecialty(v as ClinicType) : (v as UserRole)
              const specialty_type = isArea ? (v as ClinicType) : ''
              setUserForm(p => ({ ...p, role, specialty_type }))
              setProfessionalSpecialty('')
              if (!editingUser) { setPermissionsForm(presetPermissions(role)); setCreateProfessional(isClinicalRole(role)) }
            }}
            options={[
              { value: 'recepcao', label: 'Recepção' },
              { value: 'auxiliar', label: 'Auxiliar' },
              { value: 'admin', label: 'Admin (acesso total)' },
              ...CLINIC_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label, group: 'Área de atuação' })),
            ]}
          />
          {!editingUser && userForm.role !== 'admin' && (
            <span className={f.hint}>Permissões abaixo já vêm pré-marcadas pro cargo — ajuste se precisar.</span>
          )}
        </div>

        {!editingUser && isClinicalRole(userForm.role) && (
          <>
            <div className={f.switches}>
              <label className={f.switchRow}>
                <span className={f.switchText}>
                  <b>Também cadastrar na agenda</b>
                  <small>Deixa esse cargo agendável.</small>
                </span>
                <span className={f.toggle}>
                  <input
                    type="checkbox"
                    checked={createProfessional}
                    onChange={e => setCreateProfessional(e.target.checked)}
                    disabled={professionalLimitReached && !createProfessional}
                  />
                  <span />
                </span>
              </label>
            </div>
            {professionalLimitReached && !createProfessional && (
              <span className={f.hint}>Limite de profissionais do plano atingido ({professionalCount}/{professionalLimit}). Só dá pra cadastrar sem vincular na agenda agora.</span>
            )}
            {createProfessional && (
              <div className={f.field}>
                <label>Especialidade (opcional)</label>
                <SelectMenu
                  variant="field"
                  ariaLabel="Especialidade"
                  placeholder={specialtyPlaceholder(userForm.specialty_type)}
                  disabled={!userForm.specialty_type}
                  value={professionalSpecialty}
                  onChange={setProfessionalSpecialty}
                  options={specialtyOptions(userForm.specialty_type, professionalSpecialty)}
                />
              </div>
            )}
          </>
        )}

        {/* Permissões por módulo — só para não-admins */}
        {userForm.role !== 'admin' && (() => {
          const visibleModules = MODULES.filter(m => !m.plusOnly || hasWhatsAppAI(clinic?.plan))
          const formRoleLabel = ROLE_LABELS[userForm.role] ?? userForm.role
          const warnings = permissionWarnings(userForm.role, formRoleLabel, permissionsForm, visibleModules)
          return (
            <div>
              <p className={styles.permTitle}>Permissões por módulo</p>
              <div className={styles.permHelp}>
                <p><b>Ver</b>: abrir e consultar o módulo.</p>
                <p><b>Editar</b>: criar, alterar, excluir, enviar e exportar. Precisa de Ver marcado.</p>
                <p><b>Equipe</b>: quem pode editar Equipe cria profissionais e acessos (inclusive recepção e auxiliar), mas nunca administradores nem permissões acima das suas.</p>
              </div>

              <p className={styles.permSummary} role="status" aria-live="polite">
                {permissionSummary(formRoleLabel, permissionsForm, visibleModules)}
              </p>

              {warnings.length > 0 && (
                <div className={styles.permWarn} role="alert">
                  <Icon name="alert" size={16} />
                  <div>
                    {warnings.map(w => <p key={w}>{w}</p>)}
                  </div>
                </div>
              )}

              <div className={styles.permTools}>
                <Button variant="secondary" onClick={() => setPermissionsForm(restoreRolePreset(userForm.role))}>Restaurar padrão do cargo</Button>
                <Button variant="secondary" onClick={() => setPermissionsForm(prev => markAllModules(prev, visibleModules))}>Marcar tudo</Button>
                <Button variant="secondary" onClick={() => setPermissionsForm(prev => clearAllModules(prev, visibleModules))}>Limpar</Button>
              </div>

              <div className={styles.permTable}>
                <div className={styles.permHeader}>
                  <span className={styles.permModuleCol}>Módulo</span>
                  <span className={styles.permCheckCol}>Ver</span>
                  <span className={styles.permCheckCol}>Editar</span>
                </div>
                {visibleModules.map(m => {
                  const perm = permissionsForm[m.key] ?? { can_view: false, can_edit: false, metadata: {} }
                  const extras = MODULE_EXTRAS[m.key] ?? []
                  return (
                    <div key={m.key}>
                      <div className={styles.permRow}>
                        <span className={styles.permModuleText}>
                          <span className={styles.permName}>{m.label}</span>
                          <span className={styles.permDesc}>{m.desc}</span>
                          {m.note && <span className={styles.permDesc}>{m.note}</span>}
                        </span>
                        <span className={styles.permCheckCol}>
                          <input
                            type="checkbox"
                            className={styles.permCheck}
                            aria-label={`Ver ${m.label}`}
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
                            aria-label={`Editar ${m.label}`}
                            checked={perm.can_edit}
                            disabled={!perm.can_view}
                            title={!perm.can_view ? 'Marque Ver primeiro' : undefined}
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
                            checked={(perm.metadata?.[extra.key] as boolean) ?? extra.defaultOn}
                            onChange={e => setPermissionsForm(prev => ({
                              ...prev,
                              [m.key]: {
                                ...prev[m.key],
                                metadata: { ...prev[m.key].metadata, [extra.key]: e.target.checked }
                              }
                            }))}
                          />
                          <span className={styles.permExtraText}>
                            <span>{extra.label}</span>
                            {extra.hint && <span className={styles.permDesc}>{extra.hint}</span>}
                          </span>
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
          )
        })()}

        {editingUser && editingUser.user_id !== user?.id && (
          <div className={f.switches}>
            <label className={f.switchRow}>
              <span className={f.switchText}>
                <b>Usuário ativo</b>
                <small>Desativado, não consegue entrar no sistema.</small>
              </span>
              <span className={f.toggle}>
                <input
                  type="checkbox"
                  checked={editIsActive}
                  onChange={e => setEditIsActive(e.target.checked)}
                />
                <span />
              </span>
            </label>
          </div>
        )}
      </Modal>
    </>
  )
}
