import { useCallback, useState } from 'react'

export interface Transform {
  x: number
  y: number
  scale: number
}

export interface Point {
  x: number
  y: number
}

export interface CanvasController {
  transform: Transform
  zoomBy: (factor: number, anchor: Point) => void
  zoomTo: (scale: number, anchor: Point) => void
  panBy: (dx: number, dy: number) => void
  setAll: (next: Transform) => void
  /** Functional update — receives previous transform, returns next. Stable identity. */
  update: (updater: (prev: Transform) => Transform) => void
  reset: () => void
}

const MIN = 0.1
const MAX = 12

const clamp = (s: number): number => Math.max(MIN, Math.min(MAX, s))

/**
 * Figma-style transform: { x, y, scale } on a single content layer. Pan and
 * zoom operate on this state directly; the consumer applies it via
 * `transform: translate(x, y) scale(s)`. Cursor-anchored zoom keeps the
 * point under the cursor stationary as scale changes.
 */
export function useCanvasTransform(initial: Transform = { x: 0, y: 0, scale: 1 }): CanvasController {
  const [transform, setTransform] = useState<Transform>(initial)

  const update = useCallback((updater: (prev: Transform) => Transform) => {
    setTransform(updater)
  }, [])

  const zoomTo = useCallback((scale: number, anchor: Point) => {
    update((prev) => {
      const next = clamp(scale)
      const ratio = next / prev.scale
      return {
        scale: next,
        x: anchor.x - (anchor.x - prev.x) * ratio,
        y: anchor.y - (anchor.y - prev.y) * ratio,
      }
    })
  }, [update])

  const zoomBy = useCallback((factor: number, anchor: Point) => {
    update((prev) => {
      const next = clamp(prev.scale * factor)
      const ratio = next / prev.scale
      return {
        scale: next,
        x: anchor.x - (anchor.x - prev.x) * ratio,
        y: anchor.y - (anchor.y - prev.y) * ratio,
      }
    })
  }, [update])

  const panBy = useCallback((dx: number, dy: number) => {
    update((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
  }, [update])

  const setAll = useCallback((next: Transform) => {
    setTransform({ ...next, scale: clamp(next.scale) })
  }, [])

  const reset = useCallback(() => setTransform(initial), [initial])

  return { transform, zoomBy, zoomTo, panBy, setAll, update, reset }
}
