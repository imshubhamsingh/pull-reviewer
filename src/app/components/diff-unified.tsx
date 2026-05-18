import { type JSX } from 'react'
import { match } from 'ts-pattern'
import type { useShiki } from '@/app/hooks/use-shiki'
import type { DiffLine } from '@/app/lib/diff-lines'
import { CodeContent, DIFF_STYLE } from '@/app/components/diff-helpers'

/**
 * Single-column unified diff. Each row prefixed with `+` / `-` / ` ` and a
 * single line-number gutter that shows the base or head line per row.
 * Compact, GitHub-style. Horizontal scroll lives on the outer container.
 */
export function UnifiedDiff({
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
  return (
    <div className="bg-bg min-h-0 flex-1 overflow-auto font-mono text-xs">
      {children}
      <div>
        {rows.map((row, i) => (
          <UnifiedRow key={i} row={row} hl={hl} file={file} />
        ))}
      </div>
    </div>
  )
}

function UnifiedRow({
  row,
  hl,
  file,
}: {
  row: DiffLine
  hl: ReturnType<typeof useShiki>
  file: string
}): JSX.Element {
  const { bg, marker, markerColor } = match(row.kind)
    .with('add', () => ({
      bg: DIFF_STYLE.addBg,
      marker: '+',
      markerColor: 'rgb(74, 222, 128)',
    }))
    .with('del', () => ({
      bg: DIFF_STYLE.delBg,
      marker: '-',
      markerColor: 'rgb(251, 113, 133)',
    }))
    .with('eq', () => ({
      bg: undefined as string | undefined,
      marker: ' ',
      markerColor: 'var(--color-text-muted)',
    }))
    .exhaustive()
  return (
    <div className="flex leading-[1.55]" style={{ backgroundColor: bg }}>
      <span className="text-text-muted/60 w-10 shrink-0 px-1 text-right text-[10px] tabular-nums select-none">
        {row.baseLine ?? ''}
      </span>
      <span className="text-text-muted/60 w-10 shrink-0 px-1 text-right text-[10px] tabular-nums select-none">
        {row.headLine ?? ''}
      </span>
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
