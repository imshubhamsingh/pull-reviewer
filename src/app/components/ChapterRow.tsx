import type { JSX } from 'react'
import { cn } from '@/app/lib/utils'
import type { ChapterCritique, TourChapter } from '@/lib/api'
import type { ChapterNav } from '@/app/hooks/useChapterNav'

interface Props {
  chapter: TourChapter
  chapterIdx: number
  nav: ChapterNav
  expanded: boolean
  onToggle: () => void
}

export function ChapterRow({ chapter, chapterIdx, nav, expanded, onToggle }: Props): JSX.Element {
  return (
    <li className="border-border border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="hover:bg-surface-hover/40 flex w-full items-center justify-between gap-2 px-4 py-2 text-left transition-colors"
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span aria-hidden className={cn('text-text-muted text-[10px] transition-transform', expanded ? 'rotate-90' : '')}>▸</span>
          <span className="text-text-muted text-[10px] tracking-wider uppercase">Ch {chapterIdx + 1}</span>
          <span className="text-text-primary truncate text-sm font-medium">{chapter.title}</span>
          {chapter.summary && <span className="text-text-muted truncate text-xs">— {chapter.summary}</span>}
        </div>
        {chapter.critique && <CritiqueBadge critique={chapter.critique} />}
      </button>
      {expanded && <StepList chapter={chapter} chapterIdx={chapterIdx} nav={nav} />}
    </li>
  )
}

function StepList({ chapter, chapterIdx, nav }: { chapter: TourChapter; chapterIdx: number; nav: ChapterNav }): JSX.Element {
  return (
    <ul className="pb-1.5">
      {chapter.steps.map((step, stepIdxInChapter) => {
        const flatEntry = nav.flat.find((f) => f.chapterIdx === chapterIdx && f.stepIdxInChapter === stepIdxInChapter)
        if (!flatEntry) return null
        const globalIdx = nav.flat.indexOf(flatEntry)
        const isActive = nav.globalIdx === globalIdx
        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => nav.goTo(globalIdx)}
              className={cn(
                'block w-full px-6 py-1 text-left text-xs transition-colors',
                isActive ? 'bg-surface-hover text-text-primary' : 'text-text-secondary hover:bg-surface-hover',
              )}
            >
              <span className={cn('mr-2 inline-block w-2', isActive ? 'text-text-brand' : 'text-text-muted')}>
                {isActive ? '●' : '○'}
              </span>
              {step.title}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function CritiqueBadge({ critique }: { critique: ChapterCritique }): JSX.Element {
  if (critique.issues.length === 0 && critique.suggestions.length === 0) return <></>
  return (
    <span className="bg-surface text-text-secondary shrink-0 rounded-sm px-2 py-0.5 text-[11px]">
      <span aria-hidden>🚩</span> {critique.issues.length} · <span aria-hidden>💡</span> {critique.suggestions.length}
    </span>
  )
}
