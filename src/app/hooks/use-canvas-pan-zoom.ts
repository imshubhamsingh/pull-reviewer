import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useCanvasTransform, type CanvasController } from '@/app/hooks/use-canvas-transform'

/**
 * Shared pan/zoom plumbing for Figma-style canvases. Owns the container ref,
 * a left-mouse-drag pan, and a wheel handler that zooms on ctrl/meta and
 * pans otherwise. Returned `canvas` is the underlying transform controller.
 *
 * Used by `mockup-pane.tsx` and `state-diagram-pane.tsx`; the two panes had
 * ~80% identical drag/wheel/pan code before this hook landed.
 */
export interface CanvasPanZoom {
  containerRef: RefObject<HTMLDivElement | null>
  canvas: CanvasController
  dragging: boolean
  onMouseDown: (e: React.MouseEvent) => void
}

export function useCanvasPanZoom(): CanvasPanZoom {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvas = useCanvasTransform()
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        canvas.zoomBy(Math.exp(-e.deltaY * 0.002), cursorIn(el, e))
      } else {
        canvas.panBy(-e.deltaX, -e.deltaY)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canvas.panBy, canvas.zoomBy])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: canvas.transform.x,
        ty: canvas.transform.y,
      }
      setDragging(true)
    },
    [canvas.transform.x, canvas.transform.y],
  )

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent): void => {
      const d = dragRef.current
      if (!d) return
      canvas.update((prev) => ({
        ...prev,
        x: d.tx + (e.clientX - d.x),
        y: d.ty + (e.clientY - d.y),
      }))
    }
    const onUp = (): void => {
      dragRef.current = null
      setDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, canvas.update])

  return { containerRef, canvas, dragging, onMouseDown }
}

function cursorIn(
  el: HTMLElement,
  e: { clientX: number; clientY: number },
): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
