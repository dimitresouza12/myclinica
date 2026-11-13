'use client'
import { useEffect, useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { formatBytes } from '@/lib/whatsapp/media'
import { MAX_CAPTION } from '@/lib/teamChat/attachments'
import type { CompressedImage } from '@/lib/teamChat/compress'
import styles from './ChatEquipe.module.css'

export type ImagePreviewState =
  | { status: 'preparing' }
  | { status: 'ready'; image: CompressedImage; url: string }

interface Props {
  state: ImagePreviewState
  caption: string
  onCaption: (v: string) => void
  onCancel: () => void
  onSend: () => void
}

/** Pré-visualização da foto (já comprimida) antes de enviar, com legenda opcional. Esc cancela. */
export function ImagePreview({ state, caption, onCaption, onCancel, onSend }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ready = state.status === 'ready'

  // no computador o foco vai para a legenda; no celular, para o painel (focar o campo abriria o teclado por cima da foto)
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (ready && fine) inputRef.current?.focus()
    else panelRef.current?.focus()
  }, [ready])

  return (
    <div
      ref={panelRef}
      className={styles.imgPrev}
      role="group"
      aria-label="Enviar foto"
      tabIndex={-1}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
    >
      {state.status === 'preparing' ? (
        <div className={styles.imgPrevBusy} role="status">
          <Spinner size={22} decorative />
          Preparando a foto
        </div>
      ) : (
        <>
          <div className={styles.imgPrevPic}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.url} alt="Pré-visualização da foto a enviar" className={styles.imgPrevImg} />
            <span className={styles.imgPrevMeta}>{state.image.width} x {state.image.height} · {formatBytes(state.image.blob.size)}</span>
          </div>
        </>
      )}
      <div className={styles.imgPrevRow}>
        <button type="button" className={styles.recCancel} onClick={onCancel} aria-label="Cancelar o envio da foto" title="Cancelar">
          <Icon name="close" size={20} />
        </button>
        <input
          ref={inputRef}
          type="text"
          className={styles.imgPrevCaption}
          value={caption}
          maxLength={MAX_CAPTION}
          placeholder="Adicionar legenda (opcional)"
          aria-label="Legenda da foto"
          disabled={!ready}
          onChange={e => onCaption(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
            if (e.key === 'Enter') { e.preventDefault(); if (ready) onSend() }
          }}
        />
        <button type="button" className={styles.send} onClick={onSend} disabled={!ready} aria-label="Enviar foto" title="Enviar foto">
          <Icon name="send" size={18} />
        </button>
      </div>
    </div>
  )
}
