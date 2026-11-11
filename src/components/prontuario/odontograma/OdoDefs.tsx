import { useEffect } from 'react'
import { ALL_STATUS } from '@/lib/odontograma'
import { FRONT_TILES, OCC_TILES, SPRITE, TILE_IDS, centerPathOf } from './shapes'
import { probeSprite } from './spriteStatus'
import styles from './odontogramaBoard.module.css'

/** Id dos recursos compartilhados (gradientes, filtro, recortes, fatias da sprite). Definidos uma vez por tela, em OdoDefs. */
export const ODO = {
  steel: 'odo-steel', gold: 'odo-gold', shadow: 'odo-shadow',
  sprite: (col: number, row: number) => `odo-sp-${col}-${row}`,
  stain: (k: string) => `odo-stain-${k}`,
  clipCrown: (k: string) => `odo-cc-${k}`,
  clipRoots: (k: string) => `odo-cr-${k}`,
  clipRing: (k: string) => `odo-ring-${k}`,
}
export const url = (id: string) => `url(#${id})`

const stop = (offset: number, color: string, opacity?: number) => (
  <stop offset={offset} style={{ stopColor: color }} stopOpacity={opacity} />
)

/**
 * Recursos de desenho dos dentes: as 10 fatias da sprite fotográfica (uma só imagem, carregada uma vez e reaproveitada
 * por todos os dentes via <use>), aço, ouro, manchas de condição, sombra suave e os recortes (coroa, raízes, anel das
 * faces).
 */
export function OdoDefs() {
  const { cols, rows, tileW, tileH, src } = SPRITE
  useEffect(() => { probeSprite(src) }, [src])
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', pointerEvents: 'none' }}>
      <defs>
        {Array.from({ length: cols }, (_, c) => Array.from({ length: rows }, (_, r) => (
          <symbol key={`${c}-${r}`} id={ODO.sprite(c, r)} viewBox={`0 0 ${tileW} ${tileH}`}>
            <image href={src} x={-c * tileW} y={-r * tileH} width={cols * tileW} height={rows * tileH} preserveAspectRatio="none" />
          </symbol>
        )))}
        <linearGradient id={ODO.steel} x1="0" y1="0" x2="0" y2="1">
          {stop(0, '#F6F8FA')}{stop(0.45, '#A3ACB7')}{stop(0.55, '#6F7885')}{stop(1, '#C8CFD7')}
        </linearGradient>
        <linearGradient id={ODO.gold} x1="0" y1="0" x2="1" y2="1">
          {stop(0, '#FBE9A8')}{stop(0.4, '#D8A93C')}{stop(0.7, '#A57817')}{stop(1, '#F1D27A')}
        </linearGradient>
        {ALL_STATUS.map(s => (
          <radialGradient key={s.key} id={ODO.stain(s.key)} cx="0.5" cy="0.5" r="0.5">
            {stop(0, s.color, 0.92)}{stop(0.55, s.color, 0.6)}{stop(1, s.color, 0)}
          </radialGradient>
        ))}
        <filter id={ODO.shadow} x="-15%" y="-8%" width="130%" height="124%">
          <feDropShadow dx="0" dy="1.7" stdDeviation="1.7" className={styles.shadowFlood} />
        </filter>
        {TILE_IDS.map(k => (
          <g key={k}>
            <clipPath id={ODO.clipCrown(k)}><path d={FRONT_TILES[k].crown} /></clipPath>
            <clipPath id={ODO.clipRoots(k)}>{FRONT_TILES[k].roots.map((r, i) => <path key={i} d={r.d} />)}</clipPath>
            <clipPath id={ODO.clipRing(k)}><path d={`${OCC_TILES[k].outline} ${centerPathOf(OCC_TILES[k])}`} clipRule="evenodd" /></clipPath>
          </g>
        ))}
      </defs>
    </svg>
  )
}
