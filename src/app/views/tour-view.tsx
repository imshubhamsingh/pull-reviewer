import { ExternalLink, PanelLeft, PanelRight } from 'lucide-react'
import { cn } from '@/app/lib/utils'
import { match } from 'ts-pattern'
import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
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
import { ContextMenu, type ContextMenuItem } from '@/app/components/context-menu'
import { DiagramPane } from '@/app/components/diagram-pane'
import { DocsPane } from '@/app/components/docs-pane'
import { FileMap } from '@/app/components/file-map'
import { GeneratingPanel } from '@/app/components/generating-panel'
import { ReviewPane } from '@/app/components/review-pane'
import { StaleBanner } from '@/app/components/stale-banner'
import { UsagesPane } from '@/app/components/usages-pane'
import type { CodeContextTarget } from '@/app/hooks/use-code-context-menu'
import { api } from '@/lib/api'
import type { CodeRef, Finding, PrChatMessage, TourResult, TourStep, UsagesResult } from '@/lib/api'

interface Props {
  repo: string
  prNumber: number
  onBack: () => void
}

export function TourView({ repo, prNumber, onBack }: Props): JSX.Element {
  const { state, generate, regenerate, cancel, viewStale } = useTour(repo, prNumber)
  const drafts = useReviewDrafts(repo, prNumber)
  const qa = useQaThreads(repo, prNumber)
  // Pane visibility — controls let the user hide the Docs (left) and the
  // Map/Review/Chat (right) sections so the centre Code/Diagram pane can
  // dominate. Buttons live in the header next to "View on GitHub".
  // Persisted in localStorage so the layout sticks across PRs / restarts.
  const [leftVisible, setLeftVisible] = usePersistedBoolean('tour.leftVisible', true)
  const [rightVisible, setRightVisible] = usePersistedBoolean('tour.rightVisible', true)
  return (
    <div className="flex h-full flex-col">
      <Header
        repo={repo}
        prNumber={prNumber}
        onBack={onBack}
        showPaneToggles={state.kind === 'ready'}
        leftVisible={leftVisible}
        rightVisible={rightVisible}
        onToggleLeft={() => setLeftVisible((v) => !v)}
        onToggleRight={() => setRightVisible((v) => !v)}
      />
      <div className="min-h-0 flex-1">
        {match(state)
          .with({ kind: 'loading' }, () => <CenterMessage>Loading…</CenterMessage>)
          .with({ kind: 'no-tour' }, ({ staleTour }) => (
            <NoTourPrompt
              repo={repo}
              prNumber={prNumber}
              onGenerate={generate}
              staleTour={staleTour}
              onViewStale={viewStale}
            />
          ))
          .with({ kind: 'generating' }, ({ events }) => (
            <GeneratingPanel events={events} onCancel={cancel} />
          ))
          .with({ kind: 'error' }, ({ message }) => (
            <ErrorPanel message={message} onRetry={generate} />
          ))
          .with({ kind: 'ready' }, ({ tour }) => (
            <ReadyView
              repo={repo}
              tour={tour}
              drafts={drafts}
              qa={qa}
              onRegenerate={regenerate}
              onBack={onBack}
              leftVisible={leftVisible}
              rightVisible={rightVisible}
            />
          ))
          .exhaustive()}
      </div>
    </div>
  )
}

/**
 * Explicit-opt-in prompt shown when a PR has no cached tour. Generating costs
 * tokens, so the user clicks Generate rather than auto-burning on every PR
 * open.
 */
function NoTourPrompt({
  repo,
  prNumber,
  onGenerate,
  staleTour,
  onViewStale,
}: {
  repo: string
  prNumber: number
  onGenerate: () => void
  staleTour: TourResult | null
  onViewStale: () => void
}): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-text-primary text-sm">
        No tour yet for{' '}
        <span className="font-mono">
          {repo}#{prNumber}
        </span>
        .
      </p>
      <p className="text-text-muted text-xs">
        Generating a tour runs the AI reviewer over the diff — this costs tokens and takes ~30–90s.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onGenerate}
          className="bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-fg rounded-sm px-4 py-1.5 text-xs font-medium transition-colors"
        >
          Generate tour
        </button>
        {staleTour && (
          <button
            type="button"
            onClick={onViewStale}
            className="border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary rounded-sm border px-4 py-1.5 text-xs font-medium transition-colors"
            title={`Snapshot from head ${staleTour.headRefOid.slice(0, 7)}`}
          >
            View previous tour ({formatStaleAge(staleTour.generatedAt)})
          </button>
        )}
      </div>
    </div>
  )
}

function formatStaleAge(generatedAt: string): string {
  const then = new Date(generatedAt).getTime()
  if (!Number.isFinite(then)) return 'previous'
  const diffMs = Date.now() - then
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-text-danger text-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-fg rounded-sm px-4 py-1.5 text-xs font-medium transition-colors"
      >
        Retry
      </button>
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
  leftVisible: boolean
  rightVisible: boolean
}

type CenterState = { kind: 'step' } | { kind: 'standalone'; ref: CodeRef }

function ReadyView({
  repo,
  tour,
  drafts,
  qa,
  onRegenerate,
  onBack,
  leftVisible,
  rightVisible,
}: ReadyProps): JSX.Element {
  const [rightPaneMode, setRightPaneMode] = useState<RightPaneMode>('map')
  const [centerState, setCenterState] = useState<CenterState>({ kind: 'step' })
  const [pendingFindingExpand, setPendingFindingExpand] = useState<string | null>(null)
  // When a finding / chat ref / standalone-modal click lands on a file
  // that's PINNED to a chapter step, we navigate to that step — but the
  // step's anchor lines usually aren't the ref's lines. Hold the ref's
  // line here and CodePane will scroll to it instead of the step's
  // default. Re-bumps on each click via a counter so clicking the same
  // ref twice still re-scrolls.
  const [pendingScroll, setPendingScroll] = useState<{ line: number; nonce: number } | null>(null)
  // Holds the pre-fill payload for the right-pane chat composer when the
  // user clicks "Send to chat" from a line-composer Chat tab. `nonce` keys
  // the Composer's seed effect so repeat clicks re-prefill.
  const [chatPrefill, setChatPrefill] = useState<{ text: string; nonce: number } | null>(null)
  // Right-click context-menu state. `target` carries the resolved click site
  // — file / line / column / symbol guess — plus the anchor coordinates the
  // ContextMenu portal renders from.
  const [contextMenu, setContextMenu] = useState<{ target: CodeContextTarget } | null>(null)
  // Find-usages query + result. State lives here so it survives switching
  // away to Chat / Map / Review and back. `prevRightMode` remembers which
  // pane to fall back to when the user closes the Usages pane.
  const [usages, setUsages] = useState<{
    symbol: string
    result: UsagesResult | null
    loading: boolean
    error: string | undefined
  } | null>(null)
  const usagesAbortRef = useRef<AbortController | null>(null)
  const prevRightModeRef = useRef<RightPaneMode>('map')
  const sendSelectionToChat = (input: {
    file: string
    startLine: number
    endLine: number
    snippet: string
    question: string
  }): void => {
    const lang = input.file.split('.').pop() ?? ''
    const range =
      input.startLine === input.endLine
        ? `\`${input.file}:${input.startLine}\``
        : `\`${input.file}:${input.startLine}–${input.endLine}\``
    const text = `About ${range}:\n\n\`\`\`${lang}\n${input.snippet}\n\`\`\`\n\n${input.question}`
    setRightPaneMode('chat')
    setChatPrefill({ text, nonce: Date.now() })
  }
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
      // Stash the ref's line so CodePane scrolls to it; the step's own
      // anchor lines would otherwise win.
      if (ref.lineStart != null) {
        setPendingScroll((prev) => ({ line: ref.lineStart!, nonce: (prev?.nonce ?? 0) + 1 }))
      }
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

  // Fire a Find-usages search. Pivots the right pane to Usages, remembers
  // the previous mode so the close button can return to it, and aborts any
  // in-flight query so the latest click wins.
  const runUsagesQuery = useCallback(
    (target: CodeContextTarget): void => {
      setRightPaneMode((prev) => {
        if (prev !== 'usages') prevRightModeRef.current = prev
        return 'usages'
      })
      usagesAbortRef.current?.abort()
      const ac = new AbortController()
      usagesAbortRef.current = ac
      setUsages({ symbol: target.symbol, result: null, loading: true, error: undefined })
      api.usages
        .find({
          repo,
          sha: tour.headRefOid,
          file: target.file,
          line: target.line,
          column: target.column,
          kind: 'references',
        })
        .then((result) => {
          if (ac.signal.aborted) return
          setUsages({
            symbol: result.symbol || target.symbol,
            result,
            loading: false,
            error: undefined,
          })
        })
        .catch((err: Error) => {
          if (ac.signal.aborted) return
          setUsages({ symbol: target.symbol, result: null, loading: false, error: err.message })
        })
    },
    [repo, tour.headRefOid],
  )

  // Fire Go-to-definition. Routes the first definition site through the
  // existing `jumpToRef` flow — same behaviour as clicking a finding /
  // chat ref. No right-pane state change.
  const runDefinitionJump = useCallback(
    (target: CodeContextTarget): void => {
      void api.usages
        .find({
          repo,
          sha: tour.headRefOid,
          file: target.file,
          line: target.line,
          column: target.column,
          kind: 'definition',
        })
        .then((result) => {
          const first = result.hits[0]
          if (!first) return
          jumpToRef({ file: first.file, lineStart: first.line })
        })
        .catch(() => {
          /* swallow — definition lookup is best-effort */
        })
    },
    [repo, tour.headRefOid],
  )

  const contextMenuItems = ((): ContextMenuItem[] => {
    const target = contextMenu?.target
    if (!target) return []
    const ext = (target.file.split('.').pop() ?? '').toLowerCase()
    const isTs =
      ext === 'ts' ||
      ext === 'tsx' ||
      ext === 'js' ||
      ext === 'jsx' ||
      ext === 'mjs' ||
      ext === 'cjs'
    return [
      {
        label: target.symbol ? `Find usages of \`${target.symbol}\`` : 'Find usages',
        onClick: () => runUsagesQuery(target),
        disabled: !target.symbol,
      },
      {
        label: 'Go to definition',
        onClick: () => runDefinitionJump(target),
        disabled: !target.symbol || !isTs,
        hint: !isTs ? 'TS only' : undefined,
      },
      {
        label: 'Copy symbol',
        onClick: () => {
          if (!target.symbol) return
          void navigator.clipboard.writeText(target.symbol)
        },
        disabled: !target.symbol,
      },
    ]
  })()

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
      <div
        className="bg-border grid min-h-0 flex-1 gap-px"
        style={{ gridTemplateColumns: gridTemplateFor(leftVisible, rightVisible) }}
      >
        {leftVisible && (
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
        )}
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
              onContextRequest={(t) => setContextMenu({ target: t })}
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
              pendingScroll,
              onSendToChat: sendSelectionToChat,
              onContextRequest: (t) => setContextMenu({ target: t }),
              viewMode,
              onViewModeChange: setViewMode,
              diffLayout,
              onDiffLayoutChange: setDiffLayout,
            })
          ) : (
            <PlaceholderPane>No step.</PlaceholderPane>
          )}
        </Section>
        {rightVisible && (
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
                drafts={drafts.drafts}
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
                composerPrefill={chatPrefill ?? undefined}
              />
            )}
            {rightPaneMode === 'usages' && (
              <UsagesPane
                symbol={usages?.symbol ?? ''}
                result={usages?.result ?? null}
                loading={usages?.loading ?? false}
                error={usages?.error}
                onJumpRef={(ref) => jumpToRef(ref)}
                onClose={() => setRightPaneMode(prevRightModeRef.current)}
              />
            )}
          </Section>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          items={contextMenuItems}
          anchorX={contextMenu.target.anchorX}
          anchorY={contextMenu.target.anchorY}
          onClose={() => setContextMenu(null)}
        />
      )}
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
  if (mode === 'usages') return 'Usages'
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
  pendingScroll: { line: number; nonce: number } | null
  onSendToChat: (input: {
    file: string
    startLine: number
    endLine: number
    snippet: string
    question: string
  }) => void
  onContextRequest: (target: CodeContextTarget) => void
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
    pendingScroll,
    onSendToChat,
    onContextRequest,
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
        pendingScroll={pendingScroll}
        onSendToChat={onSendToChat}
        onContextRequest={onContextRequest}
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
        drafts={drafts.drafts}
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
  showPaneToggles,
  leftVisible,
  rightVisible,
  onToggleLeft,
  onToggleRight,
}: {
  repo: string
  prNumber: number
  onBack: () => void
  showPaneToggles: boolean
  leftVisible: boolean
  rightVisible: boolean
  onToggleLeft: () => void
  onToggleRight: () => void
}): JSX.Element {
  const url = `https://github.com/${repo}/pull/${prNumber}`
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
      <div className="flex items-center gap-1.5">
        {showPaneToggles && (
          <>
            <PaneToggle side="left" visible={leftVisible} onToggle={onToggleLeft} />
            <PaneToggle side="right" visible={rightVisible} onToggle={onToggleRight} />
          </>
        )}
        <button
          type="button"
          onClick={() => window.electron.openExternal(url)}
          title={`Open ${url} on GitHub`}
          className="border-border text-text-secondary hover:text-text-primary hover:bg-surface-hover inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] transition-colors"
        >
          View on GitHub
          <ExternalLink size={11} aria-hidden />
        </button>
      </div>
    </header>
  )
}

/**
 * Eyeball-style toggle for the Docs (left) and Map/Review/Chat (right) panes.
 * `aria-pressed` carries the on/off state; icon dims to `text-text-muted` when
 * the pane is hidden so the user can see which sides are currently visible
 * at a glance.
 */
function PaneToggle({
  side,
  visible,
  onToggle,
}: {
  side: 'left' | 'right'
  visible: boolean
  onToggle: () => void
}): JSX.Element {
  const Icon = side === 'left' ? PanelLeft : PanelRight
  const label = side === 'left' ? 'docs pane' : 'map / review / chat pane'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={visible}
      title={`${visible ? 'Hide' : 'Show'} ${label}`}
      className={cn(
        'border-border hover:bg-surface-hover inline-flex items-center rounded-sm border p-1 transition-colors',
        visible ? 'text-text-primary' : 'text-text-muted',
      )}
    >
      <Icon size={12} aria-hidden />
    </button>
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

/** Tour body grid template based on which side panes are visible. The
 *  centre column always gets the lion's share so hiding either side just
 *  gives the centre more room rather than stretching the survivor. */
function gridTemplateFor(left: boolean, right: boolean): string {
  if (left && right) return '1fr 2fr 1fr'
  if (left && !right) return '1fr 3fr'
  if (!left && right) return '3fr 1fr'
  return '1fr'
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

/**
 * Boolean state mirrored to localStorage so the value sticks across PRs and
 * app restarts. Reads the seed value lazily so SSR-safe (no-op when window
 * is undefined). Writes synchronously on every update.
 */
function usePersistedBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultValue
    const stored = window.localStorage.getItem(key)
    if (stored !== '0' && stored !== '1') return defaultValue
    return stored === '1'
  })
  const update = (next: boolean | ((prev: boolean) => boolean)): void => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      try {
        window.localStorage.setItem(key, resolved ? '1' : '0')
      } catch {
        /* ignore storage quota / private-mode failures */
      }
      return resolved
    })
  }
  return [value, update]
}
