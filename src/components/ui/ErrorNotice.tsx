import { Icon } from './Icon'
import { Spinner } from './Spinner'
import styles from './errorNotice.module.css'

interface Props {
  /** o que deu errado, em linguagem simples */
  message: string
  /** frase curta em destaque antes da mensagem (opcional) */
  title?: string
  /** quando informado, mostra o botão "Tentar novamente" */
  onRetry?: () => void
  retryLabel?: string
  /** desabilita o botão e mostra spinner enquanto a nova tentativa roda */
  retrying?: boolean
  className?: string
}

/** Aviso de erro em linha (role="alert"), com tentativa de novo opcional. */
export function ErrorNotice({ message, title, onRetry, retryLabel = 'Tentar novamente', retrying = false, className }: Props) {
  return (
    <div role="alert" className={[styles.root, className].filter(Boolean).join(' ')}>
      <Icon name="alert" size={18} className={styles.icon} aria-hidden="true" />
      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        <p className={styles.text}>{message}</p>
      </div>
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry} disabled={retrying}>
          {retrying ? <Spinner size={14} decorative /> : <Icon name="refresh" size={14} aria-hidden="true" />}
          {retryLabel}
        </button>
      )}
    </div>
  )
}
