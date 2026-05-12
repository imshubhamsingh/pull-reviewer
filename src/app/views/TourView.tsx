import { match } from 'ts-pattern'
import type { JSX, ReactNode } from 'react'
import { useTour } from '@/app/hooks/useTour'
import { useChapterNav } from '@/app/hooks/useChapterNav'
import { ChapterStepper } from '@/app/components/ChapterStepper'
import { CodePane } from '@/app/components/CodePane'
import { DiagramPane } from '@/app/components/DiagramPane'
import { DocsPane } from '@/app/components/DocsPane'
import { GeneratingPanel } from '@/app/components/GeneratingPanel'
import { StaleBanner } from '@/app/components/StaleBanner'
import type { TourResult, TourStep } from '@/lib/api'

interface Props {
  repo: string
  prNumber: number
  onBack: () => void
}

export function TourView({ repo, prNumber, onBack }: Props): JSX.Element {
  const { state, regenerate } = useTour(repo, prNumber)
  return (
    <div className="flex h-full flex-col">
      <Header repo={repo} prNumber={prNumber} onBack={onBack} />
      <div className="min-h-0 flex-1">
        {match(state)
          .with({ kind: 'loading' }, () => <CenterMessage>Loading…</CenterMessage>)
          .with({ kind: 'generating' }, ({ events }) => <GeneratingPanel events={events} />)
          .with({ kind: 'error' }, ({ message }) => <CenterMessage tone="danger">{message}</CenterMessage>)
          .with({ kind: 'ready' }, ({ tour }) => (
            <ReadyView repo={repo} tour={tour} onRegenerate={regenerate} onBack={onBack} />
          ))
          .exhaustive()}
      </div>
    </div>
  )
}

interface ReadyProps {
  repo: string
  tour: TourResult
  onRegenerate: () => void
  onBack: () => void
}

function ReadyView({ repo, tour, onRegenerate, onBack }: ReadyProps): JSX.Element {
  const nav = useChapterNav(tour.chapters, { onRegenerate, onEscape: onBack })
  const isStale = tour.headRefOid !== tour.currentHeadRefOid
  const jumpToStep = (stepId: string) => {
    const idx = nav.flat.findIndex((f) => f.step.id === stepId)
    if (idx >= 0) nav.goTo(idx)
  }
  return (
    <div className="flex h-full flex-col">
      {isStale && (
        <div className="px-4 pt-3">
          <StaleBanner
            generatedFor={tour.headRefOid}
            currentHead={tour.currentHeadRefOid}
            onRegenerate={onRegenerate}
          />
        </div>
      )}
      <div className="bg-border grid min-h-0 flex-1 grid-cols-[1fr_2fr_1fr] gap-px">
        <Section title="Docs">
          {nav.current
            ? <DocsPane step={nav.current.step} />
            : <CenterMessage>No step selected.</CenterMessage>}
        </Section>
        <Section title="Code / Diagram">
          {nav.current
            ? renderCenter(nav.current.step, repo, tour, jumpToStep)
            : <PlaceholderPane>No step.</PlaceholderPane>}
        </Section>
        <Section title="Map">
          <PlaceholderPane>File map lands in Phase 10.</PlaceholderPane>
        </Section>
      </div>
      <ChapterStepper chapters={tour.chapters} nav={nav} onRegenerate={onRegenerate} />
    </div>
  )
}

function renderCenter(step: TourStep, repo: string, tour: TourResult, onJumpToStep: (id: string) => void): JSX.Element {
  return match(step.panel)
    .with('code', () => <CodePane repo={repo} tour={tour} step={step} onJumpToStep={onJumpToStep} />)
    .with('diagram', () => <DiagramPane step={step} />)
    .with('code-map', () => <PlaceholderPane>Code map lands in Phase 10.</PlaceholderPane>)
    .with('docs', () => <PlaceholderPane>This step is docs-only.</PlaceholderPane>)
    .exhaustive()
}

function Header({ repo, prNumber, onBack }: { repo: string; prNumber: number; onBack: () => void }): JSX.Element {
  return (
    <header className="border-border bg-surface flex items-center justify-between border-b px-4 py-2">
      <button
        type="button"
        onClick={onBack}
        className="text-text-secondary hover:text-text-primary text-sm transition-colors"
      >
        ← back
      </button>
      <h1 className="text-text-primary text-sm font-medium">{repo} #{prNumber}</h1>
      <span aria-hidden className="w-12" />
    </header>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="bg-bg flex min-h-0 min-w-0 flex-col">
      <div className="border-border text-text-muted border-b px-3 py-1 text-[10px] tracking-wider uppercase">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  )
}

function PlaceholderPane({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="text-text-muted flex h-full items-center justify-center p-4 text-center text-xs">
      {children}
    </div>
  )
}

function CenterMessage({ children, tone }: { children: ReactNode; tone?: 'danger' }): JSX.Element {
  return (
    <div className={`flex h-full items-center justify-center p-6 text-sm ${tone === 'danger' ? 'text-text-danger' : 'text-text-secondary'}`}>
      {children}
    </div>
  )
}
