import { marked } from 'marked'
import { useMemo, type JSX } from 'react'
import { CritiqueCallout } from '@/app/components/critique-callout'
import { PrShapeCallout } from '@/app/components/pr-shape-callout'
import { QaThreadCard } from '@/app/components/qa-thread-card'
import { linkify } from '@/app/lib/docs-linkify'
import type { CodePointer, PrShape, QaThread, TourChapter, TourStep } from '@/lib/api'

interface Props {
  step: TourStep
  chapter: TourChapter
  /** Q&A threads for the current step's file, in order. */
  qaThreads: QaThread[]
  /** Every changed file in the tour — used as an additional linkify source so any backticked file basename becomes clickable. */
  tourFilePaths: string[]
  /** Top-of-tour PR-shape summary. Passed only for the first chapter; absent
   * elsewhere so it doesn't repeat across the walkthrough. */
  prShape?: PrShape
  onDeleteQa: (id: number) => Promise<void>
  /** Click on a linkified identifier in the body. Receives the pointer it resolved to. */
  onJumpToRef?: (ref: CodePointer) => void
  /** Click on a critique row's file-meta link. Resolves through the same
   * `jumpToFinding` pipeline as the right-pane Review tab — jumps to the
   * file:line AND auto-expands the inline ✨ AI card on that line. */
  onJumpToFinding?: (findingId: string, code: CodePointer) => void
}

/**
 * Renders a step's narration plus its chapter critique, plus the Q&A threads
 * anchored to this step's file. Body markdown is produced by our zod-validated
 * prompt; identifiers that match an entry in `step.references[]` get wrapped
 * as `.doc-link` anchors so the reviewer can jump to the file that defines them.
 */
export function DocsPane({
  step,
  chapter,
  qaThreads,
  tourFilePaths,
  prShape,
  onDeleteQa,
  onJumpToRef,
  onJumpToFinding,
}: Props): JSX.Element {
  const { html, pointers } = useMemo(() => {
    const raw = marked.parse(step.body, { async: false }) as string
    return linkify(raw, { refs: step.references, filePaths: tourFilePaths })
  }, [step.body, step.references, tourFilePaths])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onJumpToRef) return
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.doc-link')
    if (!link) return
    e.preventDefault()
    const idx = Number(link.dataset.refIdx)
    const ref = pointers[idx]
    if (ref) onJumpToRef(ref)
  }

  return (
    <article className="markdown h-full overflow-y-auto p-5">
      <h2 className="text-text-primary mb-3 text-xl font-semibold">{step.title}</h2>
      <div
        className="text-text-secondary text-sm leading-relaxed"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {chapter.critique && (
        <CritiqueCallout critique={chapter.critique} onJumpToFinding={onJumpToFinding} />
      )}
      {prShape && <PrShapeCallout shape={prShape} className="mt-4" />}
      {qaThreads.length > 0 && (
        <div className="mt-2">
          {qaThreads.map((t) => (
            <QaThreadCard key={t.id} thread={t} onDelete={onDeleteQa} />
          ))}
        </div>
      )}
    </article>
  )
}
