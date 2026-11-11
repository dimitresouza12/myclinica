'use client'
import { diaMes } from '@/lib/vet/datas'
import { emOrdemCronologica, type Pesagem } from '@/lib/vet/peso'
import { fmt } from '@/lib/vet/numeros'
import styles from './vet.module.css'

const W = 320
const H = 170
const ML = 36
const MR = 18
const MT = 22
const MB = 26

const ts = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').getTime()

/** Casas decimais do eixo conforme a amplitude: pet de 400 g precisa de 2, cavalo de 500 kg não. */
function casasDoEixo(amplitude: number): number {
  return amplitude < 1 ? 2 : amplitude < 10 ? 1 : 0
}

/** Curva de peso em SVG próprio: eixo X proporcional às datas, peso escrito em cada ponto (funciona no toque, sem hover). */
export function GraficoPeso({ pesagens }: { pesagens: Pesagem[] }) {
  const pontos = emOrdemCronologica(pesagens)
  if (pontos.length === 0) return <p className={styles.chartEmpty}>Sem pesagens ainda.</p>

  const valores = pontos.map(p => p.weight_kg)
  let min = Math.min(...valores)
  let max = Math.max(...valores)
  if (max - min < max * 0.04) { const m = Math.max(max * 0.04, 0.01); min -= m; max += m }
  const folga = (max - min) * 0.15
  min -= folga; max += folga
  const casas = casasDoEixo(max - min)

  const t0 = ts(pontos[0].weighed_on)
  const t1 = ts(pontos[pontos.length - 1].weighed_on)
  const x = (p: Pesagem) => (pontos.length === 1 || t1 === t0 ? (ML + W - MR) / 2 : ML + ((ts(p.weighed_on) - t0) / (t1 - t0)) * (W - ML - MR))
  const y = (v: number) => MT + (1 - (v - min) / (max - min)) * (H - MT - MB)

  const caminho = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)} ${y(p.weight_kg).toFixed(1)}`).join(' ')
  const mostrarTodos = pontos.length <= 8
  const marcasY = [min + folga, (min + max) / 2, max - folga]
  const resumo = pontos.map(p => `${diaMes(p.weighed_on)}: ${fmt(p.weight_kg, 3)} kg`).join('; ')

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curva de peso. ${resumo}`}>
      {marcasY.map((v, i) => (
        <g key={i}>
          <line className={styles.chartGridLine} x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} />
          <text className={styles.chartAxis} x={ML - 4} y={y(v) + 3} textAnchor="end">{fmt(v, casas)}</text>
        </g>
      ))}
      {pontos.length > 1 && <path className={styles.chartLine} d={caminho} />}
      {pontos.map((p, i) => {
        const ultimo = i === pontos.length - 1
        const rotulo = mostrarTodos || i === 0 || ultimo
        const mostrarData = pontos.length <= 4 || i === 0 || ultimo
        return (
          <g key={p.id}>
            <circle className={styles.chartDot} cx={x(p)} cy={y(p.weight_kg)} r={3.6} />
            {rotulo && <text className={styles.chartLabel} x={x(p)} y={y(p.weight_kg) - 8}>{fmt(p.weight_kg, 2)}</text>}
            {mostrarData && <text className={styles.chartAxis} x={x(p)} y={H - 8} textAnchor="middle">{diaMes(p.weighed_on)}</text>}
          </g>
        )
      })}
    </svg>
  )
}
