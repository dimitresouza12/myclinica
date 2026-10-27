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
import { TabCorpograma } from './TabCorpograma'
import { TabTimeline } from './TabTimeline'
import { TabChatIA } from './TabChatIA'
import { TabDocumentos } from './TabDocumentos'
import { Modal } from '@/components/ui/Modal'
import { PillTabs } from '@/components/ui/PillTabs'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import btn from '@/components/ui/button.module.css'
import { printProntuario } from '@/lib/print'
import styles from './ProntuarioModal.module.css'
import { Icon } from '@/components/ui/Icon'
import { mergeSpecialtyConfigs } from '@/lib/specialtyConfig'

type Tab = 'ficha' | 'odontograma' | 'faceograma' | 'corpograma' | 'timeline' | 'documentos' | 'chat'

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

  async function tryClose() {
    if (!timelinePending) return onClose()
    const ok = await confirmDialog({
      title: 'Fechar sem salvar?',
      message: 'Você tem uma anotação não salva. Se fechar agora ela será perdida.',
      confirmText: 'Descartar e fechar',
      cancelText: 'Voltar e salvar',
      danger: true,
    })
    if (ok) onClose()
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

  // Abas extras (odontograma/faceograma/corpograma) vêm da união das áreas
  // que a clínica de fato atende (clinic.specialties), não só da área
  // principal — sem isso, odonto+estética com principal odonto não via o
  // Corpograma que a parte de estética da clínica precisa.
  const clinicSpecialties = clinic.specialties?.length ? clinic.specialties : [clinic.type]
  const recordTabs = mergeSpecialtyConfigs(clinicSpecialties).recordTabs
  const RECORD_TAB_LABELS: Record<string, string> = { odontograma: 'Odontograma', faceograma: 'Faceograma', corpograma: 'Corpograma' }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ficha', label: 'Ficha Clínica' },
    ...recordTabs.map(t => ({ key: t as Tab, label: RECORD_TAB_LABELS[t] })),
    { key: 'timeline',   label: 'Evolução'    },
    { key: 'documentos', label: 'Documentos'  },
    { key: 'chat',       label: 'Chat IA'     },
  ]

  const initials = patient.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <Modal
      open
      onClose={tryClose}
      size="xl"
      title={patient.name}
      subtitle="Prontuário"
      leading={
        <button type="button" className={styles.avatarWrap} onClick={() => avatarInputRef.current?.click()} aria-label="Trocar a foto do paciente" title="Trocar a foto">
          {avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatarUrl} alt="" className={styles.avatar} />
            : <span className={styles.avatarInitials}>{initials}</span>
          }
          <span className={styles.avatarOverlay}>{uploadingAvatar ? <Icon name="refresh" size={16} className={styles.spinIcon} /> : <Icon name="camera" size={16} />}</span>
        </button>
      }
      actions={
        /* A aba Documentos tem seu próprio botão de impressão (imprime só o documento).
           Ocultamos o do cabeçalho ali para não imprimir o prontuário inteiro por engano. */
        tab !== 'documentos' ? (
          <button
            type="button"
            className={btn.secondary}
            onClick={() => printProntuario({ name: clinicName, logo: clinic.logo, address: clinic.address, phone: clinic.phone }, patient, record, entries, user?.specialtyType ?? clinicSpecialties[0])}
            title={entriesLoading ? 'Carregando dados...' : 'Imprimir / Salvar PDF'}
            disabled={entriesLoading}
          >
            {entriesLoading ? 'Carregando...' : 'Imprimir'}
          </button>
        ) : undefined
      }
      toolbar={
        <PillTabs
          label="Seções do prontuário"
          options={tabs.map(x => ({ value: x.key, label: x.label }))}
          value={tab}
          onChange={goToTab}
        />
      }
    >
      <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
      <div className={styles.sections}>
          <>
            {/* Ficha: always mounted (default tab) */}
            <div style={{ display: tab === 'ficha' ? undefined : 'none' }}>
              {loading
                ? <p className={styles.loading}>Carregando prontuário...</p>
                : <TabFicha
                    patient={patient}
                    record={record}
                    entries={entries}
                    clinic={clinic}
                    clinicId={clinicId}
                    clinicName={clinicName}
                    onSaved={loadRecord}
                  />
              }
            </div>

            {/* Heavy tabs: lazy-mount on first visit, then keep mounted */}
            {recordTabs.includes('odontograma') && visited.has('odontograma') && (
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
            {recordTabs.includes('corpograma') && visited.has('corpograma') && (
              <div style={{ display: tab === 'corpograma' ? undefined : 'none' }}>
                <TabCorpograma
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
      </div>
    </Modal>
  )
}
