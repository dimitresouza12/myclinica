'use client'
import { useId } from 'react'
import {
  Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import styles from './areaTrendChart.module.css'

export interface TrendPoint {
  label: string
  value: number | null
  /** série de comparação (semana passada, despesas...), desenhada tracejada */
  compare?: number | null
}

interface Props {
  data: TrendPoint[]
  formatValue: (n: number) => string
  formatAxis?: (n: number) => string
  /** nomes das séries no tooltip e na legenda */
  valueName: string
  compareName?: string
  /** ponto destacado (etiqueta escura e faixa hachurada); sem isso, nenhum destaque */
  highlightIndex?: number
  height?: number
  /** resumo para leitor de tela */
  label: string
}

interface TipProps {
  active?: boolean
  label?: string | number
  payload?: readonly { dataKey?: unknown; value?: unknown }[]
  formatValue: (n: number) => string
  valueName: string
  compareName?: string
}

function TrendTip({ active, label, payload, formatValue, valueName, compareName }: TipProps) {
  if (!active || !payload?.length) return null
  const pick = (key: string) => {
    const v = payload.find(p => p.dataKey === key)?.value
    return typeof v === 'number' ? v : null
  }
  const v = pick('value')
  const c = pick('compare')
  return (
    <div className={styles.tip}>
      <div className={styles.tipLabel}>{label}</div>
      {v != null && <div className={styles.tipRow}><i className={styles.keyMain} />{valueName}<b>{formatValue(v)}</b></div>}
      {c != null && compareName && <div className={styles.tipRow}><i className={styles.keyDash} />{compareName}<b>{formatValue(c)}</b></div>}
    </div>
  )
}

/** Gráfico de tendência padrão (Dashboard, Financeiro, Relatórios): área teal, comparação tracejada e um ponto em destaque. */
export function AreaTrendChart({ data, formatValue, formatAxis = formatValue, valueName, compareName, highlightIndex, height = 240, label }: Props) {
  const id = useId().replace(/:/g, '')
  const hasCompare = data.some(d => d.compare != null)
  const hi = highlightIndex != null ? data[highlightIndex] : undefined
  const rows = data.map((d, i) => ({ ...d, band: i === highlightIndex ? d.value : null }))

  return (
    <figure className={styles.wrap} aria-label={label} role="img">
      {(hasCompare && compareName) && (
        <figcaption className={styles.legend} aria-hidden="true">
          <span><i className={styles.keyMain} />{valueName}</span>
          <span><i className={styles.keyDash} />{compareName}</span>
        </figcaption>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 34, right: 12, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <defs>
              <linearGradient id={`area-${id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" className={styles.areaTop} />
                <stop offset="1" className={styles.areaBottom} />
              </linearGradient>
              <pattern id={`hatch-${id}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="2" height="4" className={styles.hatch} />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--surface-line)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} dy={8} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} tickFormatter={formatAxis} width={58} />
            <Tooltip content={p => <TrendTip {...p} formatValue={formatValue} valueName={valueName} compareName={compareName} />} cursor={{ stroke: 'var(--border-color)' }} />
            {highlightIndex != null && <Bar dataKey="band" barSize={18} radius={9} fill={`url(#hatch-${id})`} isAnimationActive={false} />}
            <Area type="monotone" dataKey="value" stroke="none" fill={`url(#area-${id})`} isAnimationActive={false} connectNulls />
            {hasCompare && <Line type="monotone" dataKey="compare" stroke="var(--text-tertiary)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} activeDot={false} isAnimationActive={false} connectNulls />}
            <Line type="monotone" dataKey="value" className={styles.main} stroke="var(--brand-accent)" strokeWidth={2.2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} connectNulls />
            {hi && hi.value != null && (
              <ReferenceDot
                x={hi.label}
                y={hi.value}
                r={5}
                shape={({ cx, cy }: { cx?: number; cy?: number }) => {
                  if (cx == null || cy == null) return <g />
                  const text = formatValue(hi.value as number)
                  const w = Math.max(64, text.length * 7 + 20)
                  // nas pontas a etiqueta cresce para dentro, senão é cortada na borda do gráfico
                  const left = highlightIndex === data.length - 1 ? cx - w + 14 : highlightIndex === 0 ? cx - 14 : cx - w / 2
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={5} className={styles.dot} />
                      <rect x={left} y={cy - 34} width={w} height={24} rx={12} className={styles.pill} />
                      <text x={left + w / 2} y={cy - 18} textAnchor="middle" className={styles.pillText}>{text}</text>
                    </g>
                  )
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
