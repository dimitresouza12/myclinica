'use client'
import { useEffect, useRef, useState } from 'react'
import { Portal } from '@/components/ui/Portal'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import btn from '@/components/ui/button.module.css'
import { confirmQuestion, sigiloNotice } from '@/lib/prontuario/printOptions'
import type { RecordEntry } from '@/types'
import type { TabPrintAction } from './PrintRegistry'
import styles from './printMenu.module.css'

export interface PrintGroup { key: string; title?: string; items: TabPrintAction[] }

interface Props {
  patientName: string
  /** Devolve os grupos no momento em que o menu abre (as ações das abas ficam num registro, não em estado). */
  getGroups: () => PrintGroup[]
  /** Evolução do paciente: só para o aviso de anotações sigilosas na confirmação. */
  entries: RecordEntry[]
}

const MENU_W = 320

/**
 * O único botão "Imprimir" do prontuário. Abre um menu com tudo que dá para imprimir (do paciente e da aba aberta);
 * escolher uma opção abre a confirmação com o nome do que será impresso e para quem, e só o "Imprimir" dela dispara.
 */
export function PrintMenu({ patientName, getGroups, entries }: Props) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<PrintGroup[]>([])
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [pending, setPending] = useState<TabPrintAction | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function place() {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!r) return
      const w = Math.min(MENU_W, window.innerWidth - 24)
      setPos({ top: r.bottom + 6, left: Math.min(Math.max(r.right - w, 12), window.innerWidth - w - 12) })
    }
    place()
    function outside(e: MouseEvent) {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false)
    }
    function key(e: KeyboardEvent) { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } }
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  function toggle() {
    if (!open) setGroups(getGroups())
    setOpen(o => !o)
  }

  function choose(a: TabPrintAction) {
    setOpen(false)
    setPending(a)
  }

  function confirmPrint() {
    const a = pending
    if (!a) return
    setPending(null)
    // direto no clique: a janela de impressão precisa abrir enquanto o gesto da pessoa ainda vale
    void a.run()
  }

  return (
    <>
      <button ref={triggerRef} type="button" className={btn.secondary} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <Icon name="download" size={15} /> Imprimir
        <Icon name="chevronDown" size={14} />
      </button>

      {open && (
        <Portal>
          <div ref={menuRef} role="menu" aria-label="O que imprimir" className={styles.menu} style={{ top: pos.top, left: pos.left }}>
            {groups.filter(g => g.items.length > 0).map(g => (
              <div key={g.key} className={styles.group} role="group" aria-label={g.title}>
                {g.title && <p className={styles.groupTitle}>{g.title}</p>}
                {g.items.map(it => (
                  <button key={it.id} type="button" role="menuitem" className={styles.item} disabled={!!it.disabledReason} onClick={() => choose(it)}>
                    {it.label}
                    {it.disabledReason && <span className={styles.itemHint}>{it.disabledReason}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Portal>
      )}

      {pending && (
        <Modal
          open
          onClose={() => setPending(null)}
          size="sm"
          title="Confirmar impressão"
          footer={
            <>
              <button type="button" className={btn.secondary} onClick={() => setPending(null)}>Cancelar</button>
              <button type="button" className={btn.primary} onClick={confirmPrint} autoFocus>Imprimir</button>
            </>
          }
        >
          <div className={styles.confirm}>
            <p className={styles.question}>{confirmQuestion(pending.label, patientName)}</p>
            {pending.includes.length > 0 && (
              <>
                <p className={styles.listTitle}>O que entra</p>
                <ul className={styles.list}>{pending.includes.map(t => <li key={t}>{t}</li>)}</ul>
              </>
            )}
            {pending.mentionsSigilo && (
              <p className={styles.notice} role="note"><Icon name="info" size={16} aria-hidden="true" />{sigiloNotice(entries)}</p>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
