import { useRef, type JSX } from 'react'
import type { useShiki } from '@/app/hooks/use-shiki'
import type { DiffLine } from '@/app/lib/diff-lines'
import { CodeContent, DIFF_STYLE } from '@/app/components/diff-helpers'

/**
 * Two parallel columns (base / head), each scrolling horizontally as a unit.
 * Horizontal scroll is mirrored across both via refs so dragging one side's
 * scrollbar moves the other in lockstep — diff rows stay aligned regardless
 * of which column you scrolled. Vertical scroll lives on the outer container
 * so both columns scroll together vertically too.
 */
export function DiffColumns({
  rows,
  hl,
  file,
  children,
}: {
  rows: DiffLine[]
  hl: ReturnType<typeof useShiki>
  file: string
  children: React.ReactNode
}): JSX.Element {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)
  const mirrorScroll =
    (peer: React.RefObject<HTMLDivElement | null>) =>
    (e: React.UIEvent<HTMLDivElement>): void => {
      if (syncingRef.current) return
      const target = peer.current
      if (!target) return
      syncingRef.current = true
      target.scrollLeft = e.currentTarget.scrollLeft
      // Release the lock after this microtask so the mirrored scroll event
      // (which fires synchronously on peer scrollLeft assignment) is skipped.
      queueMicrotask(() => {
        syncingRef.current = false
      })
    }
  return (
    <div className="bg-bg min-h-0 flex-1 overflow-y-auto font-mono text-xs">
      {children}
      <div className="flex">
        <div
          ref={leftRef}
          onScroll={mirrorScroll(rightRef)}
          className="border-border min-w-0 flex-1 overflow-x-auto border-r"
        >
          {rows.map((row, i) => (
            <SideRow key={i} side="base" row={row} hl={hl} file={file} />
          ))}
        </div>
        <div
          ref={rightRef}
          onScroll={mirrorScroll(leftRef)}
          className="min-w-0 flex-1 overflow-x-auto"
        >
          {rows.map((row, i) => (
            <SideRow key={i} side="head" row={row} hl={hl} file={file} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SideRow({
  side,
  row,
  hl,
  file,
}: {
  side: 'base' | 'head'
  row: DiffLine
  hl: ReturnType<typeof useShiki>
  file: string
}): JSX.Element {
  const isBase = side === 'base'
  const shown = row.kind === 'eq' || (isBase ? row.kind === 'del' : row.kind === 'add')
  const isChange = (isBase && row.kind === 'del') || (!isBase && row.kind === 'add')
  const isOpposite = (isBase && row.kind === 'add') || (!isBase && row.kind === 'del')
  const bg = isChange
    ? isBase
      ? DIFF_STYLE.delBg
      : DIFF_STYLE.addBg
    : isOpposite
      ? isBase
        ? DIFF_STYLE.addFill
        : DIFF_STYLE.delFill
      : undefined
  const marker: '+' | '-' | ' ' = isChange ? (isBase ? '-' : '+') : ' '
  const markerColor =
    marker === '+'
      ? 'rgb(74, 222, 128)'
      : marker === '-'
        ? 'rgb(251, 113, 133)'
        : 'var(--color-text-muted)'
  const lineNum = isBase ? row.baseLine : row.headLine
  return (
    <div className="flex leading-[1.55]" style={{ backgroundColor: bg }}>
      <span className="text-text-muted/60 w-12 shrink-0 px-2 text-right text-[10px] tabular-nums select-none">
        {shown ? (lineNum ?? '') : ''}
      </span>
      <span
        className="w-4 shrink-0 text-center font-mono select-none"
        style={{ color: markerColor }}
      >
        {shown ? marker : ''}
      </span>
      <span className="pr-3 whitespace-pre">
        {shown ? <CodeContent content={row.content} hl={hl} file={file} /> : ' '}
      </span>
    </div>
  )
}
