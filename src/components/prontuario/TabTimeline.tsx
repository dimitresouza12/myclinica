'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import { formatDate } from '@/lib/utils'
import type { Patient, MedicalRecord, RecordEntry } from '@/types'
import styles from './TabTimeline.module.css'

interface Props {
  patient: Patient
  record: MedicalRecord | null
  entries: RecordEntry[]
  clinicId: string
  onSaved: () => void
  onPendingChange?: (hasPending: boolean) => void
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024  // 5MB
const SIGNED_URL_EXPIRES = 3600           // 1 hora

export function TabTimeline({ patient, record, entries, clinicId, onSaved, onPendingChange }: Props) {
  const { user, clinic } = useAuthStore()
  const [text, setText] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  // Map de path → signed URL para imagens do prontuário
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  // notifica o pai sobre texto pendente
  useEffect(() => {
    onPendingChange?.(!!text.trim() || !!photoFile)
  }, [text, photoFile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Gera signed URLs para todas as fotos ao carregar as entradas
  useEffect(() => {
    const photoPaths = entries
      .filter(e => e.photo_url)
      .map(e => extractStoragePath(e.photo_url!))
      .filter(Boolean) as string[]

    if (photoPaths.length === 0) return

    Promise.all(
      photoPaths.map(async (path) => {
        const { data } = await supabase.storage
          .from('pacientes')
          .createSignedUrl(path, SIGNED_URL_EXPIRES)
        return [path, data?.signedUrl ?? ''] as [string, string]
      })
    ).then((pairs) => {
      setSignedUrls(Object.fromEntries(pairs.filter(([, url]) => url)))
    })
  }, [entries])

  function extractStoragePath(url: string): string | null {
    try {
      const u = new URL(url)
      // URL pública: /storage/v1/object/public/pacientes/...
      const match = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/pacientes\/(.+)/)
      return match ? match[1] : null
    } catch {
      return null
    }
  }

  function getPhotoUrl(entry: RecordEntry): string | null {
    if (!entry.photo_url) return null
    const path = extractStoragePath(entry.photo_url)
    if (path && signedUrls[path]) return signedUrls[path]
    return entry.photo_url // fallback enquanto signed URL carrega
  }

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
    // Armazena o path, não a URL pública — signed URL é gerada no display
    return path
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

      let photoPath: string | null = null
      if (photoFile) photoPath = await uploadPhoto()

      const { error: entryErr } = await supabase.from('record_entries').insert([{
        clinic_id: clinicId,
        patient_id: patient.id,
        record_id: recordId,
        entry_text: text.trim() || '(imagem anexada)',
        author_name: user?.displayName ?? 'Sistema',
        entry_type: 'evolucao',
        // Salva o path relativo; URL assinada é gerada no display
        photo_url: photoPath,
      }])
      if (entryErr) throw new Error('Erro ao salvar evolução: ' + entryErr.message)

      // Auditoria: registro de nova entrada no prontuário
      if (user?.id && clinic?.id) {
        await audit({
          action: 'prontuario.update',
          user_id: user.id,
          clinic_id: clinic.id,
          module: 'prontuario',
          resource_id: patient.id,
          details: { has_photo: !!photoPath, text_length: text.trim().length },
        })
      }

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
            className={`${styles.btnAdd} ${(text.trim() || photoFile) ? styles.btnAddPulse : ''}`}
            onClick={handleAddEntry}
            disabled={saving || (!text.trim() && !photoFile)}
          >
            {saving ? 'Salvando...' : '+ Adicionar Anotação'}
          </button>
        </div>
      </div>

      {/* Aviso de imutabilidade */}
      <p className={styles.immutableNote}>
        Anotações são permanentes conforme CFM 1.638/2002 — não é possível editar ou excluir após salvar.
      </p>

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
                  onClick={() => setLightbox(getPhotoUrl(entry))}
                  title="Clique para ampliar"
                >
                  <img
                    src={getPhotoUrl(entry) ?? ''}
                    alt="Anexo da evolução"
                    className={styles.itemImg}
                  />
                </button>
              )}
              <div className={styles.itemFooter}>
                {entry.author_name && (
                  <span className={styles.itemAuthor}>por {entry.author_name}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightbox(null)}>✕</button>
          <img src={lightbox} alt="Imagem ampliada" className={styles.lightboxImg} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
