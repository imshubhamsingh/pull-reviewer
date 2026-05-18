import type { StateMachine, StateNode, Transition } from '@/lib/api'
import { bfsLayer, rectsBounds, type Bounds } from '@/app/components/graph-layout'

/**
 * Walks an XState-shaped `StateMachine` into a flat node + edge list with
 * positions assigned, ready for the SVG renderer. Compound states are
 * carried as their own nodes that *visually contain* their children;
 * children are laid out within the compound's bounds.
 *
 * Layout strategy: a separate `bfsLayer` pass per compound scope (the
 * machine root, and each compound child). After children are positioned,
 * their parent's `width`/`height` expand to contain them.
 *
 * Pure function — no React, no DOM. The renderer memoises the result.
 */

// Gutters are intentionally generous: transition labels live in the
// horizontal gap between layers and can run long (`event [cond] / actions`
// often spans 30+ chars). 260 / 96 leaves plenty of room for the pill
// without overlapping either state box, and gives the layout breathing
// room overall.
const GUTTER_X = 260
const GUTTER_Y = 96
const PADDING = 48
const COMPOUND_HEADER_H = 28
const COMPOUND_PADDING = 16
const NODE_MIN_W = 140
const NODE_MIN_H = 56
const NODE_CHAR_W = 7
const NODE_LINE_H = 14
const NODE_PADDING = 12

export interface PositionedStateNode {
  /** Dotted path from machine root — `autosave.saving.snapshot`. */
  id: string
  /** Local name (last path segment) — `snapshot`. */
  name: string
  type: 'atomic' | 'compound' | 'final'
  /** Parent's dotted path, undefined when this is a root-level state. */
  parent?: string
  entry?: string[]
  exit?: string[]
  source?: string
  isInitial: boolean
  /** Absolute coordinates on the canvas (compounds carry their full child bounds). */
  x: number
  y: number
  width: number
  height: number
}

export interface PositionedStateEdge {
  from: string
  to: string
  event: string
  cond?: string
  actions?: string[]
  source?: string
}

export interface PositionedStateGraph {
  nodes: PositionedStateNode[]
  edges: PositionedStateEdge[]
  bounds: Bounds
  /** Dotted id of the root machine's initial state — the small entry-dot anchors to it. */
  initialId: string
}

interface DraftNode {
  id: string
  name: string
  parent?: string
  type: 'atomic' | 'compound' | 'final'
  entry?: string[]
  exit?: string[]
  source?: string
  isInitial: boolean
  hasChildren: boolean
  width: number
  height: number
}

interface DraftEdge {
  from: string
  to: string
  event: string
  cond?: string
  actions?: string[]
  source?: string
}

export function flattenAndLayout(machine: StateMachine): PositionedStateGraph {
  const drafts: DraftNode[] = []
  const draftEdges: DraftEdge[] = []
  // The machine id itself is the root scope — top-level states list it as
  // their parent so `parentOf(dottedId)` agrees with `draft.parent`.
  const childrenOf = new Map<string, DraftNode[]>()

  walkStates(
    machine.states,
    machine.id,
    machine.initial,
    machine.id,
    drafts,
    draftEdges,
    childrenOf,
  )

  // Bottom-up: lay out each compound's children, then size the compound to
  // contain them. Process scopes by depth, deepest first.
  const byScope = childrenOf
  const scopesByDepth = Array.from(byScope.keys()).sort((a, b) => depthOf(b) - depthOf(a))

  const localPositions = new Map<string, { x: number; y: number }>()
  for (const scope of scopesByDepth) {
    const kids = byScope.get(scope) ?? []
    if (kids.length === 0) continue
    const edges = draftEdges.filter((e) => {
      const p = parentOf(e.from)
      const q = parentOf(e.to)
      return p === scope && q === scope
    })
    // Seed BFS with the scope's `initial` child so cycles don't collapse
    // every node into the trailing layer. For the root scope this is the
    // machine's `initial`; for compounds it's that compound's `initial`.
    const initialKid = kids.find((k) => k.isInitial)
    const { positions } = bfsLayer(
      kids.map((k) => ({ id: k.id, width: k.width, height: k.height })),
      edges.map((e) => ({ from: e.from, to: e.to })),
      {
        gutterX: GUTTER_X,
        gutterY: GUTTER_Y,
        roots: initialKid ? [initialKid.id] : undefined,
      },
    )
    for (const [id, pos] of positions) localPositions.set(id, pos)
    // Grow the parent compound to contain its kids + their layout box.
    if (scope) {
      const minX = Math.min(...kids.map((k) => positions.get(k.id)?.x ?? 0))
      const minY = Math.min(...kids.map((k) => positions.get(k.id)?.y ?? 0))
      const maxX = Math.max(...kids.map((k) => (positions.get(k.id)?.x ?? 0) + k.width))
      const maxY = Math.max(...kids.map((k) => (positions.get(k.id)?.y ?? 0) + k.height))
      const parent = drafts.find((d) => d.id === scope)
      if (parent) {
        parent.width = Math.max(parent.width, maxX - minX + COMPOUND_PADDING * 2)
        parent.height = Math.max(
          parent.height,
          maxY - minY + COMPOUND_PADDING * 2 + COMPOUND_HEADER_H,
        )
      }
    }
  }

  // Resolve absolute positions: top-level kids keep their local coords,
  // then walk down the tree by depth, translating each child's local coord
  // into the parent's content box.
  const absolute = new Map<string, { x: number; y: number }>()
  const rootKids = byScope.get(machine.id) ?? []
  for (const k of rootKids) {
    absolute.set(k.id, localPositions.get(k.id) ?? { x: 0, y: 0 })
  }
  const ordered = drafts
    .filter((d) => d.parent !== machine.id)
    .sort((a, b) => depthOf(a.id) - depthOf(b.id))
  for (const d of ordered) {
    if (!d.parent) continue
    const parentPos = absolute.get(d.parent) ?? { x: 0, y: 0 }
    const local = localPositions.get(d.id) ?? { x: 0, y: 0 }
    const parentInnerX = parentPos.x + COMPOUND_PADDING
    const parentInnerY = parentPos.y + COMPOUND_HEADER_H + COMPOUND_PADDING
    // Each compound's child layout starts at its own (0,0); shift into the
    // parent's content box by subtracting the kids' min coordinates.
    const siblings = byScope.get(d.parent) ?? []
    const minX = Math.min(...siblings.map((k) => localPositions.get(k.id)?.x ?? 0))
    const minY = Math.min(...siblings.map((k) => localPositions.get(k.id)?.y ?? 0))
    absolute.set(d.id, {
      x: parentInnerX + (local.x - minX),
      y: parentInnerY + (local.y - minY),
    })
  }

  const nodes: PositionedStateNode[] = drafts.map((d) => {
    const p = absolute.get(d.id) ?? { x: 0, y: 0 }
    return {
      id: d.id,
      name: d.name,
      type: d.type,
      parent: d.parent,
      entry: d.entry,
      exit: d.exit,
      source: d.source,
      isInitial: d.isInitial,
      x: p.x,
      y: p.y,
      width: d.width,
      height: d.height,
    }
  })

  const edges: PositionedStateEdge[] = draftEdges.map((e) => ({ ...e }))

  // Bounds only over top-level nodes (children of the machine itself). Their
  // boxes already enclose any nested compounds via the parent-grow pass above.
  const bounds = rectsBounds(
    nodes
      .filter((n) => n.parent === machine.id)
      .map((n) => ({ x: n.x, y: n.y, w: n.width, h: n.height })),
    PADDING,
    COMPOUND_HEADER_H,
  )

  const initialId = `${machine.id}.${machine.initial}`

  return { nodes, edges, bounds, initialId }
}

function walkStates(
  states: Record<string, StateNode> | undefined,
  parentDotted: string,
  initialName: string | undefined,
  machineId: string,
  drafts: DraftNode[],
  draftEdges: DraftEdge[],
  childrenOf: Map<string, DraftNode[]>,
): void {
  if (!states) return
  const siblings: DraftNode[] = []
  for (const [name, node] of Object.entries(states)) {
    const dotted = `${parentDotted}.${name}`
    const hasChildren = !!node.states && Object.keys(node.states).length > 0
    const declaredType = node.type
    const type: 'atomic' | 'compound' | 'final' =
      declaredType === 'final'
        ? 'final'
        : hasChildren || declaredType === 'compound'
          ? 'compound'
          : 'atomic'
    const entry = normaliseActions(node.entry)
    const exit = normaliseActions(node.exit)
    const size = sizeForNode(name, entry, exit)
    const draft: DraftNode = {
      id: dotted,
      name,
      parent: parentDotted,
      type,
      entry,
      exit,
      source: node.source,
      isInitial: initialName === name,
      hasChildren,
      width: size.width,
      height: size.height,
    }
    drafts.push(draft)
    siblings.push(draft)

    for (const [event, raw] of Object.entries(node.on ?? {})) {
      const list = Array.isArray(raw) ? raw : [raw]
      for (const t of list) {
        const tr = normaliseTransition(t)
        if (!tr.target) continue
        const targetDotted = resolveTarget(tr.target, parentDotted)
        draftEdges.push({
          from: dotted,
          to: targetDotted,
          event,
          cond: tr.cond,
          actions: tr.actions,
          source: tr.source,
        })
      }
    }

    if (hasChildren) {
      walkStates(node.states, dotted, node.initial, machineId, drafts, draftEdges, childrenOf)
    }
  }
  childrenOf.set(parentDotted, siblings)
}

function normaliseActions(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined
  return Array.isArray(v) ? v : [v]
}

function normaliseTransition(t: string | Transition): {
  target?: string
  cond?: string
  actions?: string[]
  source?: string
} {
  return typeof t === 'string' ? { target: t } : t
}

/**
 * Resolve an XState target expression to a dotted node id.
 * - `'sibling'`     → parent's children scope
 * - `'.child'`      → leading dot is relative; for v1 we treat same as sibling
 * - `'#machine.x'`  → absolute path within the machine
 */
function resolveTarget(target: string, parentDotted: string): string {
  if (target.startsWith('#')) {
    return target.slice(1)
  }
  const name = target.startsWith('.') ? target.slice(1) : target
  return `${parentDotted}.${name}`
}

function sizeForNode(
  name: string,
  entry: string[] | undefined,
  exit: string[] | undefined,
): {
  width: number
  height: number
} {
  const lines = [
    name,
    ...(entry?.map((e) => `entry / ${e}`) ?? []),
    ...(exit?.map((e) => `exit / ${e}`) ?? []),
  ]
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0)
  const width = Math.max(NODE_MIN_W, longest * NODE_CHAR_W + NODE_PADDING * 2)
  const height = Math.max(NODE_MIN_H, lines.length * NODE_LINE_H + NODE_PADDING * 2)
  return { width, height }
}

function parentOf(dotted: string): string {
  const idx = dotted.lastIndexOf('.')
  return idx < 0 ? dotted : dotted.slice(0, idx)
}

function depthOf(dotted: string): number {
  return (dotted.match(/\./g)?.length ?? 0) + 1
}
