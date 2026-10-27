import { scalePoints, smoothPath } from '@/lib/ui/charts'
import styles from './sparkline.module.css'

interface Props {
  values: number[]
  /** texto para leitor de tela, ex.: "Pacientes nos últimos 7 dias: de 30 para 45" */
  label: string
  width?: number
  height?: number
  className?: string
}

/** Mini gráfico de tendência: curva suave, ponto vazado no início e ponto teal no fim. */
export function Sparkline({ values, label, width = 120, height = 46, className }: Props) {
  // sem pelo menos dois pontos, ou tudo zerado, a linha não diz nada
  if (values.length < 2 || values.every(v => v === 0)) return null
  const pts = scalePoints(values, width, height, 6)
  const first = pts[0]
  const last = pts[pts.length - 1]
  return (
    <svg className={[styles.spark, className].filter(Boolean).join(' ')} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <path className={styles.line} d={smoothPath(pts)} />
      <circle className={styles.start} cx={first[0]} cy={first[1]} r={3.5} />
      <circle className={styles.end} cx={last[0]} cy={last[1]} r={4} />
    </svg>
  )
}
