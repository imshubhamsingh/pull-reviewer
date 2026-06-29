import { Sparkles } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { BundledLanguage, Highlighter, ThemedToken } from 'shiki'
import { cn } from '@/app/lib/utils'
import { SHIKI_THEME } from '@/app/hooks/use-shiki'
import type { GutterSelection } from '@/app/hooks/use-gutter-selection'
import { AiCommentCard } from '@/app/components/ai-comment-card'
import { DraftRow } from '@/app/components/draft-row'
import { LineComposer } from '@/app/components/line-composer'
import type { AskContext } from '@/app/components/ask-ai-panel'
import { highlightTokens } from '@/app/lib/highlight-matches'
import { useCodeContextMenu, type CodeContextTarget } from '@/app/hooks/use-code-context-menu'
import type { LineMatchRange } from '@/app/lib/code-search'
import type { AskStreamEvent, Finding, QaThread, ReviewDraft, SymbolLocation } from '@/lib/api'

export interface CodeSearchMatch {
  line: number
  start: number
  end: number
}

export interface ComposerTarget {
  startLine: number
  endLine: number
}

interface Props {
  highlighter: Highlighter
  content: string
  lang: string
  file: string
  sha: string
  /** Lines to emphasise. The first is also the line we scroll-into-view. */
  focusLines?: Set<number>
  /** Single line to scroll-into-view (derived from focusLines but kept explicit for clarity). */
  scrollTo?: number
  range?: { start: number; end: number }
  drafts: ReviewDraft[]
  composer: ComposerTarget | null
  selection: GutterSelection
  /** Line numbers (on the current side) that fall inside a diff hunk — these
   * are the lines GitHub will accept a review comment on. Lines outside this
   * set still accept drag-select and draft creation; they just don't get the
   * left-border accent. Empty when hunks haven't loaded yet. */
  commentableLines?: Set<number>
  /** AI review findings on this file, keyed by `code.lineStart`. Optional. */
  aiFindingsByLine?: Map<number, Finding[]>
  /** Set of dismissed finding ids; dismissed findings don't render their gutter ✨. */
  aiDismissed?: Set<string>
  /** Set of finding ids already converted to a draft; passed through to the card to disable the button. */
  aiConverted?: Set<string>
  /** When set, auto-open the inline card for the finding with this id (e.g., from right-pane jump). */
  aiPendingExpand?: string | null
  onAiDismiss?: (findingId: string) => Promise<void> | void
  onAiUndismiss?: (findingId: string) => Promise<void> | void
  onAiConvert?: (finding: Finding) => Promise<void> | void
  onAiJumpSymbol?: (loc: SymbolLocation) => void
  onCloseComposer: () => void
  onSaveDraft: (target: ComposerTarget, body: string) => Promise<void>
  onUpdateDraft: (id: number, body: string) => Promise<void>
  onReanchorDraft: (id: number, line: number, startLine: number | null) => Promise<void>
  onDeleteDraft: (id: number) => Promise<void>
  onAskAiStream?: (
    input: { file: string; sha: string; startLine: number; endLine: number; question: string },
    onEvent: (e: AskStreamEvent) => void,
  ) => Promise<QaThread>
  /** Hand a free-form question + the selected snippet's `(file, startLine,
   *  endLine, content slice)` to the host so it can pre-fill the right-pane
   *  chat composer. CodeLines builds the markdown wrapper; the host just
   *  pivots panes and pre-fills. */
  onSendToChat?: (input: {
    file: string
    startLine: number
    endLine: number
    snippet: string
    question: string
  }) => void
  /** Search matches in this file's content; the line+range tuples used to
   *  paint highlights and to scroll the active match into view. */
  searchMatches?: CodeSearchMatch[]
  /** Index into `searchMatches` of the currently-active match — the one
   *  that should be flashed + scrolled into view. -1 / undefined disables. */
  searchActiveIndex?: number
  /** Right-click handler — when set, a contextmenu on any rendered line
   *  resolves to `(file, line, column, symbol)` and fires this. The host
   *  opens its `ContextMenu` portal from the target. Leaves whitespace
   *  clicks alone so the native menu still works there. */
  onContextRequest?: (target: CodeContextTarget) => void
}

interface TokensPayload {
  lines: ThemedToken[][]
  fg: string
  bg: string
}

export function CodeLines(props: Props): JSX.Element {
  const {
    highlighter,
    content,
    lang,
    file,
    sha,
    focusLines,
    scrollTo,
    range,
    drafts,
    composer,
    selection,
    commentableLines,
    aiFindingsByLine,
    aiDismissed,
    aiConverted,
    aiPendingExpand,
    onAiDismiss,
    onAiConvert,
    onAiJumpSymbol,
    onAskAiStream,
    onSendToChat,
    searchMatches,
    searchActiveIndex,
    onContextRequest,
  } = props
  const ctxMenu = useCodeContextMenu({ file, onOpen: onContextRequest ?? noop })
  const containerRef = useRef<HTMLDivElement>(null)
  const focusSet = focusLines ?? EMPTY_FOCUS
  const commentableSet = commentableLines ?? EMPTY_FOCUS
  const dismissedSet = aiDismissed ?? EMPTY_STRING_SET
  const convertedSet = aiConverted ?? EMPTY_STRING_SET
  const aiByLine = aiFindingsByLine ?? EMPTY_AI_MAP
  // Per-line open state for AI cards. The pending-expand prop seeds this on
  // mount so click-to-jump from the right-pane lands on an already-open card.
  const [openAiLines, setOpenAiLines] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (!aiPendingExpand) return
    for (const [line, findings] of aiByLine) {
      if (findings.some((f) => f.id === aiPendingExpand)) {
        setOpenAiLines((prev) => {
          if (prev.has(line)) return prev
          const next = new Set(prev)
          next.add(line)
          return next
        })
        break
      }
    }
  }, [aiPendingExpand, aiByLine])

  const payload = useMemo<TokensPayload>(() => {
    const safeLang = (
      highlighter.getLoadedLanguages().includes(lang) ? lang : 'plaintext'
    ) as BundledLanguage
    const { tokens, fg, bg } = highlighter.codeToTokens(content, {
      lang: safeLang,
      theme: SHIKI_THEME,
    })
    return { lines: tokens, fg: fg ?? '#d4d4d4', bg: bg ?? 'transparent' }
  }, [highlighter, content, lang])

  // Every line covered by any pending draft — single-line drafts paint one row,
  // range drafts paint [startLine, line] inclusive. Drives the persistent
  // line-drafted highlight so a multi-line comment stays visible across the
  // whole selection after the composer closes.
  const draftedLines = useMemo(() => {
    const s = new Set<number>()
    for (const d of drafts) {
      const { start, end } = draftRange(d)
      for (let i = start; i <= end; i++) s.add(i)
    }
    return s
  }, [drafts])

  // Bucket search matches by line so the per-line render is O(matches-on-this-line).
  const matchesByLine = useMemo(() => bucketMatchesByLine(searchMatches), [searchMatches])
  const activeMatch =
    searchMatches && searchActiveIndex != null && searchActiveIndex >= 0
      ? searchMatches[searchActiveIndex]
      : undefined

  useEffect(() => {
    if (scrollTo == null || !containerRef.current) return
    const target = containerRef.current.querySelector<HTMLElement>(`[data-line="${scrollTo}"]`)
    target?.scrollIntoView({ block: 'center' })
  }, [scrollTo, payload])

  // Scroll the active search match into view + flash it briefly. The flash is
  // driven by a temporary attribute that the CSS animation listens for.
  useEffect(() => {
    if (!activeMatch || !containerRef.current) return
    const lineEl = containerRef.current.querySelector<HTMLElement>(
      `[data-line="${activeMatch.line}"]`,
    )
    lineEl?.scrollIntoView({ block: 'center' })
    const activeSeg = lineEl?.querySelector<HTMLElement>('[data-search-active="true"]')
    if (!activeSeg) return
    activeSeg.classList.add('search-match-active-flash')
    const id = window.setTimeout(() => activeSeg.classList.remove('search-match-active-flash'), 700)
    return () => window.clearTimeout(id)
  }, [activeMatch])

  return (
    <div
      ref={containerRef}
      className="shiki-block min-h-0 flex-1 overflow-auto text-xs"
      style={{ backgroundColor: payload.bg, color: payload.fg }}
      onContextMenu={onContextRequest ? ctxMenu.onContextMenu : undefined}
    >
      <pre className="my-3">
        <code className="block">
          {payload.lines.map((tokens, idx) => {
            const lineNum = idx + 1
            const lineDrafts = drafts.filter((d) => isDraftAnchoredHere(d, lineNum))
            const composerAnchoredHere = composer && composer.endLine === lineNum
            const lineAi = aiByLine.get(lineNum) ?? []
            const visibleAi = lineAi.filter((f) => !dismissedSet.has(f.id))
            const aiIsOpen = openAiLines.has(lineNum)
            const toggleAi = (): void =>
              setOpenAiLines((prev) => {
                const next = new Set(prev)
                if (next.has(lineNum)) next.delete(lineNum)
                else next.add(lineNum)
                return next
              })
            const closeAi = (): void =>
              setOpenAiLines((prev) => {
                if (!prev.has(lineNum)) return prev
                const next = new Set(prev)
                next.delete(lineNum)
                return next
              })
            const lineMatches = matchesByLine.get(lineNum) ?? EMPTY_MATCHES
            const activeRangeForLine =
              activeMatch && activeMatch.line === lineNum
                ? { start: activeMatch.start, end: activeMatch.end }
                : null
            return (
              <Fragment key={lineNum}>
                <CodeLine
                  tokens={tokens}
                  lineNum={lineNum}
                  highlighted={!!range && lineNum >= range.start && lineNum <= range.end}
                  focused={focusSet.has(lineNum)}
                  selected={selection.isInRange(lineNum)}
                  drafted={draftedLines.has(lineNum)}
                  commentable={commentableSet.has(lineNum)}
                  matches={lineMatches}
                  activeMatch={activeRangeForLine}
                  aiFindingCount={visibleAi.length}
                  aiIsOpen={aiIsOpen}
                  onAiToggle={visibleAi.length > 0 ? toggleAi : undefined}
                  onGutterDown={(shift) => selection.start(lineNum, shift)}
                  onGutterEnter={() => selection.extend(lineNum)}
                />
                {aiIsOpen &&
                  visibleAi.map((f) => (
                    <AiCommentCard
                      key={f.id}
                      finding={f}
                      isConverted={convertedSet.has(f.id)}
                      isDismissed={dismissedSet.has(f.id)}
                      onConvert={() => onAiConvert?.(f)}
                      onDismiss={() => onAiDismiss?.(f.id)}
                      onClose={closeAi}
                      onJumpToSymbol={(loc) => onAiJumpSymbol?.(loc)}
                    />
                  ))}
                {lineDrafts.map((d) => (
                  <DraftRow
                    key={d.id}
                    draft={d}
                    file={file}
                    sha={sha}
                    onUpdate={props.onUpdateDraft}
                    onReanchor={props.onReanchorDraft}
                    onDelete={props.onDeleteDraft}
                    onAskAiStream={onAskAiStream}
                  />
                ))}
                {composerAnchoredHere && composer && (
                  <LineComposer
                    rangeLabel={composerRangeLabel(composer)}
                    askContext={onAskAiStream ? composerAskContext(composer, file, sha) : undefined}
                    onAskStream={
                      onAskAiStream
                        ? (question, onEvent) =>
                            onAskAiStream(
                              {
                                file,
                                sha,
                                startLine: Math.min(composer.startLine, composer.endLine),
                                endLine: Math.max(composer.startLine, composer.endLine),
                                question,
                              },
                              onEvent,
                            )
                        : undefined
                    }
                    onSave={(body) => props.onSaveDraft(composer, body)}
                    onSendToChat={
                      onSendToChat
                        ? (question) => {
                            const lo = Math.min(composer.startLine, composer.endLine)
                            const hi = Math.max(composer.startLine, composer.endLine)
                            const lines = content.split('\n')
                            const snippet = lines.slice(lo - 1, hi).join('\n')
                            onSendToChat({
                              file,
                              startLine: lo,
                              endLine: hi,
                              snippet,
                              question,
                            })
                            selection.clear()
                          }
                        : undefined
                    }
                    onCancel={() => {
                      props.onCloseComposer()
                      selection.clear()
                    }}
                  />
                )}
              </Fragment>
            )
          })}
        </code>
      </pre>
    </div>
  )
}

function isDraftAnchoredHere(d: ReviewDraft, line: number): boolean {
  // The DraftRow itself attaches at the end-line of a range (GitHub convention);
  // the line-drafted highlight separately paints the whole [start, end] window.
  return d.line === line
}

function draftRange(d: ReviewDraft): { start: number; end: number } {
  if (d.startLine == null || d.startLine === d.line) return { start: d.line, end: d.line }
  return { start: Math.min(d.startLine, d.line), end: Math.max(d.startLine, d.line) }
}

function composerRangeLabel(c: ComposerTarget): string {
  const lo = Math.min(c.startLine, c.endLine)
  const hi = Math.max(c.startLine, c.endLine)
  return lo === hi ? `line ${lo}` : `lines ${lo}–${hi}`
}

function composerAskContext(c: ComposerTarget, file: string, sha: string): AskContext {
  return {
    file,
    sha,
    startLine: Math.min(c.startLine, c.endLine),
    endLine: Math.max(c.startLine, c.endLine),
  }
}

interface CodeLineProps {
  tokens: ThemedToken[]
  lineNum: number
  highlighted: boolean
  focused: boolean
  selected: boolean
  drafted: boolean
  commentable: boolean
  /** Search match ranges within this line; drives `.search-match` highlighting. */
  matches: LineMatchRange[]
  /** When set, the single range that should render as `.search-match-active`. */
  activeMatch: LineMatchRange | null
  /** How many non-dismissed AI findings exist on this line; 0 hides the ✨ icon. */
  aiFindingCount: number
  /** Whether the inline ✨ card(s) for this line are currently expanded. */
  aiIsOpen: boolean
  /** Click handler for the ✨ icon. Only wired when `aiFindingCount > 0`. */
  onAiToggle?: () => void
  onGutterDown: (shiftKey: boolean) => void
  onGutterEnter: () => void
}

function CodeLine({
  tokens,
  lineNum,
  highlighted,
  focused,
  selected,
  drafted,
  commentable,
  matches,
  activeMatch,
  aiFindingCount,
  aiIsOpen,
  onAiToggle,
  onGutterDown,
  onGutterEnter,
}: CodeLineProps): JSX.Element {
  const segments = highlightTokens(tokens, matches, activeMatch)
  return (
    <span
      data-line={lineNum}
      className={cn(
        'group code-line flex items-start',
        highlighted && 'line-hl',
        focused && 'line-focus',
        selected && 'line-selected',
        drafted && 'line-drafted',
        commentable && 'line-commentable',
      )}
    >
      <span className="flex w-5 shrink-0 items-center justify-center leading-[1.55]">
        {aiFindingCount > 0 && onAiToggle && (
          <button
            type="button"
            onClick={onAiToggle}
            title={
              aiIsOpen
                ? `Hide AI finding${aiFindingCount > 1 ? 's' : ''}`
                : `${aiFindingCount} AI finding${aiFindingCount > 1 ? 's' : ''} on line ${lineNum}`
            }
            className={cn(
              'inline-flex items-center gap-0.5 transition-colors',
              aiIsOpen ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            <Sparkles size={11} aria-hidden />
            {aiFindingCount > 1 && (
              <span className="text-[10px] tabular-nums">{aiFindingCount}</span>
            )}
          </button>
        )}
      </span>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          onGutterDown(e.shiftKey)
        }}
        onMouseEnter={onGutterEnter}
        title={`Comment on line ${lineNum} (drag or shift+click to select a range)`}
        className="code-gutter relative w-12 shrink-0 pr-3 text-right text-[10px] leading-[1.55] select-none"
      >
        <span className="text-text-muted group-hover:text-text-primary transition-colors">
          {lineNum}
        </span>
        <span className="text-interactive-primary absolute -right-0.5 -top-0.5 hidden text-xs group-hover:inline">
          +
        </span>
      </button>
      <span className="code-content min-w-0 flex-1 pr-3">
        {segments.map((seg, i) => (
          <span
            key={i}
            className={cn(seg.matched && 'search-match', seg.active && 'search-match-active')}
            data-search-active={seg.active ? 'true' : undefined}
            style={{ color: seg.color, fontStyle: fontStyle(seg.fontStyle) }}
          >
            {seg.content}
          </span>
        ))}
        {tokens.length === 0 && '\n'}
      </span>
    </span>
  )
}

function fontStyle(mask: number | undefined): React.CSSProperties['fontStyle'] {
  return mask != null && (mask & 1) === 1 ? 'italic' : 'normal'
}

function bucketMatchesByLine(
  matches: CodeSearchMatch[] | undefined,
): Map<number, LineMatchRange[]> {
  const out = new Map<number, LineMatchRange[]>()
  if (!matches) return out
  for (const m of matches) {
    const list = out.get(m.line)
    const range: LineMatchRange = { start: m.start, end: m.end }
    if (list) list.push(range)
    else out.set(m.line, [range])
  }
  return out
}

const EMPTY_FOCUS = new Set<number>()
const EMPTY_STRING_SET = new Set<string>()
const EMPTY_AI_MAP = new Map<number, Finding[]>()
const EMPTY_MATCHES: LineMatchRange[] = []
const noop = (_target: CodeContextTarget): void => {}
