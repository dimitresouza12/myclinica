'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { MAX_STORED_BYTES, formatDuration } from '@/lib/whatsapp/media'
import { VoicePlayer } from './VoicePlayer'
import { FileCard } from './FileCard'
import type { WaMessage } from '@/hooks/useWhatsAppInbox'
import styles from './Inbox.module.css'

const KIND_LABEL: Record<WaMessage['kind'], string> = {
  text: '', image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha', other: 'Mensagem',
}

interface Props {
  m: WaMessage
  /** link temporário do arquivo, quando já disponível */
  url: string | undefined
  onOpenMedia: (url: string, name: string, kind: 'image' | 'video') => void
  onRetry: (messageId: string) => Promise<string | null>
  onDownload: (messageId: string) => Promise<string | null>
}

/** O arquivo de uma mensagem: imagem, áudio, vídeo, documento ou figurinha, com o estado em que ele está. */
export function MediaBubble({ m, url, onOpenMedia, onRetry, onDownload }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const thumb = m.media_thumb ? `data:image/jpeg;base64,${m.media_thumb}` : null
  const tooBig = m.media_size != null && m.media_size > MAX_STORED_BYTES

  async function run(fn: (id: string) => Promise<string | null>) {
    setBusy(true); setError('')
    try { setError((await fn(m.id)) ?? '') } finally { setBusy(false) }
  }

  // ainda baixando, não disponível ou removido: mostra a miniatura (se houver) e o estado
  if (m.media_status !== 'ready' || !url) {
    const state =
      m.media_status === 'pending' ? 'Carregando…'
      : m.media_status === 'expired' ? 'Removido. Veja no WhatsApp do celular.'
      : tooBig ? 'Grande demais para abrir aqui. Veja no WhatsApp do celular.'
      : m.media_status === 'failed' ? 'Não foi possível carregar o arquivo.'
      : m.media_status === 'ready' ? 'Preparando o arquivo…'
      : 'Indisponível aqui. Veja no WhatsApp do celular.'
    // arquivo enviado pelo sistema não tem como baixar de novo do WhatsApp (não guardamos a chave dele)
    const canRetry = (m.media_status === 'failed' || m.media_status === 'expired') && !tooBig && m.origin !== 'sistema'
    if (m.kind === 'document') {
      return (
        <FileCard
          name={m.media_name ?? 'Documento'}
          size={m.media_size}
          mime={m.media_mime}
          state={m.media_status === 'pending' ? 'loading' : 'unavailable'}
          hint={state}
          busy={busy}
          error={error}
          onRetry={canRetry ? () => void run(onRetry) : undefined}
        />
      )
    }
    return (
      <div className={styles.mediaBox}>
        {thumb && (m.kind === 'image' || m.kind === 'video' || m.kind === 'sticker') && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.thumbBlur} src={thumb} alt="" />
        )}
        <span className={styles.mediaKind}>{KIND_LABEL[m.kind]}{m.media_name ? `: ${m.media_name}` : ''}</span>
        <span className={styles.mediaState}>{state}</span>
        {canRetry && (
          <button type="button" className={styles.fileRetry} disabled={busy} onClick={() => void run(onRetry)}>
            {busy ? 'Baixando…' : 'Baixar de novo'}
          </button>
        )}
        {error && <span className={styles.mediaError} role="alert">{error}</span>}
      </div>
    )
  }

  if (m.kind === 'image' || m.kind === 'sticker') {
    const label = m.kind === 'sticker' ? 'Figurinha' : 'Imagem'
    return (
      <button type="button" className={styles.imgBtn} onClick={() => onOpenMedia(url, m.media_name ?? label, 'image')} aria-label={`Abrir ${label.toLowerCase()} em tamanho grande`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={m.kind === 'sticker' ? styles.sticker : styles.img} src={url} alt={label} loading="lazy" />
      </button>
    )
  }

  if (m.kind === 'audio') {
    return <VoicePlayer url={url} seed={m.id} wave={m.media_wave} seconds={m.media_seconds} outgoing={m.direction === 'out'} />
  }

  if (m.kind === 'video') {
    return (
      <button type="button" className={styles.videoBtn} onClick={() => onOpenMedia(url, m.media_name ?? 'Vídeo', 'video')} aria-label="Abrir vídeo">
        {thumb
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className={styles.video} src={thumb} alt="" />
          : <video className={styles.video} src={url} muted preload="metadata" playsInline />}
        <span className={styles.videoPlay} aria-hidden="true"><Icon name="play" size={22} /></span>
        {m.media_seconds ? <span className={styles.videoDuration}>{formatDuration(m.media_seconds)}</span> : null}
      </button>
    )
  }

  // documento
  const isPdf = m.media_mime === 'application/pdf'
  return (
    <FileCard
      name={m.media_name ?? 'Documento'}
      size={m.media_size}
      mime={m.media_mime}
      state="ready"
      href={isPdf ? url : undefined}
      onDownload={() => void run(onDownload)}
      busy={busy}
      error={error}
    />
  )
}
