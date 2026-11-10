import type { InputHTMLAttributes } from 'react'
import { Icon } from './Icon'
import styles from './searchInput.module.css'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'size'> {
  value: string
  /** recebe o texto já extraído do evento */
  onChange: (value: string) => void
  /** nome acessível; padrão = placeholder */
  label?: string
  /** esconde o botão de limpar (padrão false) */
  hideClear?: boolean
  className?: string
}

/** Campo de busca: ícone, botão de limpar, 40px no desktop e 44px no mobile, raio de campo padrão. */
export function SearchInput({ value, onChange, label, placeholder = 'Buscar', hideClear = false, className, ...rest }: Props) {
  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <Icon name="search" size={16} className={styles.icon} aria-hidden="true" />
      <input
        {...rest}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={e => onChange(e.target.value)}
      />
      {!hideClear && value && (
        <button type="button" className={styles.clear} aria-label="Limpar busca" onClick={() => onChange('')}>
          <Icon name="close" size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
