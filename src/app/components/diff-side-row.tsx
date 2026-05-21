import type { JSX } from 'react'
import type { useShiki } from '@/app/hooks/use-shiki'
import type { DiffLine } from '@/app/lib/diff-lines'
import type { LineMatchRange } from '@/app/lib/code-search'
import { cn } from '@/app/lib/utils'
import { CodeContent, DIFF_STYLE } from '@/app/components/diff-helpers'
import { DiffGutterButton, DiffGutterStatic } from '@/app/components/diff-gutter'
import type { DiffSurface, ReviewSide } from '@/app/components/diff-surface'

/**
 * One row of a split-view column (`base` or `head`). Shows the line number,
 * +/-/space marker, and code content for its side. The gutter is interactive
 * when the row's side has a real line number AND a `surface` was passed —
 * spacer rows (the empty half of an add/del) skip selection entirely.
 */
export function DiffSideRow({
  column,
  rowIndex,
  row,
  hl,
  file,
  surface,
  matches,
  activeMatch,
}: {
  column: 'base' | 'head'
  rowIndex: number
  row: DiffLine
  hl: ReturnType<typeof useShiki>
  file: string
  surface: DiffSurface | null
  matches?: LineMatchRange[]
  activeMatch?: LineMatchRange | null
}): JSX.Element {
  const view = computeRowView(column, row, surface)
  return (
    <div
      data-diff-row={rowIndex}
      data-diff-side={column}
      className={cn(
        'diff-row group flex leading-[1.55]',
        view.commentable && 'line-commentable',
        view.selected && 'line-selected',
      )}
      style={{ backgroundColor: view.bg }}
    >
      {view.canInteract && surface ? (
        <DiffGutterButton line={view.lineNum!} side={view.reviewSide} surface={surface} />
      ) : (
        <DiffGutterStatic line={view.shown ? (view.lineNum ?? null) : null} />
      )}
      <span
        className="w-4 shrink-0 text-center font-mono select-none"
        style={{ color: view.markerColor }}
      >
        {view.shown ? view.marker : ''}
      </span>
      <span className="pr-3 whitespace-pre">
        {view.shown ? (
          <CodeContent
            content={row.content}
            hl={hl}
            file={file}
            matches={matches}
            activeMatch={activeMatch}
          />
        ) : (
          ' '
        )}
      </span>
    </div>
  )
}

interface RowView {
  shown: boolean
  lineNum: number | undefined
  reviewSide: ReviewSide
  selected: boolean
  commentable: boolean
  bg: string | undefined
  marker: '+' | '-' | ' '
  markerColor: string
  canInteract: boolean
}

function computeRowView(
  column: 'base' | 'head',
  row: DiffLine,
  surface: DiffSurface | null,
): RowView {
  const isBase = column === 'base'
  const shown = row.kind === 'eq' || (isBase ? row.kind === 'del' : row.kind === 'add')
  const isChange = (isBase && row.kind === 'del') || (!isBase && row.kind === 'add')
  const isOpposite = (isBase && row.kind === 'add') || (!isBase && row.kind === 'del')
  const lineNum = isBase ? row.baseLine : row.headLine
  const reviewSide: ReviewSide = isBase ? 'before' : 'after'
  const selected = !!(surface && lineNum != null && surface.isSelectedOnSide(lineNum, reviewSide))
  const commentable = !!(
    surface &&
    lineNum != null &&
    (isBase ? surface.commentableLeft : surface.commentableRight).has(lineNum)
  )
  const diffBg = isChange
    ? isBase
      ? DIFF_STYLE.delBg
      : DIFF_STYLE.addBg
    : isOpposite
      ? isBase
        ? DIFF_STYLE.addFill
        : DIFF_STYLE.delFill
      : undefined
  const bg = selected ? 'hsl(45 90% 50% / 0.22)' : diffBg
  const marker: '+' | '-' | ' ' = isChange ? (isBase ? '-' : '+') : ' '
  const markerColor =
    marker === '+'
      ? 'rgb(74, 222, 128)'
      : marker === '-'
        ? 'rgb(251, 113, 133)'
        : 'var(--color-text-muted)'
  const canInteract = shown && lineNum != null && surface != null
  return {
    shown,
    lineNum,
    reviewSide,
    selected,
    commentable,
    bg,
    marker,
    markerColor,
    canInteract,
  }
}
