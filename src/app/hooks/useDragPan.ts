import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export interface DragPan {
  isDragging: boolean
  onMouseDown: (e: React.MouseEvent) => void
}

/**
 * Click-and-drag panning by mutating scrollLeft/scrollTop on a scrollable
 * container. Composes naturally with CSS `zoom` since scrollable bounds
 * scale with content.
 */
export function useDragPan(containerRef: RefObject<HTMLElement | null>): DragPan {
  const [isDragging, setIsDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const c = containerRef.current
    if (!c) return
    drag.current = { x: e.clientX, y: e.clientY, sx: c.scrollLeft, sy: c.scrollTop }
    setIsDragging(true)
  }, [containerRef])

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const d = drag.current
      const c = containerRef.current
      if (!d || !c) return
      c.scrollLeft = d.sx - (e.clientX - d.x)
      c.scrollTop = d.sy - (e.clientY - d.y)
    }
    const onUp = () => {
      drag.current = null
      setIsDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, containerRef])

  return { isDragging, onMouseDown }
}
