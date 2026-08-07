'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import type { Clinic } from '@/types'
import { computeClinicStatus } from '@/lib/clinicStatus'
import { StatusBadge } from './StatusBadge'
import { ClinicEditModal } from './ClinicEditModal'
import { Portal } from '@/components/ui/Portal'
import { useScrollLock } from '@/hooks/useScrollLock'
import styles from './admin.module.css'
import { Icon } from '@/components/ui/Icon'
import { CLINIC_TYPE_OPTIONS } from '@/lib/specialtyConfig'

function waLink(phone: string, clinicName: string): string {
  const clean = phone.replace(/\D/g, '')
  const number = clean.startsWith('55') ? clean : `55${clean}`
  const msg = encodeURIComponent(`Olá! Aqui é do MyClinica, sobre o cadastro da clínica ${clinicName}. 😊`)
  return `https://wa.me/${number}?text=${msg}`
}

interface Props {
  clinics: Clinic[]
  onReload: () => void
}

export function AdminClinicas({ clinics, onReload }: Props) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [editTarget, setEditTarget] = useState<Clinic | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', slug: '', clinic_type: 'odonto', email: '', phone: '', address: '' })
  const [saving, setSaving] = useState(false)

  useScrollLock(!!editTarget || showNewModal)

  const filtered = clinics.filter((c) => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.slug.includes(search.toLowerCase())
    const matchStatus = !filterStatus || computeClinicStatus(c) === filterStatus
    return matchSearch && matchStatus
  })

  async function handleCreateClinic() {
    if (!newForm.name || !newForm.slug) return
    setSaving(true)
    await supabase.from('clinics').insert([newForm])
    setSaving(false)
    setShowNewModal(false)
    setNewForm({ name: '', slug: '', clinic_type: 'odonto', email: '', phone: '', address: '' })
    onReload()
  }

  const PLAN_COLORS: Record<string, string> = {
    essencial:     '#0D9488',
    avancado:      '#3B82F6',
    completo:      '#8B5CF6',
    completo_plus: '#F59E0B',
  }
  return (
    <>
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
            <option value="active">Ativa</option>
            <option value="trial">Trial</option>
            <option value="trial_expired">Trial expirado</option>
            <option value="suspended">Suspensa (atraso)</option>
          </select>
        </div>
        <button className={styles.btnPrimary} onClick={() => setShowNewModal(true)}>+ Nova Clínica</button>
      </div>

      <div className={`${styles.richTable} resp-table-wrap`}>
        <table className={`${styles.table} resp-table`}>
          <thead>
            <tr>
              <th>Clínica</th>
              <th>Tipo</th>
              <th>Plano</th>
              <th>Status</th>
              <th>Trial</th>
              <th>Pacientes</th>
              <th>Mensalidade</th>
              <th>Contato</th>
              <th>Criada</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className={styles.empty}>Nenhuma clínica encontrada.</td></tr>
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
                <td data-label="Tipo"><span className={styles.typeChip}>{c.clinic_type}</span></td>
                <td data-label="Plano">
                  <span className={styles.planPill} style={{ background: `${PLAN_COLORS[c.plan ?? 'basico']}22`, color: PLAN_COLORS[c.plan ?? 'basico'], borderColor: `${PLAN_COLORS[c.plan ?? 'basico']}55` }}>
                    {c.plan ?? 'basico'}
                  </span>
                </td>
                <td data-label="Status"><StatusBadge clinic={c} /></td>
                <td data-label="Trial">
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
                <td data-label="Pacientes" className={styles.patientCount}>{c.max_patients ?? 200}</td>
                <td data-label="Mensalidade">
                  <span className={c.billing_paid ? styles.paidBadge : styles.unpaidBadge}>
                    {c.billing_paid ? <><Icon name="check" size={11} /> Pago</> : <><Icon name="alert" size={11} /> Pendente</>}
                  </span>
                  {c.billing_due_day && (
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      vence dia {c.billing_due_day}
                    </span>
                  )}
                </td>
                <td data-label="Contato">
                  {c.phone ? (
                    <div className={styles.contactCell}>
                      <span className={styles.contactPhone}>{c.phone}</span>
                      <a
                        href={waLink(c.phone, c.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.contactWa}
                        title={`Falar com ${c.name} no WhatsApp`}
                      >
                        <Icon name="phone" size={12} /> WhatsApp
                      </a>
                    </div>
                  ) : (
                    <span className={styles.contactEmpty}>—</span>
                  )}
                </td>
                <td data-label="Criada" className={styles.dateCell}>{formatDate(c.created_at, true)}</td>
                <td data-label="Ações">
                  <div className={styles.rowActions}>
                    <button className={styles.actionBtnSecondary} onClick={() => setEditTarget(c)} title="Editar clínica">
                      Editar
                    </button>
                  </div>
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

      {showNewModal && (
        <Portal>
        <div className={styles.overlay} onClick={() => setShowNewModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Nova Clínica</h2>
              <button className={styles.btnClose} onClick={() => setShowNewModal(false)}><Icon name="close" size={18} /></button>
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
                  {CLINIC_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        </Portal>
      )}
    </>
  )
}
