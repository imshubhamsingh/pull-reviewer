import { useEffect, useState, type JSX } from 'react'
import type { TourChapter, TourResult } from '@/lib/api'
import type { ChapterNav } from '@/app/hooks/useChapterNav'
import type { ReviewDrafts } from '@/app/hooks/useReviewDrafts'
import { ChapterRow } from '@/app/components/ChapterRow'
import { SubmitReviewButton } from '@/app/components/SubmitReviewButton'

interface Props {
  chapters: TourChapter[]
  nav: ChapterNav
  tour: TourResult
  drafts: ReviewDrafts
  onRegenerate: () => void
}

export function ChapterStepper({ chapters, nav, tour, drafts, onRegenerate }: Props): JSX.Element {
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
            onToggle={() => toggle(i)}
          />
        ))}
      </ul>
      <NavBar nav={nav} tour={tour} drafts={drafts} onRegenerate={onRegenerate} />
    </div>
  )
}

interface NavBarProps {
  nav: ChapterNav
  tour: TourResult
  drafts: ReviewDrafts
  onRegenerate: () => void
}

function NavBar({ nav, tour, drafts, onRegenerate }: NavBarProps): JSX.Element {
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
      </p>
      <div className="flex items-center gap-3">
        <SubmitReviewButton tour={tour} drafts={drafts} />
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
