import { useEffect, useMemo, useState, type JSX } from 'react'
import type { TourChapter, TourResult } from '@/lib/api'
import type { ChapterCompletionsState } from '@/app/hooks/useChapterCompletions'
import type { ChapterNav } from '@/app/hooks/useChapterNav'
import type { FileCoverage } from '@/app/hooks/useFileCoverage'
import type { FileReviewsState } from '@/app/hooks/useFileReviews'
import type { ReviewDrafts } from '@/app/hooks/useReviewDrafts'
import { ChapterRow } from '@/app/components/ChapterRow'
import { SubmitReviewButton } from '@/app/components/SubmitReviewButton'

interface Props {
  chapters: TourChapter[]
  nav: ChapterNav
  tour: TourResult
  drafts: ReviewDrafts
  onRegenerate: () => void
  repo: string
  completions: ChapterCompletionsState
  fileReviews: FileReviewsState
  coverage: FileCoverage
}

export function ChapterStepper({
  chapters,
  nav,
  tour,
  drafts,
  onRegenerate,
  repo,
  completions,
  fileReviews,
  coverage,
}: Props): JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]))
  const activeChapter = nav.current?.chapterIdx

  useEffect(() => {
    if (activeChapter == null) return
    setExpanded((prev) => prev.has(activeChapter) ? prev : new Set([...prev, activeChapter]))
  }, [activeChapter])

  const toggle = (idx: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  /**
   * Marking-or-unmarking a chapter. The unmark path does NOT cascade — file
   * reviews are preserved so the user keeps their explicit progress even when
   * they revisit a chapter. The mark path bulk-ticks the chapter's pinned
   * files and auto-advances to the next chapter's first step.
   */
  const handleToggleChapter = async (chapterId: string): Promise<void> => {
    const wasComplete = completions.isComplete(chapterId)
    await completions.toggle(chapterId)
    if (wasComplete) return // un-marking: no cascade, no advance
    const chapterIdx = chapters.findIndex((c) => c.id === chapterId)
    if (chapterIdx < 0) return
    const pinned = coverage.pinnedFilesIn(chapterIdx)
    if (pinned.length > 0) await fileReviews.markMany(pinned)
    const firstStepOfNext = nav.flat.findIndex((f) => f.chapterIdx === chapterIdx + 1)
    if (firstStepOfNext >= 0) nav.goTo(firstStepOfNext)
  }

  const completedCount = useMemo(
    () => chapters.filter((c) => completions.isComplete(c.id)).length,
    [chapters, completions],
  )
  const reviewedCount = useMemo(
    () => tour.files.filter((f) => fileReviews.isReviewed(f.path)).length,
    [tour.files, fileReviews],
  )

  return (
    <div className="border-border bg-bg flex flex-col border-t">
      <ul className="max-h-64 overflow-y-auto">
        {chapters.map((chapter, i) => (
          <ChapterRow
            key={chapter.id}
            chapter={chapter}
            chapterIdx={i}
            nav={nav}
            expanded={expanded.has(i)}
            completed={completions.isComplete(chapter.id)}
            onToggle={() => toggle(i)}
            onToggleComplete={(id) => { handleToggleChapter(id) }}
          />
        ))}
      </ul>
      <NavBar
        nav={nav}
        tour={tour}
        drafts={drafts}
        onRegenerate={onRegenerate}
        repo={repo}
        completedChapters={completedCount}
        totalChapters={chapters.length}
        reviewedFiles={reviewedCount}
        totalFiles={tour.files.length}
      />
    </div>
  )
}

interface NavBarProps {
  nav: ChapterNav
  tour: TourResult
  drafts: ReviewDrafts
  onRegenerate: () => void
  repo: string
  completedChapters: number
  totalChapters: number
  reviewedFiles: number
  totalFiles: number
}

function NavBar({
  nav,
  tour,
  drafts,
  onRegenerate,
  repo,
  completedChapters,
  totalChapters,
  reviewedFiles,
  totalFiles,
}: NavBarProps): JSX.Element {
  return (
    <div className="border-border bg-surface flex items-center justify-between gap-4 border-t px-4 py-2">
      <div className="flex gap-2">
        <NavButton onClick={nav.prev} disabled={nav.globalIdx === 0}>◀ prev</NavButton>
        <NavButton onClick={nav.next} disabled={nav.globalIdx >= nav.total - 1}>next ▶</NavButton>
      </div>
      <p className="text-text-secondary text-xs">
        Step {nav.globalIdx + 1}/{nav.total}
        {nav.current && (
          <span className="text-text-muted ml-2">
            (Chapter {nav.current.chapterIdx + 1}: {nav.current.chapter.title})
          </span>
        )}
        <span className="text-text-muted ml-2">
          · {completedChapters}/{totalChapters} chapters · {reviewedFiles}/{totalFiles} files reviewed
        </span>
      </p>
      <div className="flex items-center gap-3">
        <SubmitReviewButton repo={repo} tour={tour} drafts={drafts} />
        <button
          type="button"
          onClick={onRegenerate}
          className="text-text-secondary hover:text-text-primary text-xs transition-colors"
        >
          ⟳ regenerate
        </button>
      </div>
    </div>
  )
}

function NavButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-interactive-secondary hover:bg-interactive-secondary-hover text-text-primary rounded-sm px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}
