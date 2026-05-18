import { CheckSquare, LayoutTemplate, Share2, Sparkles, Square, Workflow } from 'lucide-react'
import type { JSX } from 'react'
import { cn } from '@/app/lib/utils'
import type { ChapterCritique, TourChapter, TourStep } from '@/lib/api'
import type { ChapterNav } from '@/app/hooks/use-chapter-nav'

interface Props {
  chapter: TourChapter
  chapterIdx: number
  nav: ChapterNav
  expanded: boolean
  completed: boolean
  onToggle: () => void
  onToggleComplete: (chapterId: string) => void
}

export function ChapterRow({
  chapter,
  chapterIdx,
  nav,
  expanded,
  completed,
  onToggle,
  onToggleComplete,
}: Props): JSX.Element {
  return (
    <li className="border-border border-b last:border-b-0">
      <div className="hover:bg-surface-hover/40 flex w-full items-center gap-2 px-4 py-2 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
        >
          <span
            aria-hidden
            className={cn(
              'text-text-muted text-sm transition-transform',
              expanded ? 'rotate-90' : '',
            )}
          >
            ▸
          </span>
          <span className="text-text-muted text-[10px] tracking-wider uppercase">
            Ch {chapterIdx + 1}
          </span>
          <span
            className={cn(
              'truncate text-sm font-medium',
              completed ? 'text-text-secondary line-through' : 'text-text-primary',
            )}
          >
            {chapter.title}
          </span>
          {chapter.summary && (
            <span className="text-text-muted truncate text-xs">— {chapter.summary}</span>
          )}
        </button>
        <DiagramBadges steps={chapter.steps} />
        {chapter.critique && <AiFindingsBadge critique={chapter.critique} />}
        {chapter.critique && <CritiqueBadge critique={chapter.critique} />}
        <button
          type="button"
          onClick={() => onToggleComplete(chapter.id)}
          aria-pressed={completed}
          aria-label={completed ? 'Mark chapter incomplete' : 'Mark chapter complete'}
          className={cn(
            'flex shrink-0 items-center transition-colors',
            completed
              ? 'text-green-400 hover:text-green-300'
              : 'text-text-muted hover:text-text-primary',
          )}
        >
          {completed ? <CheckSquare size={14} aria-hidden /> : <Square size={14} aria-hidden />}
        </button>
      </div>
      {expanded && <StepList chapter={chapter} chapterIdx={chapterIdx} nav={nav} />}
    </li>
  )
}

function StepList({
  chapter,
  chapterIdx,
  nav,
}: {
  chapter: TourChapter
  chapterIdx: number
  nav: ChapterNav
}): JSX.Element {
  return (
    <ul className="pb-1.5">
      {chapter.steps.map((step, stepIdxInChapter) => {
        const flatEntry = nav.flat.find(
          (f) => f.chapterIdx === chapterIdx && f.stepIdxInChapter === stepIdxInChapter,
        )
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
                isActive
                  ? 'bg-surface-hover text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover',
              )}
            >
              <span
                className={cn(
                  'mr-2 inline-block w-2',
                  isActive ? 'text-text-brand' : 'text-text-muted',
                )}
              >
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
      <span aria-hidden>🚩</span> {critique.issues.length} · <span aria-hidden>💡</span>{' '}
      {critique.suggestions.length}
    </span>
  )
}

/**
 * Flags which diagram kinds a chapter contains — one small pill per distinct
 * kind so reviewers can scan the chapter list and spot mockups / state
 * machines / mermaid diagrams at a glance. Multiple steps of the same kind
 * collapse into one pill with a count suffix.
 */
function DiagramBadges({ steps }: { steps: TourStep[] }): JSX.Element {
  const counts = countDiagramKinds(steps)
  if (counts.mockup === 0 && counts.state === 0 && counts.mermaid === 0) return <></>
  return (
    <span className="flex shrink-0 items-center gap-1">
      {counts.mockup > 0 && (
        <DiagramBadge
          icon={<LayoutTemplate size={11} aria-hidden />}
          count={counts.mockup}
          title={`${counts.mockup} UI mockup${counts.mockup > 1 ? 's' : ''}`}
        />
      )}
      {counts.state > 0 && (
        <DiagramBadge
          icon={<Workflow size={11} aria-hidden />}
          count={counts.state}
          title={`${counts.state} state machine${counts.state > 1 ? 's' : ''}`}
        />
      )}
      {counts.mermaid > 0 && (
        <DiagramBadge
          icon={<Share2 size={11} aria-hidden />}
          count={counts.mermaid}
          title={`${counts.mermaid} diagram${counts.mermaid > 1 ? 's' : ''}`}
        />
      )}
    </span>
  )
}

function DiagramBadge({
  icon,
  count,
  title,
}: {
  icon: JSX.Element
  count: number
  title: string
}): JSX.Element {
  return (
    <span
      title={title}
      className="bg-surface text-text-secondary inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[11px]"
    >
      {icon}
      {count > 1 && <span>{count}</span>}
    </span>
  )
}

interface DiagramCounts {
  mockup: number
  state: number
  mermaid: number
}

function countDiagramKinds(steps: TourStep[]): DiagramCounts {
  const counts: DiagramCounts = { mockup: 0, state: 0, mermaid: 0 }
  for (const s of steps) {
    if (!s.diagram) continue
    if (s.diagram.kind === 'mockup') counts.mockup++
    else if (s.diagram.kind === 'state') counts.state++
    else counts.mermaid++
  }
  return counts
}

/**
 * Counts AI-surfaced critique entries (those carrying a `lens` field —
 * model-emitted in-tour critique leaves `lens` undefined). Shown only
 * when at least one AI-sourced item lives in this chapter's critique.
 */
function AiFindingsBadge({ critique }: { critique: ChapterCritique }): JSX.Element {
  const count =
    critique.issues.filter((i) => i.lens).length + critique.suggestions.filter((s) => s.lens).length
  if (count === 0) return <></>
  return (
    <span
      title={`${count} AI finding${count === 1 ? '' : 's'} in this chapter`}
      className="bg-surface text-text-secondary inline-flex shrink-0 items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-[11px]"
    >
      <Sparkles size={11} aria-hidden />
      {count > 1 && <span>{count}</span>}
    </span>
  )
}
