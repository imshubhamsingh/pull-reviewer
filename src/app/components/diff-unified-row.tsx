import type { JSX } from 'react'
import { match } from 'ts-pattern'
import type { useShiki } from '@/app/hooks/use-shiki'
import type { DiffLine } from '@/app/lib/diff-lines'
import { cn } from '@/app/lib/utils'
import { CodeContent, DIFF_STYLE } from '@/app/components/diff-helpers'
import { DiffGutterButton, DiffGutterStatic } from '@/app/components/diff-gutter'
import { lineOfUnifiedRow, sideOfUnifiedRow } from '@/app/components/diff-blocks'
import type { DiffSurface, ReviewSide } from '@/app/components/diff-surface'

/**
 * One row of the unified-view single column — shows both base and head line
 * numbers, the +/-/space marker, and the code content. The line-number
 * column matching `sideOfUnifiedRow(row)` is interactive when a surface is
 * passed; the other side renders as a static label.
 */
export function DiffUnifiedRow({
  row,
  hl,
  file,
  surface,
}: {
  row: DiffLine
  hl: ReturnType<typeof useShiki>
  file: string
  surface: DiffSurface | null
}): JSX.Element {
  const { bg: diffBg, marker, markerColor } = styleForKind(row.kind)
  const reviewSide = sideOfUnifiedRow(row)
  const lineNum = lineOfUnifiedRow(row)
  const selected = !!(surface && lineNum != null && surface.isSelectedOnSide(lineNum, reviewSide))
  const commentable = !!(
    surface &&
    lineNum != null &&
    (reviewSide === 'before' ? surface.commentableLeft : surface.commentableRight).has(lineNum)
  )
  const bg = selected ? 'hsl(45 90% 50% / 0.22)' : diffBg
  const canInteract = lineNum != null && surface != null

  return (
    <div
      className={cn(
        'diff-row group flex leading-[1.55]',
        commentable && 'line-commentable',
        selected && 'line-selected',
      )}
      style={{ backgroundColor: bg }}
    >
      <UnifiedLineNumCell
        line={row.baseLine ?? null}
        interactive={canInteract && reviewSide === 'before'}
        side="before"
        surface={surface}
      />
      <UnifiedLineNumCell
        line={row.headLine ?? null}
        interactive={canInteract && reviewSide === 'after'}
        side="after"
        surface={surface}
      />
      <span
        className="w-4 shrink-0 text-center font-mono select-none"
        style={{ color: markerColor }}
      >
        {marker}
      </span>
      <span className="pr-3 whitespace-pre">
        <CodeContent content={row.content} hl={hl} file={file} />
      </span>
    </div>
  )
}

function UnifiedLineNumCell({
  line,
  interactive,
  side,
  surface,
}: {
  line: number | null
  interactive: boolean
  side: ReviewSide
  surface: DiffSurface | null
}): JSX.Element {
  if (interactive && line != null && surface) {
    return <DiffGutterButton line={line} side={side} surface={surface} widthClass="w-10 px-1" />
  }
  return <DiffGutterStatic line={line} widthClass="w-10 px-1" />
}

function styleForKind(kind: DiffLine['kind']): {
  bg: string | undefined
  marker: '+' | '-' | ' '
  markerColor: string
} {
  return match(kind)
    .with('add', () => ({
      bg: DIFF_STYLE.addBg as string | undefined,
      marker: '+' as const,
      markerColor: 'rgb(74, 222, 128)',
    }))
    .with('del', () => ({
      bg: DIFF_STYLE.delBg as string | undefined,
      marker: '-' as const,
      markerColor: 'rgb(251, 113, 133)',
    }))
    .with('eq', () => ({
      bg: undefined as string | undefined,
      marker: ' ' as const,
      markerColor: 'var(--color-text-muted)',
    }))
    .exhaustive()
}
