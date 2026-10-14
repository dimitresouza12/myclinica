'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { MAX_STORED_BYTES, formatBytes, formatDuration } from '@/lib/whatsapp/media'
import { VoicePlayer } from './VoicePlayer'
import type { WaMessage } from '@/hooks/useWhatsAppInbox'
import styles from './Inbox.module.css'

const KIND_TITLE: Record<WaMessage['kind'], string> = {
  text: '', image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha', other: 'Mensagem',
}

interface Props {
  m: WaMessage
  /** link temporário do arquivo, quando já disponível */
  url: string | undefined
  onOpenImage: (url: string, name: string) => void
  onRetry: (messageId: string) => Promise<string | null>
  onDownload: (messageId: string) => Promise<string | null>
}

/** O arquivo de uma mensagem: imagem, áudio, vídeo, documento ou figurinha, com o estado em que ele está. */
export function MediaBubble({ m, url, onOpenImage, onRetry, onDownload }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const thumb = m.media_thumb ? `data:image/jpeg;base64,${m.media_thumb}` : null
  const title = KIND_TITLE[m.kind]
  const tooBig = m.media_size != null && m.media_size > MAX_STORED_BYTES

  async function run(fn: (id: string) => Promise<string | null>) {
    setBusy(true); setError('')
    try { setError((await fn(m.id)) ?? '') } finally { setBusy(false) }
  }

  // ainda baixando, não disponível ou removido: mostra a miniatura (se houver) e o estado
  if (m.media_status !== 'ready' || !url) {
    const state =
      m.media_status === 'pending' ? 'Carregando o arquivo…'
      : m.media_status === 'expired' ? 'Arquivo removido. A cópia fica guardada por poucos dias.'
      : tooBig ? 'Arquivo grande demais para abrir por aqui. Veja no WhatsApp do celular.'
      : m.media_status === 'failed' ? 'Não foi possível carregar o arquivo.'
      : m.media_status === 'ready' ? 'Preparando o arquivo…'
      : 'O arquivo não está disponível por aqui. Veja no WhatsApp do celular.'
    // arquivo enviado pelo sistema não tem como baixar de novo do WhatsApp (não guardamos a chave dele)
    const canRetry = (m.media_status === 'failed' || m.media_status === 'expired') && !tooBig && m.origin !== 'sistema'
    return (
      <div className={styles.mediaBox}>
        {thumb && (m.kind === 'image' || m.kind === 'video' || m.kind === 'sticker') && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.thumbBlur} src={thumb} alt="" />
        )}
        <span className={styles.mediaTitle}>{title}{m.media_name ? `: ${m.media_name}` : ''}</span>
        <span className={styles.media}>{state}</span>
        {canRetry && (
          <button type="button" className={styles.mediaBtn} disabled={busy} onClick={() => void run(onRetry)}>
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
      <button type="button" className={styles.imgBtn} onClick={() => onOpenImage(url, m.media_name ?? label)} aria-label={`Abrir ${label.toLowerCase()} em tamanho grande`}>
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
      <div className={styles.mediaBox}>
        <video className={styles.video} controls preload="metadata" src={url} poster={thumb ?? undefined} />
        {m.media_seconds ? <span className={styles.media}>Vídeo ({formatDuration(m.media_seconds)})</span> : null}
      </div>
    )
  }

  // documento
  const isPdf = m.media_mime === 'application/pdf'
  return (
    <div className={styles.docCard}>
      <span className={styles.docIcon} aria-hidden="true"><Icon name="paperclip" size={20} /></span>
      <span className={styles.docInfo}>
        <b>{m.media_name ?? 'Documento'}</b>
        <span>{formatBytes(m.media_size)}</span>
      </span>
      <span className={styles.docActions}>
        {isPdf && <a className={styles.mediaBtn} href={url} target="_blank" rel="noopener noreferrer">Abrir</a>}
        <button type="button" className={styles.mediaBtn} disabled={busy} onClick={() => void run(onDownload)}>{busy ? 'Preparando…' : 'Baixar'}</button>
      </span>
      {error && <span className={styles.mediaError} role="alert">{error}</span>}
    </div>
  )
}
