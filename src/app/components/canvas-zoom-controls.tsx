import { type JSX, type RefObject } from 'react'
import type { CanvasController } from '@/app/hooks/use-canvas-transform'

/**
 * Floating zoom/fit affordance shared by the mockup and state-diagram
 * panes. Sits in the pane's top-right corner. `−` / `+` zoom anchored to
 * the pane centre; `Fit` calls back to re-frame the diagram via whatever
 * "fit to layout" logic the pane owns.
 */
const ZOOM_STEP = 1.25

interface Props {
  canvas: CanvasController
  containerRef: RefObject<HTMLDivElement | null>
  onFit: () => void
}

export function CanvasZoomControls({ canvas, containerRef, onFit }: Props): JSX.Element {
  const anchorCenter = (): { x: number; y: number } => {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    return { x: el.clientWidth / 2, y: el.clientHeight / 2 }
  }
  return (
    <div className="border-border bg-surface/95 absolute top-4 right-4 z-10 flex items-center gap-1 rounded-md border p-1 shadow-lg backdrop-blur-sm">
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
