import { useCallback, useEffect, useRef, useState } from 'react'

export interface GutterRange {
  startLine: number
  endLine: number
}

export interface GutterSelection {
  active: GutterRange | null
  /** Inclusive lo/hi after normalising direction; null when nothing selected. */
  normalized: GutterRange | null
  isInRange: (line: number) => boolean
  start: (line: number, shiftKey: boolean) => void
  extend: (line: number) => void
  clear: () => void
}

interface Options {
  /**
   * Fires on mouseup at the end of a gutter selection gesture, with the
   * normalised range. The composer should open from this callback — opening
   * on mousedown breaks drag-select.
   */
  onCommit?: (range: GutterRange) => void
}

/**
 * GitHub-style line gutter selection. The selection gesture is mousedown on a
 * gutter → optional mouseenter on other gutters → mouseup anywhere. The
 * composer opens only on mouseup so a drag-select doesn't get clobbered by a
 * single-line composer popping up the moment you press down.
 */
export function useGutterSelection(opts: Options = {}): GutterSelection {
  const [active, setActive] = useState<GutterRange | null>(null)
  const draggingRef = useRef(false)
  const activeRef = useRef(active)
  const onCommitRef = useRef(opts.onCommit)

  activeRef.current = active
  onCommitRef.current = opts.onCommit

  const start = useCallback((line: number, shiftKey: boolean) => {
    setActive((prev) => (shiftKey && prev) ? { startLine: prev.startLine, endLine: line } : { startLine: line, endLine: line })
    draggingRef.current = true
  }, [])

  const extend = useCallback((line: number) => {
    if (!draggingRef.current) return
    setActive((prev) => prev ? { startLine: prev.startLine, endLine: line } : prev)
  }, [])

  const clear = useCallback(() => {
    setActive(null)
    draggingRef.current = false
  }, [])

  useEffect(() => {
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      const a = activeRef.current
      if (!a) return
      const range: GutterRange = {
        startLine: Math.min(a.startLine, a.endLine),
        endLine: Math.max(a.startLine, a.endLine),
      }
      onCommitRef.current?.(range)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [])

  const normalized = active
    ? { startLine: Math.min(active.startLine, active.endLine), endLine: Math.max(active.startLine, active.endLine) }
    : null

  return {
    active,
    normalized,
    isInRange: (line) => !!normalized && line >= normalized.startLine && line <= normalized.endLine,
    start,
    extend,
    clear,
  }
}
