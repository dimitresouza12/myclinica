import styles from './spinner.module.css'

interface Props {
  /** diâmetro em px (padrão 20) */
  size?: number
  /** texto para leitor de tela (padrão "Carregando") */
  label?: string
  /** true quando o contexto já anuncia o carregamento (ex.: dentro de botão com texto) */
  decorative?: boolean
  className?: string
}

/** Indicador de carregamento circular. Herda a cor do texto (currentColor). */
export function Spinner({ size = 20, label = 'Carregando', decorative = false, className }: Props) {
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'status' as const, 'aria-label': label }
  return (
    <span
      className={[styles.spinner, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 10)) }}
      {...a11y}
    />
  )
}
