import type { JSX } from 'react'
import { cn } from '@/app/lib/utils'
import type { DiffSurface, ReviewSide } from '@/app/components/diff-surface'

/**
 * Interactive line-number gutter for a diff row. Mousedown starts a
 * selection on `side`; mouseenter extends it (locked to the originating
 * side at the surface level). Hover shows a `+` affordance — same pattern
 * as `CodeLines` CodeLine.
 *
 * Pass `widthClass` to override the default width — split uses `w-12 px-2`,
 * unified's narrower base/head columns use `w-10 px-1`.
 */
export function DiffGutterButton({
  line,
  side,
  surface,
  widthClass = 'w-12 px-2',
}: {
  line: number
  side: ReviewSide
  surface: DiffSurface
  widthClass?: string
}): JSX.Element {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        surface.onStartSelection(line, side, e.shiftKey)
      }}
      onMouseEnter={() => surface.onExtendSelection(line, side)}
      title={`Comment on line ${line} (drag or shift+click for a range)`}
      className={cn(
        'code-gutter relative shrink-0 text-right text-[10px] tabular-nums select-none',
        widthClass,
      )}
    >
      <span className="text-text-muted/60">{line}</span>
      <span className="text-interactive-primary absolute -top-0.5 right-0 hidden text-xs group-hover:inline">
        +
      </span>
    </button>
  )
}

/**
 * Non-interactive line-number cell — used for split-view spacer rows (the
 * empty side of an add/del) and for unified-view's opposite-side line
 * number column on rows whose side rule doesn't make that column
 * interactive.
 */
export function DiffGutterStatic({
  line,
  widthClass = 'w-12 px-2',
}: {
  line: number | null
  widthClass?: string
}): JSX.Element {
  return (
    <span
      className={cn(
        'text-text-muted/60 shrink-0 text-right text-[10px] tabular-nums select-none',
        widthClass,
      )}
    >
      {line ?? ''}
    </span>
  )
}
