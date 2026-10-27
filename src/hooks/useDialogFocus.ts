import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Foco de um painel ou diálogo que não usa <Modal> (ex.: gaveta lateral): leva o foco para dentro quando o painel aparece,
 * prende o Tab nele e devolve o foco a quem o abriu na saída.
 *
 * `panel` vem de um ref de callback guardado em estado (o conteúdo de um Portal só existe um render depois da montagem,
 * então um useRef comum ainda estaria nulo no primeiro efeito). `initial` é o campo que recebe o foco primeiro.
 */
export function useDialogFocus(panel: HTMLElement | null, initial?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!panel) return
    const opener = document.activeElement as HTMLElement | null
    if (!panel.contains(document.activeElement)) {
      const first = initial?.current ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel
      first.focus()
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !panel) return
      // uma confirmação aberta por cima é quem responde ao Tab
      if (document.querySelector('[role="alertdialog"]')) return
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel])
}
