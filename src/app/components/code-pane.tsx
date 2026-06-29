import { match } from 'ts-pattern'
import { useMemo, useState, type JSX, type ReactNode } from 'react'
import { FileCode, GitCompareArrows } from 'lucide-react'
import type { Highlighter } from 'shiki'
import { useFileSnapshot } from '@/app/hooks/use-file-snapshot'
import { useGutterSelection } from '@/app/hooks/use-gutter-selection'
import { useHunks, commentableLineSet } from '@/app/hooks/use-hunks'
import { useShiki } from '@/app/hooks/use-shiki'
import { useCodeSearch, useCmdFListener } from '@/app/hooks/use-code-search'
import { chooseSha, highlightWindow, inferLang } from '@/app/lib/code-utils'
import { compileQuery, findLineMatches } from '@/app/lib/code-search'
import { cn } from '@/app/lib/utils'
import { CodeSearchOverlay } from '@/app/components/code-search-overlay'
import { DiffPane } from '@/app/components/diff-pane'
import { OtherSideDraftsBanner } from '@/app/components/other-side-drafts-banner'
import type {
  CodePointer,
  Finding,
  FileSnapshot,
  SymbolLocation,
  TourResult,
  TourStep,
} from '@/lib/api'
import { CodeHeader } from '@/app/components/code-header'
import { CodeLines, type CodeSearchMatch, type ComposerTarget } from '@/app/components/code-lines'
import type { CodeContextTarget } from '@/app/hooks/use-code-context-menu'
import { References } from '@/app/components/references'
import type { QaThreads } from '@/app/hooks/use-qa-threads'
import type { ReviewDrafts } from '@/app/hooks/use-review-drafts'
import type { ReviewFindingsState } from '@/app/hooks/use-review-findings'

type ViewMode = 'code' | 'diff'
export type DiffLayout = 'split' | 'unified'

interface Props {
  repo: string
  tour: TourResult
  step: TourStep
  /** Active chapter id — stamped on any Ask AI thread created from this pane so it later surfaces in the chapter's docs. */
  chapterId: string | undefined
  drafts: ReviewDrafts
  qa: QaThreads
  aiFindings: ReviewFindingsState
  /** When the user clicks a finding in the right-pane, this is set to the finding id so the inline ✨ card auto-opens once CodePane mounts that file. */
  aiPendingExpand?: string | null
  /** Set when the user clicked a ref / finding pointing at a specific
   *  line; overrides the step's own anchor lines for scroll-to. Nonce
   *  changes per click so repeat-clicks re-scroll. */
  pendingScroll?: { line: number; nonce: number } | null
  /** Pre-fill the right-pane chat composer with snippet + question; the
   *  host pivots the right pane to Chat. Forwarded straight to CodeLines. */
  onSendToChat?: (input: {
    file: string
    startLine: number
    endLine: number
    snippet: string
    question: string
  }) => void
  onJumpToRef: (ref: CodePointer) => void
  /** Right-click handler — forwarded to CodeLines. Set by tour-view to open
   *  the Find-usages context menu on the resolved target. */
  onContextRequest?: (target: CodeContextTarget) => void
  /** PR-wide Code/Diff selection lifted to tour-view so it persists across navigation. */
  viewMode: ViewMode
  onViewModeChange: (m: ViewMode) => void
  diffLayout: DiffLayout
  onDiffLayoutChange: (l: DiffLayout) => void
}

export function CodePane({
  repo,
  tour,
  step,
  chapterId,
  drafts,
  qa,
  aiFindings,
  aiPendingExpand,
  pendingScroll,
  onSendToChat,
  onJumpToRef,
  onContextRequest,
  viewMode,
  onViewModeChange,
  diffLayout,
  onDiffLayoutChange,
}: Props): JSX.Element {
  const code = step.code
  const sha = chooseSha(tour, code?.side)
  const snapshot = useFileSnapshot(repo, sha, code?.file)
  const hl = useShiki()
  const hunks = useHunks(repo, tour.prNumber, tour.headRefOid)

  if (!code) return <EmptyPane>No file pinned for this step.</EmptyPane>

  if (viewMode === 'diff') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ViewToggle
          mode={viewMode}
          onChange={onViewModeChange}
          diffLayout={diffLayout}
          onDiffLayoutChange={onDiffLayoutChange}
          header={<CodeHeader file={code.file} sha={sha} side={code.side} />}
        />
        <DiffPane
          repo={repo}
          baseSha={tour.baseRefOid}
          headSha={tour.headRefOid}
          file={code.file}
          prNumber={tour.prNumber}
          layout={diffLayout}
          drafts={drafts}
          qa={qa}
          chapterId={chapterId}
        />
      </div>
    )
  }

  return match(snapshot)
    .with({ kind: 'idle' }, () => <EmptyPane>No file selected.</EmptyPane>)
    .with({ kind: 'loading' }, () => <EmptyPane>Loading file…</EmptyPane>)
    .with({ kind: 'error' }, ({ message }) => <EmptyPane tone="danger">{message}</EmptyPane>)
    .with({ kind: 'ready' }, ({ snap }) => (
      <ReadyPane
        snap={snap}
        code={code}
        sha={sha}
        step={step}
        chapterId={chapterId}
        hl={hl}
        drafts={drafts}
        qa={qa}
        aiFindings={aiFindings}
        aiPendingExpand={aiPendingExpand}
        pendingScroll={pendingScroll}
        onSendToChat={onSendToChat}
        onContextRequest={onContextRequest}
        commentableLines={commentableSetForFile(hunks, code.file, code.side)}
        onJumpToRef={onJumpToRef}
        mode={viewMode}
        onModeChange={onViewModeChange}
        diffLayout={diffLayout}
        onDiffLayoutChange={onDiffLayoutChange}
      />
    ))
    .exhaustive()
}

function ViewToggle({
  mode,
  onChange,
  diffLayout,
  onDiffLayoutChange,
  header,
}: {
  mode: ViewMode
  onChange: (m: ViewMode) => void
  diffLayout: DiffLayout
  onDiffLayoutChange: (l: DiffLayout) => void
  header: JSX.Element
}): JSX.Element {
  return (
    <div className="border-border bg-surface flex items-center justify-between gap-3 border-b pr-3">
      <div className="min-w-0 flex-1">{header}</div>
      {mode === 'diff' && (
        <div className="border-border flex shrink-0 overflow-hidden rounded-sm border">
          <ToggleBtn active={diffLayout === 'split'} onClick={() => onDiffLayoutChange('split')}>
            Split
          </ToggleBtn>
          <ToggleBtn
            active={diffLayout === 'unified'}
            onClick={() => onDiffLayoutChange('unified')}
          >
            Unified
          </ToggleBtn>
        </div>
      )}
      <div className="border-border flex shrink-0 overflow-hidden rounded-sm border">
        <ToggleBtn active={mode === 'code'} onClick={() => onChange('code')}>
          <FileCode size={12} aria-hidden />
          Code
        </ToggleBtn>
        <ToggleBtn active={mode === 'diff'} onClick={() => onChange('diff')}>
          <GitCompareArrows size={12} aria-hidden />
          Diff
        </ToggleBtn>
      </div>
    </div>
  )
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 px-2 py-0.5 text-[10px] tracking-wider uppercase transition-colors',
        active
          ? 'bg-surface-hover text-text-primary'
          : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary',
      )}
    >
      {children}
    </button>
  )
}

interface ReadyPaneProps {
  snap: FileSnapshot
  code: CodePointer
  sha: string
  step: TourStep
  chapterId: string | undefined
  hl: Highlighter | undefined
  drafts: ReviewDrafts
  qa: QaThreads
  aiFindings: ReviewFindingsState
  aiPendingExpand?: string | null
  pendingScroll?: { line: number; nonce: number } | null
  onSendToChat?: (input: {
    file: string
    startLine: number
    endLine: number
    snippet: string
    question: string
  }) => void
  commentableLines: Set<number>
  onJumpToRef: (ref: CodePointer) => void
  onContextRequest?: (target: CodeContextTarget) => void
  mode: ViewMode
  onModeChange: (m: ViewMode) => void
  diffLayout: DiffLayout
  onDiffLayoutChange: (l: DiffLayout) => void
}

function ReadyPane({
  snap,
  code,
  sha,
  step,
  chapterId,
  hl,
  drafts,
  qa,
  aiFindings,
  aiPendingExpand,
  pendingScroll,
  onSendToChat,
  onContextRequest,
  commentableLines,
  onJumpToRef,
  mode,
  onModeChange,
  diffLayout,
  onDiffLayoutChange,
}: ReadyPaneProps): JSX.Element {
  const [composer, setComposer] = useState<ComposerTarget | null>(null)
  // Open the composer only on mouseup commit (after a drag / click finishes) so
  // a drag-select gesture doesn't get clobbered by a composer popping up on mousedown.
  const selection = useGutterSelection({
    onCommit: (range) => setComposer({ startLine: range.startLine, endLine: range.endLine }),
  })
  const search = useCodeSearch()
  useCmdFListener(search.open)
  const searchMatches = useMemo(
    () => buildContentMatches(snap.content ?? '', search.query, search.regex, search.caseSensitive),
    [snap.content, search.query, search.regex, search.caseSensitive],
  )
  // Only render drafts whose side matches the currently-shown side of the file.
  // A `before`-side draft anchored to baseLine 45 has nothing to do with line 45
  // of the head-side file — surfacing it inline would point at unrelated code.
  // Those drafts still surface in the Diff view (in the base column) and in the
  // submit modal.
  const reviewSide: 'before' | 'after' = code.side === 'before' ? 'before' : 'after'
  const fileDrafts = drafts.drafts.filter((d) => d.file === code.file && d.side === reviewSide)

  if (snap.encoding !== 'utf8' || !snap.content) {
    return (
      <OmittedPane
        file={code.file}
        sha={sha}
        side={code.side}
        encoding={snap.encoding}
        size={snap.size}
      />
    )
  }
  if (!hl) return <EmptyPane>Loading highlighter…</EmptyPane>
  const { focusLines, scrollTo: defaultScrollTo, range } = highlightWindow(code)
  // A click on a finding / ref overrides the step's own anchor lines so the
  // user lands on the line they clicked, not on the step's pinned range.
  // `nonce` keys the override so repeat clicks re-scroll.
  const scrollTo = pendingScroll?.line ?? defaultScrollTo
  const aiByLine = aiFindings.byLineMap(code.file)
  const dismissedFile = collectIds(aiByLine, (id) => aiFindings.isDismissed(id))
  const convertedFile = collectIds(aiByLine, (id) => aiFindings.isConverted(id))
  const otherSide: 'before' | 'after' = reviewSide === 'before' ? 'after' : 'before'
  const otherSideDraftCount = drafts.drafts.filter(
    (d) => d.file === code.file && d.side === otherSide,
  ).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewToggle
        mode={mode}
        onChange={onModeChange}
        diffLayout={diffLayout}
        onDiffLayoutChange={onDiffLayoutChange}
        header={<CodeHeader file={code.file} sha={sha} side={code.side} />}
      />
      {otherSideDraftCount > 0 && (
        <OtherSideDraftsBanner
          count={otherSideDraftCount}
          otherSide={otherSide}
          onJumpToDiff={() => {
            onModeChange('diff')
            onDiffLayoutChange('split')
          }}
        />
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <CodeSearchOverlay search={search} matchCount={searchMatches.length} />
        <CodeLines
          highlighter={hl}
          content={snap.content}
          lang={inferLang(code.file)}
          file={code.file}
          sha={sha}
          focusLines={focusLines}
          scrollTo={scrollTo}
          range={range}
          drafts={fileDrafts}
          composer={composer}
          selection={selection}
          commentableLines={commentableLines}
          searchMatches={searchMatches}
          searchActiveIndex={search.activeIndex}
          aiFindingsByLine={aiByLine}
          aiDismissed={dismissedFile}
          aiConverted={convertedFile}
          aiPendingExpand={aiPendingExpand}
          onAiDismiss={aiFindings.dismiss}
          onAiConvert={(finding) => convertFindingToDraft(finding, drafts, aiFindings, reviewSide)}
          onAiJumpSymbol={(loc: SymbolLocation) =>
            onJumpToRef({ file: loc.file, lineStart: loc.line })
          }
          onCloseComposer={() => {
            setComposer(null)
            selection.clear()
          }}
          onAskAiStream={(input, onEvent) =>
            qa.askStream({ ...input, chapterId: chapterId ?? null }, { onEvent })
          }
          onSendToChat={onSendToChat}
          onContextRequest={onContextRequest}
          onSaveDraft={async (target, body) => {
            const lo = Math.min(target.startLine, target.endLine)
            const hi = Math.max(target.startLine, target.endLine)
            await drafts.add({
              file: code.file,
              line: hi,
              startLine: lo === hi ? null : lo,
              side: reviewSide,
              body,
            })
            setComposer(null)
            selection.clear()
          }}
          onUpdateDraft={drafts.update}
          onReanchorDraft={drafts.reanchor}
          onDeleteDraft={drafts.remove}
        />
      </div>
      {step.references?.length ? (
        <References
          refs={step.references}
          // Every ref is now jumpable — TourView's dispatcher falls back to a
          // standalone read-only view when no step pins the referenced file.
          isJumpable={() => true}
          onClick={onJumpToRef}
        />
      ) : null}
    </div>
  )
}

/**
 * Pick the per-file commentable line set for the file currently in view. Uses
 * `code.side` to choose between the diff's left / right line numbering. Falls
 * back to an empty set while hunks are still loading (no false-positive
 * highlight; lines just look like today until the data arrives).
 */
function commentableSetForFile(
  hunks: ReturnType<typeof useHunks>,
  file: string,
  side: CodePointer['side'],
): Set<number> {
  if (hunks.kind !== 'ready') return EMPTY_LINES
  return commentableLineSet(hunks.response.files[file], side === 'before' ? 'left' : 'right')
}

const EMPTY_LINES: Set<number> = new Set()

function collectIds(
  aiByLine: Map<number, Finding[]>,
  predicate: (id: string) => boolean,
): Set<string> {
  const out = new Set<string>()
  for (const findings of aiByLine.values()) {
    for (const f of findings) {
      if (predicate(f.id)) out.add(f.id)
    }
  }
  return out
}

/**
 * Convert an AI finding into a user-authored review draft. The finding
 * itself stays in `review.findings` (and the inline ✨ remains so the
 * user can see its provenance) — but a new 💬 draft appears alongside,
 * pre-populated with body + suggestion + an AI-surfaced footer that the
 * submit-review modal uses to render the "AI-surfaced" pill.
 */
async function convertFindingToDraft(
  finding: Finding,
  drafts: ReviewDrafts,
  aiFindings: ReviewFindingsState,
  reviewSide: 'before' | 'after',
): Promise<void> {
  if (!finding.code?.file || finding.code.lineStart == null) return
  const lineEnd = finding.code.lineEnd ?? finding.code.lineStart
  const lineStart = finding.code.lineStart
  const body = buildDraftBodyFromFinding(finding)
  await drafts.add({
    file: finding.code.file,
    line: Math.max(lineStart, lineEnd),
    startLine: lineStart === lineEnd ? null : Math.min(lineStart, lineEnd),
    side: reviewSide,
    body,
  })
  aiFindings.markConverted(finding.id)
}

function buildDraftBodyFromFinding(finding: Finding): string {
  const parts = [finding.body]
  if (finding.suggestion) parts.push(`**Suggestion:** ${finding.suggestion}`)
  return parts.join('\n\n')
}

function buildContentMatches(
  content: string,
  query: string,
  regex: boolean,
  caseSensitive: boolean,
): CodeSearchMatch[] {
  const re = compileQuery(query, { regex, caseSensitive })
  if (!re) return []
  const lines = content.split('\n')
  const out: CodeSearchMatch[] = []
  for (let i = 0; i < lines.length; i++) {
    for (const r of findLineMatches(lines[i]!, re)) {
      out.push({ line: i + 1, start: r.start, end: r.end })
    }
  }
  return out
}

function OmittedPane({
  file,
  sha,
  side,
  encoding,
  size,
}: {
  file: string
  sha: string
  side: CodePointer['side']
  encoding: string
  size: number
}): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <CodeHeader file={file} sha={sha} side={side} />
      <div className="text-text-muted flex flex-1 items-center justify-center p-6 text-center text-xs">
        File omitted ({encoding}, {size} bytes).
      </div>
    </div>
  )
}

function EmptyPane({ children, tone }: { children: ReactNode; tone?: 'danger' }): JSX.Element {
  return (
    <div
      className={`flex h-full items-center justify-center p-6 text-center text-xs ${tone === 'danger' ? 'text-text-danger' : 'text-text-muted'}`}
    >
      {children}
    </div>
  )
}
