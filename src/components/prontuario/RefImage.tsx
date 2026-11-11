'use client'
// Imagem de referência dentro de um SVG: mostra a miniatura embutida (ampliada, portanto borrada) até a imagem
// de verdade terminar de carregar, e então troca. `hi` pede a versão completa (tela cheia); sem ele vale a -sm.
import { useEffect, useState } from 'react'
import type { RefImage as RefImageData } from '@/lib/referenceImages'

interface Props { img: RefImageData; hi?: boolean; width: number; height: number }

export function RefImage({ img, hi = false, width, height }: Props) {
  const src = hi ? img.src : img.sm
  const [loaded, setLoaded] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const probe = new Image()
    probe.onload = () => { if (alive) setLoaded(src) }
    probe.src = src
    return () => { alive = false }
  }, [src])

  return (
    <image
      href={loaded === src ? src : img.tiny}
      x="0" y="0" width={width} height={height}
      preserveAspectRatio="xMidYMid meet"
    />
  )
}
