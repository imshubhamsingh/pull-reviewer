import { useMemo, useRef, type JSX } from 'react'
import { match } from 'ts-pattern'
import type { useShiki } from '@/app/hooks/use-shiki'
import type { DiffLine } from '@/app/lib/diff-lines'
import { DiffCommentBlock } from '@/app/components/diff-comment-block'
import { DiffSideRow } from '@/app/components/diff-side-row'
import { anchorsForSplitRow, interleave, type Block } from '@/app/components/diff-blocks'
import type { DiffSurface } from '@/app/components/diff-surface'

/**
 * Two parallel columns (base / head) chunked into bands. Each "rows" band is
 * a side-by-side pair with its own horizontal-scroll mirror; comment bands
 * (drafts or composer) render between row bands, confined to the column
 * matching the comment's side — base-side comments land in the left half,
 * head-side in the right, the opposite half stays blank to preserve row
 * alignment. Cross-band horizontal scroll is not synced — the comment band
 * breaks the side-by-side flow anyway, which is the desired UX.
 *
 * Without `surface`, the bands chunker has no drafts or composer to inject,
 * so the layout degrades to a single rows band identical to the previous
 * read-only version.
 */
export function DiffColumns({
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
  const bands = useMemo(() => chunkIntoBands(buildBlocks(rows, surface)), [rows, surface])
  return (
    <div className="bg-bg min-h-0 flex-1 overflow-y-auto font-mono text-xs">
      {children}
      {bands.map((band, bi) =>
        match(band)
          .with({ kind: 'rows' }, (b) => (
            <TwoColumnBand key={bi} rows={b.rows} hl={hl} file={file} surface={surface ?? null} />
          ))
          .with({ kind: 'full' }, (b) =>
            surface ? (
              <SplitCommentBand key={bi} block={b.block} surface={surface} file={file} />
            ) : null,
          )
          .exhaustive(),
      )}
    </div>
  )
}

function buildBlocks(rows: DiffLine[], surface: DiffSurface | null | undefined): Block[] {
  if (!surface) return rows.map((row, index) => ({ kind: 'row', row, index }))
  return interleave(rows, surface.fileDrafts, surface.composer, anchorsForSplitRow)
}

/**
 * Confines a comment band (drafts or composer) to the column matching its
 * side: `before` lands in the base (left) half, `after` in the head (right)
 * half. The opposite half stays empty so subsequent row bands keep their
 * left/right alignment.
 */
function SplitCommentBand({
  block,
  surface,
  file,
}: {
  block: Exclude<Block, { kind: 'row' }>
  surface: DiffSurface
  file: string
}): JSX.Element {
  const side = block.kind === 'drafts' ? block.side : block.composer.side
  return (
    <div className="flex">
      <div className="border-border min-w-0 flex-1 border-r">
        {side === 'before' ? (
          <DiffCommentBlock block={block} surface={surface} file={file} />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        {side === 'after' ? <DiffCommentBlock block={block} surface={surface} file={file} /> : null}
      </div>
    </div>
  )
}

type Band =
  | { kind: 'rows'; rows: Array<{ row: DiffLine; index: number }> }
  | { kind: 'full'; block: Exclude<Block, { kind: 'row' }> }

function chunkIntoBands(blocks: Block[]): Band[] {
  const out: Band[] = []
  let pending: Array<{ row: DiffLine; index: number }> = []
  for (const b of blocks) {
    if (b.kind === 'row') {
      pending.push({ row: b.row, index: b.index })
    } else {
      if (pending.length > 0) {
        out.push({ kind: 'rows', rows: pending })
        pending = []
      }
      out.push({ kind: 'full', block: b })
    }
  }
  if (pending.length > 0) out.push({ kind: 'rows', rows: pending })
  return out
}

function TwoColumnBand({
  rows,
  hl,
  file,
  surface,
}: {
  rows: Array<{ row: DiffLine; index: number }>
  hl: ReturnType<typeof useShiki>
  file: string
  surface: DiffSurface | null
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
      queueMicrotask(() => {
        syncingRef.current = false
      })
    }
  return (
    <div className="flex">
      <div
        ref={leftRef}
        onScroll={mirrorScroll(rightRef)}
        className="border-border min-w-0 flex-1 overflow-x-auto border-r"
      >
        {rows.map(({ row, index }) => (
          <DiffSideRow key={index} column="base" row={row} hl={hl} file={file} surface={surface} />
        ))}
      </div>
      <div
        ref={rightRef}
        onScroll={mirrorScroll(leftRef)}
        className="min-w-0 flex-1 overflow-x-auto"
      >
        {rows.map(({ row, index }) => (
          <DiffSideRow key={index} column="head" row={row} hl={hl} file={file} surface={surface} />
        ))}
      </div>
    </div>
  )
}
