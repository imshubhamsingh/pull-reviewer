import type { AskStreamEvent, QaThread, ReviewDraft } from '@/lib/api'
import type { ComposerTarget } from '@/app/components/code-lines'

export type ReviewSide = 'before' | 'after'

export interface DiffSurfaceComposer {
  target: ComposerTarget
  side: ReviewSide
}

/**
 * Everything `DiffColumns` / `UnifiedDiff` need to render the
 * comment-creation flow. Owned by `useDiffSurface` and passed through as a
 * single bag so the layout components don't take a dozen props each.
 */
export interface DiffSurface {
  file: string
  /** SHA the head side was loaded against. Used for the `after` Ask AI context. */
  headSha: string
  /** SHA the base side was resolved to. Used for the `before` Ask AI context. */
  baseSha: string
  fileDrafts: ReviewDraft[]
  composer: DiffSurfaceComposer | null
  commentableLeft: Set<number>
  commentableRight: Set<number>
  /** Begin a selection on the given side. Side is captured so subsequent
   *  `extend` calls from the opposite column can be ignored. */
  onStartSelection: (line: number, side: ReviewSide, shift: boolean) => void
  /** Extend the active selection. Ignored if the active side differs (split
   *  view's cross-column lock). */
  onExtendSelection: (line: number, side: ReviewSide) => void
  /** True when the given (line, side) is part of the active selection. */
  isSelectedOnSide: (line: number, side: ReviewSide) => boolean
  onSaveDraft: (target: ComposerTarget, side: ReviewSide, body: string) => Promise<void>
  onCloseComposer: () => void
  onUpdateDraft: (id: number, body: string) => Promise<void>
  onReanchorDraft: (id: number, line: number, startLine: number | null) => Promise<void>
  onDeleteDraft: (id: number) => Promise<void>
  onAskAiStream?: (
    input: { file: string; sha: string; startLine: number; endLine: number; question: string },
    onEvent: (e: AskStreamEvent) => void,
  ) => Promise<QaThread>
}
