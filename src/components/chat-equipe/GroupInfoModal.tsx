'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { SearchInput } from '@/components/ui/SearchInput'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { memberRoleLabel, normalizeSearch, type ChannelView } from '@/lib/teamChat/format'
import type { TeamChatActions } from '@/hooks/useTeamChat'
import type { TeamDirectoryEntry } from '@/lib/teamChat/types'
import { ChannelAvatar } from './ChannelAvatar'
import { PresenceDot } from './PresenceDot'
import styles from './ChatEquipe.module.css'

interface Props {
  view: ChannelView
  meId: string | null
  directory: TeamDirectoryEntry[]
  /** criador do grupo ou administrador da clínica: renomeia, adiciona e remove */
  canManage: boolean
  actions: TeamChatActions
  /** logins online agora (clinic_user_id) */
  online: ReadonlySet<string>
  onClose: () => void
  /** a pessoa saiu do grupo: a tela volta para a lista sem conversa selecionada */
  onLeft: () => void
}

type Screen = 'info' | 'add'

/** Informações do grupo: nome, participantes, adicionar, remover e sair. Montado só enquanto aberto. */
export function GroupInfoModal({ view, meId, directory, canManage, actions, online, onClose, onLeft }: Props) {
  const channelId = view.channel.id
  const [screen, setScreen] = useState<Screen>('info')
  const [name, setName] = useState(view.title)
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const cameFromAdd = useRef(false)

  const byId = useMemo(() => new Map(directory.map(d => [d.clinic_user_id, d])), [directory])
  const memberIds = useMemo(() => new Set(view.members.map(m => m.clinic_user_id)), [view.members])
  const people = useMemo(() => {
    const list = view.members.map(m => ({ id: m.clinic_user_id, entry: byId.get(m.clinic_user_id) ?? null }))
    return list.sort((a, b) => {
      if (a.id === meId) return -1
      if (b.id === meId) return 1
      return (a.entry?.display_name ?? '~').localeCompare(b.entry?.display_name ?? '~', 'pt-BR')
    })
  }, [view.members, byId, meId])

  const candidates = useMemo(() => directory.filter(d => !memberIds.has(d.clinic_user_id)), [directory, memberIds])
  const q = normalizeSearch(query)
  const shown = useMemo(() => (q ? candidates.filter(c => normalizeSearch(c.display_name).includes(q)) : candidates), [candidates, q])

  // ao voltar da escolha de participantes, o foco volta para o botão que a abriu (o conteúdo trocou)
  useEffect(() => {
    if (screen === 'info' && cameFromAdd.current) {
      cameFromAdd.current = false
      addBtnRef.current?.focus()
    }
  }, [screen])

  const disabled = busy !== null
  const trimmed = name.trim()
  const canRename = canManage && !!trimmed && trimmed !== (view.channel.name ?? '')

  function openAdd() {
    setError(''); setPicked([]); setQuery('')
    setScreen('add')
  }
  function backToInfo() {
    if (disabled) return
    setError('')
    cameFromAdd.current = true
    setScreen('info')
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault()
    if (!canRename || disabled) return
    setBusy('rename'); setError('')
    const err = await actions.renameGroup(channelId, trimmed)
    setBusy(null)
    if (err) { setError(err); return }
    showToast('ok', 'Nome do grupo atualizado.')
  }

  async function removeMember(id: string, label: string) {
    if (disabled) return
    const ok = await confirmDialog({
      title: 'Remover do grupo',
      message: `${label} deixa de ver este grupo e as mensagens dele. Você pode adicionar a pessoa de novo depois.`,
      confirmText: 'Remover',
      danger: true,
    })
    if (!ok) return
    setBusy(`rm:${id}`); setError('')
    const err = await actions.removeGroupMember(channelId, id)
    setBusy(null)
    if (err) { setError(err); return }
    showToast('ok', `${label} foi removido do grupo.`)
  }

  async function addPicked() {
    if (disabled || picked.length === 0) return
    setBusy('add'); setError('')
    const err = await actions.addGroupMembers(channelId, picked)
    setBusy(null)
    if (err) { setError(err); return }
    showToast('ok', picked.length === 1 ? 'Participante adicionado.' : 'Participantes adicionados.')
    cameFromAdd.current = true
    setScreen('info')
  }

  async function leave() {
    if (disabled) return
    const last = view.members.length <= 1
    const ok = await confirmDialog({
      title: 'Sair do grupo',
      message: last
        ? 'Você é a última pessoa do grupo. Ao sair, o grupo será arquivado.'
        : 'Você deixa de ver este grupo e as mensagens dele. Para voltar, alguém precisa adicionar você de novo.',
      confirmText: 'Sair do grupo',
      danger: true,
    })
    if (!ok) return
    setBusy('leave'); setError('')
    const err = await actions.leaveGroup(channelId)
    setBusy(null)
    if (err) { setError(err); return }
    onLeft()
  }

  const toggle = (id: string) => setPicked(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]))
  const isAdd = screen === 'add'

  return (
    <Modal
      open
      onClose={isAdd ? backToInfo : onClose}
      size="sm"
      title={isAdd ? 'Adicionar participantes' : 'Informações do grupo'}
      subtitle={isAdd ? 'Escolha quem entra no grupo.' : view.subtitle}
      footer={isAdd ? (
        <div className={styles.modalFoot}>
          <button type="button" className={btn.secondary} onClick={backToInfo} disabled={disabled}>Voltar</button>
          <button type="button" className={btn.primary} onClick={() => void addPicked()} disabled={disabled || picked.length === 0}>
            {busy === 'add' ? 'Adicionando…' : picked.length > 0 ? `Adicionar (${picked.length})` : 'Adicionar'}
          </button>
        </div>
      ) : (
        <div className={styles.modalFoot}>
          <button type="button" className={btn.secondary} onClick={onClose} disabled={disabled}>Fechar</button>
        </div>
      )}
    >
      <div className={`${styles.scope} ${styles.formStack}`}>
        {isAdd ? (
          <>
            <SearchInput placeholder="Buscar colega" value={query} onChange={setQuery} autoFocus />
            {candidates.length === 0 ? (
              <p className={styles.pickEmpty}>Todos os colegas ativos da clínica já estão neste grupo.</p>
            ) : shown.length === 0 ? (
              <p className={styles.pickEmpty}>Nenhum colega encontrado.</p>
            ) : (
              <ul className={styles.pickList} aria-label="Colegas que ainda não estão no grupo">
                {shown.map(c => {
                  const on = picked.includes(c.clinic_user_id)
                  return (
                    <li key={c.clinic_user_id} className={styles.pickItem}>
                      <button type="button" role="checkbox" aria-checked={on} className={`${styles.pickRow} ${on ? styles.pickRowOn : ''}`} onClick={() => toggle(c.clinic_user_id)} disabled={disabled}>
                        <ChannelAvatar kind="direct" name={c.display_name} />
                        <span className={styles.pickText}><span className={styles.pickNameRow}><b>{c.display_name}</b>{online.has(c.clinic_user_id) && <PresenceDot />}</span><span>{memberRoleLabel(c)}</span></span>
                        <span className={styles.pickBox} aria-hidden="true">{on && <Icon name="check" size={14} />}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className={styles.pickCount} aria-live="polite">
              {picked.length === 0 ? 'Nenhum participante escolhido.' : `${picked.length} ${picked.length === 1 ? 'participante escolhido' : 'participantes escolhidos'}.`}
            </p>
          </>
        ) : (
          <>
            {canManage ? (
              <form className={styles.groupRename} onSubmit={e => void rename(e)}>
                <div className={f.field}>
                  <label htmlFor="team-group-rename">Nome do grupo</label>
                  <input id="team-group-rename" value={name} maxLength={80} onChange={e => setName(e.target.value)} autoComplete="off" disabled={disabled} />
                </div>
                <button type="submit" className={btn.secondary} disabled={disabled || !canRename}>
                  {busy === 'rename' ? 'Salvando…' : 'Salvar nome'}
                </button>
              </form>
            ) : (
              <div className={styles.groupNameBox}>
                <span className={styles.groupNameLabel}>Nome do grupo</span>
                <p className={styles.groupName}>{view.title}</p>
              </div>
            )}

            <div className={styles.groupHead}>
              <h3 className={styles.groupHeading}>Participantes ({people.length})</h3>
              {canManage && (
                <button ref={addBtnRef} type="button" className={btn.secondary} onClick={openAdd} disabled={disabled}>
                  <Icon name="plus" size={16} />Adicionar participantes
                </button>
              )}
            </div>

            <ul className={styles.pickList} aria-label="Participantes do grupo">
              {people.map(({ id, entry }) => {
                const label = entry?.display_name ?? 'Colega desativado'
                const mine = id === meId
                const creator = id === view.channel.created_by
                return (
                  <li key={id} className={`${styles.pickItem} ${styles.groupMember}`}>
                    <ChannelAvatar kind="direct" name={label} />
                    <span className={styles.pickText}>
                      <span className={styles.pickNameRow}>
                        <b>{mine ? `${label} (você)` : label}</b>
                        {online.has(id) && <PresenceDot />}
                        {creator && <span className={styles.kindTag}>Criador</span>}
                      </span>
                      <span>{entry ? memberRoleLabel(entry) : 'Sem acesso ao chat'}</span>
                    </span>
                    {canManage && !mine && (
                      <button
                        type="button"
                        className={styles.groupRemove}
                        onClick={() => void removeMember(id, label)}
                        disabled={disabled}
                        aria-label={`Remover ${label} do grupo`}
                      >
                        {busy === `rm:${id}` ? 'Removendo…' : 'Remover'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>

            <button type="button" className={`${btn.secondary} ${styles.groupLeave}`} onClick={() => void leave()} disabled={disabled}>
              <Icon name="logout" size={16} />{busy === 'leave' ? 'Saindo…' : 'Sair do grupo'}
            </button>
          </>
        )}
        {error && <div className={f.error} role="alert">{error}</div>}
      </div>
    </Modal>
  )
}
