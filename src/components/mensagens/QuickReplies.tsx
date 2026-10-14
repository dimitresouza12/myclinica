'use client'
import { useEffect, useRef, useState } from 'react'
import { Portal } from '@/components/ui/Portal'
import { Icon } from '@/components/ui/Icon'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { deleteQuickReply, saveQuickReply, type QuickReplyRow } from '@/hooks/useWhatsAppInbox'
import { QUICK_BODY_MAX, QUICK_TITLE_MAX, validateQuickReply } from '@/lib/whatsapp/quick-replies'
import styles from './Inbox.module.css'

/** Lista de respostas rápidas acima da caixa de mensagem. Escolher uma coloca o texto no campo (a pessoa ainda revisa e envia). */
export function QuickReplyMenu({ items, canManage, onPick, onManage, onClose }: {
  items: QuickReplyRow[]
  canManage: boolean
  onPick: (r: QuickReplyRow) => void
  onManage: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={styles.quickMenu} role="listbox" aria-label="Respostas rápidas">
      {items.length === 0 && <p className={styles.quickEmpty}>Nenhuma resposta encontrada.</p>}
      {items.map(r => (
        <button key={r.id} type="button" role="option" aria-selected={false} className={styles.quickItem} onClick={() => onPick(r)}>
          <b>{r.title}</b>
          <span>{r.body}</span>
        </button>
      ))}
      {canManage && <button type="button" className={styles.quickManage} onClick={onManage}>Gerenciar respostas</button>}
    </div>
  )
}

/** Criar, editar e excluir as respostas rápidas da clínica. */
export function QuickReplyManager({ clinicId, items, onChanged, onClose }: {
  clinicId: string
  items: QuickReplyRow[]
  onChanged: () => void
  onClose: () => void
}) {
  const [editing, setEditing] = useState<QuickReplyRow | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function startEdit(r: QuickReplyRow | null) {
    setEditing(r); setTitle(r?.title ?? ''); setBody(r?.body ?? ''); setError('')
    requestAnimationFrame(() => titleRef.current?.focus())
  }

  async function save() {
    const invalid = validateQuickReply({ title, body })
    if (invalid) { setError(invalid); return }
    setSaving(true); setError('')
    const err = await saveQuickReply(clinicId, { id: editing?.id, title, body })
    setSaving(false)
    if (err) { setError(err); return }
    startEdit(null)
    onChanged()
  }

  async function remove(r: QuickReplyRow) {
    const ok = await confirmDialog({ title: 'Excluir resposta', message: `Excluir a resposta "${r.title}"?`, confirmText: 'Excluir', danger: true })
    if (!ok) return
    const err = await deleteQuickReply(clinicId, r.id)
    if (err) { setError(err); return }
    if (editing?.id === r.id) startEdit(null)
    onChanged()
  }

  return (
    <Portal>
      <div className={styles.lightbox} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={styles.quickDialog} role="dialog" aria-modal="true" aria-labelledby="quick-title">
          <div className={styles.quickHead}>
            <h2 id="quick-title">Respostas rápidas</h2>
            <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Fechar"><Icon name="close" size={20} /></button>
          </div>
          <p className={styles.quickHint}>Textos prontos para usar nas conversas. Digite / na caixa de mensagem para escolher. Use {'{nome}'} para o primeiro nome do contato.</p>

          <ul className={styles.quickList}>
            {items.length === 0 && <li className={styles.quickEmpty}>Você ainda não criou nenhuma resposta.</li>}
            {items.map(r => (
              <li key={r.id} className={styles.quickRow}>
                <span className={styles.quickRowText}><b>{r.title}</b><span>{r.body}</span></span>
                <button type="button" className={styles.mediaBtn} onClick={() => startEdit(r)}>Editar</button>
                <button type="button" className={styles.mediaBtn} onClick={() => void remove(r)}>Excluir</button>
              </li>
            ))}
          </ul>

          <div className={styles.quickForm}>
            <label>Nome
              <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Endereço" />
            </label>
            <label>Texto
              <textarea rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Ex.: Olá {nome}, nosso endereço é..." />
            </label>
            <span className={styles.quickCount}>{title.trim().length}/{QUICK_TITLE_MAX} no nome, {body.trim().length}/{QUICK_BODY_MAX} no texto</span>
            {error && <span className={styles.mediaError} role="alert">{error}</span>}
            <div className={styles.quickActions}>
              {editing && <button type="button" className={styles.mediaBtn} onClick={() => startEdit(null)}>Cancelar edição</button>}
              <button type="button" className={`${styles.mediaBtn} ${styles.quickSave}`} disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Adicionar resposta'}</button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
