import { useLayoutEffect, type RefObject } from 'react'

interface NaturalSize {
  width: number
  height: number
}

interface Options {
  containerRef: RefObject<HTMLElement | null>
  contentRef: RefObject<HTMLElement | null>
  apply: (scale: number) => void
  /** Auto-fit fires exactly once each time this changes — typically the rendered SVG string. */
  trigger: unknown
  padding?: number
}

/**
 * Measures the first SVG inside `contentRef` and applies a one-shot scale that
 * fits it inside `containerRef`. Fires only when `trigger` changes (i.e. when a
 * new diagram is rendered) so user zoom/pan is never silently overwritten by a
 * background resize.
 */
export function useAutoFit({ containerRef, contentRef, apply, trigger, padding = 24 }: Options): void {
  useLayoutEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return
    const size = measureSvg(content)
    if (!size) return
    const availW = Math.max(1, container.clientWidth - padding)
    const availH = Math.max(1, container.clientHeight - padding)
    apply(Math.min(availW / size.width, availH / size.height))
  }, [trigger, containerRef, contentRef, apply, padding])
}

function measureSvg(host: HTMLElement): NaturalSize | undefined {
  const svg = host.querySelector('svg')
  if (!svg) return undefined
  const vb = svg.viewBox.baseVal
  if (vb && vb.width > 0 && vb.height > 0) return { width: vb.width, height: vb.height }
  const rect = svg.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) return { width: rect.width, height: rect.height }
  return undefined
}
