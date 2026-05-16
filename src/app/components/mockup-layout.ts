import type { MockupFrame, MockupScene } from '@/lib/api'

/**
 * Auto-layout for the Figma-style flow canvas. The model MAY emit explicit
 * `canvasX/canvasY` per frame; for any frame missing positions, we walk the
 * transition graph and place layers left-to-right with vertical fanout on
 * branches. Frames not reachable from any root land in a row below.
 *
 * Pure function — no React, no DOM. The renderer memoises the result.
 */

const GUTTER_X = 180
const GUTTER_Y = 80

export interface PositionedFrame extends MockupFrame {
  canvasX: number
  canvasY: number
}

export interface SceneBounds {
  x: number
  y: number
  w: number
  h: number
}

const PADDING = 48

export function autoLayout(scene: MockupScene): PositionedFrame[] {
  const frames = scene.frames
  if (frames.length === 0) return []

  const layer = computeLayers(scene)
  const byLayer = groupBy(frames, (f) => layer.get(f.id) ?? 0)
  const layerOrder = Array.from(byLayer.keys()).sort((a, b) => a - b)

  const positioned: PositionedFrame[] = frames.map((f) => ({
    ...f,
    canvasX: f.canvasX ?? 0,
    canvasY: f.canvasY ?? 0,
  }))
  const byId = new Map(positioned.map((p) => [p.id, p]))

  let cursorX = 0
  for (const l of layerOrder) {
    const layerFrames = byLayer.get(l) ?? []
    const layerHeight = layerFrames.reduce((sum, f) => sum + f.height + GUTTER_Y, -GUTTER_Y)
    let cursorY = -layerHeight / 2
    let layerWidth = 0
    for (const f of layerFrames) {
      const p = byId.get(f.id)!
      if (f.canvasX === undefined) p.canvasX = cursorX
      if (f.canvasY === undefined) p.canvasY = cursorY
      cursorY += p.height + GUTTER_Y
      if (p.width > layerWidth) layerWidth = p.width
    }
    cursorX += layerWidth + GUTTER_X
  }

  return positioned
}

function computeLayers(scene: MockupScene): Map<string, number> {
  const out = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  const ids = new Set(scene.frames.map((f) => f.id))
  for (const f of scene.frames) {
    out.set(f.id, [])
    indeg.set(f.id, 0)
  }
  for (const t of scene.transitions ?? []) {
    if (!ids.has(t.fromFrame) || !ids.has(t.toFrame)) continue
    out.get(t.fromFrame)!.push(t.toFrame)
    indeg.set(t.toFrame, (indeg.get(t.toFrame) ?? 0) + 1)
  }

  const layer = new Map<string, number>()
  const queue: string[] = []
  for (const f of scene.frames) {
    if ((indeg.get(f.id) ?? 0) === 0) {
      layer.set(f.id, 0)
      queue.push(f.id)
    }
  }
  while (queue.length) {
    const id = queue.shift()!
    const l = layer.get(id) ?? 0
    for (const child of out.get(id) ?? []) {
      const childLayer = Math.max(layer.get(child) ?? 0, l + 1)
      if (layer.get(child) !== childLayer) {
        layer.set(child, childLayer)
        queue.push(child)
      }
    }
  }
  // Frames left unassigned (pure cycles): bucket into a trailing layer.
  const maxLayer = layer.size > 0 ? Math.max(...Array.from(layer.values())) : 0
  for (const f of scene.frames) {
    if (!layer.has(f.id)) layer.set(f.id, maxLayer + 1)
  }
  return layer
}

function groupBy<T, K>(items: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const k = keyFn(item)
    if (!out.has(k)) out.set(k, [])
    out.get(k)!.push(item)
  }
  return out
}

export function sceneBounds(frames: PositionedFrame[]): SceneBounds {
  if (frames.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const minX = Math.min(...frames.map((f) => f.canvasX))
  const minY = Math.min(...frames.map((f) => f.canvasY))
  const maxX = Math.max(...frames.map((f) => f.canvasX + f.width))
  const maxY = Math.max(...frames.map((f) => f.canvasY + f.height))
  return {
    x: minX - PADDING,
    y: minY - PADDING - FRAME_TITLE_H,
    w: maxX - minX + PADDING * 2,
    h: maxY - minY + PADDING * 2 + FRAME_TITLE_H,
  }
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
