import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRailController, RAIL_OPEN_DELAY, RAIL_CLOSE_DELAY } from './sidebarRail'

describe('sidebarRail', () => {
  let open: boolean
  let ctl: ReturnType<typeof createRailController>
  beforeEach(() => {
    vi.useFakeTimers()
    open = false
    ctl = createRailController(v => { open = v })
  })
  afterEach(() => { ctl.dispose(); vi.useRealTimers() })

  it('abre só depois do atraso de entrada', () => {
    ctl.pointerEnter()
    vi.advanceTimersByTime(RAIL_OPEN_DELAY - 1)
    expect(open).toBe(false)
    vi.advanceTimersByTime(1)
    expect(open).toBe(true)
  })

  it('não abre se o mouse só passou de relance', () => {
    ctl.pointerEnter()
    vi.advanceTimersByTime(RAIL_OPEN_DELAY - 20)
    ctl.pointerLeave()
    vi.advanceTimersByTime(500)
    expect(open).toBe(false)
  })

  it('fecha com atraso curto ao sair e cancela se voltar a tempo', () => {
    ctl.pointerEnter(); vi.advanceTimersByTime(RAIL_OPEN_DELAY)
    ctl.pointerLeave()
    vi.advanceTimersByTime(RAIL_CLOSE_DELAY - 10)
    ctl.pointerEnter()
    vi.advanceTimersByTime(500)
    expect(open).toBe(true)
    ctl.pointerLeave()
    vi.advanceTimersByTime(RAIL_CLOSE_DELAY)
    expect(open).toBe(false)
  })

  it('clique encolhe na hora e só reabre depois de sair e entrar de novo', () => {
    ctl.pointerEnter(); vi.advanceTimersByTime(RAIL_OPEN_DELAY)
    ctl.collapse()
    expect(open).toBe(false)
    // continua com o mouse em cima: não reabre
    ctl.pointerEnter()
    vi.advanceTimersByTime(1000)
    expect(open).toBe(false)
    ctl.pointerLeave(); vi.advanceTimersByTime(RAIL_CLOSE_DELAY)
    ctl.pointerEnter(); vi.advanceTimersByTime(RAIL_OPEN_DELAY)
    expect(open).toBe(true)
  })

  it('foco de teclado abre de imediato e segura aberta mesmo sem mouse', () => {
    ctl.focusIn(true)
    expect(open).toBe(true)
    ctl.pointerEnter(); ctl.pointerLeave()
    vi.advanceTimersByTime(1000)
    expect(open).toBe(true)
    ctl.focusOut(false)
    vi.advanceTimersByTime(1000)
    expect(open).toBe(true)
    ctl.focusOut(true)
    vi.advanceTimersByTime(RAIL_CLOSE_DELAY)
    expect(open).toBe(false)
  })

  it('foco vindo do mouse não abre nem prende a barra', () => {
    ctl.focusIn(false)
    expect(open).toBe(false)
  })

  it('depois do clique, um novo foco de teclado reabre', () => {
    ctl.focusIn(true)
    ctl.collapse()
    expect(open).toBe(false)
    ctl.focusIn(true)
    expect(open).toBe(true)
  })

  it('perder o foco com o mouse ainda em cima mantém aberta', () => {
    ctl.pointerEnter(); vi.advanceTimersByTime(RAIL_OPEN_DELAY)
    ctl.focusIn(true)
    ctl.focusOut(true)
    vi.advanceTimersByTime(1000)
    expect(open).toBe(true)
  })
})
