import type { JSX } from 'react'
import {
  anchorPoint,
  autoSide,
  type PositionedFrame,
  type Side,
} from '@/app/components/mockup-layout'

interface Props {
  from: PositionedFrame
  to: PositionedFrame
  trigger: string
  fromSide?: Side
  toSide?: Side
}

const STROKE = 2
const LABEL_PAD_X = 10
const LABEL_PAD_Y = 5
const LABEL_FONT = 11
const LABEL_CHAR_W = 6.4
const LABEL_MAX_CHARS = 24

/**
 * Figma-style flow arrow: cubic bezier between two frame anchors with a
 * labeled pill on the path. Label is hard-truncated to the gutter so it
 * doesn't overlap the source / target frames. Side selection auto-derives
 * from the relative position of the frames when the model doesn't pin it.
 */
export function FlowArrow({ from, to, trigger, fromSide, toSide }: Props): JSX.Element {
  const auto = autoSide(from, to)
  const sFrom: Side = fromSide ?? auto.fromSide
  const sTo: Side = toSide ?? auto.toSide
  const a = anchorPoint(from, sFrom)
  const b = anchorPoint(to, sTo)
  const path = bezier(a, sFrom, b, sTo)
  const mid = midpoint(a, b)
  const horizontalGutter =
    (sFrom === 'left' || sFrom === 'right') && (sTo === 'left' || sTo === 'right')
      ? Math.abs(b.x - a.x) - LABEL_PAD_X * 2
      : Infinity
  const maxChars = Math.min(
    LABEL_MAX_CHARS,
    Math.max(8, Math.floor(horizontalGutter / LABEL_CHAR_W)),
  )
  const labelText = truncate(trigger, maxChars)
  const labelW = Math.max(40, labelText.length * LABEL_CHAR_W + LABEL_PAD_X * 2)
  const labelH = LABEL_FONT + LABEL_PAD_Y * 2
  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="var(--color-text-secondary)"
        strokeWidth={STROKE}
        markerEnd="url(#mockup-arrow-head)"
      />
      <g color="var(--color-text-secondary)">
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
    </g>
  )
}

/** Arrow head marker — render once inside the SVG defs. */
export function ArrowHeadMarker(): JSX.Element {
  return (
    <marker
      id="mockup-arrow-head"
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
