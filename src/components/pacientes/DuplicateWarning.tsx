'use client'
import { isoToDateBR } from '@/lib/numericFormat'
import { reasonLabel, type DuplicateMatch } from '@/lib/pacientes/duplicados'
import { Icon } from '@/components/ui/Icon'
import styles from './DuplicateWarning.module.css'

interface Props {
  matches: DuplicateMatch[]
  /** true quando algum cadastro tem o mesmo CPF: não dá para cadastrar de novo */
  cpfConflict: boolean
  onUse: (m: DuplicateMatch) => void
  /** telefone / nome + nascimento: a pessoa confere e segue com o cadastro novo. Ausente no conflito de CPF. */
  onProceed?: () => void
}

/** Aviso "Já existe cadastro parecido", com o botão de usar o cadastro existente. */
export function DuplicateWarning({ matches, cpfConflict, onUse, onProceed }: Props) {
  if (matches.length === 0) return null
  return (
    <div className={`${styles.box} ${cpfConflict ? styles.boxBlock : ''}`} role={cpfConflict ? 'alert' : 'status'}>
      <p className={styles.title}>
        <Icon name="alert" size={15} />
        {cpfConflict ? 'CPF já cadastrado' : 'Já existe cadastro parecido'}
      </p>
      <ul className={styles.list}>
        {matches.map(m => (
          <li key={m.id} className={styles.item}>
            <span className={styles.info}>
              <b>{m.name}</b>
              <small>
                {reasonLabel(m.reason)}
                {m.phoneMasked ? ` · ${m.phoneMasked}` : ''}
                {m.birthDate ? ` · Nasc. ${isoToDateBR(m.birthDate)}` : ''}
              </small>
            </span>
            <button type="button" className={styles.use} onClick={() => onUse(m)}>Usar este cadastro</button>
          </li>
        ))}
      </ul>
      {!cpfConflict && onProceed && (
        <button type="button" className={styles.proceed} onClick={onProceed}>Cadastrar mesmo assim</button>
      )}
    </div>
  )
}
