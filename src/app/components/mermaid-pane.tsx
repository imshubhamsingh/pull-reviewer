import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'
import mermaid from 'mermaid'
import { marked } from 'marked'
import { cn } from '@/app/lib/utils'
import { useCanvasTransform, type CanvasController } from '@/app/hooks/use-canvas-transform'
import { sanitizeMermaid } from '@/app/components/mermaid-sanitize'
import type { TourStep } from '@/lib/api'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
  fontFamily: 'inherit',
})

interface Props {
  step: TourStep
}

type RenderState =
  | { kind: 'idle' }
  | { kind: 'ok'; svg: string }
  | { kind: 'error'; message: string }

interface NaturalSize {
  width: number
  height: number
}

const FIT_PADDING = 48
const ZOOM_STEP = 1.25

export function MermaidPane({ step }: Props): JSX.Element {
  const [state, setState] = useState<RenderState>({ kind: 'idle' })
  const [natural, setNatural] = useState<NaturalSize | undefined>()
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const canvas = useCanvasTransform()
  const [dragging, setDragging] = useState(false)
  const fittedForRef = useRef<string | null>(null)
  const id = `mermaid-${step.id}`
  const source = step.diagram && 'mermaid' in step.diagram ? step.diagram.mermaid : undefined

  useEffect(() => {
    let cancelled = false
    setNatural(undefined)
    fittedForRef.current = null
    if (!source) {
      setState({ kind: 'error', message: 'No mermaid source on this step.' })
      return
    }
    mermaid
      .render(id, sanitizeMermaid(source))
      .then(({ svg }) => {
        if (!cancelled) setState({ kind: 'ok', svg })
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: 'error', message: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [id, source])

  // Measure natural SVG size once it's in the DOM.
  useLayoutEffect(() => {
    if (state.kind !== 'ok') return
    const svg = contentRef.current?.querySelector('svg')
    if (!svg) return
    const vb = svg.viewBox.baseVal
    const rect = svg.getBoundingClientRect()
    const width = vb && vb.width > 0 ? vb.width : rect.width
    const height = vb && vb.height > 0 ? vb.height : rect.height
    if (width > 0 && height > 0) setNatural({ width, height })
  }, [state])

  const fit = useCallback(() => {
    fitDiagram(containerRef.current, natural, canvas.setAll)
  }, [natural, canvas.setAll])

  // First-fit when both natural and container are settled. Subsequent container
  // resizes don't re-fit (we don't want to clobber user zoom/pan on layout shifts).
  useEffect(() => {
    if (!natural || !containerRef.current) return
    if (fittedForRef.current === keyFor(state)) return
    // Defer one frame so the container has its final size after the SVG mounts.
    const raf = requestAnimationFrame(() => {
      fit()
      fittedForRef.current = keyFor(state)
    })
    return () => cancelAnimationFrame(raf)
  }, [natural, state, fit])

  // Wheel: cmd/ctrl = zoom at cursor; otherwise pan (trackpad swipe).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.002)
        canvas.zoomBy(factor, cursorIn(el, e))
      } else {
        canvas.panBy(-e.deltaX, -e.deltaY)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [canvas.panBy, canvas.zoomBy])

  // Drag-to-pan: mousedown on canvas → mousemove on window → mouseup ends.
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
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
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      canvas.update((prev) => ({
        ...prev,
        x: d.tx + (e.clientX - d.x),
        y: d.ty + (e.clientY - d.y),
      }))
    }
    const onUp = () => {
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

  const captionHtml = useMemo(() => marked.parse(step.body, { async: false }), [step.body])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex-1">
        <div
          ref={containerRef}
          onMouseDown={onMouseDown}
          className={cn(
            'absolute inset-0 overflow-hidden select-none',
            dragging ? 'cursor-grabbing' : state.kind === 'ok' ? 'cursor-grab' : 'cursor-default',
          )}
        >
          {renderBody(state, source, canvas, natural, contentRef)}
        </div>
        {state.kind === 'ok' && (
          <ZoomControls canvas={canvas} onFit={fit} containerRef={containerRef} />
        )}
      </div>
      <figcaption
        className="markdown border-border text-text-secondary border-t px-4 py-3 text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: captionHtml }}
      />
    </div>
  )
}

function keyFor(state: RenderState): string | null {
  return state.kind === 'ok' ? state.svg : null
}

function renderBody(
  state: RenderState,
  source: string | undefined,
  canvas: CanvasController,
  natural: NaturalSize | undefined,
  contentRef: React.RefObject<HTMLDivElement | null>,
): JSX.Element {
  if (state.kind === 'idle')
    return (
      <p className="text-text-muted absolute inset-0 grid place-content-center text-xs">
        Rendering…
      </p>
    )
  if (state.kind === 'error') {
    return (
      <pre className="text-text-danger bg-surface m-4 w-fit max-w-full overflow-auto rounded-md p-3 text-xs">
        Bad mermaid: {state.message}
        {source && `\n\n${source}`}
      </pre>
    )
  }
  const { x, y, scale } = canvas.transform
  // Wrapper size = natural * scale → SVG re-renders at this size as vector.
  // Only translate via CSS transform so we never rasterize.
  const width = natural ? natural.width * scale : undefined
  const height = natural ? natural.height * scale : undefined
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        transform: `translate3d(${x}px, ${y}px, 0)`,
        // While we're still measuring natural size, render off-screen.
        visibility: natural ? 'visible' : 'hidden',
      }}
    >
      <div
        ref={contentRef}
        className="diagram-svg"
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    </div>
  )
}

function fitDiagram(
  container: HTMLDivElement | null,
  natural: NaturalSize | undefined,
  setAll: CanvasController['setAll'],
): void {
  if (!container || !natural) return
  const cw = container.clientWidth
  const ch = container.clientHeight
  if (cw <= 0 || ch <= 0) return
  const scale = Math.min((cw - FIT_PADDING) / natural.width, (ch - FIT_PADDING) / natural.height)
  setAll({
    scale,
    x: (cw - natural.width * scale) / 2,
    y: (ch - natural.height * scale) / 2,
  })
}

interface ZoomControlsProps {
  canvas: CanvasController
  onFit: () => void
  containerRef: React.RefObject<HTMLDivElement | null>
}

function ZoomControls({ canvas, onFit, containerRef }: ZoomControlsProps): JSX.Element {
  const anchorCenter = (): { x: number; y: number } => {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    return { x: el.clientWidth / 2, y: el.clientHeight / 2 }
  }
  return (
    <div className="border-border bg-surface/95 absolute right-4 top-4 z-10 flex items-center gap-1 rounded-md border p-1 shadow-lg backdrop-blur-sm">
      <ZoomBtn
        onClick={() => canvas.zoomBy(1 / ZOOM_STEP, anchorCenter())}
        label="−"
        title="Zoom out"
      />
      <button
        type="button"
        onClick={onFit}
        title="Fit to pane"
        className="text-text-secondary hover:text-text-primary w-14 text-center text-xs tabular-nums transition-colors"
      >
        {Math.round(canvas.transform.scale * 100)}%
      </button>
      <ZoomBtn onClick={() => canvas.zoomBy(ZOOM_STEP, anchorCenter())} label="+" title="Zoom in" />
      <span aria-hidden className="bg-border mx-0.5 h-4 w-px" />
      <button
        type="button"
        onClick={onFit}
        title="Fit to pane"
        className="text-text-secondary hover:bg-surface-hover hover:text-text-primary rounded px-2 text-[11px] transition-colors"
      >
        Fit
      </button>
    </div>
  )
}

function ZoomBtn({
  onClick,
  label,
  title,
}: {
  onClick: () => void
  label: string
  title: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="text-text-secondary hover:bg-surface-hover hover:text-text-primary flex h-6 w-6 items-center justify-center rounded text-sm transition-colors"
    >
      {label}
    </button>
  )
}

function cursorIn(
  el: HTMLElement,
  e: { clientX: number; clientY: number },
): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}
