import type { CSSProperties } from 'react'
import styles from './skeleton.module.css'

interface SkeletonProps {
  /** largura (número = px, string = qualquer unidade CSS). Padrão 100% */
  width?: number | string
  /** altura (padrão 16px) */
  height?: number | string
  /** raio (padrão 8px). Use '50%' para círculo */
  radius?: number | string
  className?: string
  style?: CSSProperties
}

/** Bloco de carregamento com brilho. Decorativo: marque o contêiner com aria-busy="true". */
export function Skeleton({ width = '100%', height = 16, radius = 8, className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.skeleton, className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  )
}

interface SkeletonLinesProps {
  /** quantidade de linhas (padrão 3) */
  lines?: number
  /** altura de cada linha (padrão 14px) */
  lineHeight?: number
  /** a última linha fica mais curta, como um parágrafo (padrão true) */
  shortLast?: boolean
  className?: string
}

/** Várias linhas de texto em carregamento. */
export function SkeletonLines({ lines = 3, lineHeight = 14, shortLast = true, className }: SkeletonLinesProps) {
  return (
    <span aria-hidden="true" className={[styles.lines, className].filter(Boolean).join(' ')}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={shortLast && lines > 1 && i === lines - 1 ? '60%' : '100%'} radius={6} />
      ))}
    </span>
  )
}
