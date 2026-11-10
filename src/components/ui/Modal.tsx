'use client'
import { useCallback, useEffect, useId, useRef } from 'react'
import { Portal } from './Portal'
import { Icon } from './Icon'
import { useScrollLock } from '@/hooks/useScrollLock'
import styles from './modal.module.css'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** Linha de contexto sob o título (ex.: "Botox · R$ 890,00") */
  subtitle?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'wide' | 'full'
  /** Botões de ação, alinhados à direita; fica fixo no pé enquanto o corpo rola */
  footer?: React.ReactNode
  /** false: sem botão de fechar e sem Esc nem clique no fundo (modal bloqueante, ex.: teste encerrado) */
  dismissible?: boolean
  /** À esquerda do título (ex.: avatar) */
  leading?: React.ReactNode
  /** À direita do título, antes do botão de fechar (ex.: Imprimir) */
  actions?: React.ReactNode
  /** Faixa entre o cabeçalho e o corpo (ex.: abas); fica fixa enquanto o corpo rola */
  toolbar?: React.ReactNode
  /** Só a casca (véu, foco, Esc, trava de rolagem): o conteúdo traz o próprio cabeçalho e rodapé. O título vira rótulo para leitor de tela. */
  bare?: boolean
  children: React.ReactNode
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, subtitle, size = 'md', footer, dismissible = true, leading, actions, toolbar, bare = false, children }: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  useScrollLock(open)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { dismissibleRef.current = dismissible }, [dismissible])

  // O Portal monta os filhos um render depois: o foco inicial entra pelo ref de callback
  const setPanel = useCallback((el: HTMLDivElement | null) => {
    panelRef.current = el
    // Sem autoFocus no conteúdo, o foco entra no painel para o Esc e o Tab funcionarem
    if (el && !el.contains(document.activeElement)) el.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null

    function onKey(e: KeyboardEvent) {
      // uma confirmação aberta por cima é quem responde ao Esc e ao Tab
      if (document.querySelector('[role="alertdialog"]')) return
      // com um modal aberto sobre outro (ex.: detalhe do dente sobre o prontuário), só o de cima responde
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs.length > 1 && dialogs[dialogs.length - 1] !== panelRef.current) return
      if (e.key === 'Escape') {
        if (dismissibleRef.current) { e.stopPropagation(); onCloseRef.current() }
        return
      }
      const panel = panelRef.current
      if (e.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null)
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <Portal>
      <div className={styles.overlay} onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose() }}>
        <div
          ref={setPanel}
          className={`${styles.panel} ${styles[size]}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          {bare ? <h2 id={titleId} className={styles.srOnly}>{title}</h2> : (
            <header className={`${styles.head} ${leading ? styles.headCentered : ''}`}>
              {leading && <div className={styles.leading}>{leading}</div>}
              <div className={styles.headText}>
                <h2 id={titleId} className={styles.title}>{title}</h2>
                {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
              </div>
              {actions && <div className={styles.actions}>{actions}</div>}
              {dismissible && (
                <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
                  <Icon name="close" size={18} />
                </button>
              )}
            </header>
          )}
          {toolbar && <div className={styles.toolbar}>{toolbar}</div>}
          <div className={bare ? `${styles.body} ${styles.bodyBare}` : styles.body}>{children}</div>
          {footer && <footer className={styles.foot}>{footer}</footer>}
        </div>
      </div>
    </Portal>
  )
}
