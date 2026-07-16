'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { formatDate, formatPhone } from '@/lib/utils'
import { syncLeadAppointments } from '@/lib/sync-leads'
import { hasWhatsApp } from '@/lib/planGates'
import { usePacientesData } from '@/hooks/useClinicData'
import type { Patient } from '@/types'
import { ProntuarioModal } from '@/components/prontuario/ProntuarioModal'
import { PatientFormModal } from '@/components/pacientes/PatientFormModal'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { useScrollLock } from '@/hooks/useScrollLock'
import styles from './pacientes.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'

function PacientesContent() {
  const { clinic } = useAuthStore()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: pacientesData, isLoading: loading } = usePacientesData(clinic?.id)
  const patients = pacientesData?.patients ?? []

  const [prontuarioPatient, setProntuarioPatient] = useState<Patient | null>(null)
  const [editPatient, setEditPatient] = useState<Patient | null>(null)
  const [showNewPatient, setShowNewPatient] = useState(false)

  useScrollLock(!!prontuarioPatient || !!editPatient || showNewPatient)

  // Fire-and-forget sync in background
  useEffect(() => {
    if (clinic && hasWhatsApp(clinic.plan)) syncLeadAppointments(clinic.id, clinic.slug)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  // Open prontuário directly if ?patient=<id> is in URL
  useEffect(() => {
    const targetId = searchParams.get('patient')
    if (!targetId || !patients.length) return
    const target = patients.find(p => p.id === targetId)
    if (target) setProntuarioPatient(target)
  }, [patients, searchParams])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['pacientes', clinic?.id] })
  }

  const filteredPatients = useMemo(() => {
    const term = search.toLowerCase()
    return patients.filter((p) => {
      const name = p.name.toLowerCase()
      const phone = (p.phone ?? '').toLowerCase()
      const email = (p.email ?? '').toLowerCase()
      return !term || name.includes(term) || phone.includes(term) || email.includes(term)
    })
  }, [patients, search])

  function handleSaved() {
    setEditPatient(null)
    setShowNewPatient(false)
    invalidate()
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Pacientes</h1>
          <p className={styles.sub}>{filteredPatients.length} pacientes</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <GlobalSearch />
          <button className={styles.btnPrimary} onClick={() => setShowNewPatient(true)}>
            + Novo Paciente
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            className={styles.search}
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <p className={styles.loading}>Carregando...</p>
      ) : (
        <div className={`${styles.tableWrap} resp-table-wrap`}>
          <table className={`${styles.table} resp-table`}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Cadastro</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length === 0 ? (
                <tr><td colSpan={5} className={styles.empty}>Nenhum paciente encontrado.</td></tr>
              ) : filteredPatients.map((p) => (
                <tr key={p.id}>
                  <td className={styles.bold}>{p.name}</td>
                  <td data-label="Telefone">{formatPhone(p.phone)}</td>
                  <td data-label="E-mail">{p.email ?? '-'}</td>
                  <td data-label="Cadastro">{formatDate(p.created_at, true)}</td>
                  <td data-label="Ações">
                    <div className={styles.actions}>
                      <button className={styles.btnAction} onClick={() => setProntuarioPatient(p)}>
                        Prontuário
                      </button>
                      <button className={`${styles.btnAction} ${styles.btnSecondary}`} onClick={() => setEditPatient(p)}>
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {prontuarioPatient && (
        <ProntuarioModal
          patient={prontuarioPatient}
          clinic={clinic!}
          onClose={() => setProntuarioPatient(null)}
        />
      )}

      {(editPatient || showNewPatient) && (
        <PatientFormModal
          patient={editPatient}
          clinicId={clinic!.id}
          onClose={() => { setEditPatient(null); setShowNewPatient(false) }}
          onSaved={handleSaved}
        />
      )}

    </div>
  )
}

export default function PacientesPage() {
  return (
    <PermissionGuard module="pacientes">
      <Suspense fallback={<div />}>
        <PacientesContent />
      </Suspense>
    </PermissionGuard>
  )
}
