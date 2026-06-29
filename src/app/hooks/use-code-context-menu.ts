import { useCallback, type MouseEvent } from 'react'

export interface CodeContextTarget {
  file: string
  /** 1-based, from the line's `data-line` attr. */
  line: number
  /** 0-based column resolved via `caretPositionFromPoint`. */
  column: number
  /** Whitespace-trimmed identifier guess under the cursor, '' if none. */
  symbol: string
  anchorX: number
  anchorY: number
}

interface Options {
  /** The file currently rendered in the host code pane. */
  file: string | undefined
  onOpen: (target: CodeContextTarget) => void
}

const IDENT_RE = /[A-Za-z_$][\w$]*/g

interface UseCodeContextMenu {
  /** Attach to the `<pre>` / scroll container — uses event delegation, so
   *  individual `<span>`s don't need handlers. */
  onContextMenu: (e: MouseEvent) => void
}

/**
 * Right-click handler that walks the DOM to recover `(file, line, column,
 * symbol)` from a contextmenu event somewhere inside a `.code-content`
 * container. Pass the result to the host so it can open a `ContextMenu`.
 *
 * Returns silently (and lets the native menu through) when the click lands
 * outside any line — e.g. on whitespace, the gutter, or a non-code area.
 */
export function useCodeContextMenu({ file, onOpen }: Options): UseCodeContextMenu {
  const onContextMenu = useCallback(
    (e: MouseEvent): void => {
      if (!file) return
      const target = e.target
      if (!(target instanceof HTMLElement)) return
      const lineEl = target.closest<HTMLElement>('[data-line]')
      if (!lineEl) return
      const lineAttr = lineEl.getAttribute('data-line')
      if (!lineAttr) return
      const line = Number(lineAttr)
      if (!Number.isInteger(line) || line <= 0) return
      const contentEl = lineEl.querySelector<HTMLElement>('.code-content')
      if (!contentEl) return

      const column = resolveColumn(contentEl, e.clientX, e.clientY)
      if (column == null) return
      const lineText = contentEl.textContent ?? ''
      const symbol = symbolFromLine(lineText, column)

      e.preventDefault()
      onOpen({ file, line, column, symbol, anchorX: e.clientX, anchorY: e.clientY })
    },
    [file, onOpen],
  )
  return { onContextMenu }
}

/**
 * Walk into `.code-content` to find the 0-based column for a viewport point.
 * Uses `caretPositionFromPoint` (or `caretRangeFromPoint` as a Safari
 * fallback), then sums prior-sibling text lengths to convert the in-node
 * offset into a column offset on the full line.
 */
function resolveColumn(contentEl: HTMLElement, clientX: number, clientY: number): number | null {
  const point = caretFromPoint(clientX, clientY)
  if (!point) return null
  const { offsetNode, offset } = point
  if (!contentEl.contains(offsetNode)) return null
  // Sum text lengths of every node before `offsetNode` inside `contentEl`.
  let column = 0
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()
  while (node) {
    if (node === offsetNode) {
      return column + offset
    }
    column += (node.textContent ?? '').length
    node = walker.nextNode()
  }
  return null
}

interface Caret {
  offsetNode: Node
  offset: number
}

function caretFromPoint(x: number, y: number): Caret | null {
  if (typeof document.caretPositionFromPoint === 'function') {
    const pos = document.caretPositionFromPoint(x, y)
    if (!pos) return null
    return { offsetNode: pos.offsetNode, offset: pos.offset }
  }
  if (typeof document.caretRangeFromPoint === 'function') {
    const range = document.caretRangeFromPoint(x, y)
    if (!range) return null
    return { offsetNode: range.startContainer, offset: range.startOffset }
  }
  return null
}

function symbolFromLine(line: string, column: number): string {
  IDENT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = IDENT_RE.exec(line)) !== null) {
    if (column >= m.index && column <= m.index + m[0].length) {
      return m[0]
    }
  }
  return ''
}
