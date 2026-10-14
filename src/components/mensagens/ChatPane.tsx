'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { clockLabel, contactDisplayName, formatJidPhone, withDaySeparators } from '@/lib/whatsapp/inbox'
import { Avatar } from '@/components/ui/Avatar'
import { conversationPhoto } from '@/hooks/useWhatsAppInbox'
import type { WaConversation, WaMessage } from '@/hooks/useWhatsAppInbox'
import { MediaBubble } from './MediaBubble'
import { QuickReplyManager, QuickReplyMenu } from './QuickReplies'
import { STATUS_LABEL, canDeleteForEveryone, canEditMessage } from '@/lib/whatsapp/message-events'
import { fillQuickReply, filterQuickReplies, slashQuery } from '@/lib/whatsapp/quick-replies'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import type { QuickReplyRow } from '@/hooks/useWhatsAppInbox'
import { useVoiceRecorder } from './useVoiceRecorder'
import { UPLOAD_ACCEPT, checkUpload, formatBytes, formatDuration } from '@/lib/whatsapp/media'
import styles from './Inbox.module.css'

const KIND_TITLE: Record<WaMessage['kind'], string> = {
  text: '', image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha', other: 'Mensagem',
}

interface MediaHandlers {
  urls: Record<string, string>
  onOpenImage: (url: string, name: string) => void
  onRetry: (messageId: string) => Promise<string | null>
  onDownload: (messageId: string) => Promise<string | null>
}

function originLabel(m: WaMessage): string | null {
  if (m.direction !== 'out') return null
  if (m.origin === 'sistema') return m.sent_by_name ?? 'Equipe'
  if (m.origin === 'celular') return 'Celular da clínica'
  if (m.origin === 'automatico') return 'Mensagem automática'
  return null
}

const HAS_FILE: ReadonlySet<WaMessage['kind']> = new Set(['image', 'audio', 'video', 'document', 'sticker'])

function Bubble({ m, timezone, now, media, canAct, onEdit, onDelete }: {
  m: WaMessage; timezone: string; now: Date; media: MediaHandlers; canAct: boolean
  onEdit: (id: string, text: string) => Promise<string | null>
  onDelete: (id: string) => Promise<string | null>
}) {
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const by = originLabel(m)
  const deleted = !!m.deleted_at
  // mensagem com arquivo guardado: mostra o arquivo; as antigas (de antes desta função) e os tipos sem arquivo mostram só o aviso
  const hasFile = !deleted && HAS_FILE.has(m.kind) && m.media_status !== null
  const isMedia = m.kind !== 'text' && !deleted
  const canEdit = canAct && canEditMessage(m, now)
  const canDelete = canAct && canDeleteForEveryone(m, now)
  const reactions = [m.reactions?.contato, m.reactions?.clinica].filter((x): x is string => !!x)
  const status = m.direction === 'out' && !deleted ? (m.delivery_status ?? 'sent') : null

  async function saveEdit() {
    const t = draft.trim()
    if (!t || busy) return
    setBusy(true); setErr('')
    const e = await onEdit(m.id, t)
    setBusy(false)
    if (e) setErr(e); else setEditing(false)
  }

  async function remove() {
    setMenu(false)
    const ok = await confirmDialog({ title: 'Apagar para todos', message: 'A mensagem some para você e para o contato no WhatsApp. Isso não pode ser desfeito.', confirmText: 'Apagar', danger: true })
    if (!ok) return
    const e = await onDelete(m.id)
    if (e) setErr(e)
  }

  return (
    <div className={`${styles.b} ${m.direction === 'in' ? styles.in : styles.out}`}>
      {by && <span className={styles.by}>{by}</span>}
      {deleted ? <span className={styles.deleted}>Mensagem apagada</span> : (
        <>
          {hasFile
            ? <MediaBubble m={m} url={media.urls[m.id]} onOpenImage={media.onOpenImage} onRetry={media.onRetry} onDownload={media.onDownload} />
            : isMedia && <span className={styles.mediaTitle}>{KIND_TITLE[m.kind]}</span>}
          {editing ? (
            <span className={styles.editBox}>
              <textarea rows={3} value={draft} onChange={e => setDraft(e.target.value)} aria-label="Novo texto da mensagem" autoFocus />
              <span className={styles.editActions}>
                <button type="button" className={styles.mediaBtn} onClick={() => { setEditing(false); setErr('') }} disabled={busy}>Cancelar</button>
                <button type="button" className={styles.mediaBtn} onClick={() => void saveEdit()} disabled={busy || !draft.trim()}>{busy ? 'Salvando…' : 'Salvar'}</button>
              </span>
            </span>
          ) : m.body}
          {isMedia && !hasFile && (
            <span className={styles.media}>
              {m.direction === 'in' ? 'O arquivo não está disponível por aqui. Veja no WhatsApp do celular.' : 'Enviada pelo celular da clínica.'}
            </span>
          )}
        </>
      )}
      {err && <span className={styles.mediaError} role="alert">{err}</span>}
      {reactions.length > 0 && !deleted && <span className={styles.reactions} aria-label="Reações">{reactions.join(' ')}</span>}
      <span className={styles.time}>
        {m.edited_at && !deleted ? 'editada · ' : ''}{clockLabel(new Date(m.created_at), timezone)}
        {status && <span className={`${styles.statusTxt} ${status === 'read' ? styles.statusRead : ''}`}>{STATUS_LABEL[status]}</span>}
      </span>
      {(canEdit || canDelete) && !editing && (
        <>
          <button type="button" className={styles.msgMenuBtn} aria-label="Mais opções da mensagem" aria-expanded={menu} onClick={() => setMenu(o => !o)}><Icon name="chevronDown" size={16} /></button>
          {menu && (
            <div className={styles.msgMenu} role="menu">
              {canEdit && <button type="button" role="menuitem" onClick={() => { setMenu(false); setDraft(m.body ?? ''); setEditing(true) }}>Editar</button>}
              {canDelete && <button type="button" role="menuitem" className={styles.danger} onClick={() => void remove()}>Apagar para todos</button>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface Props {
  conversation: WaConversation | null
  messages: WaMessage[]
  loading: boolean
  now: Date
  timezone: string
  /** pode digitar e enviar (permissão de edição e WhatsApp conectado) */
  canSend: boolean
  sendBlockedReason: string | null
  sending: boolean
  sendError: string
  onSend: (text: string) => Promise<boolean>
  /** envia imagem ou documento (o texto vira legenda) */
  onSendFile: (file: File, caption: string) => Promise<boolean>
  /** envia mensagem de voz gravada */
  onSendVoice: (blob: Blob, seconds: number) => Promise<boolean>
  /** links temporários dos arquivos já disponíveis, por id de mensagem */
  mediaUrls: Record<string, string>
  onRetryMedia: (messageId: string) => Promise<string | null>
  onDownloadMedia: (messageId: string) => Promise<string | null>
  /** edita o texto de uma mensagem enviada; devolve o erro ou null */
  onEditMessage: (messageId: string, text: string) => Promise<string | null>
  /** apaga para todos uma mensagem enviada; devolve o erro ou null */
  onDeleteMessage: (messageId: string) => Promise<string | null>
  clinicId: string
  /** pode criar e editar respostas rápidas */
  canManageQuick: boolean
  quickReplies: QuickReplyRow[]
  onQuickChanged: () => void
  onBack: () => void
  onToggleInfo: () => void
}

export function ChatPane(p: Props) {
  const [text, setText] = useState('')
  const [attached, setAttached] = useState<{ file: File; preview: string | null } | null>(null)
  const [fileError, setFileError] = useState('')
  const file = attached?.file ?? null
  const preview = attached?.preview ?? null
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recorder = useVoiceRecorder()
  const msgsRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const convId = p.conversation?.id ?? null
  const [quickOpen, setQuickOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  // vai para o fim ao abrir a conversa e quando chega mensagem nova
  useLayoutEffect(() => {
    const el = msgsRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [convId, p.messages.length])

  const items = useMemo(() => withDaySeparators(p.messages, p.now, p.timezone), [p.messages, p.now, p.timezone])

  function resize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }

  // o endereço temporário da prévia é liberado quando a imagem sai (trocada, removida, enviada ou ao fechar a conversa)
  useEffect(() => () => { if (attached?.preview) URL.revokeObjectURL(attached.preview) }, [attached])

  // Esc fecha a imagem em tamanho grande
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  async function pickFile(f: File | undefined) {
    if (!f) return
    const head = new Uint8Array(await f.slice(0, 16).arrayBuffer())
    const check = checkUpload({ name: f.name, size: f.size, head })
    if (!check.ok) { setAttached(null); setFileError(check.error); return }
    setFileError('')
    setAttached({ file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })
  }

  const slash = slashQuery(text)
  const showQuick = p.canSend && (quickOpen || slash !== null)

  function pickQuick(r: QuickReplyRow) {
    const c = p.conversation
    const name = c ? contactDisplayName({ patientName: c.patients?.name, contactName: c.contact_name, jid: c.jid }) : null
    setText(fillQuickReply(r.body, name))
    setQuickOpen(false)
    requestAnimationFrame(() => { taRef.current?.focus(); resize() })
  }

  async function sendRecording() {
    if (p.sending || !p.canSend) return
    const r = await recorder.finish()
    if (r) await p.onSendVoice(r.blob, r.seconds)
  }

  async function submit() {
    const value = text.trim()
    if ((!value && !file) || p.sending || !p.canSend) return
    const ok = file ? await p.onSendFile(file, value) : await p.onSend(value)
    if (ok) { setText(''); setAttached(null); setFileError(''); requestAnimationFrame(resize) }
  }

  if (!p.conversation) {
    return (
      <div className={`${styles.pane} ${styles.chat}`}>
        <div className={styles.placeholder}>
          <div><strong>Selecione uma conversa</strong>Escolha um contato na lista para ver as mensagens e responder.</div>
        </div>
      </div>
    )
  }

  const c = p.conversation
  const name = contactDisplayName({ patientName: c.patients?.name, contactName: c.contact_name, jid: c.jid })

  return (
    <div className={`${styles.pane} ${styles.chat}`}>
      <div className={styles.chatHead}>
        <button className={`${styles.iconBtn} ${styles.narrowOnly}`} onClick={p.onBack} aria-label="Voltar para a lista"><Icon name="chevronLeft" size={20} /></button>
        <Avatar url={conversationPhoto(c)} name={name} size={40} className={styles.avatar} />
        <div className={styles.who}>
          <b>{name}</b>
          <span>{formatJidPhone(c.jid)} · {c.patient_id ? 'Paciente' : 'Lead'}</span>
        </div>
        <button className={`${styles.iconBtn} ${styles.mediumOnly}`} onClick={p.onToggleInfo} aria-label="Ver ficha do contato"><Icon name="info" size={20} /></button>
      </div>

      <div className={styles.msgs} ref={msgsRef}>
        {p.loading && p.messages.length === 0 && <div className={styles.day}>Carregando mensagens…</div>}
        {items.map(i => i.type === 'day'
          ? <div key={`d-${i.key}`} className={styles.day}>{i.label}</div>
          : <Bubble key={i.msg.id} m={i.msg} timezone={p.timezone} now={p.now} canAct={p.canSend} onEdit={p.onEditMessage} onDelete={p.onDeleteMessage} media={{ urls: p.mediaUrls, onOpenImage: (url, name) => setLightbox({ url, name }), onRetry: p.onRetryMedia, onDownload: p.onDownloadMedia }} />)}
      </div>

      {lightbox && (
        <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label={lightbox.name} onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.lightboxImg} src={lightbox.url} alt={lightbox.name} onClick={e => e.stopPropagation()} />
          <button type="button" className={styles.lightboxClose} onClick={() => setLightbox(null)} aria-label="Fechar imagem" autoFocus><Icon name="close" size={20} /></button>
        </div>
      )}

      {p.sendBlockedReason && <div className={styles.notice}>{p.sendBlockedReason}</div>}
      {(fileError || recorder.error || p.sendError) && <div className={styles.sendError} role="alert">{fileError || recorder.error || p.sendError}</div>}
      {file && (
        <div className={styles.pending}>
          {preview
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className={styles.pendingThumb} src={preview} alt="" />
            : <span className={styles.pendingIcon} aria-hidden="true"><Icon name="paperclip" size={20} /></span>}
          <span className={styles.pendingInfo}><b>{file.name}</b><span>{formatBytes(file.size)}. O texto abaixo vai como legenda.</span></span>
          <button type="button" className={styles.iconBtn} onClick={() => { setAttached(null); setFileError('') }} aria-label="Remover o arquivo" disabled={p.sending}><Icon name="close" size={18} /></button>
        </div>
      )}
      {showQuick && (
        <QuickReplyMenu
          items={filterQuickReplies(p.quickReplies, slash ?? '')}
          canManage={p.canManageQuick}
          onPick={pickQuick}
          onManage={() => { setQuickOpen(false); setManageOpen(true) }}
          onClose={() => setQuickOpen(false)}
        />
      )}
      {manageOpen && <QuickReplyManager clinicId={p.clinicId} items={p.quickReplies} onChanged={p.onQuickChanged} onClose={() => setManageOpen(false)} />}
      {recorder.recording && (
        <div className={styles.composer} role="group" aria-label="Gravando mensagem de voz">
          <button type="button" className={styles.attachBtn} onClick={recorder.cancel} aria-label="Descartar a gravação"><Icon name="trash" size={20} /></button>
          <span className={styles.recInfo}><span className={styles.recDot} aria-hidden="true" />Gravando {formatDuration(recorder.seconds)}</span>
          <button className={styles.send} onClick={() => void sendRecording()} disabled={p.sending} aria-label="Enviar a gravação"><Icon name="send" size={18} /></button>
        </div>
      )}
      <div className={`${styles.composer} ${recorder.recording ? styles.composerHidden : ''}`}>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={UPLOAD_ACCEPT}
          onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = '' }}
        />
        <button type="button" className={styles.attachBtn} onClick={() => fileRef.current?.click()} disabled={!p.canSend || p.sending} aria-label="Anexar foto ou documento">
          <Icon name="paperclip" size={20} />
        </button>
        <button type="button" className={styles.attachBtn} onClick={() => setQuickOpen(o => !o)} disabled={!p.canSend || p.sending} aria-label="Respostas rápidas" aria-expanded={showQuick}>
          <Icon name="chat" size={20} />
        </button>
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          disabled={!p.canSend}
          placeholder={p.canSend ? (file ? 'Legenda (opcional)' : 'Escreva uma mensagem') : 'Envio indisponível'}
          aria-label="Mensagem"
          maxLength={4000}
          onChange={e => { setText(e.target.value); resize() }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() } }}
        />
        {text.trim() || file ? (
          <button className={styles.send} onClick={() => void submit()} disabled={!p.canSend || p.sending} aria-label="Enviar mensagem">
            <Icon name="send" size={18} />
          </button>
        ) : (
          <button className={styles.send} onClick={() => void recorder.start()} disabled={!p.canSend || p.sending} aria-label="Gravar mensagem de voz">
            <Icon name="mic" size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
