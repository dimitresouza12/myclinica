'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/ui/Icon'
import { formatBrPhone } from '@/lib/phoneFormat'
import styles from './lotes.module.css'

export interface PacienteEscolhido { id: string; name: string }
interface Achado extends PacienteEscolhido { phone: string | null }

interface Props {
  clinicId: string
  value: PacienteEscolhido | null
  onChange: (p: PacienteEscolhido | null) => void
}

/** Busca de paciente por nome (até 8 resultados), para dizer quem recebeu o material. Opcional. */
export function PacienteBusca({ clinicId, value, onChange }: Props) {
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<Achado[] | null>(null)

  useEffect(() => {
    const t = termo.trim()
    if (t.length < 2) return
    let vivo = true
    const timer = setTimeout(async () => {
      // % e _ são curingas do ilike; a vírgula e os parênteses quebrariam o filtro: saem
      const seguro = t.replace(/[%_\\,()]/g, ' ')
      const { data } = await supabase.from('patients').select('id, name, phone').eq('clinic_id', clinicId).eq('is_active', true).ilike('name', `%${seguro}%`).order('name').limit(8)
      if (vivo) setAchados((data ?? []) as Achado[])
    }, 250)
    return () => { vivo = false; clearTimeout(timer) }
  }, [termo, clinicId])

  const mostrar = termo.trim().length >= 2 ? achados : null

  if (value) {
    return (
      <div className={styles.chosen}>
        <span>{value.name}</span>
        <button type="button" className={styles.chosenClear} aria-label="Remover paciente" onClick={() => { onChange(null); setTermo(''); setAchados(null) }}>
          <Icon name="close" size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className={styles.pick}>
      <input
        type="search"
        placeholder="Buscar paciente pelo nome"
        aria-label="Buscar paciente"
        autoComplete="off"
        value={termo}
        onChange={e => setTermo(e.target.value)}
      />
      {mostrar && (
        <div className={styles.pickList}>
          {mostrar.length === 0
            ? <p className={styles.pickNone}>Nenhum paciente encontrado.</p>
            : mostrar.map(p => (
              <button key={p.id} type="button" className={styles.pickItem} onClick={() => { onChange({ id: p.id, name: p.name }); setTermo(''); setAchados(null) }}>
                {p.name}
                {p.phone && <small>{formatBrPhone(p.phone)}</small>}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
