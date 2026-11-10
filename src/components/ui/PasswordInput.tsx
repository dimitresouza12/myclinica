'use client'
import { useState, type InputHTMLAttributes } from 'react'
import { Icon } from './Icon'
import styles from './passwordInput.module.css'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/** Campo de senha com o olho para mostrar ou esconder o que foi digitado. Herda o visual do campo de quem o usa. */
export function PasswordInput({ className, ...props }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className={styles.wrap}>
      <input {...props} type={visible ? 'text' : 'password'} className={`${styles.input} ${className ?? ''}`} />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  )
}
