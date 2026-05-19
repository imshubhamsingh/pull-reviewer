import { match } from 'ts-pattern'
import type { JSX } from 'react'
import type { ReviewDraft } from '@/lib/api'
import { DraftRow } from '@/app/components/draft-row'
import { LineComposer } from '@/app/components/line-composer'
import type { DiffSurface, DiffSurfaceComposer, ReviewSide } from '@/app/components/diff-surface'
import type { Block } from '@/app/components/diff-blocks'

/**
 * Full-width band rendered between diff rows when there are drafts anchored at
 * the row above OR the composer is open there. Picks the right SHA per side
 * (base for `before`, head for `after`) so the Ask AI context reads the
 * correct revision.
 */
export function DiffCommentBlock({
  block,
  surface,
  file,
}: {
  block: Exclude<Block, { kind: 'row' }>
  surface: DiffSurface
  file: string
}): JSX.Element {
  return match(block)
    .with({ kind: 'drafts' }, (b) => (
      <DraftsBlock drafts={b.drafts} side={b.side} surface={surface} file={file} />
    ))
    .with({ kind: 'composer' }, (b) => (
      <ComposerBlock composer={b.composer} surface={surface} file={file} />
    ))
    .exhaustive()
}

function DraftsBlock({
  drafts,
  side,
  surface,
  file,
}: {
  drafts: ReviewDraft[]
  side: ReviewSide
  surface: DiffSurface
  file: string
}): JSX.Element {
  const sha = side === 'before' ? surface.baseSha : surface.headSha
  return (
    <>
      {drafts.map((d) => (
        <DraftRow
          key={d.id}
          draft={d}
          file={file}
          sha={sha}
          onUpdate={surface.onUpdateDraft}
          onReanchor={surface.onReanchorDraft}
          onDelete={surface.onDeleteDraft}
          onAskAiStream={surface.onAskAiStream}
        />
      ))}
    </>
  )
}

function ComposerBlock({
  composer,
  surface,
  file,
}: {
  composer: DiffSurfaceComposer
  surface: DiffSurface
  file: string
}): JSX.Element {
  const sha = composer.side === 'before' ? surface.baseSha : surface.headSha
  const lo = Math.min(composer.target.startLine, composer.target.endLine)
  const hi = Math.max(composer.target.startLine, composer.target.endLine)
  const rangeLabel = lo === hi ? `line ${lo}` : `lines ${lo}–${hi}`
  return (
    <LineComposer
      rangeLabel={rangeLabel}
      askContext={surface.onAskAiStream ? { file, sha, startLine: lo, endLine: hi } : undefined}
      onAskStream={
        surface.onAskAiStream
          ? (question, onEvent) =>
              surface.onAskAiStream!({ file, sha, startLine: lo, endLine: hi, question }, onEvent)
          : undefined
      }
      onSave={(body) => surface.onSaveDraft(composer.target, composer.side, body)}
      onCancel={surface.onCloseComposer}
    />
  )
}
