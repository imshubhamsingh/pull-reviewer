import type { MockupFrame, MockupScene } from '@/lib/api'
import { bfsLayer, rectsBounds, type Bounds } from '@/app/components/graph-layout'

/**
 * Mockup-specific layout glue. The generic BFS layering lives in
 * `graph-layout.ts` so the state diagram pane can reuse it; this file
 * keeps the mockup-only concerns: pre-positioned frames keep their
 * `canvasX/canvasY`, frame chrome height is reserved above each frame's
 * bounding box, and arrow anchors are derived from frame edges.
 *
 * Pure function — no React, no DOM. The renderer memoises the result.
 */

const GUTTER_X = 180
const GUTTER_Y = 80
const PADDING = 48

export interface PositionedFrame extends MockupFrame {
  canvasX: number
  canvasY: number
}

export type SceneBounds = Bounds

export function autoLayout(scene: MockupScene): PositionedFrame[] {
  const frames = scene.frames
  if (frames.length === 0) return []

  const { positions } = bfsLayer(
    frames.map((f) => ({
      id: f.id,
      width: f.width,
      height: f.height,
      fixedX: f.canvasX,
      fixedY: f.canvasY,
    })),
    (scene.transitions ?? []).map((t) => ({ from: t.fromFrame, to: t.toFrame })),
    { gutterX: GUTTER_X, gutterY: GUTTER_Y },
  )

  return frames.map((f) => {
    const p = positions.get(f.id)
    return { ...f, canvasX: p?.x ?? 0, canvasY: p?.y ?? 0 }
  })
}

export function sceneBounds(frames: PositionedFrame[]): SceneBounds {
  return rectsBounds(
    frames.map((f) => ({ x: f.canvasX, y: f.canvasY, w: f.width, h: f.height })),
    PADDING,
    FRAME_TITLE_H,
  )
}

/** Height reserved above each frame for the title chrome. */
export const FRAME_TITLE_H = 28

/** Where the arrow attaches when no `fromSide`/`toSide` is provided. */
export function autoSide(
  from: PositionedFrame,
  to: PositionedFrame,
): { fromSide: Side; toSide: Side } {
  const fcx = from.canvasX + from.width / 2
  const fcy = from.canvasY + from.height / 2
  const tcx = to.canvasX + to.width / 2
  const tcy = to.canvasY + to.height / 2
  const dx = tcx - fcx
  const dy = tcy - fcy
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' }
  }
  return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' }
}

export type Side = 'top' | 'right' | 'bottom' | 'left'

export function anchorPoint(frame: PositionedFrame, side: Side): { x: number; y: number } {
  const { canvasX: x, canvasY: y, width: w, height: h } = frame
  if (side === 'top') return { x: x + w / 2, y: y - FRAME_TITLE_H }
  if (side === 'bottom') return { x: x + w / 2, y: y + h }
  if (side === 'left') return { x: x, y: y + h / 2 }
  return { x: x + w, y: y + h / 2 }
}
