import { match } from 'ts-pattern'
import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { useTour } from '@/app/hooks/useTour'
import { useChapterCompletions } from '@/app/hooks/useChapterCompletions'
import { useChapterNav } from '@/app/hooks/useChapterNav'
import { useFileCoverage, type FileCoverage } from '@/app/hooks/useFileCoverage'
import { useFileReviews } from '@/app/hooks/useFileReviews'
import { useQaThreads, type QaThreads } from '@/app/hooks/useQaThreads'
import { useReviewDrafts, type ReviewDrafts } from '@/app/hooks/useReviewDrafts'
import { ChapterStepper } from '@/app/components/ChapterStepper'
import { ChatPane } from '@/app/components/chat/ChatPane'
import { RightPaneToggle, type RightPaneMode } from '@/app/components/chat/RightPaneToggle'
import { StandaloneCodeView } from '@/app/components/chat/StandaloneCodeView'
import { CodePane } from '@/app/components/CodePane'
import { DiagramPane } from '@/app/components/DiagramPane'
import { DocsPane } from '@/app/components/DocsPane'
import { FileMap } from '@/app/components/FileMap'
import { GeneratingPanel } from '@/app/components/GeneratingPanel'
import { StaleBanner } from '@/app/components/StaleBanner'
import type { CodeRef, PrChatMessage, TourResult, TourStep } from '@/lib/api'

interface Props {
  repo: string
  prNumber: number
  onBack: () => void
}

export function TourView({ repo, prNumber, onBack }: Props): JSX.Element {
  const { state, regenerate, cancel } = useTour(repo, prNumber)
  const drafts = useReviewDrafts(repo, prNumber)
  const qa = useQaThreads(repo, prNumber)
  return (
    <div className="flex h-full flex-col">
      <Header repo={repo} prNumber={prNumber} onBack={onBack} />
      <div className="min-h-0 flex-1">
        {match(state)
          .with({ kind: 'loading' }, () => <CenterMessage>Loading…</CenterMessage>)
          .with({ kind: 'generating' }, ({ events }) => <GeneratingPanel events={events} onCancel={cancel} />)
          .with({ kind: 'error' }, ({ message }) => <CenterMessage tone="danger">{message}</CenterMessage>)
          .with({ kind: 'ready' }, ({ tour }) => (
            <ReadyView repo={repo} tour={tour} drafts={drafts} qa={qa} onRegenerate={regenerate} onBack={onBack} />
          ))
          .exhaustive()}
      </div>
    </div>
  )
}

interface ReadyProps {
  repo: string
  tour: TourResult
  drafts: ReviewDrafts
  qa: QaThreads
  onRegenerate: () => void
  onBack: () => void
}

type CenterState = { kind: 'step' } | { kind: 'standalone'; ref: CodeRef }

function ReadyView({ repo, tour, drafts, qa, onRegenerate, onBack }: ReadyProps): JSX.Element {
  const [rightPaneMode, setRightPaneMode] = useState<RightPaneMode>('map')
  const [centerState, setCenterState] = useState<CenterState>({ kind: 'step' })
  const nav = useChapterNav(tour.chapters, { onRegenerate, onEscape: onBack })
  const isStale =
    typeof tour.headRefOid === 'string' &&
    typeof tour.currentHeadRefOid === 'string' &&
    tour.headRefOid !== tour.currentHeadRefOid
  const coverage = useFileCoverage(nav.flat)
  const completions = useChapterCompletions(repo, tour.prNumber, tour.headRefOid)
  const fileReviews = useFileReviews(repo, tour.prNumber, tour.headRefOid)
  // Walking the stepper exits standalone view so the user isn't stranded.
  useEffect(() => {
    setCenterState((current) => current.kind === 'standalone' ? { kind: 'step' } : current)
  }, [nav.globalIdx])
  const jumpToFile = (file: string): void => {
    const kind = coverage.kind(file)
    // Pinned files have a dedicated step whose center pane renders the file
    // via CodePane — step jump is the right behaviour.
    if (kind === 'pinned') {
      const idx = coverage.firstStep(file)
      if (idx >= 0) nav.goTo(idx)
      setCenterState({ kind: 'step' })
      return
    }
    // Referenced or uncovered files — clicking the file in the map should
    // SHOW the file, not yank the stepper to a docs-only step. Open the
    // file directly in the standalone viewer; the CH N badge in the row
    // already communicates which chapter mentions it. Arrow keys still exit
    // standalone back to step navigation.
    setCenterState({ kind: 'standalone', ref: { file, lineStart: 1 } })
  }
  /**
   * Unified ref click — drives both step `references[]` (CodePane / DocsPane)
   * and chat `references[]` (ChatPane). Prefer jumping to a tour step that
   * pins the file (the code pane then shows the diff hunk in context). For
   * files the tour didn't pin, swap the center pane to a standalone read-only
   * view scoped to the ref's lines so the user can still see the file.
   */
  const jumpToRef = (ref: { file: string; lineStart?: number; lineEnd?: number }): void => {
    if (coverage.kind(ref.file) === 'pinned') {
      jumpToFile(ref.file)
      return
    }
    setCenterState({
      kind: 'standalone',
      ref: { file: ref.file, lineStart: ref.lineStart ?? 1, lineEnd: ref.lineEnd },
    })
  }
  const jumpToChatRef = (ref: CodeRef): void => jumpToRef(ref)
  const closeStandalone = (): void => setCenterState({ kind: 'step' })
  /**
   * Draft a review comment seeded from a chat answer. The first structured
   * reference's file/lineStart picks the anchor; the message body becomes the
   * draft body with a small "from chat" footer for provenance. Afterwards we
   * jump the viewer to the same location so the user sees their new draft
   * inline in CodePane.
   */
  const useChatMessageAsComment = async (message: PrChatMessage): Promise<void> => {
    const ref = message.references?.[0]
    if (!ref) return
    const body = `${message.body}\n\n_(from chat)_`
    await drafts.add({ file: ref.file, line: ref.lineStart, body })
    jumpToFile(ref.file)
    setRightPaneMode('map')
  }
  // When the center pane is showing a standalone file (clicked from chat ref,
  // doc ref, or an uncovered file in the map), the file map's active row
  // should reflect that file — not the step's pinned file. Otherwise the
  // map highlights one thing while you're looking at another.
  const currentFile = centerState.kind === 'standalone'
    ? centerState.ref.file
    : nav.current?.step.code?.file
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
            ? <DocsPane
                step={nav.current.step}
                chapter={nav.current.chapter}
                qaThreads={nav.current.step.code ? qa.byFile(nav.current.step.code.file) : []}
                tourFilePaths={tour.files.map((f) => f.path)}
                onDeleteQa={qa.remove}
                onJumpToRef={jumpToRef}
              />
            : <CenterMessage>No step selected.</CenterMessage>}
        </Section>
        <Section title="Code / Diagram">
          {centerState.kind === 'standalone'
            ? <StandaloneCodeView
                repo={repo}
                headSha={tour.headRefOid}
                baseSha={tour.baseRefOid}
                ref={centerState.ref}
                drafts={drafts}
                qa={qa}
                onClose={closeStandalone}
              />
            : nav.current
              ? renderCenter({
                  step: nav.current.step, repo, tour, drafts, qa, jumpToFile, jumpToRef, coverage, currentFile,
                  reviewed: fileReviews.reviewed,
                  onToggleReviewed: fileReviews.toggle,
                })
              : <PlaceholderPane>No step.</PlaceholderPane>}
        </Section>
        <Section
          title={rightPaneMode === 'map' ? `Map · ${tour.files.length} ${tour.files.length === 1 ? 'file' : 'files'}` : 'Chat'}
          headerExtras={<RightPaneToggle mode={rightPaneMode} onChange={setRightPaneMode} />}
        >
          {rightPaneMode === 'map'
            ? <FileMap
                files={tour.files}
                currentFile={currentFile}
                coverage={coverage}
                reviewed={fileReviews.reviewed}
                onPick={jumpToFile}
                onToggleReviewed={fileReviews.toggle}
              />
            : <ChatPane
                repo={repo}
                prNumber={tour.prNumber}
                tourReady={true}
                onRegenerate={onRegenerate}
                onJumpRef={jumpToChatRef}
                onUseAsComment={useChatMessageAsComment}
              />}
        </Section>
      </div>
      <ChapterStepper
        chapters={tour.chapters}
        nav={nav}
        tour={tour}
        drafts={drafts}
        onRegenerate={onRegenerate}
        repo={repo}
        completions={completions}
        fileReviews={fileReviews}
        coverage={coverage}
      />
    </div>
  )
}

interface CenterArgs {
  step: TourStep
  repo: string
  tour: TourResult
  drafts: ReviewDrafts
  qa: QaThreads
  jumpToFile: (path: string) => void
  jumpToRef: (ref: { file: string; lineStart?: number; lineEnd?: number }) => void
  coverage: FileCoverage
  currentFile?: string
  reviewed: Set<string>
  onToggleReviewed: (path: string) => void
}

function renderCenter(args: CenterArgs): JSX.Element {
  const { step, repo, tour, drafts, qa, jumpToFile, jumpToRef, coverage, currentFile, reviewed, onToggleReviewed } = args
  return match(step.panel)
    .with('code', () => <CodePane repo={repo} tour={tour} step={step} drafts={drafts} qa={qa} onJumpToRef={jumpToRef} />)
    .with('diagram', () => <DiagramPane step={step} />)
    .with('code-map', () => (
      <FileMap
        files={tour.files}
        currentFile={currentFile}
        coverage={coverage}
        reviewed={reviewed}
        onPick={jumpToFile}
        onToggleReviewed={onToggleReviewed}
      />
    ))
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

function Section({ title, children, headerExtras }: { title: string; children: ReactNode; headerExtras?: ReactNode }): JSX.Element {
  return (
    <section className="bg-bg flex min-h-0 min-w-0 flex-col">
      <div className="border-border text-text-muted flex items-center justify-between border-b px-3 py-1 text-[10px] tracking-wider uppercase">
        <span>{title}</span>
        {headerExtras}
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
