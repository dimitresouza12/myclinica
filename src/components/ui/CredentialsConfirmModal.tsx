'use client'
import { useState } from 'react'
import { Portal } from './Portal'
import { Icon } from './Icon'
import styles from './credentialsConfirmModal.module.css'

interface Props {
  displayName: string
  username: string
  email: string
  password: string
  onClose: () => void
}

// Depois de criar um login, o modal antes fechava em silêncio — o admin não
// tinha como confirmar se anotou os dados certos, e quem ia logar não sabia
// como entrar. Essa tela mostra o que foi definido, com botão de copiar,
// antes de sumir.
export function CredentialsConfirmModal({ displayName, username, email, password, onClose }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(field: string, value: string) {
    navigator.clipboard?.writeText(value)
    setCopied(field)
    setTimeout(() => setCopied(null), 1500)
  }

  const rows: { key: string; label: string; value: string }[] = [
    { key: 'username', label: 'Usuário', value: username },
    { key: 'email', label: 'E-mail', value: email },
    { key: 'password', label: 'Senha', value: password },
  ]

  return (
    <Portal>
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <div className={styles.iconWrap}><Icon name="checkCircle" size={22} /></div>
            <h2>Login criado para {displayName}</h2>
          </div>
          <p className={styles.desc}>
            Compartilhe esses dados com segurança — a pessoa pode trocar a senha depois de entrar.
          </p>
          <div className={styles.rows}>
            {rows.map(r => (
              <div key={r.key} className={styles.row}>
                <div>
                  <div className={styles.rowLabel}>{r.label}</div>
                  <div className={styles.rowValue}>{r.value}</div>
                </div>
                <button className={styles.btnCopy} onClick={() => copy(r.key, r.value)} type="button">
                  {copied === r.key ? <Icon name="check" size={14} /> : <Icon name="copy" size={14} />}
                  {copied === r.key ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            ))}
          </div>
          <button className={styles.btnDone} onClick={onClose}>Entendi</button>
        </div>
      </div>
    </Portal>
  )
}
