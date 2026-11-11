import { useEffect, useState } from 'react'
import { carregarTaco, tacoCarregada, type Alimento } from '@/lib/nutri/alimentos'

/**
 * Catálogo da TACO carregado sob demanda (chunk separado). `taco` é `null` enquanto carrega; se o chunk não vier
 * (rede), `erro` fica true e `tentarDeNovo` repete o pedido. Depois da primeira carga, volta pronto na hora.
 */
export function useTaco() {
  const [taco, setTaco] = useState<Alimento[] | null>(() => tacoCarregada())
  const [erro, setErro] = useState(false)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (taco) return
    let vivo = true
    carregarTaco().then(t => { if (vivo) setTaco(t) }).catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [taco, tentativa])

  return { taco, erro, tentarDeNovo: () => { setErro(false); setTentativa(n => n + 1) } }
}
