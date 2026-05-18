import type { JSX } from 'react'

/**
 * Generic labeled flow arrow shared by the mockup canvas and the state
 * diagram canvas. Renders a cubic bezier from one rect's perimeter to
 * another's with a centered pill carrying the trigger / event label. Side
 * selection auto-derives from the relative position of the rects when the
 * caller doesn't pin it.
 *
 * `titleAbove` reserves space above the visible `y` for an external title
 * bar (mockup frames sit below their title chrome). When the arrow's
 * anchor side is `top`, the actual attach point sits `titleAbove` pixels
 * above `y`. Atomic state nodes pass 0 (or omit it).
 */

export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
  titleAbove?: number
}

interface Props {
  from: Rect
  to: Rect
  label: string
  fromSide?: Side
  toSide?: Side
}

const STROKE = 2
const LABEL_PAD_X = 10
const LABEL_PAD_Y = 5
const LABEL_FONT = 11
const LABEL_CHAR_W = 6.4
// Hard cap only — we don't shrink-to-gutter anymore. Callers are
// responsible for spacing nodes far enough apart that long labels don't
// collide; the pill renders the full text up to this length.
const LABEL_MAX_CHARS = 64

export function FlowArrow({ from, to, label, fromSide, toSide }: Props): JSX.Element {
  const auto = autoSide(from, to)
  const sFrom: Side = fromSide ?? auto.fromSide
  const sTo: Side = toSide ?? auto.toSide
  const a = anchorPoint(from, sFrom)
  const b = anchorPoint(to, sTo)
  const path = bezier(a, sFrom, b, sTo)
  const mid = midpoint(a, b)
  const labelText = truncate(label, LABEL_MAX_CHARS)
  const labelW = Math.max(40, labelText.length * LABEL_CHAR_W + LABEL_PAD_X * 2)
  const labelH = LABEL_FONT + LABEL_PAD_Y * 2
  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="var(--color-text-secondary)"
        strokeWidth={STROKE}
        markerEnd="url(#flow-arrow-head)"
      />
      {labelText && (
        <g>
          <rect
            x={mid.x - labelW / 2}
            y={mid.y - labelH / 2}
            width={labelW}
            height={labelH}
            rx={labelH / 2}
            fill="var(--color-surface-hover)"
            stroke="var(--color-border-strong)"
            strokeWidth={1}
          />
          <text
            x={mid.x}
            y={mid.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={LABEL_FONT}
            fontWeight={500}
            fill="var(--color-text-primary)"
          >
            {labelText}
          </text>
        </g>
      )}
    </g>
  )
}

/** Render once per SVG canvas inside `<defs>`. */
export function ArrowHeadMarker(): JSX.Element {
  return (
    <marker
      id="flow-arrow-head"
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-text-secondary)" />
    </marker>
  )
}

export function autoSide(from: Rect, to: Rect): { fromSide: Side; toSide: Side } {
  const fcx = from.x + from.w / 2
  const fcy = from.y + from.h / 2
  const tcx = to.x + to.w / 2
  const tcy = to.y + to.h / 2
  const dx = tcx - fcx
  const dy = tcy - fcy
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' }
  }
  return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' }
}

export function anchorPoint(rect: Rect, side: Side): { x: number; y: number } {
  const { x, y, w, h } = rect
  if (side === 'top') return { x: x + w / 2, y: y - (rect.titleAbove ?? 0) }
  if (side === 'bottom') return { x: x + w / 2, y: y + h }
  if (side === 'left') return { x: x, y: y + h / 2 }
  return { x: x + w, y: y + h / 2 }
}

function bezier(
  a: { x: number; y: number },
  sa: Side,
  b: { x: number; y: number },
  sb: Side,
): string {
  const dist = Math.max(48, Math.hypot(b.x - a.x, b.y - a.y) * 0.35)
  const c1 = offset(a, sa, dist)
  const c2 = offset(b, sb, dist)
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`
}

function offset(p: { x: number; y: number }, side: Side, d: number): { x: number; y: number } {
  if (side === 'top') return { x: p.x, y: p.y - d }
  if (side === 'bottom') return { x: p.x, y: p.y + d }
  if (side === 'left') return { x: p.x - d, y: p.y }
  return { x: p.x + d, y: p.y }
}

function midpoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}
