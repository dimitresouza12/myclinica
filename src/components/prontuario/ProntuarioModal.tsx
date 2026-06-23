'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import type { Patient, MedicalRecord, RecordEntry } from '@/types'
import type { AuthClinic } from '@/types'
import { TabFicha } from './TabFicha'
import { TabOdontograma } from './TabOdontograma'
import { TabFaceograma } from './TabFaceograma'
import { TabTimeline } from './TabTimeline'
import { TabChatIA } from './TabChatIA'
import { TabDocumentos } from './TabDocumentos'
import { Portal } from '@/components/ui/Portal'
import { printProntuario } from '@/lib/print'
import styles from './ProntuarioModal.module.css'

type Tab = 'ficha' | 'odontograma' | 'faceograma' | 'timeline' | 'documentos' | 'chat'

interface Props {
  patient: Patient
  clinic: AuthClinic
  onClose: () => void
}

export function ProntuarioModal({ patient, clinic, onClose }: Props) {
  const clinicId = clinic.id
  const clinicName = clinic.name
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('ficha')
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['ficha']))
  const [record, setRecord] = useState<MedicalRecord | null>(null)
  const [entries, setEntries] = useState<RecordEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [loading, setLoading] = useState(true)

  function goToTab(t: Tab) {
    setTab(t)
    setVisited(prev => new Set(prev).add(t))
  }
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [timelinePending, setTimelinePending] = useState(false)
  const [showPendingWarning, setShowPendingWarning] = useState(false)

  function tryClose() {
    if (timelinePending) {
      setShowPendingWarning(true)
    } else {
      onClose()
    }
  }

  useEffect(() => {
    loadRecord()
    loadAvatar()
    // Auditoria: acesso ao prontuário
    if (user?.id) {
      audit({
        action: 'prontuario.view',
        user_id: user.id,
        clinic_id: clinicId,
        module: 'prontuario',
        resource_id: patient.id,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id])

  async function loadAvatar() {
    if (!patient.avatar_url) return
    try {
      // Extrai path relativo da URL pública se necessário
      const path = `${clinicId}/${patient.id}/avatar.jpg`
      const { data } = await supabase.storage
        .from('patient-avatars')
        .createSignedUrl(path, 3600)
      if (data?.signedUrl) setAvatarUrl(data.signedUrl)
    } catch {
      // Avatar não encontrado — sem URL
    }
  }

  async function loadRecord() {
    setLoading(true)
    // Load medical_record first — unblocks the UI for Ficha/Faceograma tabs
    const recRes = await supabase
      .from('medical_records')
      .select('*')
      .eq('patient_id', patient.id)
      .maybeSingle<MedicalRecord>()
    setRecord(recRes.data ?? null)
    setLoading(false)
    // Load entries in the background — only needed for Timeline/print
    setEntriesLoading(true)
    supabase
      .from('record_entries')
      .select('*')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setEntries((data ?? []) as RecordEntry[])
        setEntriesLoading(false)
      })
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!file.type.startsWith('image/')) return
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${clinicId}/${patient.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage
      .from('patient-avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (!upErr) {
      // Salva o path no banco, não a URL pública
      await supabase.from('patients').update({ avatar_url: path }).eq('id', patient.id)
      // Gera signed URL para exibição imediata
      const { data } = await supabase.storage
        .from('patient-avatars')
        .createSignedUrl(path, 3600)
      if (data?.signedUrl) setAvatarUrl(data.signedUrl)
    }
    setUploadingAvatar(false)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ficha', label: 'Ficha Clínica' },
    ...(clinic.type === 'odonto'   ? [{ key: 'odontograma' as Tab,  label: 'Odontograma' }] : []),
    ...(clinic.type === 'estetica' ? [{ key: 'faceograma'  as Tab,  label: 'Faceograma'  }] : []),
    { key: 'timeline',   label: 'Evolução'    },
    { key: 'documentos', label: 'Documentos'  },
    { key: 'chat',       label: 'Chat IA'     },
  ]

  const initials = patient.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <Portal>
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className={styles.modal}>

        {/* Aviso de anotação não salva */}
        {showPendingWarning && (
          <div className={styles.pendingOverlay}>
            <div className={styles.pendingDialog}>
              <p className={styles.pendingText}>⚠️ Você tem uma anotação não salva. Se fechar agora ela será perdida.</p>
              <div className={styles.pendingActions}>
                <button className={styles.btnPendingDiscard} onClick={onClose}>Descartar e fechar</button>
                <button className={styles.btnPendingKeep} onClick={() => setShowPendingWarning(false)}>Voltar e salvar</button>
              </div>
            </div>
          </div>
        )}

        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.avatarWrap} onClick={() => avatarInputRef.current?.click()} title="Clique para trocar foto">
              {avatarUrl
                ? <img src={avatarUrl} alt={patient.name} className={styles.avatar} />
                : <div className={styles.avatarInitials}>{initials}</div>
              }
              <div className={styles.avatarOverlay}>{uploadingAvatar ? '⟳' : '📷'}</div>
              <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            </div>
            <div>
              <h2 className={styles.title}>Prontuário</h2>
              <p className={styles.patientName}>{patient.name}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* A aba Documentos tem seu próprio botão de impressão (imprime só o documento).
                Ocultamos o do cabeçalho ali para não imprimir o prontuário inteiro por engano. */}
            {tab !== 'documentos' && (
              <button
                className={styles.btnPrint}
                onClick={() => printProntuario({ name: clinicName, logo: clinic.logo, address: clinic.address, phone: clinic.phone }, patient, record, entries)}
                title={entriesLoading ? 'Carregando dados...' : 'Imprimir / Salvar PDF'}
                disabled={entriesLoading}
              >
                {entriesLoading ? 'Carregando...' : 'Imprimir'}
              </button>
            )}
            <button className={styles.btnClose} onClick={tryClose}>✕</button>
          </div>
        </div>

        <div className={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`${styles.tabBtn} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => goToTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {loading ? (
            <p className={styles.loading}>Carregando prontuário...</p>
          ) : (
            <>
              {/* Ficha: always mounted (default tab) */}
              <div style={{ display: tab === 'ficha' ? undefined : 'none' }}>
                <TabFicha
                  patient={patient}
                  record={record}
                  entries={entries}
                  clinic={clinic}
                  clinicId={clinicId}
                  clinicName={clinicName}
                  onSaved={loadRecord}
                />
              </div>

              {/* Heavy tabs: lazy-mount on first visit, then keep mounted */}
              {clinic.type === 'odonto' && visited.has('odontograma') && (
                <div style={{ display: tab === 'odontograma' ? undefined : 'none' }}>
                  <TabOdontograma
                    record={record}
                    patient={patient}
                    clinicId={clinicId}
                    onSaved={loadRecord}
                  />
                </div>
              )}
              {visited.has('faceograma') && (
                <div style={{ display: tab === 'faceograma' ? undefined : 'none' }}>
                  <TabFaceograma
                    record={record}
                    patient={patient}
                    clinicId={clinicId}
                    onSaved={loadRecord}
                  />
                </div>
              )}
              {visited.has('timeline') && (
                <div style={{ display: tab === 'timeline' ? undefined : 'none' }}>
                  <TabTimeline
                    patient={patient}
                    record={record}
                    entries={entries}
                    clinicId={clinicId}
                    onSaved={loadRecord}
                    onPendingChange={setTimelinePending}
                  />
                </div>
              )}
              {visited.has('documentos') && (
                <div style={{ display: tab === 'documentos' ? undefined : 'none' }}>
                  <TabDocumentos patient={patient} />
                </div>
              )}
              {visited.has('chat') && (
                <div style={{ display: tab === 'chat' ? undefined : 'none' }}>
                  <TabChatIA phone={patient.phone} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </Portal>
  )
}
