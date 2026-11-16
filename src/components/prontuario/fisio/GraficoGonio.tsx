'use client'
import { diaMes } from '@/lib/vet/datas'
import { fmt } from '@/lib/vet/numeros'
import type { Medida } from '@/lib/fisio/goniometria'
import styles from './fisio.module.css'

const W = 320
const H = 190
const ML = 38
const MR = 18
const MT = 22
const MB = 26

const ts = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').getTime()

/**
 * Evolução do ângulo em SVG próprio: eixo X proporcional às datas, ângulo escrito em cada ponto (funciona no toque, sem
 * hover) e uma linha tracejada com o valor normal de referência.
 */
export function GraficoGonio({ pontos, referencia }: { pontos: Medida[]; referencia: number | null }) {
  if (pontos.length === 0) return <p className={styles.chartEmpty}>Sem medidas ainda.</p>

  const valores = pontos.map(p => p.angle_deg)
  let min = Math.min(...valores, ...(referencia !== null ? [referencia] : []))
  let max = Math.max(...valores, ...(referencia !== null ? [referencia] : []))
  if (max - min < 10) { min -= 5; max += 5 }
  const folga = (max - min) * 0.12
  min = Math.max(0, min - folga)
  max += folga

  const t0 = ts(pontos[0].measured_on)
  const t1 = ts(pontos[pontos.length - 1].measured_on)
  const x = (p: Medida) => (pontos.length === 1 || t1 === t0 ? (ML + W - MR) / 2 : ML + ((ts(p.measured_on) - t0) / (t1 - t0)) * (W - ML - MR))
  const y = (v: number) => MT + (1 - (v - min) / (max - min)) * (H - MT - MB)

  const caminho = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)} ${y(p.angle_deg).toFixed(1)}`).join(' ')
  const mostrarTodos = pontos.length <= 8
  const marcasY = [min, (min + max) / 2, max]
  const resumo = pontos.map(p => `${diaMes(p.measured_on)}: ${fmt(p.angle_deg, 1)} graus`).join('; ')
  const refY = referencia !== null ? y(referencia) : null

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolução do ângulo${referencia !== null ? `, referência ${fmt(referencia, 0)} graus` : ''}. ${resumo}`}>
      {marcasY.map((v, i) => (
        <g key={i}>
          <line className={styles.chartGridLine} x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} />
          <text className={styles.chartAxis} x={ML - 4} y={y(v) + 3} textAnchor="end">{`${fmt(v, 0)}°`}</text>
        </g>
      ))}
      {refY !== null && (
        <g>
          <line className={styles.chartRef} x1={ML} x2={W - MR} y1={refY} y2={refY} />
          <text className={styles.chartRefLabel} x={W - MR} y={refY - 3} textAnchor="end">{`Referência ${fmt(referencia, 0)}°`}</text>
        </g>
      )}
      {pontos.length > 1 && <path className={styles.chartLine} d={caminho} />}
      {pontos.map((p, i) => {
        const ultimo = i === pontos.length - 1
        const rotulo = mostrarTodos || i === 0 || ultimo
        const mostrarData = pontos.length <= 4 || i === 0 || ultimo
        return (
          <g key={p.id}>
            <circle className={styles.chartDot} cx={x(p)} cy={y(p.angle_deg)} r={3.6} />
            {rotulo && <text className={styles.chartLabel} x={x(p)} y={y(p.angle_deg) - 8}>{`${fmt(p.angle_deg, 1)}°`}</text>}
            {mostrarData && <text className={styles.chartAxis} x={x(p)} y={H - 8} textAnchor="middle">{diaMes(p.measured_on)}</text>}
          </g>
        )
      })}
    </svg>
  )
}
