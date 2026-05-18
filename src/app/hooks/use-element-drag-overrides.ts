import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Per-element drag for canvases. Each element is identified by an id; while
 * dragging, the override map records `{dx, dy}` in canvas units so the
 * consumer can apply offsets on top of an auto-laid-out scene.
 *
 * `scale` is the live canvas zoom — mouse deltas are divided by it so a
 * drag of N screen pixels moves the element by N canvas pixels regardless
 * of zoom. Reset overrides by calling `reset()` (e.g. when the scene
 * identity changes).
 */
export interface ElementOverride {
  dx: number
  dy: number
}

export interface ElementDragOverrides {
  overrides: Map<string, ElementOverride>
  draggingId: string | null
  onMouseDown: (id: string, e: React.MouseEvent) => void
  reset: () => void
}

interface DragRef {
  startClientX: number
  startClientY: number
  baseDx: number
  baseDy: number
}

export function useElementDragOverrides(scale: number): ElementDragOverrides {
  const [overrides, setOverrides] = useState<Map<string, ElementOverride>>(new Map())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragRef = useRef<DragRef | null>(null)

  const onMouseDown = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const cur = overrides.get(id) ?? { dx: 0, dy: 0 }
      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        baseDx: cur.dx,
        baseDy: cur.dy,
      }
      setDraggingId(id)
    },
    [overrides],
  )

  useEffect(() => {
    if (!draggingId) return
    const onMove = (e: MouseEvent): void => {
      const d = dragRef.current
      if (!d) return
      const s = scale || 1
      const dx = d.baseDx + (e.clientX - d.startClientX) / s
      const dy = d.baseDy + (e.clientY - d.startClientY) / s
      setOverrides((prev) => {
        const next = new Map(prev)
        next.set(draggingId, { dx, dy })
        return next
      })
    }
    const onUp = (): void => {
      dragRef.current = null
      setDraggingId(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draggingId, scale])

  const reset = useCallback(() => setOverrides(new Map()), [])

  return { overrides, draggingId, onMouseDown, reset }
}
