import { useCallback, useEffect, useMemo, useRef, type JSX } from 'react'
import { match } from 'ts-pattern'
import { marked } from 'marked'
import { cn } from '@/app/lib/utils'
import { useCanvasPanZoom } from '@/app/hooks/use-canvas-pan-zoom'
import { useElementDragOverrides } from '@/app/hooks/use-element-drag-overrides'
import type { CanvasController } from '@/app/hooks/use-canvas-transform'
import type { StateMachine, TourStep } from '@/lib/api'
import {
  flattenAndLayout,
  type PositionedStateEdge,
  type PositionedStateGraph,
  type PositionedStateNode,
} from '@/app/components/state-graph'
import { ArrowHeadMarker, FlowArrow, type Rect } from '@/app/components/flow-arrow'
import { SourceWrap, type JumpSource } from '@/app/components/source-wrap'
import { parseSourceRef } from '@/app/components/mockup-source'
import { CanvasZoomControls } from '@/app/components/canvas-zoom-controls'
import type { Bounds } from '@/app/components/graph-layout'

/**
 * Renders an XState-shaped `StateMachine` config as a labeled state graph
 * on a pannable / zoomable SVG canvas. Pan/zoom plumbing mirrors
 * `mockup-pane.tsx`. States are rounded rects (atomic), double-bordered
 * (final), or container chrome with substates inside (compound).
 * Transitions are bezier arrows with a centered pill carrying
 * `event [cond] / actions`. Click on any state or transition with a
 * `source` annotation jumps to the JSX/TS line via the shared
 * `jumpToRef` pipeline.
 */

interface Props {
  step: TourStep
  machine: StateMachine
  onJumpSource?: JumpSource
}

const FIT_PADDING = 48
const COMPOUND_HEADER_H = 28
const CANVAS_PAD = 600

export function StateDiagramPane({ step, machine, onJumpSource }: Props): JSX.Element {
  const layoutGraph = useMemo(() => flattenAndLayout(machine), [machine])
  const { containerRef, canvas, dragging, onMouseDown } = useCanvasPanZoom()
  const elementDrag = useElementDragOverrides(canvas.transform.scale)
  const { overrides, onMouseDown: onNodeMouseDown, reset: resetOverrides } = elementDrag

  // New machine → reset any user drags.
  useEffect(() => resetOverrides(), [machine, resetOverrides])

  const graph = useMemo(() => applyOverrides(layoutGraph, overrides), [layoutGraph, overrides])
  const liveBounds = useMemo(() => computeLiveBounds(graph), [graph])

  const fit = useCallback(() => {
    fitGraph(containerRef.current, graph, liveBounds, canvas.setAll)
  }, [containerRef, graph, liveBounds, canvas.setAll])

  const fittedRef = useRef<string | null>(null)
  useEffect(() => {
    const key = graphKey(graph)
    if (fittedRef.current === key) return
    const raf = requestAnimationFrame(() => {
      fit()
      fittedRef.current = key
    })
    return () => cancelAnimationFrame(raf)
  }, [graph, fit])

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
            canvas={canvas}
            graph={graph}
            liveBounds={liveBounds}
            onJumpSource={onJumpSource}
            onNodeMouseDown={onNodeMouseDown}
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
  canvas: CanvasController
  graph: PositionedStateGraph
  liveBounds: Bounds
  onJumpSource?: JumpSource
  onNodeMouseDown: (nodeId: string, e: React.MouseEvent) => void
}

function computeLiveBounds(graph: PositionedStateGraph): Bounds {
  let minX = graph.bounds.x
  let minY = graph.bounds.y
  let maxX = graph.bounds.x + graph.bounds.w
  let maxY = graph.bounds.y + graph.bounds.h
  for (const n of graph.nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x + n.width > maxX) maxX = n.x + n.width
    if (n.y + n.height > maxY) maxY = n.y + n.height
  }
  return {
    x: minX - CANVAS_PAD,
    y: minY - CANVAS_PAD,
    w: maxX - minX + CANVAS_PAD * 2,
    h: maxY - minY + CANVAS_PAD * 2,
  }
}

function CanvasContent({
  canvas,
  graph,
  liveBounds,
  onJumpSource,
  onNodeMouseDown,
}: ContentProps): JSX.Element {
  const { x, y, scale } = canvas.transform
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes])
  const w = liveBounds.w * scale
  const h = liveBounds.h * scale
  const initial = byId.get(graph.initialId)
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
        viewBox={`${liveBounds.x} ${liveBounds.y} ${liveBounds.w} ${liveBounds.h}`}
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <ArrowHeadMarker />
        </defs>
        {initial && <InitialDot target={initial} />}
        {graph.edges.map((e, i) => {
          const from = byId.get(e.from)
          const to = byId.get(e.to)
          if (!from || !to || from.id === to.id) return null
          return <StateEdge key={i} edge={e} from={from} to={to} onJumpSource={onJumpSource} />
        })}
        {graph.nodes.map((n) => (
          <StateNodeView
            key={n.id}
            node={n}
            onJumpSource={onJumpSource}
            onMouseDown={onNodeMouseDown}
          />
        ))}
      </svg>
    </div>
  )
}

function StateNodeView({
  node,
  onJumpSource,
  onMouseDown,
}: {
  node: PositionedStateNode
  onJumpSource?: JumpSource
  onMouseDown: (nodeId: string, e: React.MouseEvent) => void
}): JSX.Element {
  return (
    <g onMouseDown={(e) => onMouseDown(node.id, e)} style={{ cursor: 'grab' }}>
      <title>Drag to reposition</title>
      {match(node.type)
        .with('compound', () => <CompoundChrome node={node} />)
        .with('final', () => <FinalNode node={node} />)
        .otherwise(() => (
          <AtomicNode node={node} />
        ))}
      {node.source && onJumpSource && (
        <SourceJumpIcon node={node} source={node.source} onJumpSource={onJumpSource} />
      )}
    </g>
  )
}

function SourceJumpIcon({
  node,
  source,
  onJumpSource,
}: {
  node: PositionedStateNode
  source: string
  onJumpSource: JumpSource
}): JSX.Element {
  const cx = node.x + node.width - 12
  // For compound containers the icon sits inside the header strip; for
  // atomic/final nodes it sits in the top-right corner of the body.
  const cy = node.type === 'compound' ? node.y + COMPOUND_HEADER_H / 2 : node.y + 12
  const handleJump = (e: React.MouseEvent): void => {
    e.stopPropagation()
    const ref = parseSourceRef(source)
    if (ref) onJumpSource(ref)
  }
  return (
    <g onClick={handleJump} onMouseDown={(e) => e.stopPropagation()} style={{ cursor: 'pointer' }}>
      <title>Open source ({source})</title>
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill="var(--color-bg)"
        stroke="var(--color-border-strong)"
        strokeWidth={1}
      />
      <text
        x={cx}
        y={cy + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={600}
        fill="var(--color-text-secondary)"
      >
        ↗
      </text>
    </g>
  )
}

function AtomicNode({ node }: { node: PositionedStateNode }): JSX.Element {
  return (
    <g>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={10}
        fill="var(--color-surface)"
        stroke="var(--color-border-strong)"
        strokeWidth={1.5}
      />
      <NodeBody node={node} />
    </g>
  )
}

function FinalNode({ node }: { node: PositionedStateNode }): JSX.Element {
  return (
    <g>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={10}
        fill="var(--color-surface)"
        stroke="var(--color-border-strong)"
        strokeWidth={1.5}
      />
      <rect
        x={node.x + 4}
        y={node.y + 4}
        width={node.width - 8}
        height={node.height - 8}
        rx={7}
        fill="none"
        stroke="var(--color-border-strong)"
        strokeWidth={1.5}
      />
      <NodeBody node={node} />
    </g>
  )
}

function CompoundChrome({ node }: { node: PositionedStateNode }): JSX.Element {
  return (
    <g>
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={10}
        fill="var(--color-bg)"
        stroke="var(--color-border-strong)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={COMPOUND_HEADER_H}
        rx={10}
        fill="var(--color-surface)"
        stroke="var(--color-border-strong)"
        strokeWidth={1}
      />
      <text
        x={node.x + 12}
        y={node.y + COMPOUND_HEADER_H / 2 + 1}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
        fill="var(--color-text-secondary)"
      >
        {node.name}
      </text>
    </g>
  )
}

function NodeBody({ node }: { node: PositionedStateNode }): JSX.Element {
  const lines = [
    ...(node.entry?.map((e) => `entry / ${e}`) ?? []),
    ...(node.exit?.map((e) => `exit / ${e}`) ?? []),
  ]
  const lineH = 14
  const totalH = 18 + lines.length * lineH
  const startY = node.y + (node.height - totalH) / 2 + 14
  return (
    <g>
      <text
        x={node.x + node.width / 2}
        y={startY}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={600}
        fill="var(--color-text-primary)"
      >
        {node.name}
      </text>
      {lines.map((l, i) => (
        <text
          key={i}
          x={node.x + node.width / 2}
          y={startY + 18 + i * lineH}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fill="var(--color-text-muted)"
        >
          {l}
        </text>
      ))}
    </g>
  )
}

function InitialDot({ target }: { target: PositionedStateNode }): JSX.Element {
  // A filled circle to the left of the initial state with a short arrow
  // pointing into it. The arrow head reuses the shared marker.
  const cx = target.x - 26
  const cy = target.y + target.height / 2
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill="var(--color-text-primary)" />
      <path
        d={`M ${cx + 5} ${cy} L ${target.x - 1} ${cy}`}
        stroke="var(--color-text-secondary)"
        strokeWidth={2}
        fill="none"
        markerEnd="url(#flow-arrow-head)"
      />
    </g>
  )
}

function StateEdge({
  edge,
  from,
  to,
  onJumpSource,
}: {
  edge: PositionedStateEdge
  from: PositionedStateNode
  to: PositionedStateNode
  onJumpSource?: JumpSource
}): JSX.Element {
  const label = edgeLabel(edge)
  const fromRect: Rect = { x: from.x, y: from.y, w: from.width, h: from.height }
  const toRect: Rect = { x: to.x, y: to.y, w: to.width, h: to.height }
  return (
    <SourceWrap source={edge.source} onJumpSource={onJumpSource}>
      <FlowArrow from={fromRect} to={toRect} label={label} />
    </SourceWrap>
  )
}

function edgeLabel(e: PositionedStateEdge): string {
  let label = e.event
  if (e.cond) label += ` [${e.cond}]`
  if (e.actions && e.actions.length > 0) label += ` / ${e.actions.join(', ')}`
  return label
}

function fitGraph(
  container: HTMLDivElement | null,
  graph: PositionedStateGraph,
  liveBounds: Bounds,
  setAll: CanvasController['setAll'],
): void {
  if (!container || graph.bounds.w <= 0 || graph.bounds.h <= 0) return
  const cw = container.clientWidth
  const ch = container.clientHeight
  if (cw <= 0 || ch <= 0) return
  const scale = Math.min((cw - FIT_PADDING) / graph.bounds.w, (ch - FIT_PADDING) / graph.bounds.h)
  setAll({
    scale,
    x: (cw - graph.bounds.w * scale) / 2 - (graph.bounds.x - liveBounds.x) * scale,
    y: (ch - graph.bounds.h * scale) / 2 - (graph.bounds.y - liveBounds.y) * scale,
  })
}

function graphKey(g: PositionedStateGraph): string {
  return g.nodes.map((n) => n.id).join('|') + '#' + g.edges.length
}

function applyOverrides(
  g: PositionedStateGraph,
  ov: Map<string, { dx: number; dy: number }>,
): PositionedStateGraph {
  if (ov.size === 0) return g
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      const o = ov.get(n.id)
      return o ? { ...n, x: n.x + o.dx, y: n.y + o.dy } : n
    }),
  }
}
