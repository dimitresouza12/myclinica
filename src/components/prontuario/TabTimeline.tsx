'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import { formatDate } from '@/lib/utils'
import type { Patient, MedicalRecord, RecordEntry } from '@/types'
import styles from './TabTimeline.module.css'
import { Icon } from '@/components/ui/Icon'

interface Props {
  patient: Patient
  record: MedicalRecord | null
  entries: RecordEntry[]
  clinicId: string
  onSaved: () => void
  onPendingChange?: (hasPending: boolean) => void
}

interface PendingPhoto { file: File; previewUrl: string }

const MAX_IMAGE_BYTES = 5 * 1024 * 1024  // 5MB
const SIGNED_URL_EXPIRES = 3600           // 1 hora

export function TabTimeline({ patient, record, entries, clinicId, onSaved, onPendingChange }: Props) {
  const { user, clinic } = useAuthStore()
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  // Map de path → signed URL para imagens do prontuário
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  // notifica o pai sobre texto/fotos pendentes
  useEffect(() => {
    onPendingChange?.(!!text.trim() || photos.length > 0)
  }, [text, photos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Gera signed URLs para todas as fotos ao carregar as entradas
  useEffect(() => {
    const photoPaths = entries
      .flatMap(e => (e.photo_urls?.length ? e.photo_urls : (e.photo_url ? [e.photo_url] : [])))
      .map(extractStoragePath)
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
    if (!url) return null
    // Valor atual: já é o path relativo salvo direto pelo upload (ex: evolucao/clinicId/pacienteId/123.jpg)
    if (!/^https?:\/\//i.test(url)) return url
    try {
      const u = new URL(url)
      // Compat com dados antigos salvos como URL completa: /storage/v1/object/public/pacientes/...
      const match = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/pacientes\/(.+)/)
      return match ? match[1] : null
    } catch {
      return null
    }
  }

  function getEntryPhotoUrls(entry: RecordEntry): string[] {
    const raw = entry.photo_urls?.length ? entry.photo_urls : (entry.photo_url ? [entry.photo_url] : [])
    return raw.map(url => {
      const path = extractStoragePath(url)
      if (path && signedUrls[path]) return signedUrls[path]
      return url // fallback enquanto signed URL carrega
    })
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    const accepted: PendingPhoto[] = []
    const rejected: string[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) { rejected.push(`${file.name} (não é imagem)`); continue }
      if (file.size > MAX_IMAGE_BYTES) { rejected.push(`${file.name} (maior que 5MB)`); continue }
      accepted.push({ file, previewUrl: URL.createObjectURL(file) })
    }

    setError(rejected.length > 0 ? `Não foi possível anexar: ${rejected.join(', ')}.` : '')
    if (accepted.length > 0) setPhotos(prev => [...prev, ...accepted])
    if (fileRef.current) fileRef.current.value = ''
  }

  function removePhoto(index: number) {
    setPhotos(prev => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  function clearPhotos() {
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl))
    setPhotos([])
    if (fileRef.current) fileRef.current.value = ''
  }

  async function uploadPhotos(): Promise<string[]> {
    if (photos.length === 0) return []
    const uploads = await Promise.all(photos.map(async ({ file }) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `evolucao/${clinicId}/${patient.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('pacientes')
        .upload(path, file, { upsert: false, contentType: file.type })
      if (upErr) throw new Error('Erro ao subir imagem: ' + upErr.message)
      // Armazena o path, não a URL pública — signed URL é gerada no display
      return path
    }))
    return uploads
  }

  async function handleAddEntry() {
    const hasContent = text.trim() || photos.length > 0
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

      const photoPaths = await uploadPhotos()

      const { error: entryErr } = await supabase.from('record_entries').insert([{
        clinic_id: clinicId,
        patient_id: patient.id,
        record_id: recordId,
        entry_text: text.trim() || '(imagem anexada)',
        author_name: user?.displayName ?? 'Sistema',
        entry_type: 'evolucao',
        // Salva os paths relativos; URL assinada é gerada no display
        photo_urls: photoPaths,
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
          details: { photo_count: photoPaths.length, text_length: text.trim().length },
        })
      }

      setText('')
      clearPhotos()
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

        {photos.length > 0 && (
          <div className={styles.photoPreviewGrid}>
            {photos.map((p, i) => (
              <div className={styles.photoPreviewWrap} key={p.previewUrl}>
                <img src={p.previewUrl} alt={`Pré-visualização ${i + 1}`} className={styles.photoPreview} />
                <button type="button" className={styles.btnRemovePhoto} onClick={() => removePhoto(i)} title="Remover imagem">
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className={styles.errorMsg}>{error}</p>}

        <div className={styles.newEntryActions}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handlePickFiles}
            className={styles.hiddenInput}
          />
          <button
            type="button"
            className={styles.btnAttach}
            onClick={() => fileRef.current?.click()}
            disabled={saving}
          >
            <Icon name="paperclip" size={13} /> {photos.length > 0 ? `Adicionar mais imagens (${photos.length})` : 'Anexar imagens'}
          </button>
          <button
            className={`${styles.btnAdd} ${(text.trim() || photos.length > 0) ? styles.btnAddPulse : ''}`}
            onClick={handleAddEntry}
            disabled={saving || (!text.trim() && photos.length === 0)}
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
        ) : entries.map((entry) => {
          const photoUrls = getEntryPhotoUrls(entry)
          return (
            <div key={entry.id} className={styles.item}>
              <div className={styles.itemDate}>{formatDate(entry.created_at)}</div>
              <div className={styles.itemCard}>
                {entry.entry_text && entry.entry_text !== '(imagem anexada)' && (
                  <p className={styles.itemText}>{entry.entry_text}</p>
                )}
                {photoUrls.length > 0 && (
                  <div className={styles.itemImgGrid}>
                    {photoUrls.map((url, i) => (
                      <button
                        key={url + i}
                        type="button"
                        className={styles.itemImgBtn}
                        onClick={() => setLightbox(url)}
                        title="Clique para ampliar"
                      >
                        <img src={url} alt={`Anexo da evolução ${i + 1}`} className={styles.itemImg} />
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.itemFooter}>
                  {entry.author_name && (
                    <span className={styles.itemAuthor}>por {entry.author_name}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightbox(null)}><Icon name="close" size={20} /></button>
          <img src={lightbox} alt="Imagem ampliada" className={styles.lightboxImg} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
