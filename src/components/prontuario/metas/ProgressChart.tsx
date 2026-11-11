'use client'
import { useMemo } from 'react'
import { lineChartSvg } from '@/lib/metas/chartSvg'
import type { SeriesPoint } from '@/lib/metas/progress'
import styles from './metas.module.css'

interface Props {
  series: SeriesPoint[]
  /** descrição para leitor de tela */
  label: string
  height?: number
  unit?: string
  /** topo do eixo Y (padrão 100) */
  yMax?: number
  /** rótulos fixos do eixo Y */
  yTicks?: number[]
}

/** Gráfico de linha em SVG próprio (a mesma função gera o gráfico do relatório impresso). */
export function ProgressChart({ series, label, height = 180, unit, yMax, yTicks }: Props) {
  const svg = useMemo(
    () => lineChartSvg(series, { color: 'currentColor', grid: 'var(--border-color)', text: 'var(--text-secondary)', label, height, unit, yMax, yTicks }),
    [series, label, height, unit, yMax, yTicks],
  )
  if (series.length === 0) return null
  // o SVG só tem números, datas e o rótulo escapado
  return <div className={styles.chart} dangerouslySetInnerHTML={{ __html: svg }} />
}
