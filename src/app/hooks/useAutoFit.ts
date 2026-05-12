import { useCallback, useEffect, type RefObject } from 'react'

interface NaturalSize {
  width: number
  height: number
}

interface Options {
  containerRef: RefObject<HTMLElement | null>
  contentRef: RefObject<HTMLElement | null>
  apply: (scale: number) => void
  /** Re-fit whenever this changes. Pass the render state / SVG string. */
  trigger: unknown
  /** Padding subtracted from the available area so the content has breathing room. */
  padding?: number
}

/**
 * Measures the first SVG inside `contentRef` and applies a scale that makes
 * it fit inside `containerRef`. Re-runs on container resize.
 */
export function useAutoFit({ containerRef, contentRef, apply, trigger, padding = 24 }: Options): void {
  const fit = useCallback(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return
    const size = measureSvg(content)
    if (!size) return
    const availW = Math.max(1, container.clientWidth - padding)
    const availH = Math.max(1, container.clientHeight - padding)
    apply(Math.min(availW / size.width, availH / size.height))
  }, [containerRef, contentRef, apply, padding])

  // `trigger` is in the dep array so the effect re-runs when the SVG changes
  // (step swap). containerRef/contentRef are stable refs — only `fit` matters.
  useEffect(() => {
    fit()
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(fit)
    ro.observe(container)
    return () => ro.disconnect()
  }, [fit, trigger, containerRef])
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
