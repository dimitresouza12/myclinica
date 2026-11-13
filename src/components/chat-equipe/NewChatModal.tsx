'use client'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { memberRoleLabel, normalizeSearch } from '@/lib/teamChat/format'
import type { TeamChatActions } from '@/hooks/useTeamChat'
import type { TeamDirectoryEntry } from '@/lib/teamChat/types'
import { ChannelAvatar } from './ChannelAvatar'
import { PresenceDot } from './PresenceDot'
import styles from './ChatEquipe.module.css'

interface Props {
  mode: 'direct' | 'group'
  /** colegas que podem ser escolhidos (sem o próprio login) */
  colleagues: TeamDirectoryEntry[]
  actions: TeamChatActions
  /** logins online agora (clinic_user_id) */
  online: ReadonlySet<string>
  onClose: () => void
  /** conversa criada ou aberta: a tela seleciona o canal */
  onOpened: (channelId: string) => void
}

/** Nova conversa (escolher um colega) e novo grupo (nome + colegas). Montado só enquanto aberto, então o estado recomeça a cada vez. */
export function NewChatModal({ mode, colleagues, actions, online, onClose, onOpened }: Props) {
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const q = normalizeSearch(query)
  const list = useMemo(
    () => (q ? colleagues.filter(c => normalizeSearch(c.display_name).includes(q)) : colleagues),
    [colleagues, q],
  )

  async function openDirect(id: string) {
    if (busy) return
    setBusy(true); setError('')
    const r = await actions.openDirect(id)
    setBusy(false)
    if ('error' in r) { setError(r.error); return }
    onOpened(r.id)
  }

  async function createGroup() {
    const trimmed = name.trim()
    if (busy || !trimmed || picked.length === 0) return
    setBusy(true); setError('')
    const r = await actions.createGroup(trimmed, picked)
    setBusy(false)
    if ('error' in r) { setError(r.error); return }
    onOpened(r.id)
  }

  const toggle = (id: string) => setPicked(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]))
  const isGroup = mode === 'group'

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={isGroup ? 'Novo grupo' : 'Nova conversa'}
      subtitle={isGroup ? 'Dê um nome e escolha quem participa.' : 'Escolha com quem você quer conversar.'}
      footer={isGroup ? (
        <div className={styles.modalFoot}>
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={btn.primary} onClick={() => void createGroup()} disabled={busy || !name.trim() || picked.length === 0}>
            {busy ? 'Criando…' : 'Criar grupo'}
          </button>
        </div>
      ) : undefined}
    >
      <div className={`${styles.scope} ${styles.formStack}`}>
        {isGroup && (
          <div className={f.field}>
            <label htmlFor="team-group-name">Nome do grupo</label>
            <input id="team-group-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Ex.: Plantão de sábado" autoComplete="off" autoFocus />
          </div>
        )}

        <SearchInput placeholder="Buscar colega" value={query} onChange={setQuery} />

        {colleagues.length === 0 ? (
          <p className={styles.pickEmpty}>Não há outros colegas ativos na clínica.</p>
        ) : list.length === 0 ? (
          <p className={styles.pickEmpty}>Nenhum colega encontrado.</p>
        ) : (
          <ul className={styles.pickList} aria-label="Colegas">
            {list.map(c => {
              const on = picked.includes(c.clinic_user_id)
              return (
                <li key={c.clinic_user_id} className={styles.pickItem}>
                  {isGroup ? (
                    <button type="button" role="checkbox" aria-checked={on} className={`${styles.pickRow} ${on ? styles.pickRowOn : ''}`} onClick={() => toggle(c.clinic_user_id)}>
                      <ChannelAvatar kind="direct" name={c.display_name} />
                      <span className={styles.pickText}><span className={styles.pickNameRow}><b>{c.display_name}</b>{online.has(c.clinic_user_id) && <PresenceDot />}</span><span>{memberRoleLabel(c)}</span></span>
                      <span className={styles.pickBox} aria-hidden="true">{on && <Icon name="check" size={14} />}</span>
                    </button>
                  ) : (
                    <button type="button" className={styles.pickRow} onClick={() => void openDirect(c.clinic_user_id)} disabled={busy}>
                      <ChannelAvatar kind="direct" name={c.display_name} />
                      <span className={styles.pickText}><span className={styles.pickNameRow}><b>{c.display_name}</b>{online.has(c.clinic_user_id) && <PresenceDot />}</span><span>{memberRoleLabel(c)}</span></span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {isGroup && (
          <p className={styles.pickCount} aria-live="polite">
            {picked.length === 0 ? 'Nenhum participante escolhido.' : `${picked.length} ${picked.length === 1 ? 'participante escolhido' : 'participantes escolhidos'}, além de você.`}
          </p>
        )}
        {error && <div className={f.error} role="alert">{error}</div>}
      </div>
    </Modal>
  )
}
