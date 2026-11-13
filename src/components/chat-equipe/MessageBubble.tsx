'use client'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { clockLabel } from '@/lib/whatsapp/inbox'
import {
  MAX_PATIENT_TOKENS, composeBody, countPatientTokens, mentionsMe, parseBody, splitPatientTokens, tokensReserve,
  type BodySegment, type MentionIndex,
} from '@/lib/teamChat/richText'
import type { TeamMessageView } from '@/lib/teamChat/types'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { AttachmentView } from './AttachmentView'
import styles from './ChatEquipe.module.css'

const MAX_BODY = 4000

export interface QuoteInfo {
  name: string
  /** vazio quando a mensagem citada ainda não foi carregada */
  text: string
  messageId: string
  missing: boolean
  /** a mensagem citada é minha: o rótulo é "Você" */
  own: boolean
}

/** Corpo da mensagem: texto puro, com menções e citações de paciente (só os tokens conhecidos) como elementos React. */
function BodyContent({ segments }: { segments: BodySegment[] }) {
  return (
    <>
      {segments.map((s, i) => {
        if (s.kind === 'text') return s.text
        if (s.kind === 'mention') return <span key={i} className={s.me ? styles.mentionMe : styles.mention}>{s.text}</span>
        return (
          <Link key={i} href={`/pacientes/${s.id}`} prefetch={false} className={styles.patientChip} aria-label={`Abrir a ficha de ${s.name}`}>
            <Icon name="patients" size={14} aria-hidden="true" />
            <span>{s.name}</span>
          </Link>
        )
      })}
    </>
  )
}

interface Props {
  m: TeamMessageView
  /** canal da mensagem: as ações recebem canal e id por parâmetro, para o pai passar a mesma função a todas as bolhas */
  channelId: string
  mine: boolean
  /** nome de quem escreveu, quando deve aparecer acima da bolha */
  authorLabel: string | null
  /** foto de quem escreveu (junto do nome, em grupos); sem foto, iniciais */
  authorAvatar?: string | null
  /** primeira bolha de uma sequência da mesma pessoa: abre um espaço maior */
  runStart: boolean
  quote: QuoteInfo | null
  /** nomes do diretório, para reconhecer "@Nome" no texto */
  mentionIndex: MentionIndex
  timezone: string
  canReply: boolean
  canModify: boolean
  flash: boolean
  onReply: (m: TeamMessageView) => void
  onEdit: (channelId: string, messageId: string, text: string) => Promise<string | null>
  onDelete: (channelId: string, messageId: string) => Promise<string | null>
  onRetry: (m: TeamMessageView) => void
  onDiscard: (channelId: string, messageId: string) => void
  onJump: (messageId: string) => void
}

/** Só renderiza de novo se algo que a bolha usa mudou (as funções do pai são estáveis; `quote` é um objeto novo a cada render do pai). */
function samePropsBubble(a: Props, b: Props): boolean {
  const keys = Object.keys(a) as (keyof Props)[]
  if (keys.length !== Object.keys(b).length) return false
  return keys.every(k => {
    if (k !== 'quote') return Object.is(a[k], b[k])
    const qa = a.quote, qb = b.quote
    if (!qa || !qb) return qa === qb
    return qa.name === qb.name && qa.text === qb.text && qa.messageId === qb.messageId && qa.missing === qb.missing && qa.own === qb.own
  })
}

function MessageBubbleBase(p: Props) {
  const { m } = p
  const [menu, setMenu] = useState(false)
  /** o menu abre para cima quando não cabe abaixo da bolha, dentro da lista de mensagens (última bolha) */
  const [menuUp, setMenuUp] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  /** citações de paciente da mensagem em edição: ficam à parte do texto, como no campo de escrever */
  const [editCited, setEditCited] = useState<{ id: string; name: string }[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const deleted = !!m.deleted_at
  const sending = m.sendState === 'sending'
  const failed = m.sendState === 'failed'
  const canReply = p.canReply && !deleted && !m.sendState
  const canModify = p.canModify && !deleted && !m.sendState
  // mensagem com foto/áudio: dá para responder e apagar (o banco expira o arquivo), mas não editar
  const canEdit = canModify && !m.has_attachment
  const hasMenu = canReply || canModify
  const segments = useMemo(() => parseBody(m.body, p.mentionIndex), [m.body, p.mentionIndex])
  // destaca a bolha de quem me mencionou (mensagem minha não conta)
  const mentioned = !p.mine && !deleted && mentionsMe(segments)

  // fecha o menu ao tocar fora ou com Esc
  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  function toggleMenu() {
    if (!menu) {
      const el = ref.current
      const wrap = el?.closest('[data-team-msgs]')
      if (el && wrap) {
        const b = el.getBoundingClientRect()
        const w = wrap.getBoundingClientRect()
        const need = ((canReply ? 1 : 0) + (canEdit ? 1 : 0) + (canModify ? 1 : 0)) * 44 + 8
        const below = w.bottom - (b.top + 34)
        const above = b.bottom - 34 - w.top
        setMenuUp(below < need && above > below)
      }
    }
    setMenu(o => !o)
  }

  function startEdit() {
    const { text, patients } = splitPatientTokens(m.body)
    setDraft(text)
    setEditCited(patients)
    setErr('')
    setEditing(true)
  }

  const editBody = composeBody(draft, editCited)

  async function saveEdit() {
    const t = editBody
    if (!t || busy) return
    const original = splitPatientTokens(m.body)
    if (t === composeBody(original.text, original.patients)) { setEditing(false); return }
    if (countPatientTokens(t) > MAX_PATIENT_TOKENS) { setErr(`Uma mensagem pode citar até ${MAX_PATIENT_TOKENS} pacientes.`); return }
    if (t.length > MAX_BODY) { setErr(`A mensagem pode ter até ${MAX_BODY.toLocaleString('pt-BR')} caracteres.`); return }
    setBusy(true); setErr('')
    const e = await p.onEdit(p.channelId, m.id, t)
    setBusy(false)
    if (e) setErr(e); else setEditing(false)
  }

  async function remove() {
    setMenu(false)
    const ok = await confirmDialog({
      title: 'Apagar mensagem',
      message: 'A mensagem some para toda a equipe. Isso não pode ser desfeito.',
      confirmText: 'Apagar',
      danger: true,
    })
    if (!ok) return
    const e = await p.onDelete(p.channelId, m.id)
    if (e) setErr(e)
  }

  return (
    <div
      ref={ref}
      id={`tm-${m.id}`}
      className={`${styles.b} ${p.mine ? styles.out : styles.in} ${p.runStart ? styles.runStart : ''} ${failed ? styles.outFailed : ''} ${p.flash ? styles.flash : ''} ${mentioned ? styles.mentioned : ''}`}
    >
      {p.authorLabel && <span className={styles.by}><UserAvatar name={p.authorLabel} avatar={p.authorAvatar} size={20} /><span className={styles.byName}>{p.authorLabel}</span></span>}
      {p.quote && !deleted && (p.quote.missing ? (
        // a mensagem citada está fora da janela carregada: não há para onde ir, então não é um botão
        <div className={`${styles.quote} ${styles.quoteStatic}`}>
          <span className={styles.quoteName}>Resposta a uma mensagem anterior</span>
          <span className={styles.quoteText}>Mensagem mais antiga, ainda não carregada</span>
        </div>
      ) : (
        <button type="button" className={styles.quote} onClick={() => p.onJump(p.quote!.messageId)} aria-label={p.quote.own ? 'Ir para a sua mensagem' : `Ir para a mensagem de ${p.quote.name}`}>
          <span className={styles.quoteName}>{p.quote.name}</span>
          <span className={styles.quoteText}>{p.quote.text}</span>
        </button>
      ))}
      {!deleted && !editing && <AttachmentView m={m} mine={p.mine} />}
      {deleted ? <span className={styles.deleted}>Mensagem apagada</span> : editing ? (
        <span className={styles.editBox}>
          <textarea
            rows={3}
            value={draft}
            maxLength={Math.max(0, MAX_BODY - tokensReserve(editCited))}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
              // Enter salva; Shift+Enter quebra a linha; Esc cancela
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit() }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(false); setErr('') }
            }}
            aria-label="Novo texto da mensagem"
            aria-keyshortcuts="Enter Escape"
            autoFocus
          />
          {editCited.length > 0 && (
            <ul className={styles.citedRow} aria-label="Pacientes citados">
              {editCited.map(c => (
                <li key={c.id} className={styles.citedChip}>
                  <Icon name="patients" size={14} aria-hidden="true" />
                  <span>{c.name}</span>
                  <button type="button" className={styles.citedRemove} onClick={() => setEditCited(cur => cur.filter(x => x.id !== c.id))} aria-label={`Remover ${c.name} da mensagem`}>
                    <Icon name="close" size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <span className={styles.editActions}>
            <button type="button" className={styles.smallBtn} onClick={() => { setEditing(false); setErr('') }} disabled={busy}>Cancelar</button>
            <button type="button" className={styles.smallBtn} onClick={() => void saveEdit()} disabled={busy || !editBody}>{busy ? 'Salvando…' : 'Salvar'}</button>
          </span>
        </span>
      ) : <BodyContent segments={segments} />}
      {err && <span className={styles.errText} role="alert">{err}</span>}
      {failed && (
        <>
          <span className={styles.errText} role="alert">{m.sendError ?? 'Não foi possível enviar.'}</span>
          <span className={styles.sendNote}>Se você recarregar a página, esta mensagem se perde.</span>
          <span className={styles.failActions}>
            <button type="button" className={styles.smallBtn} onClick={() => p.onDiscard(p.channelId, m.id)}>Descartar</button>
            <button type="button" className={styles.smallBtn} onClick={() => p.onRetry(m)}>Tentar de novo</button>
          </span>
        </>
      )}
      <span className={styles.time}>
        {sending ? <span className={styles.sendNote}>Enviando…</span> : failed ? <span className={styles.sendNote}>Não enviada</span> : (
          <>{m.edited_at && !deleted ? 'editada · ' : ''}{clockLabel(new Date(m.created_at), p.timezone)}</>
        )}
      </span>
      {hasMenu && !editing && (
        <>
          <button type="button" className={styles.menuBtn} aria-label="Mais opções da mensagem" aria-haspopup="menu" aria-expanded={menu} onClick={toggleMenu}>
            <Icon name="chevronDown" size={16} />
          </button>
          {menu && (
            <div className={`${styles.menu} ${menuUp ? styles.menuUp : ''}`} role="menu">
              {canReply && <button type="button" role="menuitem" onClick={() => { setMenu(false); p.onReply(m) }}>Responder</button>}
              {canEdit && <button type="button" role="menuitem" onClick={() => { setMenu(false); startEdit() }}>Editar</button>}
              {canModify && <button type="button" role="menuitem" className={styles.danger} onClick={() => void remove()}>Apagar</button>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export const MessageBubble = memo(MessageBubbleBase, samePropsBubble)
