'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate } from '@/lib/utils'
import type { Patient, MedicalRecord, RecordEntry } from '@/types'
import styles from './TabTimeline.module.css'

interface Props {
  patient: Patient
  record: MedicalRecord | null
  entries: RecordEntry[]
  clinicId: string
  onSaved: () => void
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024  // 5MB

export function TabTimeline({ patient, record, entries, clinicId, onSaved }: Props) {
  const { user } = useAuthStore()
  const [text, setText] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Imagem muito grande (máx 5MB).')
      return
    }
    setError('')
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function clearPhoto() {
    setPhotoFile(null)
    setPhotoPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function uploadPhoto(): Promise<string | null> {
    if (!photoFile) return null
    const ext = photoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `evolucao/${clinicId}/${patient.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('pacientes')
      .upload(path, photoFile, { upsert: false, contentType: photoFile.type })
    if (upErr) throw new Error('Erro ao subir imagem: ' + upErr.message)
    const { data } = supabase.storage.from('pacientes').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleAddEntry() {
    const hasContent = text.trim() || photoFile
    if (!hasContent) return
    setSaving(true)
    setError('')
    try {
      let recordId = record?.id
      if (!recordId) {
        const { data, error: recErr } = await supabase
          .from('medical_records')
          .insert([{ clinic_id: clinicId, patient_id: patient.id }])
          .select('id')
          .single()
        if (recErr) throw new Error('Erro ao criar prontuário: ' + recErr.message)
        recordId = data?.id
      }
      if (!recordId) throw new Error('Falha ao criar prontuário.')

      let photoUrl: string | null = null
      if (photoFile) photoUrl = await uploadPhoto()

      const { error: entryErr } = await supabase.from('record_entries').insert([{
        clinic_id: clinicId,
        patient_id: patient.id,
        record_id: recordId,
        entry_text: text.trim() || '(imagem anexada)',
        author_name: user?.displayName ?? 'Sistema',
        entry_type: 'evolucao',
        photo_url: photoUrl,
      }])
      if (entryErr) throw new Error('Erro ao salvar evolução: ' + entryErr.message)
      setText('')
      clearPhoto()
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.newEntry}>
        <textarea
          className={styles.textarea}
          rows={3}
          placeholder="Adicionar anotação clínica..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {photoPreview && (
          <div className={styles.photoPreviewWrap}>
            <img src={photoPreview} alt="Pré-visualização" className={styles.photoPreview} />
            <button type="button" className={styles.btnRemovePhoto} onClick={clearPhoto} title="Remover imagem">
              ✕
            </button>
          </div>
        )}

        {error && <p className={styles.errorMsg}>{error}</p>}

        <div className={styles.newEntryActions}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handlePickFile}
            className={styles.hiddenInput}
          />
          <button
            type="button"
            className={styles.btnAttach}
            onClick={() => fileRef.current?.click()}
            disabled={saving}
          >
            📎 {photoFile ? 'Trocar imagem' : 'Anexar imagem'}
          </button>
          <button
            className={styles.btnAdd}
            onClick={handleAddEntry}
            disabled={saving || (!text.trim() && !photoFile)}
          >
            {saving ? 'Salvando...' : '+ Adicionar Anotação'}
          </button>
        </div>
      </div>

      <div className={styles.timeline}>
        {entries.length === 0 ? (
          <p className={styles.empty}>Nenhuma anotação ainda. Adicione a primeira acima.</p>
        ) : entries.map((entry) => (
          <div key={entry.id} className={styles.item}>
            <div className={styles.itemDate}>{formatDate(entry.created_at)}</div>
            <div className={styles.itemCard}>
              {entry.entry_text && entry.entry_text !== '(imagem anexada)' && (
                <p className={styles.itemText}>{entry.entry_text}</p>
              )}
              {entry.photo_url && (
                <button
                  type="button"
                  className={styles.itemImgBtn}
                  onClick={() => setLightbox(entry.photo_url!)}
                  title="Clique para ampliar"
                >
                  <img src={entry.photo_url} alt="Anexo da evolução" className={styles.itemImg} />
                </button>
              )}
              {entry.author_name && (
                <span className={styles.itemAuthor}>por {entry.author_name}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {lightbox && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightbox(null)}>✕</button>
          <img src={lightbox} alt="Imagem ampliada" className={styles.lightboxImg} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
