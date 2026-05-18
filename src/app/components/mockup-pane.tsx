import { useCallback, useEffect, useMemo, useRef, type JSX } from 'react'
import { marked } from 'marked'
import { cn } from '@/app/lib/utils'
import { useCanvasPanZoom } from '@/app/hooks/use-canvas-pan-zoom'
import { useElementDragOverrides } from '@/app/hooks/use-element-drag-overrides'
import type { CanvasController } from '@/app/hooks/use-canvas-transform'
import type { MockupScene, TourStep } from '@/lib/api'
import {
  autoLayout,
  sceneBounds,
  FRAME_TITLE_H,
  type PositionedFrame,
  type SceneBounds,
} from '@/app/components/mockup-layout'
import { ArrowHeadMarker, FlowArrow } from '@/app/components/flow-arrow'
import { Element } from '@/app/components/mockup-element'
import type { JumpSource } from '@/app/components/source-wrap'
import { parseSourceRef } from '@/app/components/mockup-source'
import { CanvasZoomControls } from '@/app/components/canvas-zoom-controls'
import type { MockupElement } from '@/lib/api'

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
const CANVAS_PAD = 600

export function MockupPane({ step, scene, onJumpSource }: Props): JSX.Element {
  const baseLayout = useMemo(() => autoLayout(scene), [scene])
  const { containerRef, canvas, dragging, onMouseDown } = useCanvasPanZoom()
  const elementDrag = useElementDragOverrides(canvas.transform.scale)
  const { overrides, onMouseDown: onFrameMouseDown, reset: resetOverrides } = elementDrag

  // New scene → discard any prior drags.
  useEffect(() => resetOverrides(), [scene, resetOverrides])

  const positioned = useMemo(() => applyOverrides(baseLayout, overrides), [baseLayout, overrides])
  const layoutBounds = useMemo(() => sceneBounds(positioned), [positioned])
  const liveBounds = useMemo(() => padBounds(layoutBounds, positioned), [layoutBounds, positioned])

  const fit = useCallback(() => {
    fitScene(containerRef.current, layoutBounds, liveBounds, canvas.setAll)
  }, [containerRef, layoutBounds, liveBounds, canvas.setAll])

  const fittedRef = useRef<string | null>(null)
  useEffect(() => {
    const key = sceneKey(scene)
    if (fittedRef.current === key) return
    const raf = requestAnimationFrame(() => {
      fit()
      fittedRef.current = key
    })
    return () => cancelAnimationFrame(raf)
  }, [scene, fit])

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
            bounds={liveBounds}
            canvas={canvas}
            positioned={positioned}
            scene={scene}
            onJumpSource={onJumpSource}
            onFrameMouseDown={onFrameMouseDown}
          />
        </div>
        <CanvasZoomControls canvas={canvas} onFit={fit} containerRef={containerRef} />
      </div>
      <figcaption
        className="markdown border-border text-text-secondary border-t px-4 py-3 text-sm leading-relaxed"
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
  onFrameMouseDown: (frameId: string, e: React.MouseEvent) => void
}

function CanvasContent({
  bounds,
  canvas,
  positioned,
  scene,
  onJumpSource,
  onFrameMouseDown,
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
              from={{
                x: from.canvasX,
                y: from.canvasY,
                w: from.width,
                h: from.height,
                titleAbove: FRAME_TITLE_H,
              }}
              to={{
                x: to.canvasX,
                y: to.canvasY,
                w: to.width,
                h: to.height,
                titleAbove: FRAME_TITLE_H,
              }}
              label={t.trigger}
              fromSide={t.fromSide}
              toSide={t.toSide}
            />
          )
        })}
        {positioned.map((f) => (
          <g
            key={f.id}
            transform={`translate(${f.canvasX} ${f.canvasY})`}
            onMouseDown={(e) => onFrameMouseDown(f.id, e)}
            style={{ cursor: 'grab' }}
          >
            <title>Drag to reposition</title>
            <FrameChrome
              title={f.title}
              w={f.width}
              h={f.height}
              source={dominantSource(f.elements)}
              onJumpSource={onJumpSource}
            />
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
  source: string | undefined
  onJumpSource: JumpSource | undefined
}

function FrameChrome({ title, w, h, source, onJumpSource }: ChromeProps): JSX.Element {
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
      {source && onJumpSource && (
        <FrameSourceIcon source={source} w={w} onJumpSource={onJumpSource} />
      )}
    </g>
  )
}

function FrameSourceIcon({
  source,
  w,
  onJumpSource,
}: {
  source: string
  w: number
  onJumpSource: JumpSource
}): JSX.Element {
  const cx = w - 14
  const cy = -FRAME_TITLE_H / 2
  return (
    <g
      onClick={(e) => {
        e.stopPropagation()
        const ref = parseSourceRef(source)
        if (ref) onJumpSource(ref)
      }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ cursor: 'pointer' }}
    >
      <title>Open source ({source})</title>
      <circle
        cx={cx}
        cy={cy}
        r={9}
        fill="var(--color-bg)"
        stroke="var(--color-border-strong)"
        strokeWidth={1}
      />
      <text
        x={cx}
        y={cy + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
        fill="var(--color-text-secondary)"
      >
        ↗
      </text>
    </g>
  )
}

/**
 * Pick a representative source for the whole frame: the file most frequently
 * cited by inner elements. Returns the first source pointing to that file so
 * the view-file icon lands on a real line, not just a path.
 */
function dominantSource(elements: MockupElement[]): string | undefined {
  const counts = new Map<string, number>()
  const firstByFile = new Map<string, string>()
  walkSources(elements, (source) => {
    const ref = parseSourceRef(source)
    if (!ref) return
    counts.set(ref.file, (counts.get(ref.file) ?? 0) + 1)
    if (!firstByFile.has(ref.file)) firstByFile.set(ref.file, source)
  })
  let bestFile: string | undefined
  let bestCount = 0
  for (const [file, n] of counts) {
    if (n > bestCount) {
      bestFile = file
      bestCount = n
    }
  }
  return bestFile ? firstByFile.get(bestFile) : undefined
}

function walkSources(elements: MockupElement[], visit: (source: string) => void): void {
  for (const el of elements) {
    if (el.source) visit(el.source)
    if (el.type === 'group' || el.type === 'modal') walkSources(el.children, visit)
  }
}

function fitScene(
  container: HTMLDivElement | null,
  layout: SceneBounds,
  live: SceneBounds,
  setAll: CanvasController['setAll'],
): void {
  if (!container || layout.w <= 0 || layout.h <= 0) return
  const cw = container.clientWidth
  const ch = container.clientHeight
  if (cw <= 0 || ch <= 0) return
  const scale = Math.min((cw - FIT_PADDING) / layout.w, (ch - FIT_PADDING) / layout.h)
  // Wrapper top-left sits at liveBounds origin; shift so the layout (un-padded)
  // diagram lands centred regardless of the surrounding drag padding.
  setAll({
    scale,
    x: (cw - layout.w * scale) / 2 - (layout.x - live.x) * scale,
    y: (ch - layout.h * scale) / 2 - (layout.y - live.y) * scale,
  })
}

function padBounds(layout: SceneBounds, positioned: PositionedFrame[]): SceneBounds {
  let minX = layout.x
  let minY = layout.y
  let maxX = layout.x + layout.w
  let maxY = layout.y + layout.h
  for (const f of positioned) {
    if (f.canvasX < minX) minX = f.canvasX
    if (f.canvasY - FRAME_TITLE_H < minY) minY = f.canvasY - FRAME_TITLE_H
    if (f.canvasX + f.width > maxX) maxX = f.canvasX + f.width
    if (f.canvasY + f.height > maxY) maxY = f.canvasY + f.height
  }
  return {
    x: minX - CANVAS_PAD,
    y: minY - CANVAS_PAD,
    w: maxX - minX + CANVAS_PAD * 2,
    h: maxY - minY + CANVAS_PAD * 2,
  }
}

function applyOverrides(
  positioned: PositionedFrame[],
  overrides: Map<string, { dx: number; dy: number }>,
): PositionedFrame[] {
  if (overrides.size === 0) return positioned
  return positioned.map((f) => {
    const o = overrides.get(f.id)
    return o ? { ...f, canvasX: f.canvasX + o.dx, canvasY: f.canvasY + o.dy } : f
  })
}

function sceneKey(scene: MockupScene): string {
  return scene.frames.map((f) => f.id).join('|') + '#' + (scene.transitions?.length ?? 0)
}
