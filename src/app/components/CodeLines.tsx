import { Fragment, useEffect, useMemo, useRef, type JSX } from 'react'
import type { BundledLanguage, Highlighter, ThemedToken } from 'shiki'
import { cn } from '@/app/lib/utils'
import { SHIKI_THEME } from '@/app/hooks/useShiki'
import type { GutterSelection } from '@/app/hooks/useGutterSelection'
import { DraftRow } from '@/app/components/DraftRow'
import { LineComposer } from '@/app/components/LineComposer'
import type { AskContext } from '@/app/components/AskAiPanel'
import type { AskStreamEvent, QaThread, ReviewDraft } from '@/lib/api'

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
  onCloseComposer: () => void
  onSaveDraft: (target: ComposerTarget, body: string) => Promise<void>
  onUpdateDraft: (id: number, body: string) => Promise<void>
  onDeleteDraft: (id: number) => Promise<void>
  onAskAiStream?: (
    input: { file: string; sha: string; startLine: number; endLine: number; question: string },
    onEvent: (e: AskStreamEvent) => void,
  ) => Promise<QaThread>
}

interface TokensPayload {
  lines: ThemedToken[][]
  fg: string
  bg: string
}

export function CodeLines(props: Props): JSX.Element {
  const { highlighter, content, lang, file, sha, focusLines, scrollTo, range, drafts, composer, selection, onAskAiStream } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const focusSet = focusLines ?? EMPTY_FOCUS

  const payload = useMemo<TokensPayload>(() => {
    const safeLang = (highlighter.getLoadedLanguages().includes(lang) ? lang : 'plaintext') as BundledLanguage
    const { tokens, fg, bg } = highlighter.codeToTokens(content, { lang: safeLang, theme: SHIKI_THEME })
    return { lines: tokens, fg: fg ?? '#d4d4d4', bg: bg ?? 'transparent' }
  }, [highlighter, content, lang])

  useEffect(() => {
    if (scrollTo == null || !containerRef.current) return
    const target = containerRef.current.querySelector<HTMLElement>(`[data-line="${scrollTo}"]`)
    target?.scrollIntoView({ block: 'center' })
  }, [scrollTo, payload])

  return (
    <div
      ref={containerRef}
      className="shiki-block min-h-0 flex-1 overflow-auto text-xs"
      style={{ backgroundColor: payload.bg, color: payload.fg }}
    >
      <pre className="my-3">
        <code className="block">
          {payload.lines.map((tokens, idx) => {
            const lineNum = idx + 1
            const lineDrafts = drafts.filter((d) => isDraftAnchoredHere(d, lineNum))
            const composerAnchoredHere = composer && composer.endLine === lineNum
            return (
              <Fragment key={lineNum}>
                <CodeLine
                  tokens={tokens}
                  lineNum={lineNum}
                  highlighted={!!range && lineNum >= range.start && lineNum <= range.end}
                  focused={focusSet.has(lineNum)}
                  selected={selection.isInRange(lineNum)}
                  onGutterDown={(shift) => selection.start(lineNum, shift)}
                  onGutterEnter={() => selection.extend(lineNum)}
                />
                {lineDrafts.map((d) => (
                  <DraftRow key={d.id} draft={d} onUpdate={props.onUpdateDraft} onDelete={props.onDeleteDraft} />
                ))}
                {composerAnchoredHere && composer && (
                  <LineComposer
                    rangeLabel={composerRangeLabel(composer)}
                    askContext={onAskAiStream ? composerAskContext(composer, file, sha) : undefined}
                    onAskStream={onAskAiStream ? (question, onEvent) => onAskAiStream({
                      file,
                      sha,
                      startLine: Math.min(composer.startLine, composer.endLine),
                      endLine: Math.max(composer.startLine, composer.endLine),
                      question,
                    }, onEvent) : undefined}
                    onSave={(body) => props.onSaveDraft(composer, body)}
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
  return d.line === line
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
  onGutterDown: (shiftKey: boolean) => void
  onGutterEnter: () => void
}

function CodeLine({ tokens, lineNum, highlighted, focused, selected, onGutterDown, onGutterEnter }: CodeLineProps): JSX.Element {
  return (
    <span
      data-line={lineNum}
      className={cn(
        'group code-line flex items-start',
        highlighted && 'line-hl',
        focused && 'line-focus',
        selected && 'line-selected',
      )}
    >
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onGutterDown(e.shiftKey) }}
        onMouseEnter={onGutterEnter}
        title={`Comment on line ${lineNum} (drag or shift+click to select a range)`}
        className="code-gutter relative w-12 shrink-0 pr-3 text-right text-[10px] leading-[1.55] select-none"
      >
        <span className="text-text-muted group-hover:text-text-primary transition-colors">{lineNum}</span>
        <span className="text-interactive-primary absolute -right-0.5 -top-0.5 hidden text-xs group-hover:inline">+</span>
      </button>
      <span className="code-content min-w-0 flex-1 pr-3">
        {tokens.map((tok, i) => (
          <span key={i} style={{ color: tok.color, fontStyle: fontStyle(tok.fontStyle) }}>
            {tok.content}
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

const EMPTY_FOCUS = new Set<number>()
