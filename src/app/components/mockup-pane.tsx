import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { marked } from 'marked'
import { cn } from '@/app/lib/utils'
import { useCanvasTransform, type CanvasController } from '@/app/hooks/use-canvas-transform'
import type { MockupScene, TourStep } from '@/lib/api'
import {
  autoLayout,
  sceneBounds,
  FRAME_TITLE_H,
  type PositionedFrame,
  type SceneBounds,
} from '@/app/components/mockup-layout'
import { ArrowHeadMarker, FlowArrow } from '@/app/components/mockup-arrow'
import { Element, type JumpSource } from '@/app/components/mockup-element'

/**
 * Figma-style flow renderer for a lo-fi UI mockup. Lays out every frame on a
 * single pannable/zoomable canvas with labeled arrows connecting them per
 * `scene.transitions`. Pan/zoom mirrors `DiagramPane` so the gestures stay
 * consistent across diagram kinds.
 */

interface Props {
  step: TourStep
  scene: MockupScene
  onJumpSource?: JumpSource
}

const FIT_PADDING = 48
const ZOOM_STEP = 1.25

export function MockupPane({ step, scene, onJumpSource }: Props): JSX.Element {
  const positioned = useMemo(() => autoLayout(scene), [scene])
  const bounds = useMemo(() => sceneBounds(positioned), [positioned])
  const containerRef = useRef<HTMLDivElement>(null)
  const canvas = useCanvasTransform()
  const [dragging, setDragging] = useState(false)
  const fittedRef = useRef<string | null>(null)

  const fit = useCallback(() => {
    fitScene(containerRef.current, bounds, canvas.setAll)
  }, [bounds, canvas.setAll])

  // Fit on first mount; on scene change refit so a new mockup centers itself.
  useEffect(() => {
    const key = sceneKey(scene)
    if (fittedRef.current === key) return
    const raf = requestAnimationFrame(() => {
      fit()
      fittedRef.current = key
    })
    return () => cancelAnimationFrame(raf)
  }, [scene, fit])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
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

  const captionHtml = useMemo(() => marked.parse(step.body, { async: false }), [step.body])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex-1">
        <div
          ref={containerRef}
          onMouseDown={onMouseDown}
          className={cn(
            'absolute inset-0 overflow-hidden select-none',
            dragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
        >
          <CanvasContent
            bounds={bounds}
            canvas={canvas}
            positioned={positioned}
            scene={scene}
            onJumpSource={onJumpSource}
          />
        </div>
        <ZoomControls canvas={canvas} onFit={fit} containerRef={containerRef} />
      </div>
      <figcaption
        className="markdown border-border text-text-secondary border-t px-4 py-3 text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: captionHtml }}
      />
    </div>
  )
}

interface ContentProps {
  bounds: SceneBounds
  canvas: CanvasController
  positioned: PositionedFrame[]
  scene: MockupScene
  onJumpSource?: JumpSource
}

function CanvasContent({
  bounds,
  canvas,
  positioned,
  scene,
  onJumpSource,
}: ContentProps): JSX.Element {
  const { x, y, scale } = canvas.transform
  const w = bounds.w * scale
  const h = bounds.h * scale
  const byId = useMemo(() => new Map(positioned.map((p) => [p.id, p])), [positioned])
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: w,
        height: h,
        transform: `translate3d(${x}px, ${y}px, 0)`,
      }}
    >
      <svg
        viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <ArrowHeadMarker />
        </defs>
        {/* Arrows render first so frames sit on top. */}
        {scene.transitions?.map((t, i) => {
          const from = byId.get(t.fromFrame)
          const to = byId.get(t.toFrame)
          if (!from || !to) return null
          return (
            <FlowArrow
              key={i}
              from={from}
              to={to}
              trigger={t.trigger}
              fromSide={t.fromSide}
              toSide={t.toSide}
            />
          )
        })}
        {positioned.map((f) => (
          <g key={f.id} transform={`translate(${f.canvasX} ${f.canvasY})`}>
            <FrameChrome title={f.title} w={f.width} h={f.height} />
            <svg
              x={0}
              y={0}
              width={f.width}
              height={f.height}
              viewBox={`0 0 ${f.width} ${f.height}`}
            >
              {f.elements.map((el, i) => (
                <Element key={i} el={el} onJumpSource={onJumpSource} />
              ))}
            </svg>
          </g>
        ))}
      </svg>
    </div>
  )
}

interface ChromeProps {
  title: string
  w: number
  h: number
}

function FrameChrome({ title, w, h }: ChromeProps): JSX.Element {
  return (
    <g>
      <rect
        x={0}
        y={-FRAME_TITLE_H}
        width={w}
        height={FRAME_TITLE_H}
        fill="var(--color-surface)"
        stroke="var(--color-border-strong)"
        rx={4}
      />
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill="var(--color-bg)"
        stroke="var(--color-border-strong)"
      />
      <text
        x={12}
        y={-FRAME_TITLE_H / 2 + 1}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
        fill="var(--color-text-secondary)"
      >
        {title}
      </text>
    </g>
  )
}

function fitScene(
  container: HTMLDivElement | null,
  bounds: SceneBounds,
  setAll: CanvasController['setAll'],
): void {
  if (!container || bounds.w <= 0 || bounds.h <= 0) return
  const cw = container.clientWidth
  const ch = container.clientHeight
  if (cw <= 0 || ch <= 0) return
  const scale = Math.min((cw - FIT_PADDING) / bounds.w, (ch - FIT_PADDING) / bounds.h)
  setAll({
    scale,
    x: (cw - bounds.w * scale) / 2,
    y: (ch - bounds.h * scale) / 2,
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

function sceneKey(scene: MockupScene): string {
  return scene.frames.map((f) => f.id).join('|') + '#' + (scene.transitions?.length ?? 0)
}
