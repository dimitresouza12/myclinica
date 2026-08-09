'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate } from '@/lib/utils'
import { useScrollLock } from '@/hooks/useScrollLock'
import { getSpecialtyConfig, mergeSpecialtyConfigs, specialtyRoleLabel, roleForSpecialty, CLINIC_TYPE_OPTIONS } from '@/lib/specialtyConfig'
import { presetPermissions } from '@/lib/permissionPresets'
import { normalizeUsername } from '@/lib/username'
import { userLimitFor } from '@/lib/planGates'
import type { Professional, UserRole, ClinicType } from '@/types'
import styles from './equipe.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { Portal } from '@/components/ui/Portal'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { CredentialsConfirmModal } from '@/components/ui/CredentialsConfirmModal'
import { showToast } from '@/components/ui/Toast'
import { Icon } from '@/components/ui/Icon'

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
  hasAccess: boolean
  role: UserRole
  username: string
  email: string
  password: string
}
const BLANK: NewProf = { name: '', specialty: '', specialty_type: '', defaultDuration: '', hasAccess: false, role: 'recepcao', username: '', email: '', password: '' }

const ROLE_LABELS_FALLBACK: Record<string, string> = {
  recepcao: 'Recepção', auxiliar: 'Auxiliar', dentista: 'Dentista', medico: 'Médico',
  profissional: 'Profissional', admin: 'Admin', superadmin: 'Superadmin',
}

function EquipeContent() {
  const { clinic, user, addClinicSpecialty } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin
  const specialtyRoles = mergeSpecialtyConfigs(clinic?.specialties?.length ? clinic.specialties : [clinic?.type ?? 'odonto']).roles
  const clinicAreaOptions = CLINIC_TYPE_OPTIONS.filter(o => (clinic?.specialties?.length ? clinic.specialties : [clinic?.type ?? 'odonto']).includes(o.value))
  const [professionals, setProfessionals] = useState<ProfessionalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewProf>(BLANK)
  // Sugestões de sub-especialidade seguem a ÁREA escolhida no formulário
  // (ex: "Ortodontia" não faz sentido sugerir pra quem marcou Nutrição) —
  // só cai pra clínica principal antes de qualquer área ser escolhida.
  const specialtySuggestions = getSpecialtyConfig(form.specialty_type || clinic?.type).professionalSpecialties
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showSpecialtySuggestions, setShowSpecialtySuggestions] = useState(false)
  const [activeUserCount, setActiveUserCount] = useState(0)
  const [createdCredentials, setCreatedCredentials] = useState<{ displayName: string; username: string; email: string; password: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProfessionalRow | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const userLimit = userLimitFor(clinic?.plan, clinic?.maxUsers)
  const clinicalRole = specialtyRoles.find(r => !['recepcao', 'auxiliar', 'admin'].includes(r.value))?.value as UserRole | undefined

  const filteredSpecialtySuggestions = specialtySuggestions.filter(s =>
    s.toLowerCase().includes(form.specialty.trim().toLowerCase())
  )

  useScrollLock(showModal)

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
    setForm({ ...BLANK, role: clinicalRole ?? 'recepcao' })
    setErrorMsg(null)
    setShowModal(true)
  }

  async function handleSave() {
    if (!clinic || !form.name.trim()) return
    setErrorMsg(null)
    setSaving(true)

    if (!form.hasAccess) {
      const { error } = await supabase.from('professionals').insert([{
        clinic_id: clinic.id,
        name: form.name.trim(),
        specialty: form.specialty || null,
        specialty_type: form.specialty_type || null,
        default_duration_minutes: form.defaultDuration ? Number(form.defaultDuration) : null,
      }])
      setSaving(false)
      if (error) { setErrorMsg('Erro ao salvar profissional: ' + error.message); return }
      setShowModal(false)
      setForm(BLANK)
      setShowSpecialtySuggestions(false)
      loadData()
      return
    }

    // Criando também o login — mesma validação e mesmo limite de plano
    // usados em Configurações → Equipe.
    if (!form.username.trim()) { setSaving(false); return setErrorMsg('Nome de usuário é obrigatório.') }
    if (!form.email.trim())    { setSaving(false); return setErrorMsg('E-mail é obrigatório.') }
    if (form.password.length < 6) { setSaving(false); return setErrorMsg('Senha deve ter pelo menos 6 caracteres.') }
    if (userLimit !== null && activeUserCount >= userLimit) {
      setSaving(false)
      return setErrorMsg(`Seu plano permite até ${userLimit} usuário${userLimit > 1 ? 's' : ''}. Fale com o suporte para migrar de plano ou liberar uma exceção.`)
    }

    const { data: newCuId, error } = await supabase.rpc('create_clinic_member', {
      p_email:        form.email.trim().toLowerCase(),
      p_password:     form.password,
      p_display_name: form.name.trim(),
      p_username:     normalizeUsername(form.username),
      p_role:         form.role,
      p_specialty_type: form.specialty_type || null,
    })
    if (error) {
      setSaving(false)
      const msg = error.message.includes('email_taken')      ? 'Este e-mail já está em uso.'
        : error.message.includes('username_taken')           ? 'Este nome de usuário já está em uso.'
        : error.message.includes('username_invalid')         ? 'Nome de usuário inválido (3-30 chars: letras, números, _ . -).'
        : error.message.includes('user_limit_reached')       ? 'Limite de usuários do plano atingido. Fale com o suporte para migrar de plano.'
        : 'Erro ao criar login: ' + error.message
      return setErrorMsg(msg)
    }

    const permPayload = Object.entries(presetPermissions(form.role)).map(([module, p]) => ({
      module, can_view: p.can_view, can_edit: p.can_edit, metadata: p.metadata ?? {},
    }))
    const { error: permErr } = await supabase.rpc('save_clinic_member_permissions', {
      p_member_id: newCuId, p_permissions: permPayload,
    })

    const { error: profErr } = await supabase.from('professionals').insert([{
      clinic_id: clinic.id,
      name: form.name.trim(),
      specialty: form.specialty || null,
      specialty_type: form.specialty_type || null,
      default_duration_minutes: form.defaultDuration ? Number(form.defaultDuration) : null,
      clinic_user_id: newCuId,
    }])
    if (form.specialty_type) addClinicSpecialty(form.specialty_type)

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
    setShowSpecialtySuggestions(false)
    loadData()
    loadUserCount()
  }

  async function handleDelete(p: ProfessionalRow) {
    if (!p.clinic_user_id) {
      if (!(await confirmDialog({ message: 'Remover profissional?', confirmText: 'Remover', danger: true }))) return
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Equipe</h1>
          <p className={styles.sub}>
            {professionals.length} {professionals.length === 1 ? 'profissional' : 'profissionais'}
            {isAdmin && (userLimit === null
              ? ` · ${activeUserCount} usuário${activeUserCount !== 1 ? 's' : ''} com login (plano sem limite)`
              : ` · ${activeUserCount} de ${userLimit} usuário${userLimit > 1 ? 's' : ''} com login`)}
          </p>
        </div>
        <button className={styles.btnPrimary} onClick={openNewModal}>+ Novo Profissional</button>
      </div>

      {loading ? <p className={styles.loading}>Carregando...</p> : (
        <div className={`${styles.tableWrap} resp-table-wrap`} data-hscroll>
          <table className={`${styles.table} resp-table`}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Especialidade</th>
                <th>Acesso</th>
                <th>Cadastrado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {professionals.length === 0 ? (
                <tr><td colSpan={5} className={styles.empty}>Nenhum profissional cadastrado.</td></tr>
              ) : professionals.map((p) => (
                <tr key={p.id}>
                  <td className={styles.bold}>{p.name}</td>
                  <td data-label="Especialidade">{p.specialty ?? '-'}</td>
                  <td data-label="Acesso">
                    {p.clinic_user_id ? (
                      <span className={styles.badgeAccess}>
                        <Icon name="check" size={11} /> Tem acesso{p.clinic_users?.role ? ` · ${p.clinic_users.specialty_type ? specialtyRoleLabel(p.clinic_users.specialty_type) : (ROLE_LABELS_FALLBACK[p.clinic_users.role] ?? p.clinic_users.role)}` : ''}
                        {p.clinic_users && !p.clinic_users.is_active && <em className={styles.badgeInactive}> (desativado)</em>}
                      </span>
                    ) : (
                      <span className={styles.badgeNoAccess}>Só agenda</span>
                    )}
                  </td>
                  <td data-label="Cadastrado em">{formatDate(p.created_at, true)}</td>
                  <td data-label="Ações">
                    <button className={styles.btnDelete} onClick={() => handleDelete(p)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Portal>
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Novo Profissional</h2>
              <button className={styles.btnClose} onClick={() => setShowModal(false)}><Icon name="close" size={18} /></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label>Nome *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className={styles.field}>
                <label>Especialidade</label>
                <input
                  value={form.specialty}
                  onChange={(e) => { setForm((p) => ({ ...p, specialty: e.target.value })); setShowSpecialtySuggestions(true) }}
                  onFocus={() => setShowSpecialtySuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSpecialtySuggestions(false), 150)}
                  placeholder="Ex: Ortodontia, Clínico Geral..."
                  autoComplete="off"
                />
                {showSpecialtySuggestions && filteredSpecialtySuggestions.length > 0 && (
                  <div className={styles.suggestionsDropdown}>
                    {filteredSpecialtySuggestions.map(s => (
                      <button
                        key={s}
                        type="button"
                        className={styles.suggestionItem}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setForm(p => ({ ...p, specialty: s })); setShowSpecialtySuggestions(false) }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.field}>
                <label>Duração padrão do atendimento (min)</label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={form.defaultDuration}
                  onChange={(e) => setForm((p) => ({ ...p, defaultDuration: e.target.value }))}
                  placeholder={`Padrão da área (${getSpecialtyConfig(form.specialty_type || clinic?.type).defaultDurationMinutes} min)`}
                />
              </div>

              {isAdmin && (
                <div className={styles.accessSection}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={form.hasAccess}
                      onChange={(e) => setForm(p => ({ ...p, hasAccess: e.target.checked }))}
                      disabled={userLimit !== null && activeUserCount >= userLimit && !form.hasAccess}
                    />
                    <span>Este profissional vai acessar o sistema?</span>
                  </label>
                  {userLimit !== null && activeUserCount >= userLimit && !form.hasAccess && (
                    <p className={styles.hint}>Limite de usuários do plano atingido ({activeUserCount}/{userLimit}). Só dá pra cadastrar sem login agora.</p>
                  )}

                  {form.hasAccess && (
                    <>
                      <div className={styles.field}>
                        <label>{clinic?.isMultiSpecialty ? 'Cargo / Área de atuação' : 'Cargo'}</label>
                        {clinic?.isMultiSpecialty ? (
                          <select
                            value={form.specialty_type || form.role}
                            onChange={(e) => {
                              const v = e.target.value
                              const isArea = CLINIC_TYPE_OPTIONS.some(o => o.value === v)
                              setForm(p => ({
                                ...p,
                                role: isArea ? roleForSpecialty(v as ClinicType) : (v as UserRole),
                                specialty_type: isArea ? (v as ClinicType) : '',
                              }))
                            }}
                          >
                            <option value="recepcao">Recepção</option>
                            <option value="auxiliar">Auxiliar</option>
                            <optgroup label="Área de atuação">
                              {clinicAreaOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </optgroup>
                          </select>
                        ) : (
                          <select value={form.role} onChange={(e) => setForm(p => ({ ...p, role: e.target.value as UserRole }))}>
                            {specialtyRoles.filter(r => r.value !== 'admin').map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className={styles.field}>
                        <label>Nome de usuário (login) *</label>
                        <input
                          value={form.username}
                          onChange={(e) => setForm(p => ({ ...p, username: normalizeUsername(e.target.value) }))}
                          placeholder="ex: mariasilva"
                        />
                      </div>
                      <div className={styles.field}>
                        <label>E-mail *</label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                          placeholder="profissional@clinica.com"
                        />
                      </div>
                      <div className={styles.field}>
                        <label>Senha *</label>
                        <input
                          type="password"
                          value={form.password}
                          onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                          placeholder="mín. 6 caracteres"
                        />
                      </div>
                      <p className={styles.hint}>As permissões vêm pré-marcadas pro cargo — dá pra ajustar depois em Configurações → Equipe.</p>
                    </>
                  )}
                </div>
              )}

              {errorMsg && <p className={styles.fieldError}>{errorMsg}</p>}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setShowModal(false)}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {deleteTarget && (
        <Portal>
        <div className={styles.overlay} onClick={() => !deleteLoading && setDeleteTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className={styles.modalHeader}>
              <h2>Remover {deleteTarget.name}</h2>
              <button className={styles.btnClose} onClick={() => setDeleteTarget(null)}><Icon name="close" size={18} /></button>
            </div>
            <div className={styles.modalBody}>
              <p>Esse profissional também tem login no sistema. O que você quer fazer?</p>
            </div>
            <div className={styles.modalFooter} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.6rem' }}>
              <button className={styles.btnSave} onClick={removeOnlyFromAgenda} disabled={deleteLoading}>
                Remover só da agenda (mantém o login)
              </button>
              <button className={styles.btnDelete} onClick={removeAndDeactivateAccess} disabled={deleteLoading} style={{ width: '100%', justifyContent: 'center' }}>
                Remover da agenda e desativar o acesso
              </button>
              <button className={styles.btnCancel} onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Cancelar</button>
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
    </div>
  )
}

export default function EquipePage() {
  return <PermissionGuard module="equipe"><EquipeContent /></PermissionGuard>
}
