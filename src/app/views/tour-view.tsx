import { match } from 'ts-pattern'
import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { useTour } from '@/app/hooks/use-tour'
import { useChapterCompletions } from '@/app/hooks/use-chapter-completions'
import { useChapterNav } from '@/app/hooks/use-chapter-nav'
import { useFileCoverage, type FileCoverage } from '@/app/hooks/use-file-coverage'
import { useFileReviews } from '@/app/hooks/use-file-reviews'
import { useQaThreads, type QaThreads } from '@/app/hooks/use-qa-threads'
import { useReviewDrafts, type ReviewDrafts } from '@/app/hooks/use-review-drafts'
import { useReviewFindings, type ReviewFindingsState } from '@/app/hooks/use-review-findings'
import { prewarmHunks, useHunks } from '@/app/hooks/use-hunks'
import { HunksTruncatedBanner } from '@/app/components/hunks-truncated-banner'
import { ChapterStepper } from '@/app/components/chapter-stepper'
import { ChatPane } from '@/app/components/chat/chat-pane'
import { RightPaneToggle, type RightPaneMode } from '@/app/components/chat/right-pane-toggle'
import { StandaloneCodeView } from '@/app/components/chat/standalone-code-view'
import { CodePane } from '@/app/components/code-pane'
import { DiagramPane } from '@/app/components/diagram-pane'
import { DocsPane } from '@/app/components/docs-pane'
import { FileMap } from '@/app/components/file-map'
import { GeneratingPanel } from '@/app/components/generating-panel'
import { ReviewPane } from '@/app/components/review-pane'
import { StaleBanner } from '@/app/components/stale-banner'
import type { CodeRef, Finding, PrChatMessage, TourResult, TourStep } from '@/lib/api'

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
          .with({ kind: 'generating' }, ({ events }) => (
            <GeneratingPanel events={events} onCancel={cancel} />
          ))
          .with({ kind: 'error' }, ({ message }) => (
            <CenterMessage tone="danger">{message}</CenterMessage>
          ))
          .with({ kind: 'ready' }, ({ tour }) => (
            <ReadyView
              repo={repo}
              tour={tour}
              drafts={drafts}
              qa={qa}
              onRegenerate={regenerate}
              onBack={onBack}
            />
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
  const [pendingFindingExpand, setPendingFindingExpand] = useState<string | null>(null)
  // PR-wide Code/Diff selection — persists as the user navigates between
  // chapters and standalone refs, per the user's "should be global for the PR" ask.
  const [viewMode, setViewMode] = useState<'code' | 'diff'>('code')
  const [diffLayout, setDiffLayout] = useState<'split' | 'unified'>('split')
  const nav = useChapterNav(tour.chapters, { onRegenerate, onEscape: onBack })
  const isStale =
    typeof tour.headRefOid === 'string' &&
    typeof tour.currentHeadRefOid === 'string' &&
    tour.headRefOid !== tour.currentHeadRefOid
  const coverage = useFileCoverage(nav.flat)
  const completions = useChapterCompletions(repo, tour.prNumber, tour.headRefOid)
  const fileReviews = useFileReviews(repo, tour.prNumber, tour.headRefOid)
  const aiFindings = useReviewFindings(tour.review, repo, tour.prNumber, tour.headRefOid)
  // Warm the commentable-lines cache the moment the tour resolves so the
  // very first file open already has the visual indicator. CodePane also
  // calls useHunks on mount as a lazy fallback (deduped in-flight).
  useEffect(() => {
    prewarmHunks(repo, tour.prNumber, tour.headRefOid)
  }, [repo, tour.prNumber, tour.headRefOid])
  const hunks = useHunks(repo, tour.prNumber, tour.headRefOid)
  // Walking the stepper exits standalone view so the user isn't stranded.
  useEffect(() => {
    setCenterState((current) => (current.kind === 'standalone' ? { kind: 'step' } : current))
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
   * Click on a finding in the right-pane Review tab: jump to its file:line
   * AND tell CodePane to auto-expand the inline ✨ card for this finding.
   * The pending id is consumed on the next render of CodeLines and then
   * harmlessly stays set (re-renders don't re-trigger).
   */
  const jumpToFinding = (finding: Finding): void => {
    const code = finding.code
    if (!code?.file || code.lineStart == null) return
    setPendingFindingExpand(finding.id)
    jumpToRef({ file: code.file, lineStart: code.lineStart, lineEnd: code.lineEnd })
  }
  /**
   * Convert an AI finding (from the right-pane) to a user-authored draft.
   * Mirrors `convertFindingToDraft` in code-pane.tsx but constructs the
   * draft directly here so it works regardless of which file is open.
   */
  const convertFindingFromReviewPane = async (finding: Finding): Promise<void> => {
    if (!finding.code?.file || finding.code.lineStart == null) return
    const lineEnd = finding.code.lineEnd ?? finding.code.lineStart
    const lineStart = finding.code.lineStart
    const sideHint = finding.code.side === 'before' ? 'before' : 'after'
    const body = [finding.body, finding.suggestion ? `**Suggestion:** ${finding.suggestion}` : null]
      .filter(Boolean)
      .join('\n\n')
    await drafts.add({
      file: finding.code.file,
      line: Math.max(lineStart, lineEnd),
      startLine: lineStart === lineEnd ? null : Math.min(lineStart, lineEnd),
      side: sideHint,
      body,
    })
    aiFindings.markConverted(finding.id)
  }
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
  const currentFile =
    centerState.kind === 'standalone' ? centerState.ref.file : nav.current?.step.code?.file
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
      {hunks.kind === 'ready' && hunks.response.truncated && (
        <div className="px-4 pt-3">
          <HunksTruncatedBanner />
        </div>
      )}
      <div className="bg-border grid min-h-0 flex-1 grid-cols-[1fr_2fr_1fr] gap-px">
        <Section title="Docs">
          {nav.current ? (
            <DocsPane
              step={nav.current.step}
              chapter={nav.current.chapter}
              qaThreads={qa.forChapter(nav.current.chapter.id, nav.current.step.code?.file)}
              tourFilePaths={tour.files.map((f) => f.path)}
              prShape={
                nav.current.chapterIdx === 0 && nav.current.stepIdxInChapter === 0
                  ? (tour.review?.prShape ?? undefined)
                  : undefined
              }
              onDeleteQa={qa.remove}
              onJumpToRef={jumpToRef}
              onJumpToFinding={(findingId, code) => {
                if (code.lineStart == null) return
                setPendingFindingExpand(findingId)
                jumpToRef(code)
              }}
            />
          ) : (
            <CenterMessage>No step selected.</CenterMessage>
          )}
        </Section>
        <Section title="Code / Diagram">
          {centerState.kind === 'standalone' ? (
            <StandaloneCodeView
              repo={repo}
              headSha={tour.headRefOid}
              baseSha={tour.baseRefOid}
              prNumber={tour.prNumber}
              ref={centerState.ref}
              chapterId={nav.current?.chapter.id}
              drafts={drafts}
              qa={qa}
              onClose={closeStandalone}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              diffLayout={diffLayout}
              onDiffLayoutChange={setDiffLayout}
            />
          ) : nav.current ? (
            renderCenter({
              step: nav.current.step,
              chapterId: nav.current.chapter.id,
              repo,
              tour,
              drafts,
              qa,
              jumpToFile,
              jumpToRef,
              coverage,
              currentFile,
              reviewed: fileReviews.reviewed,
              onToggleReviewed: fileReviews.toggle,
              aiFindings,
              aiPendingExpand: pendingFindingExpand,
              viewMode,
              onViewModeChange: setViewMode,
              diffLayout,
              onDiffLayoutChange: setDiffLayout,
            })
          ) : (
            <PlaceholderPane>No step.</PlaceholderPane>
          )}
        </Section>
        <Section
          title={rightPaneTitle(
            rightPaneMode,
            tour.files.length,
            tour.review?.findings.length ?? 0,
          )}
          headerExtras={<RightPaneToggle mode={rightPaneMode} onChange={setRightPaneMode} />}
        >
          {rightPaneMode === 'map' && (
            <FileMap
              files={tour.files}
              currentFile={currentFile}
              coverage={coverage}
              reviewed={fileReviews.reviewed}
              onPick={jumpToFile}
              onToggleReviewed={fileReviews.toggle}
            />
          )}
          {rightPaneMode === 'review' && (
            <ReviewPane
              review={tour.review}
              findings={aiFindings}
              onJumpToFinding={jumpToFinding}
              onJumpToSymbol={(loc) => jumpToRef({ file: loc.file, lineStart: loc.line })}
              onConvertToDraft={convertFindingFromReviewPane}
            />
          )}
          {rightPaneMode === 'chat' && (
            <ChatPane
              repo={repo}
              prNumber={tour.prNumber}
              tourReady={true}
              onRegenerate={onRegenerate}
              onJumpRef={jumpToChatRef}
              onUseAsComment={useChatMessageAsComment}
            />
          )}
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
        onJumpToFile={(file, line) => jumpToRef({ file, lineStart: line })}
      />
    </div>
  )
}

function rightPaneTitle(mode: RightPaneMode, fileCount: number, findingCount: number): string {
  if (mode === 'map') return `Map · ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`
  if (mode === 'review') {
    if (findingCount === 0) return 'Review'
    return `Review · ${findingCount} finding${findingCount === 1 ? '' : 's'}`
  }
  return 'Chat'
}

interface CenterArgs {
  step: TourStep
  chapterId: string | undefined
  repo: string
  tour: TourResult
  viewMode: 'code' | 'diff'
  onViewModeChange: (m: 'code' | 'diff') => void
  diffLayout: 'split' | 'unified'
  onDiffLayoutChange: (l: 'split' | 'unified') => void
  drafts: ReviewDrafts
  qa: QaThreads
  jumpToFile: (path: string) => void
  jumpToRef: (ref: { file: string; lineStart?: number; lineEnd?: number }) => void
  coverage: FileCoverage
  currentFile?: string
  reviewed: Set<string>
  onToggleReviewed: (path: string) => void
  aiFindings: ReviewFindingsState
  aiPendingExpand: string | null
}

function renderCenter(args: CenterArgs): JSX.Element {
  const {
    step,
    chapterId,
    repo,
    tour,
    drafts,
    qa,
    jumpToFile,
    jumpToRef,
    coverage,
    currentFile,
    reviewed,
    onToggleReviewed,
    aiFindings,
    aiPendingExpand,
    viewMode,
    onViewModeChange,
    diffLayout,
    onDiffLayoutChange,
  } = args
  return match(step.panel)
    .with('code', () => (
      <CodePane
        repo={repo}
        tour={tour}
        step={step}
        chapterId={chapterId}
        drafts={drafts}
        qa={qa}
        aiFindings={aiFindings}
        aiPendingExpand={aiPendingExpand}
        onJumpToRef={jumpToRef}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        diffLayout={diffLayout}
        onDiffLayoutChange={onDiffLayoutChange}
      />
    ))
    .with('diagram', () => <DiagramPane step={step} onJumpSource={jumpToRef} />)
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

function Header({
  repo,
  prNumber,
  onBack,
}: {
  repo: string
  prNumber: number
  onBack: () => void
}): JSX.Element {
  return (
    <header className="border-border bg-surface flex items-center justify-between border-b px-4 py-2">
      <button
        type="button"
        onClick={onBack}
        className="text-text-secondary hover:text-text-primary text-sm transition-colors"
      >
        ← back
      </button>
      <h1 className="text-text-primary text-sm font-medium">
        {repo} #{prNumber}
      </h1>
      <span aria-hidden className="w-12" />
    </header>
  )
}

function Section({
  title,
  children,
  headerExtras,
}: {
  title: string
  children: ReactNode
  headerExtras?: ReactNode
}): JSX.Element {
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
    <div
      className={`flex h-full items-center justify-center p-6 text-sm ${tone === 'danger' ? 'text-text-danger' : 'text-text-secondary'}`}
    >
      {children}
    </div>
  )
}
