import { useMemo, type JSX } from 'react'
import { match } from 'ts-pattern'
import type { useShiki } from '@/app/hooks/use-shiki'
import type { DiffLine } from '@/app/lib/diff-lines'
import type { LineMatchRange } from '@/app/lib/code-search'
import { DiffCommentBlock } from '@/app/components/diff-comment-block'
import { DiffUnifiedRow } from '@/app/components/diff-unified-row'
import { anchorsForUnifiedRow, interleave, type Block } from '@/app/components/diff-blocks'
import type { DiffSurface } from '@/app/components/diff-surface'
import type { DiffSearchPayload } from '@/app/components/diff-split'

/**
 * Single-column unified diff. Each row prefixed with `+` / `-` / ` ` and a
 * pair of line-number gutters (base | head). Comment bands render full-width
 * between rows. Compact, GitHub-style.
 *
 * Without `surface`, the bands chunker has no drafts or composer to inject;
 * the layout degrades to a flat read-only list of rows.
 */
export function UnifiedDiff({
  rows,
  hl,
  file,
  surface,
  search,
}: {
  rows: DiffLine[]
  hl: ReturnType<typeof useShiki>
  file: string
  surface?: DiffSurface | null
  search?: DiffSearchPayload
}): JSX.Element {
  const blocks = useMemo<Block[]>(() => {
    if (!surface) return rows.map((row, index) => ({ kind: 'row', row, index }))
    return interleave(rows, surface.fileDrafts, surface.composer, anchorsForUnifiedRow)
  }, [rows, surface])

  return (
    <div className="bg-bg min-h-0 flex-1 overflow-auto font-mono text-xs">
      {blocks.map((b, i) =>
        match(b)
          .with({ kind: 'row' }, (block) => (
            <DiffUnifiedRow
              key={i}
              rowIndex={block.index}
              row={block.row}
              hl={hl}
              file={file}
              surface={surface ?? null}
              matches={unifiedCellMatches(search, block.index)}
              activeMatch={unifiedCellActiveMatch(search, block.index)}
            />
          ))
          .with({ kind: 'drafts' }, (block) =>
            surface ? (
              <DiffCommentBlock key={i} block={block} surface={surface} file={file} />
            ) : null,
          )
          .with({ kind: 'composer' }, (block) =>
            surface ? (
              <DiffCommentBlock key={i} block={block} surface={surface} file={file} />
            ) : null,
          )
          .exhaustive(),
      )}
    </div>
  )
}

function unifiedCellMatches(
  search: DiffSearchPayload | undefined,
  rowIndex: number,
): LineMatchRange[] | undefined {
  if (!search || search.matches.length === 0) return undefined
  const out: LineMatchRange[] = []
  for (const m of search.matches) {
    if (m.rowIndex === rowIndex) out.push({ start: m.start, end: m.end })
  }
  return out.length === 0 ? undefined : out
}

function unifiedCellActiveMatch(
  search: DiffSearchPayload | undefined,
  rowIndex: number,
): LineMatchRange | null {
  if (!search || search.activeIndex < 0) return null
  const m = search.matches[search.activeIndex]
  if (!m || m.rowIndex !== rowIndex) return null
  return { start: m.start, end: m.end }
}
