import { useCallback, useMemo, useRef, useState } from 'react'
import { commentableLineSet, useHunks } from '@/app/hooks/use-hunks'
import { useGutterSelection } from '@/app/hooks/use-gutter-selection'
import type { AskStreamEvent, QaThread } from '@/lib/api'
import type { ComposerTarget } from '@/app/components/code-lines'
import type { ReviewDrafts } from '@/app/hooks/use-review-drafts'
import type { QaThreads } from '@/app/hooks/use-qa-threads'
import type { DiffSurface, DiffSurfaceComposer, ReviewSide } from '@/app/components/diff-surface'

interface Options {
  repo: string
  prNumber: number | undefined
  file: string
  headSha: string
  baseSha: string
  drafts: ReviewDrafts | undefined
  qa?: QaThreads | undefined
  chapterId?: string | undefined
}

/**
 * Bundles the state every DiffPane layout needs to render the comment-creation
 * flow: drafts for this file, the active composer + its side, selection +
 * locked-side, commentable-line sets per side, and stable callbacks for save /
 * cancel / update / reanchor / delete.
 *
 * Returns `null` when `drafts` is absent (e.g. read-only standalone view) so
 * callers can branch cheaply and skip rendering interactive affordances.
 */
export function useDiffSurface(opts: Options): DiffSurface | null {
  const { repo, prNumber, file, headSha, baseSha, drafts, qa, chapterId } = opts
  // Hooks must be called unconditionally — we use stable defaults and gate the
  // returned surface at the bottom of the function.
  const hunks = useHunks(repo, prNumber ?? 0, prNumber == null ? null : headSha)
  const [composer, setComposer] = useState<DiffSurfaceComposer | null>(null)
  const [selectionSide, setSelectionSide] = useState<ReviewSide | null>(null)
  const selectionSideRef = useRef<ReviewSide | null>(null)
  selectionSideRef.current = selectionSide

  const selection = useGutterSelection({
    onCommit: (range) => {
      const side = selectionSideRef.current
      if (side == null) return
      setComposer({ target: { startLine: range.startLine, endLine: range.endLine }, side })
    },
  })

  const fileDrafts = useMemo(
    () => (drafts ? drafts.drafts.filter((d) => d.file === file) : []),
    [drafts, file],
  )

  const fileHunks = hunks.kind === 'ready' ? hunks.response.files[file] : undefined
  const commentableLeft = useMemo(() => commentableLineSet(fileHunks, 'left'), [fileHunks])
  const commentableRight = useMemo(() => commentableLineSet(fileHunks, 'right'), [fileHunks])

  const onStartSelection = useCallback(
    (line: number, side: ReviewSide, shift: boolean) => {
      setSelectionSide(side)
      selectionSideRef.current = side
      selection.start(line, shift)
    },
    [selection],
  )

  const onExtendSelection = useCallback(
    (line: number, side: ReviewSide) => {
      if (selectionSideRef.current !== side) return
      selection.extend(line)
    },
    [selection],
  )

  const isSelectedOnSide = useCallback(
    (line: number, side: ReviewSide): boolean =>
      selectionSideRef.current === side && selection.isInRange(line),
    [selection],
  )

  const onCloseComposer = useCallback(() => {
    setComposer(null)
    selection.clear()
    setSelectionSide(null)
  }, [selection])

  const onSaveDraft = useCallback(
    async (target: ComposerTarget, side: ReviewSide, body: string) => {
      if (!drafts) return
      const lo = Math.min(target.startLine, target.endLine)
      const hi = Math.max(target.startLine, target.endLine)
      await drafts.add({
        file,
        line: hi,
        startLine: lo === hi ? null : lo,
        side,
        body,
      })
      setComposer(null)
      selection.clear()
      setSelectionSide(null)
    },
    [drafts, file, selection],
  )

  const onAskAiStream = useMemo(() => {
    if (!qa) return undefined
    return (
      input: { file: string; sha: string; startLine: number; endLine: number; question: string },
      onEvent: (e: AskStreamEvent) => void,
    ): Promise<QaThread> => qa.askStream({ ...input, chapterId: chapterId ?? null }, { onEvent })
  }, [qa, chapterId])

  if (!drafts) return null
  return {
    file,
    headSha,
    baseSha,
    fileDrafts,
    composer,
    commentableLeft,
    commentableRight,
    onStartSelection,
    onExtendSelection,
    isSelectedOnSide,
    onSaveDraft,
    onCloseComposer,
    onUpdateDraft: drafts.update,
    onReanchorDraft: drafts.reanchor,
    onDeleteDraft: drafts.remove,
    onAskAiStream,
  }
}
