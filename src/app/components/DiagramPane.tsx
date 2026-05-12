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

export function DiagramPane({ step }: Props): JSX.Element {
  const [state, setState] = useState<RenderState>({ kind: 'idle' })
  const zp = useZoomPan(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const drag = useDragPan(containerRef)
  const id = `mermaid-${step.id}`

  useEffect(() => {
    let cancelled = false
    if (!step.diagram) { setState({ kind: 'error', message: 'No mermaid source on this step.' }); return }
    mermaid.render(id, step.diagram.mermaid)
      .then(({ svg }) => { if (!cancelled) setState({ kind: 'ok', svg }) })
      .catch((err: Error) => { if (!cancelled) setState({ kind: 'error', message: err.message }) })
    return () => { cancelled = true }
  }, [id, step.diagram])

  useAutoFit({
    containerRef,
    contentRef,
    apply: zp.fitTo,
    trigger: state.kind === 'ok' ? state.svg : null,
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
          {renderBody(state, step.diagram?.mermaid, zp.scale, contentRef)}
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

function renderBody(state: RenderState, source: string | undefined, scale: number, ref: React.RefObject<HTMLDivElement | null>): JSX.Element {
  if (state.kind === 'idle') {
    return <CenterWrap><p className="text-text-muted text-xs">Rendering…</p></CenterWrap>
  }
  if (state.kind === 'error') {
    return (
      <CenterWrap>
        <pre className="text-text-danger bg-surface w-full max-w-3xl overflow-auto rounded-md p-3 text-xs">
          Bad mermaid: {state.message}
          {source && `\n\n${source}`}
        </pre>
      </CenterWrap>
    )
  }
  return (
    <CenterWrap>
      <div
        ref={ref}
        className="diagram-svg"
        style={{ zoom: scale }}
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    </CenterWrap>
  )
}

/**
 * Centers its child while letting it grow past the viewport. `min-w-full min-h-full`
 * keeps it at container size when content is small; when content (via `zoom`) is
 * larger, this wrapper grows with it so the scrollable parent picks it up.
 */
function CenterWrap({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="flex min-h-full min-w-full items-center justify-center p-4">{children}</div>
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
  apply(Math.min((c.clientWidth - 24) / w, (c.clientHeight - 24) / h))
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
