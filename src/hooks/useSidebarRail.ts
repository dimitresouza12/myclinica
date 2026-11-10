import { useEffect, useMemo, useRef, useState } from 'react'
import { createRailController, type RailController } from '@/lib/sidebarRail'

/**
 * Liga o controlador do trilho da barra lateral ao React.
 * `enabled` é falso fora do desktop com mouse: aí nada muda e os handlers viram no-op.
 */
export function useSidebarRail(enabled: boolean) {
  const [open, setOpen] = useState(false)
  const ctl = useRef<RailController | null>(null)

  useEffect(() => {
    const c = createRailController(setOpen)
    ctl.current = c
    return () => { c.dispose(); ctl.current = null }
  }, [])

  // ao sair do modo desktop (redimensionar), zera o estado
  useEffect(() => { if (!enabled) ctl.current?.collapse() }, [enabled])

  const handlers = useMemo(() => {
    if (!enabled) return {}
    return {
      onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType !== 'touch') ctl.current?.pointerEnter() },
      onPointerLeave: (e: React.PointerEvent) => { if (e.pointerType !== 'touch') ctl.current?.pointerLeave() },
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        // só foco de teclado abre: o clique do mouse também foca o link e não deve prender a barra
        let kb = false
        try { kb = e.target.matches(':focus-visible') } catch { kb = false }
        ctl.current?.focusIn(kb)
      },
      onBlur: (e: React.FocusEvent<HTMLElement>) => {
        ctl.current?.focusOut(!e.currentTarget.contains(e.relatedTarget as Node | null))
      },
      onClick: (e: React.MouseEvent<HTMLElement>) => {
        if ((e.target as Element).closest('a[href]')) ctl.current?.collapse()
      },
      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Escape') ctl.current?.collapse()
      },
    }
  }, [enabled])

  return { expanded: enabled && open, handlers }
}
