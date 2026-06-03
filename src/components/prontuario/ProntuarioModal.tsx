'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Patient, MedicalRecord, RecordEntry } from '@/types'
import type { AuthClinic } from '@/types'
import { TabFicha } from './TabFicha'
import { TabOdontograma } from './TabOdontograma'
import { TabTimeline } from './TabTimeline'
import { TabChatIA } from './TabChatIA'
import { TabDocumentos } from './TabDocumentos'
import { Portal } from '@/components/ui/Portal'
import { printProntuario } from '@/lib/print'
import styles from './ProntuarioModal.module.css'

type Tab = 'ficha' | 'odontograma' | 'timeline' | 'documentos' | 'chat'

interface Props {
  patient: Patient
  clinic: AuthClinic
  onClose: () => void
}

export function ProntuarioModal({ patient, clinic, onClose }: Props) {
  const clinicId = clinic.id
  const clinicName = clinic.name
  const [tab, setTab] = useState<Tab>('ficha')
  const [record, setRecord] = useState<MedicalRecord | null>(null)
  const [entries, setEntries] = useState<RecordEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(patient.avatar_url ?? null)
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
  }, [patient.id])

  async function loadRecord() {
    setLoading(true)
    const [recRes, entriesRes] = await Promise.all([
      supabase.from('medical_records').select('*').eq('patient_id', patient.id).maybeSingle<MedicalRecord>(),
      supabase.from('record_entries').select('*').eq('patient_id', patient.id).order('created_at', { ascending: false }),
    ])
    setRecord(recRes.data ?? null)
    setEntries((entriesRes.data ?? []) as RecordEntry[])
    setLoading(false)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!file.type.startsWith('image/')) return
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${clinicId}/${patient.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('patient-avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (!upErr) {
      const { data: urlData } = supabase.storage.from('patient-avatars').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('patients').update({ avatar_url: url }).eq('id', patient.id)
      setAvatarUrl(url)
    }
    setUploadingAvatar(false)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ficha', label: '📋 Ficha Clínica' },
    ...(clinic.type === 'odonto' ? [{ key: 'odontograma' as Tab, label: '🦷 Odontograma' }] : []),
    { key: 'timeline', label: '📝 Evolução' },
    { key: 'documentos', label: '📄 Documentos' },
    { key: 'chat', label: '💬 Chat IA' },
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
            <button
              className={styles.btnPrint}
              onClick={() => printProntuario({ name: clinicName, logo: clinic.logo, address: clinic.address, phone: clinic.phone }, patient, record, entries)}
              title="Imprimir / Salvar PDF"
            >
              🖨️ Imprimir
            </button>
            <button className={styles.btnClose} onClick={tryClose}>✕</button>
          </div>
        </div>

        <div className={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`${styles.tabBtn} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
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
              {tab === 'ficha' && (
                <TabFicha
                  patient={patient}
                  record={record}
                  entries={entries}
                  clinic={clinic}
                  clinicId={clinicId}
                  clinicName={clinicName}
                  onSaved={loadRecord}
                />
              )}
              {tab === 'odontograma' && clinic.type === 'odonto' && (
                <TabOdontograma
                  record={record}
                  patient={patient}
                  clinicId={clinicId}
                  onSaved={loadRecord}
                />
              )}
              {tab === 'timeline' && (
                <TabTimeline
                  patient={patient}
                  record={record}
                  entries={entries}
                  clinicId={clinicId}
                  onSaved={loadRecord}
                  onPendingChange={setTimelinePending}
                />
              )}
              {tab === 'documentos' && (
                <TabDocumentos patient={patient} />
              )}
              {tab === 'chat' && (
                <TabChatIA phone={patient.phone} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </Portal>
  )
}
