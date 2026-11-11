'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import { recordNormForType } from '@/lib/professionalCouncil'
import { formatDate } from '@/lib/utils'
import { SIGILO_ATIVO, canMarkConfidential } from '@/lib/sigilo'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_KIND_LABEL, attachmentDisplayName, attachmentKindFromPath,
  buildAttachmentPath, formatBytes, validateAttachment, type AttachmentKind,
} from '@/lib/prontuarioAttachments'
import type { Patient, MedicalRecord, RecordEntry } from '@/types'
import styles from './TabTimeline.module.css'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/Badge'
import { escribaAreaForUser } from '@/lib/ia/escriba'
import { textoVisivel } from '@/lib/escalas/registro'
import { IaEscriba } from './IaEscriba'
import { RelatorioIA } from './RelatorioIA'

interface Props {
  patient: Patient
  record: MedicalRecord | null
  entries: RecordEntry[]
  clinicId: string
  onSaved: () => void
  onPendingChange?: (hasPending: boolean) => void
}

interface PendingFile { file: File; previewUrl: string; kind: AttachmentKind; mime: string; ext: string }

// Anexo já salvo de uma evolução, pronto pra exibir (tipo vem da extensão do path).
interface EntryAttachment { key: string; kind: AttachmentKind; url: string; name: string }

const SIGNED_URL_EXPIRES = 3600           // 1 hora

export function TabTimeline({ patient, record, entries, clinicId, onSaved, onPendingChange }: Props) {
  const { user, clinic } = useAuthStore()
  const norm = recordNormForType(user?.specialtyType ?? clinic?.type)
  // Sigilo (CFP 001/2009): só aparece com o flag ligado e na área psico.
  const sigiloDisponivel = SIGILO_ATIVO && canMarkConfidential(user?.specialtyType ?? clinic?.type)
  const [confidential, setConfidential] = useState(false)
  const sigiloLigado = sigiloDisponivel && confidential
  // IA escriba (psico, medicina, fono, fisio, nutri, TO). iaNeedsReview trava o salvar até o profissional revisar o rascunho da IA.
  const escribaArea = escribaAreaForUser(user?.specialtyType, clinic?.type, clinic?.specialties)
  const [iaNeedsReview, setIaNeedsReview] = useState(false)
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<PendingFile[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  // Map de path → signed URL para imagens do prontuário
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  // Profissional (agenda) vinculado ao login atual — usado pra marcar
  // professional_id nas novas evoluções e pro filtro "só as minhas".
  const [myProfessionalId, setMyProfessionalId] = useState<string | null>(null)
  const [filterMine, setFilterMine] = useState(false)

  useEffect(() => {
    if (!user?.clinicUserId) { setMyProfessionalId(null); return }
    supabase.from('professionals').select('id')
      .eq('clinic_id', clinicId).eq('clinic_user_id', user.clinicUserId)
      .maybeSingle()
      .then(({ data }) => setMyProfessionalId(data?.id ?? null))
  }, [clinicId, user?.clinicUserId])

  const visibleEntries = filterMine && myProfessionalId
    ? entries.filter(e => e.professional_id === myProfessionalId)
    : entries

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

    // uma chamada só para todas as fotos (antes era uma por foto)
    let cancelled = false
    supabase.storage
      .from('pacientes')
      .createSignedUrls([...new Set(photoPaths)], SIGNED_URL_EXPIRES)
      .then(({ data }) => {
        if (cancelled || !data) return
        const next: Record<string, string> = {}
        for (const row of data) if (row.path && row.signedUrl) next[row.path] = row.signedUrl
        setSignedUrls(next)
      })
    return () => { cancelled = true }
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

  function getEntryAttachments(entry: RecordEntry): EntryAttachment[] {
    const raw = entry.photo_urls?.length ? entry.photo_urls : (entry.photo_url ? [entry.photo_url] : [])
    return raw.map((url, i) => {
      const path = extractStoragePath(url)
      const kind = attachmentKindFromPath(path ?? url)
      const signed = path ? signedUrls[path] : undefined
      // Só tem URL quando a assinada chegou (ou o dado antigo já era URL
      // completa) — path relativo cru nunca vai pra <img src>/lightbox.
      const resolved = signed ?? (/^https?:\/\//i.test(url) ? url : '')
      return {
        key: `${url}-${i}`,
        kind,
        url: resolved,
        name: attachmentDisplayName(path ?? url) || `${ATTACHMENT_KIND_LABEL[kind]} ${i + 1}`,
      }
    })
  }

  async function toggleConfidential(next: boolean) {
    if (next && photos.length > 0) {
      const ok = await confirmDialog({
        title: 'Remover anexos escolhidos?',
        message: 'Anotação sigilosa não aceita anexos. Os arquivos já escolhidos serão removidos desta anotação.',
        confirmText: 'Remover anexos e continuar',
        cancelText: 'Cancelar',
        danger: true,
      })
      if (!ok) return
      clearPhotos()
    }
    setConfidential(next)
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (sigiloLigado) return
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    const accepted: PendingFile[] = []
    const rejected: string[] = []
    for (const file of files) {
      const check = validateAttachment(file)
      if (!check.ok) { rejected.push(`${file.name} (${check.reason})`); continue }
      accepted.push({ file, previewUrl: URL.createObjectURL(file), kind: check.kind, mime: check.mime, ext: check.ext })
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
    const uploads = await Promise.all(photos.map(async ({ file, mime, ext }) => {
      const path = buildAttachmentPath({ clinicId, patientId: patient.id, fileName: file.name, ext })
      const { error: upErr } = await supabase.storage
        .from('pacientes')
        .upload(path, file, { upsert: false, contentType: mime || file.type })
      if (upErr) throw new Error(`Erro ao subir ${file.name}: ` + upErr.message)
      // Armazena o path, não a URL pública — signed URL é gerada no display
      return path
    }))
    return uploads
  }

  async function handleAddEntry() {
    const hasContent = text.trim() || (!sigiloLigado && photos.length > 0)
    if (!hasContent || iaNeedsReview) return
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

      const photoPaths = sigiloLigado ? [] : await uploadPhotos()

      const { error: entryErr } = await supabase.from('record_entries').insert([{
        clinic_id: clinicId,
        patient_id: patient.id,
        record_id: recordId,
        entry_text: text.trim() || (photos.every(p => p.kind === 'image') ? '(imagem anexada)' : '(anexo adicionado)'),
        author_name: user?.displayName ?? 'Sistema',
        professional_id: myProfessionalId,
        entry_type: 'evolucao',
        // Salva os paths relativos; URL assinada é gerada no display
        photo_urls: photoPaths,
        // Sigilo (psico): is_confidential só vai no insert quando ligado.
        // NUNCA enviar author_user_id — o gatilho do banco preenche sozinho.
        ...(sigiloLigado ? { is_confidential: true } : {}),
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
      setConfidential(false)
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

        {escribaArea && (
          <IaEscriba
            area={escribaArea}
            patientId={patient.id}
            text={text}
            setText={setText}
            disabled={saving}
            blockedReason={sigiloLigado ? 'Anotação sigilosa não usa IA.' : null}
            onNeedsReviewChange={setIaNeedsReview}
          />
        )}

        {sigiloDisponivel && (
          <div className={`${styles.sigiloBox} ${sigiloLigado ? styles.sigiloBoxOn : ''}`}>
            <label className={styles.sigiloSwitch}>
              <input
                type="checkbox"
                role="switch"
                checked={confidential}
                disabled={saving}
                onChange={e => { void toggleConfidential(e.target.checked) }}
              />
              <span className={styles.sigiloTrack}><span className={styles.sigiloThumb} /></span>
              <span className={styles.sigiloLabel}>Anotação pessoal sigilosa (CFP 001/2009)</span>
            </label>
            <p className={styles.sigiloHelp}>
              Só você lê esta anotação. Ela não aparece na impressão do prontuário e não pode ser desfeita depois de salva.
              Anexos não são permitidos em anotação sigilosa.
            </p>
          </div>
        )}

        {photos.length > 0 && (
          <div className={styles.photoPreviewGrid}>
            {photos.map((p, i) => (
              <div className={`${styles.photoPreviewWrap} ${p.kind === 'image' ? '' : styles.filePreviewWrap}`} key={p.previewUrl}>
                {p.kind === 'image' && (
                  <img src={p.previewUrl} alt={`Pré-visualização ${i + 1}`} className={styles.photoPreview} />
                )}
                {p.kind === 'video' && (
                  <video src={p.previewUrl} controls playsInline preload="metadata" className={styles.videoPreview} />
                )}
                {p.kind === 'audio' && (
                  <div className={styles.fileTile}>
                    <span className={styles.fileName}><Icon name="mic" size={14} /> {p.file.name}</span>
                    <audio src={p.previewUrl} controls preload="metadata" className={styles.audioPlayer} />
                  </div>
                )}
                {p.kind === 'pdf' && (
                  <div className={styles.fileTile}>
                    <span className={styles.fileName}><Icon name="procedures" size={14} /> {p.file.name}</span>
                    <a href={p.previewUrl} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                      Abrir PDF ({formatBytes(p.file.size)})
                    </a>
                  </div>
                )}
                <button type="button" className={styles.btnRemovePhoto} onClick={() => removePhoto(i)} title="Remover anexo" aria-label={`Remover ${p.file.name}`}>
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
            accept={ATTACHMENT_ACCEPT}
            multiple
            onChange={handlePickFiles}
            className={styles.hiddenInput}
          />
          <button
            type="button"
            className={styles.btnAttach}
            onClick={() => fileRef.current?.click()}
            disabled={saving || sigiloLigado}
            title={sigiloLigado ? 'Anotação sigilosa não aceita anexos' : undefined}
          >
            <Icon name="paperclip" size={13} /> {sigiloLigado ? 'Anexos indisponíveis (sigilosa)' : photos.length > 0 ? `Adicionar mais anexos (${photos.length})` : 'Anexar arquivos'}
          </button>
          <button
            className={`${styles.btnAdd} ${(text.trim() || photos.length > 0) ? styles.btnAddPulse : ''}`}
            onClick={handleAddEntry}
            disabled={saving || iaNeedsReview || (!text.trim() && photos.length === 0)}
            title={iaNeedsReview ? 'Confirme a revisão do rascunho gerado por IA para salvar' : undefined}
          >
            {saving ? 'Salvando...' : '+ Adicionar Anotação'}
          </button>
        </div>
      </div>

      {/* Aviso de imutabilidade */}
      <p className={styles.immutableNote}>
        {norm ? `Anotações são permanentes conforme ${norm}` : 'Anotações são permanentes'} — não é possível editar ou excluir após salvar.
      </p>

      {escribaArea && (
        <RelatorioIA area={escribaArea} patientId={patient.id} patientName={patient.name} clinicName={clinic?.name ?? ''} />
      )}

      {myProfessionalId && (
        <div className={styles.newEntryActions} style={{ marginBottom: '0.5rem' }}>
          <button type="button" className={styles.btnAttach} onClick={() => setFilterMine(f => !f)}>
            <Icon name="eye" size={13} /> {filterMine ? 'Mostrando só as minhas' : 'Mostrando todas as áreas'}
          </button>
        </div>
      )}

      <div className={styles.timeline}>
        {visibleEntries.length === 0 ? (
          <p className={styles.empty}>{filterMine ? 'Nenhuma anotação sua ainda.' : 'Nenhuma anotação ainda. Adicione a primeira acima.'}</p>
        ) : visibleEntries.map((entry) => {
          const attachments = getEntryAttachments(entry)
          const images = attachments.filter(a => a.kind === 'image')
          const others = attachments.filter(a => a.kind !== 'image')
          return (
            <div key={entry.id} className={styles.item}>
              <div className={styles.itemDate}>{formatDate(entry.created_at)}</div>
              <div className={styles.itemCard}>
                {entry.entry_text && entry.entry_text !== '(imagem anexada)' && entry.entry_text !== '(anexo adicionado)' && (
                  <p className={styles.itemText}>{textoVisivel(entry.entry_text)}</p>
                )}
                {images.length > 0 && (
                  <div className={styles.itemImgGrid}>
                    {images.map((a, i) => !a.url ? (
                      <span key={a.key} className={styles.fileLoading}>Carregando imagem...</span>
                    ) : (
                      <button
                        key={a.key}
                        type="button"
                        className={styles.itemImgBtn}
                        onClick={() => setLightbox(a.url)}
                        title="Clique para ampliar"
                      >
                        <img src={a.url} alt={`Anexo da evolução ${i + 1}`} className={styles.itemImg} />
                      </button>
                    ))}
                  </div>
                )}
                {others.length > 0 && (
                  <div className={styles.itemFiles}>
                    {others.map(a => (
                      <div key={a.key} className={styles.itemFile}>
                        <span className={styles.fileName}>
                          <Icon name={a.kind === 'pdf' ? 'procedures' : a.kind === 'audio' ? 'mic' : 'play'} size={14} />
                          {a.name.startsWith(ATTACHMENT_KIND_LABEL[a.kind]) ? a.name : `${ATTACHMENT_KIND_LABEL[a.kind]}: ${a.name}`}
                        </span>
                        {!a.url ? (
                          <span className={styles.fileLoading}>Carregando...</span>
                        ) : a.kind === 'audio' ? (
                          <audio src={a.url} controls preload="none" className={styles.audioPlayer} />
                        ) : a.kind === 'video' ? (
                          <video src={a.url} controls playsInline preload="metadata" className={styles.videoPlayer} />
                        ) : (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>Abrir PDF</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.itemFooter}>
                  {entry.is_confidential && <Badge tone="warning">Sigilosa</Badge>}
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
