'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/ui/Icon'
import { useScrollLock } from '@/hooks/useScrollLock'
import styles from './ChatEquipe.module.css'

interface Props {
  url: string
  onClose: () => void
  /** gera outro link (`true` força); usado UMA vez se a imagem não carregar (link vencido) */
  refresh?: (force?: boolean) => Promise<string | null>
}

/** Foto em tela cheia. Esc ou toque fora fecham; o foco fica no botão de fechar e quem abriu devolve o foco no onClose. */
export function Lightbox({ url, onClose, refresh }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [failed, setFailed] = useState(false)
  const [src, setSrc] = useState(url)
  const retriedRef = useRef(false)
  useScrollLock(true)

  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
      // só há um elemento focável: o Tab não sai do diálogo
      else if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function onImgError() {
    if (refresh && !retriedRef.current) {
      retriedRef.current = true
      void refresh(true).then(next => { if (next && next !== src) setSrc(next); else setFailed(true) }, () => setFailed(true))
      return
    }
    setFailed(true)
  }

  return createPortal(
    <div className={styles.lightbox} role="dialog" aria-modal="true" aria-label="Foto em tamanho grande" onClick={onClose}>
      <button ref={closeRef} type="button" className={styles.lightboxClose} onClick={onClose} aria-label="Fechar a foto">
        <Icon name="close" size={22} />
      </button>
      {failed ? (
        <p className={styles.lightboxErr} role="alert">Não foi possível abrir a foto.</p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Foto enviada na conversa" className={styles.lightboxImg} onClick={e => e.stopPropagation()} onError={onImgError} />
      )}
    </div>,
    document.body,
  )
}
