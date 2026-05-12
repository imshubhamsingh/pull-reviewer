import { useState, type JSX } from 'react'
import type { TourChapter } from '@/lib/api'
import type { ChapterNav } from '@/app/hooks/useChapterNav'
import { ChapterRow } from '@/app/components/ChapterRow'

interface Props {
  chapters: TourChapter[]
  nav: ChapterNav
  onRegenerate: () => void
}

export function ChapterStepper({ chapters, nav, onRegenerate }: Props): JSX.Element {
  const [openCritique, setOpenCritique] = useState<number | null>(null)
  return (
    <div className="border-border bg-bg flex flex-col border-t">
      <ul className="max-h-64 overflow-y-auto">
        {chapters.map((chapter, i) => (
          <ChapterRow
            key={chapter.id}
            chapter={chapter}
            chapterIdx={i}
            nav={nav}
            critiqueOpen={openCritique === i}
            onToggleCritique={() => setOpenCritique(openCritique === i ? null : i)}
          />
        ))}
      </ul>
      <NavBar nav={nav} onRegenerate={onRegenerate} />
    </div>
  )
}

function NavBar({ nav, onRegenerate }: { nav: ChapterNav; onRegenerate: () => void }): JSX.Element {
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
      <button
        type="button"
        onClick={onRegenerate}
        className="text-text-secondary hover:text-text-primary text-xs transition-colors"
      >
        ⟳ regenerate
      </button>
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
