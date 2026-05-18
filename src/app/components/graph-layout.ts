/**
 * Generic BFS-layered DAG layout. Consumed by both the mockup flow canvas
 * (`mockup-layout.ts`) and the state diagram canvas (`state-graph.ts`).
 *
 * - Roots (no incoming edges) start at layer 0; each child's layer is
 *   `max(child_layer, parent_layer + 1)`. Pure cycles bucket into a
 *   trailing layer below all reachable nodes.
 * - Inside a layer, nodes are vertically stacked with `gutterY` between
 *   them. Each layer's x-position is the previous layer's x + the widest
 *   node + `gutterX`.
 * - Nodes carrying `fixedX`/`fixedY` skip the auto-placement and keep their
 *   pinned coordinates (mockup frames can pre-position themselves on the
 *   canvas).
 *
 * Pure function: no DOM, no React, side-effect free.
 */

export interface LayoutNode {
  id: string
  width: number
  height: number
  /** When set, the node keeps this x and is excluded from auto-placement. */
  fixedX?: number
  /** When set, the node keeps this y. */
  fixedY?: number
}

export interface LayoutEdge {
  from: string
  to: string
}

export interface LayoutOptions {
  gutterX: number
  gutterY: number
  /**
   * Optional seed nodes for layer 0. When provided, these nodes are forced
   * to the leftmost layer even if they have incoming edges — required for
   * cyclic graphs (e.g., a state machine where every state has an in-edge).
   * Without a seed, a pure cycle would dump every node into the trailing
   * "unassigned" layer at x=0.
   */
  roots?: string[]
}

export interface Position {
  x: number
  y: number
}

export interface LayoutResult {
  positions: Map<string, Position>
}

export function bfsLayer(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: LayoutOptions,
): LayoutResult {
  const positions = new Map<string, Position>()
  if (nodes.length === 0) return { positions }

  const layer = computeLayers(nodes, edges, opts.roots)
  const byLayer = groupBy(nodes, (n) => layer.get(n.id) ?? 0)
  const layerOrder = Array.from(byLayer.keys()).sort((a, b) => a - b)

  let cursorX = 0
  for (const l of layerOrder) {
    const layerNodes = byLayer.get(l) ?? []
    const layerHeight = layerNodes.reduce((sum, n) => sum + n.height + opts.gutterY, -opts.gutterY)
    let cursorY = -layerHeight / 2
    let layerWidth = 0
    for (const n of layerNodes) {
      positions.set(n.id, {
        x: n.fixedX ?? cursorX,
        y: n.fixedY ?? cursorY,
      })
      cursorY += n.height + opts.gutterY
      if (n.width > layerWidth) layerWidth = n.width
    }
    cursorX += layerWidth + opts.gutterX
  }

  return { positions }
}

function computeLayers(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  rootHints?: string[],
): Map<string, number> {
  const adj = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) {
    adj.set(n.id, [])
    indeg.set(n.id, 0)
  }
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue
    adj.get(e.from)!.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }

  // DFS-style first-discovery layering: each node's layer is the depth of
  // its first reached path from a root. Back-edges in cycles don't bump
  // layers because the target already has a smaller assigned layer. We
  // queue roots (caller hints first, then natural in-degree-0 nodes, then
  // any orphans) and BFS outward without ever decreasing a node's layer.
  const layer = new Map<string, number>()
  const queue: string[] = []
  const seedAsRoot = (id: string): void => {
    if (!ids.has(id) || layer.has(id)) return
    layer.set(id, 0)
    queue.push(id)
  }
  for (const id of rootHints ?? []) seedAsRoot(id)
  for (const n of nodes) if ((indeg.get(n.id) ?? 0) === 0) seedAsRoot(n.id)

  // BFS — first-discovery wins; back-edges in cycles don't shift any
  // already-assigned layer. After the initial sweep, any node still
  // unvisited belongs to a pure cycle disconnected from the seeded roots:
  // promote one to a synthetic root and continue until everything has a
  // layer.
  const drain = (): void => {
    while (queue.length) {
      const id = queue.shift()!
      const l = layer.get(id) ?? 0
      for (const child of adj.get(id) ?? []) {
        if (layer.has(child)) continue
        layer.set(child, l + 1)
        queue.push(child)
      }
    }
  }
  drain()
  for (const n of nodes) {
    if (!layer.has(n.id)) {
      seedAsRoot(n.id)
      drain()
    }
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

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Bounding box around a set of positioned rectangles, padded uniformly.
 * Top padding can be inflated to leave room for header chrome (mockup
 * frame titles, state-machine title bars).
 */
export function rectsBounds(
  rects: { x: number; y: number; w: number; h: number }[],
  padding: number,
  extraTop = 0,
): Bounds {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const minX = Math.min(...rects.map((r) => r.x))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxX = Math.max(...rects.map((r) => r.x + r.w))
  const maxY = Math.max(...rects.map((r) => r.y + r.h))
  return {
    x: minX - padding,
    y: minY - padding - extraTop,
    w: maxX - minX + padding * 2,
    h: maxY - minY + padding * 2 + extraTop,
  }
}
