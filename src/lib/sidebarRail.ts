/**
 * Estado da barra lateral no desktop: trilho estreito que se estende ao passar o mouse
 * (ou com foco de teclado) e encolhe de imediato ao clicar numa aba.
 *
 * Fica fora do componente para ser testado sem DOM: só recebe eventos e avisa quando `open` muda.
 */
export interface RailOptions {
  /** atraso para abrir, evita abrir ao passar o mouse de relance */
  openDelay?: number
  /** atraso para fechar, evita piscar quando o mouse escapa por um instante */
  closeDelay?: number
}

export interface RailController {
  /** mouse entrou na barra */
  pointerEnter(): void
  /** mouse saiu da barra: libera de novo a abertura por hover */
  pointerLeave(): void
  /** foco entrou na barra; só abre se veio do teclado */
  focusIn(fromKeyboard: boolean): void
  /** foco saiu; `leftBar` é falso quando só mudou de item dentro da barra */
  focusOut(leftBar: boolean): void
  /** clique numa aba (ou Esc): encolhe já e só reabre depois de o mouse sair e voltar */
  collapse(): void
  dispose(): void
}

export const RAIL_OPEN_DELAY = 100
export const RAIL_CLOSE_DELAY = 120

export function createRailController(
  onChange: (open: boolean) => void,
  { openDelay = RAIL_OPEN_DELAY, closeDelay = RAIL_CLOSE_DELAY }: RailOptions = {},
): RailController {
  let open = false
  let hovering = false
  let keyboardFocus = false
  // depois do clique o hover não reabre até o mouse sair e entrar de novo
  let suppressed = false
  let openTimer: ReturnType<typeof setTimeout> | null = null
  let closeTimer: ReturnType<typeof setTimeout> | null = null

  function set(next: boolean) {
    if (open === next) return
    open = next
    onChange(next)
  }
  function clearTimers() {
    if (openTimer) { clearTimeout(openTimer); openTimer = null }
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
  }
  function scheduleClose() {
    if (closeTimer || !open) return
    closeTimer = setTimeout(() => { closeTimer = null; if (!hovering && !keyboardFocus) set(false) }, closeDelay)
  }

  return {
    pointerEnter() {
      hovering = true
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
      if (suppressed || open || openTimer) return
      openTimer = setTimeout(() => { openTimer = null; if (hovering && !suppressed) set(true) }, openDelay)
    },
    pointerLeave() {
      hovering = false
      suppressed = false
      if (openTimer) { clearTimeout(openTimer); openTimer = null }
      if (!keyboardFocus) scheduleClose()
    },
    focusIn(fromKeyboard) {
      if (!fromKeyboard) return
      keyboardFocus = true
      suppressed = false
      clearTimers()
      set(true)
    },
    focusOut(leftBar) {
      if (!leftBar) return
      keyboardFocus = false
      if (!hovering) scheduleClose()
    },
    collapse() {
      clearTimers()
      keyboardFocus = false
      suppressed = true
      set(false)
    },
    dispose() { clearTimers() },
  }
}
