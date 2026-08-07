'use client'
import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import { getSpecialtyConfig, specialtyRoleLabel } from '@/lib/specialtyConfig'
import type { ClinicUser, Clinic } from '@/types'
import styles from './admin.module.css'

type UserWithClinic = ClinicUser & { clinics?: { name: string } | null }

interface Props {
  users: UserWithClinic[]
  clinics: Clinic[]
}

const ROLE_LABELS: Record<string, string> = {
  admin:        'Admin',
  recepcao:     'Recepção',
  auxiliar:     'Auxiliar',
  dentista:     'Dentista',
  medico:       'Médico',
  profissional: 'Profissional',
  superadmin:   'Superadmin',
}

export function AdminUsuarios({ users, clinics }: Props) {
  const [filterClinic, setFilterClinic] = useState('')
  const [search, setSearch] = useState('')

  const filtered = users.filter((u) => {
    const matchClinic = !filterClinic || u.clinic_id === filterClinic
    const matchSearch = !search || u.display_name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase())
    return matchClinic && matchSearch
  })

  function initials(name: string) {
    return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  }

  function roleLabel(u: UserWithClinic) {
    if (u.specialty_type) return specialtyRoleLabel(u.specialty_type)
    const clinicType = clinics.find(c => c.id === u.clinic_id)?.clinic_type
    return getSpecialtyConfig(clinicType).roles.find(r => r.value === u.role)?.label ?? ROLE_LABELS[u.role] ?? u.role
  }

  return (
    <div className={styles.usuariosWrap}>
      <div className={styles.logsFilters}>
        <input className={styles.searchInput} placeholder="Buscar por nome ou usuário..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={styles.selectFilter} value={filterClinic} onChange={(e) => setFilterClinic(e.target.value)}>
          <option value="">Todas as clínicas</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className={`${styles.richTable} resp-table-wrap`}>
        <table className={`${styles.table} resp-table`}>
          <thead>
            <tr><th>Usuário</th><th>Clínica</th><th>Função</th><th>Status</th><th>Cadastro</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className={styles.empty}>Nenhum usuário encontrado.</td></tr>
            ) : filtered.map((u) => (
              <tr key={u.id} className={styles.logRow}>
                <td>
                  <div className={styles.userCell}>
                    <div className={styles.userAvatar}>{initials(u.display_name)}</div>
                    <div>
                      <p className={styles.clinicName}>{u.display_name}{u.is_superadmin && <span className={styles.superBadge}>Super</span>}</p>
                      <code className={styles.clinicSlug}>@{u.username}</code>
                    </div>
                  </div>
                </td>
                <td data-label="Clínica">{u.clinics?.name ?? <span className={styles.dimText}>—</span>}</td>
                <td data-label="Função"><span className={styles.roleChip}>{roleLabel(u)}</span></td>
                <td data-label="Status">
                  <span className={`${styles.statusPill} ${u.is_active ? styles.statusActive : styles.statusInactive}`}>
                    {u.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td data-label="Cadastro" className={styles.dateCell}>{formatDate(u.created_at, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
