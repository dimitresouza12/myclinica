'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate } from '@/lib/utils'
import { getSpecialtyConfig, mergeSpecialtyConfigs, specialtyRoleLabel, roleForSpecialty, CLINIC_TYPE_OPTIONS } from '@/lib/specialtyConfig'
import { presetPermissions } from '@/lib/permissionPresets'
import { normalizeUsername } from '@/lib/username'
import { professionalLimitFor } from '@/lib/planCatalog'
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
  hasAccess: boolean
  role: UserRole
  username: string
  email: string
  password: string
}
const BLANK: NewProf = { name: '', specialty: '', specialty_type: '', defaultDuration: '', registrationNumber: '', hasAccess: false, role: 'recepcao', username: '', email: '', password: '' }

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
  // Profissional em edição — quando setado, handleSave faz UPDATE em vez de
  // criar um novo. Só edita os campos da própria tabela `professionals`
  // (nome, especialidade, duração, registro); login/cargo/senha continuam
  // sendo função exclusiva de Configurações → Equipe.
  const [editingProf, setEditingProf] = useState<ProfessionalRow | null>(null)

  // Limite é por PROFISSIONAL cadastrado (com ou sem login) — recepção e
  // auxiliar não contam mais pro teto do plano (reestruturação de planos:
  // Completo passou a limitar profissionais, não logins). Mas TODO salvamento
  // nesta tela sem login (form.hasAccess=false) sempre cria um profissional
  // — "só agenda" só faz sentido pra gente clínica — daí `isClinicalRole`
  // só entrar em jogo quando tem login (aí sim pode ser recepção/auxiliar).
  const professionalLimit = professionalLimitFor(clinic?.plan, clinic?.maxUsers)
  const professionalLimitReached = professionalLimit !== null && professionals.length >= professionalLimit
  const clinicalRole = specialtyRoles.find(r => !['recepcao', 'auxiliar', 'admin'].includes(r.value))?.value as UserRole | undefined
  function isClinicalRole(role: UserRole) {
    return !['recepcao', 'auxiliar', 'admin'].includes(role)
  }
  const willCreateProfessional = !form.hasAccess || isClinicalRole(form.role)
  const blockedByProfessionalLimit = professionalLimitReached && willCreateProfessional

  const filteredSpecialtySuggestions = specialtySuggestions.filter(s =>
    s.toLowerCase().includes(form.specialty.trim().toLowerCase())
  )

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
    // Clínica multi-área: NÃO pré-selecionar um cargo clínico aqui. `role`
    // e `specialty_type` são ClinicType/UserRole com valores em comum (ex:
    // 'medico' é os dois) — se role já nascesse 'medico', o <select> de
    // "Cargo / Área de atuação" (value={specialty_type || role}) mostraria
    // "Medicina" pré-marcado sem specialty_type ter sido de fato escolhido,
    // e o profissional seria salvo com specialty_type null (ficha por área
    // e agenda/pacientes por área nunca resolvem a área dele). Força
    // "Recepção" como ponto de partida — sem ambiguidade — só clínica de
    // uma área só (sem esse seletor) mantém o atalho de já vir preenchido.
    setForm({ ...BLANK, role: clinic?.isMultiSpecialty ? 'recepcao' : (clinicalRole ?? 'recepcao') })
    setEditingProf(null)
    setErrorMsg(null)
    setShowModal(true)
  }

  function openEditModal(p: ProfessionalRow) {
    setForm({
      ...BLANK,
      name: p.name,
      specialty: p.specialty ?? '',
      specialty_type: (p.specialty_type ?? '') as ClinicType | '',
      defaultDuration: p.default_duration_minutes != null ? String(p.default_duration_minutes) : '',
      registrationNumber: p.registration_number ?? '',
    })
    setEditingProf(p)
    setErrorMsg(null)
    setShowModal(true)
  }

  async function handleSave() {
    if (!clinic || !form.name.trim()) return
    setErrorMsg(null)

    if (editingProf) {
      setSaving(true)
      const { error } = await supabase.from('professionals').update({
        name: form.name.trim(),
        specialty: form.specialty || null,
        specialty_type: form.specialty_type || null,
        default_duration_minutes: form.defaultDuration ? Number(form.defaultDuration) : null,
        registration_number: form.registrationNumber.trim() || null,
      }).eq('id', editingProf.id).eq('clinic_id', clinic.id)
      if (error) { setSaving(false); setErrorMsg('Erro ao salvar profissional: ' + error.message); return }
      // Profissional com login vinculado — resincroniza o nome de exibição
      // também no login, senão diverge do que aparece em Configurações → Equipe.
      if (editingProf.clinic_user_id && editingProf.clinic_users) {
        await supabase.rpc('update_clinic_member', {
          p_member_id: editingProf.clinic_user_id,
          p_role: editingProf.clinic_users.role,
          p_is_active: editingProf.clinic_users.is_active,
          p_display_name: form.name.trim(),
        })
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
      }])
      setSaving(false)
      if (error) { setErrorMsg('Erro ao salvar profissional: ' + error.message); return }
      setShowModal(false)
      setForm(BLANK)
      setShowSpecialtySuggestions(false)
      loadData()
      return
    }

    // Criando também o login — mesma validação usada em Configurações →
    // Equipe. Login em si não tem limite de plano (só profissional tem,
    // checado acima antes dos dois caminhos).
    if (!form.username.trim()) { setSaving(false); return setErrorMsg('Nome de usuário é obrigatório.') }
    if (!form.email.trim())    { setSaving(false); return setErrorMsg('E-mail é obrigatório.') }
    if (form.password.length < 6) { setSaving(false); return setErrorMsg('Senha deve ter pelo menos 6 caracteres.') }

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
          clinic_user_id: newCuId,
        }])).error
      : null
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
        actions={<button type="button" className={btn.primary} onClick={openNewModal}><Icon name="plus" size={15} /> Novo profissional</button>}
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
                  <tr key={p.id} className={`${t.clickable} ${styles.row}`} onClick={() => openEditModal(p)}>
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
                        <MoreMenu
                          label={`Mais ações de ${p.name}`}
                          items={[
                            { label: 'Editar', icon: 'edit', onClick: () => openEditModal(p) },
                            { label: 'Remover', icon: 'trash', danger: true, onClick: () => handleDelete(p) },
                          ]}
                        />
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
            {!form.hasAccess ? '' : ' — recepção e auxiliar continuam sem limite, mude o cargo acima'}.
          </p>
        )}
        <div className={f.field}>
          <label>Nome *</label>
          <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        </div>
        <div className={f.field}>
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
          <label>Registro profissional (CRO/CRM/CRMV...)</label>
          <input
            value={form.registrationNumber}
            onChange={(e) => setForm((p) => ({ ...p, registrationNumber: e.target.value }))}
            placeholder="Ex: CRO-SP 12345"
          />
          <p className={f.hint}>Preenche automaticamente documentos como a Receita de Controle Especial.</p>
        </div>

        {!editingProf && isAdmin && (
          <div className={styles.accessSection}>
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
                  <label>{clinic?.isMultiSpecialty ? 'Cargo / Área de atuação' : 'Cargo'}</label>
                  {clinic?.isMultiSpecialty ? (
                    <SelectMenu
                      variant="field"
                      ariaLabel="Cargo ou área de atuação"
                      value={form.specialty_type || form.role}
                      onChange={v => {
                        const isArea = CLINIC_TYPE_OPTIONS.some(o => o.value === v)
                        setForm(p => ({
                          ...p,
                          role: isArea ? roleForSpecialty(v as ClinicType) : (v as UserRole),
                          specialty_type: isArea ? (v as ClinicType) : '',
                        }))
                      }}
                      options={[
                        { value: 'recepcao', label: 'Recepção' },
                        { value: 'auxiliar', label: 'Auxiliar' },
                        ...clinicAreaOptions.map(o => ({ value: o.value, label: o.label, group: 'Área de atuação' })),
                      ]}
                    />
                  ) : (
                    <SelectMenu variant="field" ariaLabel="Cargo" value={form.role}
                      onChange={v => setForm(p => ({ ...p, role: v as UserRole }))}
                      options={specialtyRoles.filter(r => r.value !== 'admin').map(r => ({ value: r.value, label: r.label }))} />
                  )}
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
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="mín. 6 caracteres"
                  />
                </div>
                <p className={f.hint}>As permissões vêm pré-marcadas pro cargo — dá pra ajustar depois em Configurações → Equipe.</p>
              </>
            )}
          </div>
        )}

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
          onClose={() => setCreatedCredentials(null)}
        />
      )}
    </div>
  )
}

export default function EquipePage() {
  return <PermissionGuard module="equipe"><EquipeContent /></PermissionGuard>
}
