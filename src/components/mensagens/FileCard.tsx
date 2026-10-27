import { Fragment } from 'react'
import { Icon } from '@/components/ui/Icon'
import { fileBadge, truncateMiddle } from '@/lib/whatsapp/bubble'
import { formatBytes } from '@/lib/whatsapp/media'
import styles from './Inbox.module.css'

const NAME_MAX = 44

/** Permite quebrar a linha depois de _ - e . (nomes de arquivo não têm espaços), em vez de no meio de uma palavra. */
function breakable(name: string) {
  return name.split(/([_\-.])/).map((part, i) => (i % 2 === 1 ? <Fragment key={i}>{part}<wbr /></Fragment> : part))
}

interface Props {
  name: string
  size: number | null | undefined
  mime: string | null | undefined
  /** ready: pode abrir ou baixar; loading: a chegar ou a enviar; unavailable: removido, falhou ou grande demais */
  state: 'ready' | 'loading' | 'unavailable'
  /** PDF pronto: o cartão abre o arquivo e um botão à parte baixa */
  href?: string
  /** clique no cartão pronto que não é PDF (baixa o arquivo) e no botão de baixar do PDF */
  onDownload?: () => void
  busy?: boolean
  /** frase curta que explica o estado (loading e unavailable) */
  hint?: string
  error?: string
  /** "Baixar de novo", só em unavailable quando dá para tentar */
  onRetry?: () => void
}

/**
 * Arquivo de uma mensagem em uma camada só: selo com o tipo, nome, tamanho e uma ação.
 * Serve ao arquivo recebido, ao enviado e ao que ainda está em envio.
 */
export function FileCard({ name, size, mime, state, href, onDownload, busy, hint, error, onRetry }: Props) {
  const badge = fileBadge(name, mime)
  const shown = truncateMiddle(name, NAME_MAX)
  const meta = [badge.label, formatBytes(size)].filter(Boolean).join(' · ')

  const body = (
    <>
      <span className={`${styles.fileBadge} ${state === 'loading' ? styles.fileShimmer : ''}`} data-tone={badge.tone} aria-hidden="true">{badge.label}</span>
      <span className={styles.fileText}>
        <span className={styles.fileName} title={name}>{breakable(shown)}</span>
        <span className={styles.fileMeta}>{state === 'ready' ? meta : (hint ?? meta)}</span>
      </span>
    </>
  )

  if (state !== 'ready') {
    return (
      <div className={`${styles.fileCard} ${styles.fileDim}`} aria-busy={state === 'loading'}>
        <div className={styles.fileMain}>{body}</div>
        {onRetry && <button type="button" className={styles.fileRetry} onClick={onRetry} disabled={busy}>{busy ? 'Baixando…' : 'Baixar de novo'}</button>}
        {error && <span className={styles.mediaError} role="alert">{error}</span>}
      </div>
    )
  }

  const isLink = !!href
  return (
    <div className={styles.fileCard}>
      {isLink ? (
        <a className={`${styles.fileMain} ${styles.fileAction}`} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${name}`}>{body}</a>
      ) : (
        <button type="button" className={`${styles.fileMain} ${styles.fileAction}`} onClick={onDownload} disabled={busy} aria-label={busy ? 'Preparando o arquivo' : `Baixar ${name}`}>
          {body}
          <span className={styles.fileGo} aria-hidden="true"><Icon name="download" size={18} /></span>
        </button>
      )}
      {isLink && (
        <button type="button" className={styles.fileDl} onClick={onDownload} disabled={busy} aria-label={`Baixar ${name}`}>
          <Icon name="download" size={18} />
        </button>
      )}
      {error && <span className={styles.mediaError} role="alert">{error}</span>}
    </div>
  )
}
