import { match } from 'ts-pattern'
import type { ReviewDraft } from '@/lib/api'
import type { DiffLine } from '@/app/lib/diff-lines'
import type { DiffSurfaceComposer, ReviewSide } from '@/app/components/diff-surface'

/**
 * Output of `interleave` — flat list of either a diff row OR a full-width
 * block (drafts / composer) anchored after a row.
 */
export type Block =
  | { kind: 'row'; row: DiffLine; index: number }
  | { kind: 'drafts'; drafts: ReviewDraft[]; side: ReviewSide }
  | { kind: 'composer'; composer: DiffSurfaceComposer }

/**
 * Walk rows once, emitting Block entries. Drafts attach AFTER the row whose
 * `(side, line)` matches `draft.side` + `draft.line` (end-line of the
 * range — GitHub convention; mirrors `code-lines.tsx`). The composer
 * attaches AFTER the row whose `(side, max(start, end))` matches.
 *
 * `anchorsFor(row)` returns every `(side, line)` the row carries — split
 * view emits both base + head anchors per row; unified view emits one
 * (whichever side the layout rule selected).
 */
export function interleave(
  rows: DiffLine[],
  fileDrafts: ReviewDraft[],
  composer: DiffSurfaceComposer | null,
  anchorsFor: (row: DiffLine) => Array<{ side: ReviewSide; line: number }>,
): Block[] {
  const draftsByAnchor = new Map<string, ReviewDraft[]>()
  for (const d of fileDrafts) {
    const key = anchorKey(d.side, d.line)
    const list = draftsByAnchor.get(key)
    if (list) list.push(d)
    else draftsByAnchor.set(key, [d])
  }
  const composerKey = composer
    ? anchorKey(composer.side, Math.max(composer.target.startLine, composer.target.endLine))
    : null

  const out: Block[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    out.push({ kind: 'row', row, index: i })
    for (const a of anchorsFor(row)) {
      const key = anchorKey(a.side, a.line)
      const matching = draftsByAnchor.get(key)
      if (matching) {
        out.push({ kind: 'drafts', drafts: matching, side: a.side })
        draftsByAnchor.delete(key)
      }
      if (composer && key === composerKey) {
        out.push({ kind: 'composer', composer })
      }
    }
  }
  return out
}

/**
 * Unified rule (locked, 2026-05-19): `add`→after, `del`→before, `eq`→after.
 * Context lines anchor to the head side per GitHub's convention.
 */
export function sideOfUnifiedRow(row: DiffLine): ReviewSide {
  return match(row.kind)
    .with('add', () => 'after' as const)
    .with('del', () => 'before' as const)
    .with('eq', () => 'after' as const)
    .exhaustive()
}

export function lineOfUnifiedRow(row: DiffLine): number | null {
  return match(row.kind)
    .with('add', () => row.headLine ?? null)
    .with('del', () => row.baseLine ?? null)
    .with('eq', () => row.headLine ?? null)
    .exhaustive()
}

export function anchorsForSplitRow(row: DiffLine): Array<{ side: ReviewSide; line: number }> {
  const out: Array<{ side: ReviewSide; line: number }> = []
  if (row.baseLine != null) out.push({ side: 'before', line: row.baseLine })
  if (row.headLine != null) out.push({ side: 'after', line: row.headLine })
  return out
}

export function anchorsForUnifiedRow(row: DiffLine): Array<{ side: ReviewSide; line: number }> {
  const line = lineOfUnifiedRow(row)
  return line == null ? [] : [{ side: sideOfUnifiedRow(row), line }]
}

function anchorKey(side: ReviewSide, line: number): string {
  return `${side}:${line}`
}
