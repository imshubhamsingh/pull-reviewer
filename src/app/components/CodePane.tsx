import { match } from 'ts-pattern'
import { useState, type JSX, type ReactNode } from 'react'
import type { Highlighter } from 'shiki'
import { useFileSnapshot } from '@/app/hooks/useFileSnapshot'
import { useGutterSelection } from '@/app/hooks/useGutterSelection'
import { useShiki } from '@/app/hooks/useShiki'
import { chooseSha, findStepForRef, highlightWindow, inferLang } from '@/app/lib/code-utils'
import type { CodePointer, FileSnapshot, TourResult, TourStep } from '@/lib/api'
import { CodeHeader } from '@/app/components/CodeHeader'
import { CodeLines, type ComposerTarget } from '@/app/components/CodeLines'
import { References } from '@/app/components/References'
import type { QaThreads } from '@/app/hooks/useQaThreads'
import type { ReviewDrafts } from '@/app/hooks/useReviewDrafts'

interface Props {
  repo: string
  tour: TourResult
  step: TourStep
  drafts: ReviewDrafts
  qa: QaThreads
  onJumpToStep: (stepId: string) => void
}

export function CodePane({ repo, tour, step, drafts, qa, onJumpToStep }: Props): JSX.Element {
  const code = step.code
  const sha = chooseSha(tour, code?.side)
  const snapshot = useFileSnapshot(repo, sha, code?.file)
  const hl = useShiki()

  if (!code) return <EmptyPane>No file pinned for this step.</EmptyPane>

  return match(snapshot)
    .with({ kind: 'idle' }, () => <EmptyPane>No file selected.</EmptyPane>)
    .with({ kind: 'loading' }, () => <EmptyPane>Loading file…</EmptyPane>)
    .with({ kind: 'error' }, ({ message }) => <EmptyPane tone="danger">{message}</EmptyPane>)
    .with({ kind: 'ready' }, ({ snap }) => (
      <ReadyPane snap={snap} code={code} sha={sha} step={step} tour={tour} hl={hl} drafts={drafts} qa={qa} onJumpToStep={onJumpToStep} />
    ))
    .exhaustive()
}

interface ReadyPaneProps {
  snap: FileSnapshot
  code: CodePointer
  sha: string
  step: TourStep
  tour: TourResult
  hl: Highlighter | undefined
  drafts: ReviewDrafts
  qa: QaThreads
  onJumpToStep: (stepId: string) => void
}

function ReadyPane({ snap, code, sha, step, tour, hl, drafts, qa, onJumpToStep }: ReadyPaneProps): JSX.Element {
  const [composer, setComposer] = useState<ComposerTarget | null>(null)
  // Open the composer only on mouseup commit (after a drag / click finishes) so
  // a drag-select gesture doesn't get clobbered by a composer popping up on mousedown.
  const selection = useGutterSelection({
    onCommit: (range) => setComposer({ startLine: range.startLine, endLine: range.endLine }),
  })
  const fileDrafts = drafts.drafts.filter((d) => d.file === code.file)

  if (snap.encoding !== 'utf8' || !snap.content) {
    return <OmittedPane file={code.file} sha={sha} side={code.side} encoding={snap.encoding} size={snap.size} />
  }
  if (!hl) return <EmptyPane>Loading highlighter…</EmptyPane>
  const { focusLines, scrollTo, range } = highlightWindow(code)
  const reviewSide = code.side === 'before' ? 'before' : 'after'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CodeHeader file={code.file} sha={sha} side={code.side} />
      <CodeLines
        highlighter={hl}
        content={snap.content}
        lang={inferLang(code.file)}
        file={code.file}
        sha={sha}
        focusLines={focusLines}
        scrollTo={scrollTo}
        range={range}
        drafts={fileDrafts}
        composer={composer}
        selection={selection}
        onCloseComposer={() => { setComposer(null); selection.clear() }}
        onAskAiStream={(input, onEvent) => qa.askStream(input, { onEvent })}
        onSaveDraft={async (target, body) => {
          const lo = Math.min(target.startLine, target.endLine)
          const hi = Math.max(target.startLine, target.endLine)
          await drafts.add({
            file: code.file,
            line: hi,
            startLine: lo === hi ? null : lo,
            side: reviewSide,
            body,
          })
          setComposer(null)
          selection.clear()
        }}
        onUpdateDraft={drafts.update}
        onDeleteDraft={drafts.remove}
      />
      {step.references?.length ? (
        <References
          refs={step.references}
          isJumpable={(ref) => findStepForRef(tour, ref) != null}
          onClick={(ref) => {
            const target = findStepForRef(tour, ref)
            if (target) onJumpToStep(target.id)
          }}
        />
      ) : null}
    </div>
  )
}

function OmittedPane({ file, sha, side, encoding, size }: { file: string; sha: string; side: CodePointer['side']; encoding: string; size: number }): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <CodeHeader file={file} sha={sha} side={side} />
      <div className="text-text-muted flex flex-1 items-center justify-center p-6 text-center text-xs">
        File omitted ({encoding}, {size} bytes).
      </div>
    </div>
  )
}

function EmptyPane({ children, tone }: { children: ReactNode; tone?: 'danger' }): JSX.Element {
  return (
    <div className={`flex h-full items-center justify-center p-6 text-center text-xs ${tone === 'danger' ? 'text-text-danger' : 'text-text-muted'}`}>
      {children}
    </div>
  )
}
