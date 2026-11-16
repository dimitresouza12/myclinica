'use client'
import { RefImage } from '../RefImage'
import { FACE_FRONT } from '@/lib/referenceImages'
import { FACE_VH, FACE_VW } from '@/lib/faceograma'
import type { RegiaoAplicada } from '@/lib/estetica/aplicacoes'
import styles from './aplicacoes.module.css'

interface Props {
  regioes: RegiaoAplicada[]
  cor: string
  selecionada: string | null
  /** toque num ponto livre do rosto: adiciona uma região naquela posição */
  onAdicionar: (x: number, y: number) => void
  /** toque num ponto que já existe: seleciona a região correspondente */
  onSelecionar: (id: string) => void
}

const RAIO_TOQUE = 12

/** Mapa do rosto (o mesmo desenho do faceograma). Toque marca a região; os pontos aparecem numerados, na cor do tipo. */
export function MapaAplicacao({ regioes, cor, selecionada, onAdicionar, onSelecionar }: Props) {
  function tocar(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    const x = Math.round(((e.clientX - r.left) / r.width) * FACE_VW)
    const y = Math.round(((e.clientY - r.top) / r.height) * FACE_VH)
    const perto = regioes.find(g => g.x !== null && g.y !== null && Math.hypot((g.x ?? 0) - x, (g.y ?? 0) - y) < RAIO_TOQUE)
    if (perto) onSelecionar(perto.id)
    else onAdicionar(x, y)
  }

  return (
    <svg
      className={styles.map}
      viewBox={`0 0 ${FACE_VW} ${FACE_VH}`}
      role="img"
      aria-label="Mapa do rosto. Toque para marcar uma região aplicada."
      onClick={tocar}
    >
      <RefImage img={FACE_FRONT} width={FACE_VW} height={FACE_VH} />
      {regioes.map((g, i) => g.x === null || g.y === null ? null : (
        <g key={g.id}>
          <circle cx={g.x} cy={g.y} r={g.id === selecionada ? 8 : 6.5} fill={cor} stroke={g.id === selecionada ? '#111' : '#fff'} strokeWidth={g.id === selecionada ? 1.6 : 1} />
          <text className={styles.pin} x={g.x} y={g.y + 2.6} textAnchor="middle">{i + 1}</text>
        </g>
      ))}
    </svg>
  )
}
