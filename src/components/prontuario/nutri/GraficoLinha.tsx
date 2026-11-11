'use client'
import { formatarNumero } from '@/lib/nutri/validacao'
import type { PontoSerie } from '@/lib/nutri/avaliacao'
import styles from './nutri.module.css'

const W = 320
const H = 150
const ML = 34
const MR = 16
const MT = 20
const MB = 24

const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const ts = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').getTime()

interface Props {
  pontos: PontoSerie[]
  unidade: string
  /** Classe de cor do módulo CSS (cPeso, cMagra...). */
  corClasse: string
  /** Descrição para leitor de tela. */
  rotulo: string
}

/** Gráfico de linha em SVG próprio: eixo X proporcional às datas, valor escrito em cada ponto (funciona no toque, sem hover). */
export function GraficoLinha({ pontos, unidade, corClasse, rotulo }: Props) {
  if (pontos.length === 0) return <p className={styles.chartEmpty}>Sem medidas ainda.</p>

  const valores = pontos.map(p => p.valor)
  let min = Math.min(...valores)
  let max = Math.max(...valores)
  if (max - min < 1) { min -= 1; max += 1 }
  const folga = (max - min) * 0.15
  min -= folga; max += folga

  const t0 = ts(pontos[0].data)
  const t1 = ts(pontos[pontos.length - 1].data)
  const x = (p: PontoSerie) => pontos.length === 1 || t1 === t0 ? (ML + W - MR) / 2 : ML + ((ts(p.data) - t0) / (t1 - t0)) * (W - ML - MR)
  const y = (v: number) => MT + (1 - (v - min) / (max - min)) * (H - MT - MB)

  const caminho = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ')
  const mostrarTodos = pontos.length <= 8
  const marcasY = [min + folga, (min + max) / 2, max - folga]

  const resumo = pontos.map(p => `${dia(p.data)}: ${formatarNumero(p.valor, 1)} ${unidade}`).join('; ')

  return (
    <svg className={`${styles.chartSvg} ${corClasse}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${rotulo}. ${resumo}`}>
      {marcasY.map((v, i) => (
        <g key={i}>
          <line className={styles.chartGridLine} x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} />
          <text className={styles.chartAxis} x={ML - 4} y={y(v) + 3} textAnchor="end">{formatarNumero(v, 0)}</text>
        </g>
      ))}
      {pontos.length > 1 && <path className={styles.chartLine} d={caminho} />}
      {pontos.map((p, i) => {
        const ultimo = i === pontos.length - 1
        const rotuloPonto = mostrarTodos || i === 0 || ultimo
        const mostrarData = pontos.length <= 4 || i === 0 || ultimo
        return (
          <g key={p.id}>
            <circle className={styles.chartDot} cx={x(p)} cy={y(p.valor)} r={3.6} />
            {rotuloPonto && <text className={styles.chartLabel} x={x(p)} y={y(p.valor) - 8}>{formatarNumero(p.valor, 1)}</text>}
            {mostrarData && <text className={styles.chartAxis} x={x(p)} y={H - 8} textAnchor="middle">{dia(p.data)}</text>}
          </g>
        )
      })}
    </svg>
  )
}
