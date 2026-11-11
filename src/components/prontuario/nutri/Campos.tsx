'use client'
import { useId } from 'react'
import { DecimalInput } from '@/components/ui/NumericInput'
import { LIMITES, type LimiteKey } from '@/lib/nutri/validacao'
import styles from './nutri.module.css'

interface CampoNumeroProps {
  rotulo: string
  /** Texto com ponto decimal ("72.5"). */
  valor: string
  onChange: (v: string) => void
  limite: LimiteKey
  casas?: number
  erro?: string
  /** Sobrescreve a unidade do limite (ex.: "mm"). */
  un?: string
  placeholder?: string
  /** Destaca o campo como obrigatório do protocolo escolhido. */
  obrigatorio?: boolean
}

/** Campo numérico com rótulo, unidade e mensagem de erro; o teto da faixa é aplicado na digitação (DecimalInput). */
export function CampoNumero({ rotulo, valor, onChange, limite, casas = 1, erro, un, placeholder, obrigatorio }: CampoNumeroProps) {
  const id = useId()
  const l = LIMITES[limite]
  const unidade = un ?? l.un
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{rotulo}{unidade && <> <span className={styles.unit}>({unidade})</span></>}{obrigatorio && <span className={styles.unit}> obrigatório</span>}</label>
      <DecimalInput
        id={id}
        className={`${styles.input} ${erro ? styles.inputErr : ''}`}
        value={valor}
        onChange={onChange}
        max={l.max}
        decimals={casas}
        placeholder={placeholder ?? '0'}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
      />
      {erro && <span id={`${id}-erro`} className={styles.errMsg} role="alert">{erro}</span>}
    </div>
  )
}

/** Hora HH:MM só com dígitos: "0730" vira "07:30". */
export function mascaraHora(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}:${d.slice(2)}`
}
