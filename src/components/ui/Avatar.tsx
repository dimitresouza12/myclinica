'use client'
import { useState } from 'react'
import { initialsOf } from '@/lib/whatsapp/inbox'

interface Props {
  /** foto; sem ela (ou se falhar ao carregar) aparecem as iniciais */
  url?: string | null
  name: string
  size?: number
  className?: string
}

/**
 * Foto do contato com as iniciais como reserva. A foto do WhatsApp vem de uma URL que expira: quando
 * o navegador não consegue carregá-la, mostra as iniciais em vez de uma imagem quebrada.
 * `className` traz o visual do círculo de iniciais de cada tela (cor, fonte); o tamanho vem de `size`.
 */
export function Avatar({ url, name, size = 40, className }: Props) {
  // qual URL já falhou; trocar de URL (foto renovada) tenta de novo sem precisar de efeito
  const [failed, setFailed] = useState<string | null>(null)
  const show = !!url && failed !== url
  const box = { width: size, height: size, flexShrink: 0 } as const

  if (show) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto externa que expira: o otimizador do Next não ajuda
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(url)}
        style={{ ...box, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
      />
    )
  }
  return <div className={className} style={box} aria-hidden="true">{initialsOf(name)}</div>
}
