'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { AppointmentStatus, AuthClinic, Patient } from '@/types'
import { supabase } from '@/lib/supabase'
import { useProfessionals } from '@/hooks/useClinicData'
import { STATUS_LABELS } from '@/lib/appointmentStatus'
import { usePermissions } from '@/hooks/usePermissions'
import { buildCadastroSections } from '@/lib/pacientes/cadastro'
import { PatientFormModal } from '@/components/pacientes/PatientFormModal'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { StatusDot, type StatusTone } from '@/components/ui/StatusDot'
import btn from '@/components/ui/button.module.css'
import styles from './PatientCadastroView.module.css'

const STATUS_TONE: Record<AppointmentStatus, StatusTone> = {
  agendado: 'wait', confirmado: 'ok', arrived: 'wait', in_progress: 'now', concluido: 'idle', faltou: 'warn', cancelado: 'bad', bloqueado: 'idle',
}

interface AgendaRow {
  id: string
  scheduled_at: string
  professional_id: string | null
  status: AppointmentStatus
}

const fmtDia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

interface Props {
  patient: Patient
  clinic: AuthClinic
}

/**
 * /pacientes/[id] para quem não tem o módulo Prontuário: só os dados cadastrais e o contato do paciente,
 * sem ficha clínica, abas ou impressões. Edita pelo mesmo formulário da lista de Pacientes (quem tem can_edit de 'pacientes').
 */
export function PatientCadastroView({ patient, clinic }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { canEdit } = usePermissions('pacientes')
  // Cartão de agenda: só com Ver em Agenda, e só data/hora/profissional/status — nada clínico
  const { canView: canViewAgenda } = usePermissions('agenda')
  const { data: professionals = [] } = useProfessionals(canViewAgenda ? clinic.id : undefined)
  const { data: agenda, isLoading: agendaLoading, isError: agendaError } = useQuery({
    queryKey: ['paciente-agenda', clinic.id, patient.id],
    enabled: canViewAgenda,
    staleTime: 30_000,
    queryFn: async () => {
      const nowIso = new Date().toISOString()
      const cols = 'id, scheduled_at, professional_id, status'
      const [nextRes, lastRes] = await Promise.all([
        supabase.from('appointments').select(cols).eq('clinic_id', clinic.id).eq('patient_id', patient.id)
          .in('status', ['agendado', 'confirmado', 'arrived', 'in_progress']).gte('scheduled_at', nowIso)
          .order('scheduled_at', { ascending: true }).limit(1),
        supabase.from('appointments').select(cols).eq('clinic_id', clinic.id).eq('patient_id', patient.id)
          .neq('status', 'bloqueado').lt('scheduled_at', nowIso)
          .order('scheduled_at', { ascending: false }).limit(3),
      ])
      if (nextRes.error || lastRes.error) throw new Error('agenda')
      return { next: ((nextRes.data ?? []) as AgendaRow[])[0] ?? null, last: (lastRes.data ?? []) as AgendaRow[] }
    },
  })
  const profName = (id: string | null) => (id ? professionals.find(p => p.id === id)?.name : null) ?? 'Sem profissional'
  const [editing, setEditing] = useState(false)
  const sections = buildCadastroSections(patient)
  const initials = patient.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  function handleSaved() {
    setEditing(false)
    queryClient.invalidateQueries({ queryKey: ['paciente', clinic.id, patient.id] })
    queryClient.invalidateQueries({ queryKey: ['pacientes', clinic.id] })
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <button type="button" className={styles.back} onClick={() => router.push('/pacientes')}>
          <Icon name="chevronLeft" size={16} aria-hidden="true" /> Pacientes
        </button>
      </div>

      <header className={styles.head}>
        {patient.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={patient.avatar_url} alt="" className={styles.avatar} />
          : <span className={styles.avatarInitials} aria-hidden="true">{initials}</span>}
        <div className={styles.headText}>
          <h1 className={styles.title}>{patient.name}</h1>
          <p className={styles.subtitle}>Cadastro</p>
        </div>
        {canEdit && (
          <button type="button" className={`${btn.primary} ${styles.edit}`} onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} aria-hidden="true" /> Editar cadastro
          </button>
        )}
      </header>

      {canViewAgenda && (
        <Card title="Agenda">
          {agendaLoading ? (
            <p className={styles.empty}>Carregando...</p>
          ) : agendaError || !agenda ? (
            <p className={styles.empty} role="alert">Não foi possível carregar a agenda deste paciente.</p>
          ) : (
            <div className={styles.agenda}>
              <div>
                <h3 className={styles.agendaLabel}>Próxima consulta</h3>
                {agenda.next ? (
                  <div className={styles.agendaRow}>
                    <span className={styles.agendaWhen}>{fmtDia(agenda.next.scheduled_at)} às {fmtHora(agenda.next.scheduled_at)}</span>
                    <span className={styles.agendaProf}>{profName(agenda.next.professional_id)}</span>
                    <StatusDot tone={STATUS_TONE[agenda.next.status]}>{STATUS_LABELS[agenda.next.status]}</StatusDot>
                  </div>
                ) : <p className={styles.empty}>Nenhuma consulta futura agendada.</p>}
              </div>
              <div>
                <h3 className={styles.agendaLabel}>Últimas consultas</h3>
                {agenda.last.length === 0 ? <p className={styles.empty}>Nenhuma consulta anterior.</p> : (
                  <ul className={styles.agendaList}>
                    {agenda.last.map(a => (
                      <li key={a.id} className={styles.agendaRow}>
                        <span className={styles.agendaWhen}>{fmtDia(a.scheduled_at)} às {fmtHora(a.scheduled_at)}</span>
                        <span className={styles.agendaProf}>{profName(a.professional_id)}</span>
                        <StatusDot tone={STATUS_TONE[a.status]}>{STATUS_LABELS[a.status]}</StatusDot>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {sections.length === 0 ? (
        <Card><p className={styles.empty}>Este paciente ainda não tem dados cadastrais preenchidos.</p></Card>
      ) : (
        <div className={styles.grid}>
          {sections.map(s => (
            <Card key={s.key} title={s.title}>
              <dl className={styles.kv}>
                {s.rows.map(r => (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <PatientFormModal patient={patient} clinicId={clinic.id} onClose={() => setEditing(false)} onSaved={handleSaved} />
      )}
    </div>
  )
}
