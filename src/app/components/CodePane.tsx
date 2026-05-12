import { match } from 'ts-pattern'
import { useState, type JSX, type ReactNode } from 'react'
import type { Highlighter } from 'shiki'
import { useFileSnapshot } from '@/app/hooks/useFileSnapshot'
import { useShiki } from '@/app/hooks/useShiki'
import { chooseSha, findStepForRef, highlightWindow, inferLang } from '@/app/lib/code-utils'
import type { CodePointer, FileSnapshot, TourResult, TourStep } from '@/lib/api'
import { CodeHeader } from '@/app/components/CodeHeader'
import { CodeLines } from '@/app/components/CodeLines'
import { References } from '@/app/components/References'
import type { ReviewDrafts } from '@/app/hooks/useReviewDrafts'

interface Props {
  repo: string
  tour: TourResult
  step: TourStep
  drafts: ReviewDrafts
  onJumpToStep: (stepId: string) => void
}

export function CodePane({ repo, tour, step, drafts, onJumpToStep }: Props): JSX.Element {
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
      <ReadyPane snap={snap} code={code} sha={sha} step={step} tour={tour} hl={hl} drafts={drafts} onJumpToStep={onJumpToStep} />
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
  onJumpToStep: (stepId: string) => void
}

function ReadyPane({ snap, code, sha, step, tour, hl, drafts, onJumpToStep }: ReadyPaneProps): JSX.Element {
  const [composerLine, setComposerLine] = useState<number | null>(null)
  const fileDrafts = drafts.drafts.filter((d) => d.file === code.file)

  if (snap.encoding !== 'utf8' || !snap.content) {
    return <OmittedPane file={code.file} sha={sha} side={code.side} encoding={snap.encoding} size={snap.size} />
  }
  if (!hl) return <EmptyPane>Loading highlighter…</EmptyPane>
  const { focus, range } = highlightWindow(code)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CodeHeader file={code.file} sha={sha} side={code.side} />
      <CodeLines
        highlighter={hl}
        content={snap.content}
        lang={inferLang(code.file)}
        focus={focus}
        range={range}
        drafts={fileDrafts}
        composerLine={composerLine}
        onOpenComposer={(line) => setComposerLine(line)}
        onCloseComposer={() => setComposerLine(null)}
        onSaveDraft={async (line, body) => {
          // 'diff' isn't a real review side on GitHub — coerce to 'after'.
          const reviewSide = code.side === 'before' ? 'before' : 'after'
          await drafts.add({ file: code.file, line, side: reviewSide, body })
          setComposerLine(null)
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
