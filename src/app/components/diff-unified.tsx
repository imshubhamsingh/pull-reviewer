import { useMemo, type JSX } from 'react'
import { match } from 'ts-pattern'
import type { useShiki } from '@/app/hooks/use-shiki'
import type { DiffLine } from '@/app/lib/diff-lines'
import { DiffCommentBlock } from '@/app/components/diff-comment-block'
import { DiffUnifiedRow } from '@/app/components/diff-unified-row'
import { anchorsForUnifiedRow, interleave, type Block } from '@/app/components/diff-blocks'
import type { DiffSurface } from '@/app/components/diff-surface'

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
  children,
  surface,
}: {
  rows: DiffLine[]
  hl: ReturnType<typeof useShiki>
  file: string
  children: React.ReactNode
  surface?: DiffSurface | null
}): JSX.Element {
  const blocks = useMemo<Block[]>(() => {
    if (!surface) return rows.map((row, index) => ({ kind: 'row', row, index }))
    return interleave(rows, surface.fileDrafts, surface.composer, anchorsForUnifiedRow)
  }, [rows, surface])

  return (
    <div className="bg-bg min-h-0 flex-1 overflow-auto font-mono text-xs">
      {children}
      {blocks.map((b, i) =>
        match(b)
          .with({ kind: 'row' }, (block) => (
            <DiffUnifiedRow key={i} row={block.row} hl={hl} file={file} surface={surface ?? null} />
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
