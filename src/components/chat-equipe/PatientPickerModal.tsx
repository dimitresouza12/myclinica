'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { SearchInput } from '@/components/ui/SearchInput'
import { TEAM_SEARCH_MIN, useTeamPatientSearch } from '@/hooks/useTeamChat'
import { formatBrPhone } from '@/lib/phoneFormat'
import { ChannelAvatar } from './ChannelAvatar'
import styles from './ChatEquipe.module.css'

interface Props {
  clinicId: string
  /** canal de área ou grupo: avisa que colegas podem não ter acesso ao paciente */
  sharedChannel?: boolean
  /** pacientes que já estão na mensagem (não aparecem de novo) */
  excludeIds: string[]
  onPick: (patient: { id: string; name: string }) => void
  onClose: () => void
}

/** Escolher um paciente da clínica para citar na mensagem. Só nome e telefone aparecem aqui; na mensagem vão apenas nome e link. */
export function PatientPickerModal({ clinicId, sharedChannel = false, excludeIds, onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  const search = useTeamPatientSearch(clinicId, query)
  const rows = (search.data ?? []).filter(r => !excludeIds.includes(r.id))

  return (
    <Modal open onClose={onClose} size="sm" title="Citar paciente" subtitle="A mensagem leva só o nome e um link para a ficha.">
      <div className={`${styles.scope} ${styles.formStack}`}>
        {sharedChannel && (
          <p className={styles.pickNote}>Este canal tem colegas que podem não ter acesso a este paciente. Cite só o necessário.</p>
        )}
        <SearchInput placeholder="Buscar paciente pelo nome" value={query} onChange={setQuery} autoFocus />

        {!search.active ? (
          <p className={styles.pickEmpty}>Digite pelo menos {TEAM_SEARCH_MIN} letras do nome.</p>
        ) : search.isError ? (
          <ErrorNotice message="Não foi possível buscar os pacientes." onRetry={() => { void search.refetch() }} />
        ) : search.isLoading || search.waiting || !search.data ? (
          <div className={styles.msgsLoading} aria-busy="true"><Spinner label="Buscando pacientes" /></div>
        ) : rows.length === 0 ? (
          <p className={styles.pickEmpty}>Nenhum paciente encontrado.</p>
        ) : (
          <ul className={styles.pickList} aria-label="Pacientes">
            {rows.map(r => (
              <li key={r.id} className={styles.pickItem}>
                <button type="button" className={styles.pickRow} onClick={() => onPick({ id: r.id, name: r.name })}>
                  <ChannelAvatar kind="direct" name={r.name} />
                  <span className={styles.pickText}>
                    <b>{r.name}</b>
                    {(r.pet_name || r.phone) && <span>{[r.pet_name, r.phone ? formatBrPhone(r.phone) : null].filter(Boolean).join(' · ')}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
