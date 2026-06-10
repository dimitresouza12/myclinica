'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate } from '@/lib/utils'
import type { Clinic } from '@/types'
import { StatusBadge } from './StatusBadge'
import { ClinicEditModal } from './ClinicEditModal'
import { useScrollLock } from '@/hooks/useScrollLock'
import styles from './admin.module.css'

interface Props {
  clinics: Clinic[]
  onReload: () => void
}

export function AdminClinicas({ clinics, onReload }: Props) {
  const router = useRouter()
  const { clinic: myClinic, setClinicLogo, startImpersonation } = useAuthStore()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [editTarget, setEditTarget] = useState<Clinic | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [uploadMsg, setUploadMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', slug: '', clinic_type: 'odonto', email: '', phone: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Clinic | null>(null)
  const [deleting, setDeleting] = useState(false)

  useScrollLock(!!editTarget || showNewModal || !!deleteTarget)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingClinicRef = useRef<Clinic | null>(null)

  const filtered = clinics.filter((c) => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.slug.includes(search.toLowerCase())
    const matchStatus = !filterStatus || c.status === filterStatus
    return matchSearch && matchStatus
  })

  function handleImpersonate(c: Clinic) {
    startImpersonation(c.id, c.name)
    router.push('/dashboard')
  }

  async function handleApprove(c: Clinic) {
    if (!confirm(`Aprovar a clínica "${c.name}"?`)) return
    await supabase.from('clinics').update({ status: 'active', is_active: true }).eq('id', c.id)
    onReload()
  }

  async function handleReject(c: Clinic) {
    if (!confirm(`Rejeitar e marcar como inativa a clínica "${c.name}"?`)) return
    await supabase.from('clinics').update({ status: 'inactive', is_active: false }).eq('id', c.id)
    onReload()
  }

  function triggerLogoUpload(clinic: Clinic) {
    pendingClinicRef.current = clinic
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const clinic = pendingClinicRef.current
    if (!file || !clinic) return
    e.target.value = ''
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${clinic.id}/logo.${ext}`
    setUploadingId(clinic.id)
    setUploadMsg(null)
    const { error: upErr } = await supabase.storage.from('clinic-logos').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) {
      setUploadingId(null)
      setUploadMsg({ id: clinic.id, ok: false, text: 'Erro: ' + upErr.message })
      return
    }
    const { data: urlData } = supabase.storage.from('clinic-logos').getPublicUrl(path)
    const publicUrl = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('clinics').update({ logo_url: publicUrl }).eq('id', clinic.id)
    setUploadingId(null)
    setUploadMsg({ id: clinic.id, ok: true, text: 'Logo atualizada!' })
    if (myClinic?.id === clinic.id) setClinicLogo(publicUrl)
    onReload()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('clinics').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
    onReload()
  }

  async function handleCreateClinic() {
    if (!newForm.name || !newForm.slug) return
    setSaving(true)
    await supabase.from('clinics').insert([newForm])
    setSaving(false)
    setShowNewModal(false)
    setNewForm({ name: '', slug: '', clinic_type: 'odonto', email: '', phone: '', address: '' })
    onReload()
  }

  const PLAN_COLORS: Record<string, string> = { basico: '#0D9488', plus: '#F59E0B' }
  const pendingCount = clinics.filter(c => c.status === 'pending').length

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      <div className={styles.tableToolbar}>
        <div className={styles.toolbarLeft}>
          <input
            className={styles.searchInput}
            placeholder="Buscar por nome ou slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={styles.selectFilter} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="pending">⏳ Pendentes (novas)</option>
            <option value="active">Ativa</option>
            <option value="inactive">Inativa</option>
            <option value="suspended">Suspensa</option>
          </select>
          {pendingCount > 0 && filterStatus !== 'pending' && (
            <button className={styles.pendingAlert} onClick={() => setFilterStatus('pending')}>
              {pendingCount} aguardando aprovação
            </button>
          )}
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowNewModal(true)}>+ Nova Clínica</button>
      </div>

      <div className={styles.richTable}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Clínica</th>
              <th>Tipo</th>
              <th>Plano</th>
              <th>Status</th>
              <th>Trial</th>
              <th>Pacientes</th>
              <th>Mensalidade</th>
              <th>Criada</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className={styles.empty}>Nenhuma clínica encontrada.</td></tr>
            ) : filtered.map((c) => (
              <tr key={c.id} className={styles.clinicRow}>
                <td>
                  <div className={styles.clinicCell}>
                    <div className={styles.clinicLogo}>
                      {c.logo_url
                        ? <img src={c.logo_url} alt={c.name} className={styles.logoThumb} />
                        : <div className={styles.logoInitials} style={{ background: c.primary_color ?? '#0D9488' }}>{c.name[0]}</div>
                      }
                    </div>
                    <div>
                      <p className={styles.clinicName}>{c.name}</p>
                      <code className={styles.clinicSlug}>{c.slug}</code>
                    </div>
                  </div>
                </td>
                <td><span className={styles.typeChip}>{c.clinic_type}</span></td>
                <td>
                  <span className={styles.planPill} style={{ background: `${PLAN_COLORS[c.plan ?? 'basico']}22`, color: PLAN_COLORS[c.plan ?? 'basico'], borderColor: `${PLAN_COLORS[c.plan ?? 'basico']}55` }}>
                    {c.plan ?? 'basico'}
                  </span>
                </td>
                <td><StatusBadge status={c.status ?? 'active'} /></td>
                <td>
                  {!c.trial_ends_at ? (
                    <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>Permanente</span>
                  ) : new Date() > new Date(c.trial_ends_at) ? (
                    <span style={{ fontSize: '0.75rem', color: '#EF4444', fontWeight: 600 }}>Expirado</span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#F59E0B', fontWeight: 600 }}>
                      até {new Date(c.trial_ends_at).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </td>
                <td className={styles.patientCount}>{c.max_patients ?? 200}</td>
                <td>
                  <span className={c.billing_paid ? styles.paidBadge : styles.unpaidBadge}>
                    {c.billing_paid ? '✓ Pago' : '⚠ Pendente'}
                  </span>
                  {c.billing_due_day && (
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      vence dia {c.billing_due_day}
                    </span>
                  )}
                </td>
                <td className={styles.dateCell}>{formatDate(c.created_at, true)}</td>
                <td>
                  <div className={styles.rowActions}>
                    {c.status === 'pending' ? (
                      <>
                        <span className={styles.planPillPending} style={{ background: `${PLAN_COLORS[c.plan ?? 'basico']}22`, color: PLAN_COLORS[c.plan ?? 'basico'], borderColor: `${PLAN_COLORS[c.plan ?? 'basico']}55` }}>
                          Plano: {c.plan ?? 'basico'}
                        </span>
                        <button className={styles.actionBtnApprove} onClick={() => handleApprove(c)} title="Aprovar cadastro">
                          ✓ Aprovar
                        </button>
                        <button className={styles.actionBtnReject} onClick={() => handleReject(c)} title="Rejeitar cadastro">
                          ✕ Rejeitar
                        </button>
                      </>
                    ) : (
                      <>
                        <button className={styles.actionBtn} onClick={() => triggerLogoUpload(c)} disabled={uploadingId === c.id} title="Upload logo">
                          {uploadingId === c.id ? '...' : '↑'}
                        </button>
                        <button className={styles.actionBtnSecondary} onClick={() => setEditTarget(c)} title="Editar plano/status">
                          Editar
                        </button>
                        <button className={styles.actionBtnImpersonate} onClick={() => handleImpersonate(c)} title="Visualizar como esta clínica">
                          👁 Ver como
                        </button>
                        <button className={styles.btnDanger} onClick={() => setDeleteTarget(c)} title="Excluir clínica">
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                  {uploadMsg?.id === c.id && (
                    <p className={uploadMsg.ok ? styles.msgOk : styles.msgErr}>{uploadMsg.text}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <ClinicEditModal
          clinic={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); onReload() }}
        />
      )}

      {deleteTarget && (
        <div className={styles.overlay} onClick={() => setDeleteTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Excluir clínica</h2>
              <button className={styles.btnClose} onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                Tem certeza que deseja excluir permanentemente a clínica <strong>{deleteTarget.name}</strong>?
              </p>
              <p style={{ fontSize: '0.82rem', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.75rem', marginTop: '0.5rem' }}>
                ⚠️ Esta ação é irreversível. Todos os dados da clínica serão apagados.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button
                style={{ padding: '0.55rem 1.25rem', background: '#DC2626', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewModal && (
        <div className={styles.overlay} onClick={() => setShowNewModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Nova Clínica</h2>
              <button className={styles.btnClose} onClick={() => setShowNewModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {([['name','Nome *','text'],['slug','Slug *','text'],['email','E-mail','email'],['phone','Telefone','tel'],['address','Endereço','text']] as [string,string,string][]).map(([k,l,t]) => (
                <div className={styles.field} key={k}>
                  <label>{l}</label>
                  <input type={t} className={styles.fieldInput} value={(newForm as Record<string,string>)[k]} onChange={(e) => setNewForm((p) => ({ ...p, [k]: e.target.value }))} />
                </div>
              ))}
              <div className={styles.field}>
                <label>Tipo</label>
                <select className={styles.fieldInput} value={newForm.clinic_type} onChange={(e) => setNewForm((p) => ({ ...p, clinic_type: e.target.value }))}>
                  <option value="odonto">Odontologia</option>
                  <option value="medico">Medicina</option>
                  <option value="estetica">Estética</option>
                  <option value="vet">Veterinária</option>
                </select>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnCancel} onClick={() => setShowNewModal(false)}>Cancelar</button>
              <button className={styles.btnSave} onClick={handleCreateClinic} disabled={saving || !newForm.name || !newForm.slug}>
                {saving ? 'Criando...' : 'Criar Clínica'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
