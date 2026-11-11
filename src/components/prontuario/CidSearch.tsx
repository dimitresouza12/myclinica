'use client'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { cidText, getComunsIndex, loadCidCompleto, searchCidIndex, type CidIndex } from '@/lib/medico/cid10'
import styles from './CidSearch.module.css'

interface Props {
  /** texto "E11.9 - Diabetes mellitus tipo 2 sem complicações" do diagnóstico escolhido */
  onPick: (text: string) => void
}

const LIMITE = 50

/**
 * Busca local na CID-10 completa (DATASUS, ~12 mil códigos), baixada só quando o campo é aberto. Enquanto baixa
 * (ou se falhar), busca na lista curta dos mais comuns. O campo de texto da hipótese continua livre.
 */
export function CidSearch({ onPick }: Props) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState<CidIndex | null>(null)
  const [wanted, setWanted] = useState(false)

  useEffect(() => {
    if (!wanted || full) return
    let alive = true
    loadCidCompleto().then(idx => { if (alive) setFull(idx) }).catch(() => { if (alive) setWanted(false) })
    return () => { alive = false }
  }, [wanted, full])

  const hits = useMemo(() => searchCidIndex(q, full ?? getComunsIndex(), LIMITE), [q, full])

  return (
    <div className={styles.wrap}>
      <div className={styles.inputWrap}>
        <Icon name="search" size={14} />
        <input
          type="text"
          value={q}
          placeholder="Buscar CID-10 por código ou nome (ex: I10, diabetes)"
          aria-label="Buscar CID-10"
          autoComplete="off"
          onChange={e => { setQ(e.target.value); setOpen(true); setWanted(true) }}
          onFocus={() => { setOpen(true); setWanted(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && q.trim().length >= 2 && (
        <div className={styles.drop} role="listbox" aria-label="Resultados da busca de CID-10">
          {hits.length === 0 ? (
            <div className={styles.empty}>{wanted && !full ? 'Carregando a tabela completa da CID-10...' : 'Nenhum código encontrado. Digite o diagnóstico direto no campo.'}</div>
          ) : hits.map(e => (
            <button
              key={e[0]}
              type="button"
              role="option"
              aria-selected={false}
              className={styles.item}
              onMouseDown={ev => ev.preventDefault()}
              onClick={() => { onPick(cidText(e)); setQ(''); setOpen(false) }}
            >
              <b>{e[0]}</b>
              <span>{e[1]}</span>
            </button>
          ))}
          {hits.length >= LIMITE && <div className={styles.empty}>Mostrando os {LIMITE} primeiros. Digite mais para refinar.</div>}
        </div>
      )}
    </div>
  )
}
