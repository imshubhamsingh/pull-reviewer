import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import mermaid from 'mermaid'
import { marked } from 'marked'
import { cn } from '@/app/lib/utils'
import { useAutoFit } from '@/app/hooks/useAutoFit'
import { useDragPan } from '@/app/hooks/useDragPan'
import { useZoomPan, type ZoomPan } from '@/app/hooks/useZoomPan'
import type { TourStep } from '@/lib/api'

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict', fontFamily: 'inherit' })

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

export function DiagramPane({ step }: Props): JSX.Element {
  const [state, setState] = useState<RenderState>({ kind: 'idle' })
  const [natural, setNatural] = useState<NaturalSize | undefined>()
  const zp = useZoomPan(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const drag = useDragPan(containerRef)
  const id = `mermaid-${step.id}`

  useEffect(() => {
    let cancelled = false
    setNatural(undefined)
    if (!step.diagram) { setState({ kind: 'error', message: 'No mermaid source on this step.' }); return }
    mermaid.render(id, step.diagram.mermaid)
      .then(({ svg }) => { if (!cancelled) setState({ kind: 'ok', svg }) })
      .catch((err: Error) => { if (!cancelled) setState({ kind: 'error', message: err.message }) })
    return () => { cancelled = true }
  }, [id, step.diagram])

  // Measure the SVG's natural size once after it's in the DOM; everything
  // downstream (auto-fit, scroll bounds) keys off this.
  useEffect(() => {
    if (state.kind !== 'ok') return
    const svg = contentRef.current?.querySelector('svg')
    if (!svg) return
    const vb = svg.viewBox.baseVal
    const rect = svg.getBoundingClientRect()
    const width = vb && vb.width > 0 ? vb.width : rect.width
    const height = vb && vb.height > 0 ? vb.height : rect.height
    if (width > 0 && height > 0) setNatural({ width, height })
  }, [state])

  useAutoFit({
    containerRef,
    contentRef,
    apply: zp.fitTo,
    trigger: natural,
  })

  const captionHtml = useMemo(() => marked.parse(step.body, { async: false }), [step.body])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex-1">
        <div
          ref={containerRef}
          onWheel={zp.onWheel}
          onMouseDown={drag.onMouseDown}
          className={cn(
            'absolute inset-0 overflow-auto select-none',
            drag.isDragging ? 'cursor-grabbing' : state.kind === 'ok' ? 'cursor-grab' : 'cursor-default',
          )}
        >
          {renderBody(state, step.diagram?.mermaid, zp.scale, natural, contentRef)}
        </div>
        {state.kind === 'ok' && <ZoomControls zp={zp} onFit={() => fitNow(containerRef, contentRef, zp.fitTo)} />}
      </div>
      <figcaption
        className="markdown border-border text-text-secondary border-t px-4 py-3 text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: captionHtml }}
      />
    </div>
  )
}

function renderBody(
  state: RenderState,
  source: string | undefined,
  scale: number,
  natural: NaturalSize | undefined,
  contentRef: React.RefObject<HTMLDivElement | null>,
): JSX.Element {
  if (state.kind === 'idle') return <p className="text-text-muted p-6 text-xs">Rendering…</p>
  if (state.kind === 'error') {
    return (
      <pre className="text-text-danger bg-surface m-4 w-fit overflow-auto rounded-md p-3 text-xs">
        Bad mermaid: {state.message}
        {source && `\n\n${source}`}
      </pre>
    )
  }
  // Outer wrapper has the *scaled* dimensions so the scrollable parent sees
  // the right bounds. Inner is absolute-positioned and uses transform:scale,
  // which doesn't affect layout — only visual size — so we never fight the
  // box model. Pre-measurement (`natural === undefined`) renders at native
  // size off-screen briefly so we can grab viewBox dimensions.
  const wrapperStyle: React.CSSProperties = natural
    ? {
        width: natural.width * scale,
        height: natural.height * scale,
        position: 'relative',
        margin: '24px auto',
        flexShrink: 0,
      }
    : { opacity: 0, position: 'absolute', pointerEvents: 'none' }
  const contentStyle: React.CSSProperties = natural
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: natural.width,
        height: natural.height,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }
    : {}
  return (
    <div style={wrapperStyle}>
      <div ref={contentRef} className="diagram-svg" style={contentStyle} dangerouslySetInnerHTML={{ __html: state.svg }} />
    </div>
  )
}

function fitNow(
  containerRef: React.RefObject<HTMLDivElement | null>,
  contentRef: React.RefObject<HTMLDivElement | null>,
  apply: (s: number) => void,
): void {
  const c = containerRef.current
  const svg = contentRef.current?.querySelector('svg')
  if (!c || !svg) return
  const vb = svg.viewBox.baseVal
  const w = vb && vb.width > 0 ? vb.width : svg.getBoundingClientRect().width
  const h = vb && vb.height > 0 ? vb.height : svg.getBoundingClientRect().height
  if (!w || !h) return
  apply(Math.min((c.clientWidth - 48) / w, (c.clientHeight - 48) / h))
}

function ZoomControls({ zp, onFit }: { zp: ZoomPan; onFit: () => void }): JSX.Element {
  return (
    <div className="border-border bg-surface absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border p-1 shadow-md">
      <ZoomBtn onClick={zp.zoomOut} label="−" title="Zoom out" />
      <button
        type="button"
        onClick={zp.reset}
        title="Reset to 100%"
        className="text-text-secondary hover:text-text-primary w-12 text-xs tabular-nums transition-colors"
      >
        {Math.round(zp.scale * 100)}%
      </button>
      <ZoomBtn onClick={zp.zoomIn} label="+" title="Zoom in" />
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

function ZoomBtn({ onClick, label, title }: { onClick: () => void; label: string; title: string }): JSX.Element {
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
