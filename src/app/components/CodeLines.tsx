import { Fragment, useEffect, useMemo, useRef, type JSX } from 'react'
import type { BundledLanguage, Highlighter, ThemedToken } from 'shiki'
import { cn } from '@/app/lib/utils'
import { SHIKI_THEME } from '@/app/hooks/useShiki'
import { DraftRow } from '@/app/components/DraftRow'
import { LineComposer } from '@/app/components/LineComposer'
import type { ReviewDraft } from '@/lib/api'

interface Props {
  highlighter: Highlighter
  content: string
  lang: string
  focus?: number
  range?: { start: number; end: number }
  drafts: ReviewDraft[]
  composerLine: number | null
  onOpenComposer: (line: number) => void
  onCloseComposer: () => void
  onSaveDraft: (line: number, body: string) => Promise<void>
  onUpdateDraft: (id: number, body: string) => Promise<void>
  onDeleteDraft: (id: number) => Promise<void>
}

interface TokensPayload {
  lines: ThemedToken[][]
  fg: string
  bg: string
}

export function CodeLines(props: Props): JSX.Element {
  const { highlighter, content, lang, focus, range, drafts, composerLine } = props
  const containerRef = useRef<HTMLDivElement>(null)

  const payload = useMemo<TokensPayload>(() => {
    const safeLang = (highlighter.getLoadedLanguages().includes(lang) ? lang : 'plaintext') as BundledLanguage
    const { tokens, fg, bg } = highlighter.codeToTokens(content, { lang: safeLang, theme: SHIKI_THEME })
    return { lines: tokens, fg: fg ?? '#d4d4d4', bg: bg ?? 'transparent' }
  }, [highlighter, content, lang])

  useEffect(() => {
    if (focus == null || !containerRef.current) return
    const target = containerRef.current.querySelector<HTMLElement>(`[data-line="${focus}"]`)
    target?.scrollIntoView({ block: 'center' })
  }, [focus, payload])

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
            const lineDrafts = drafts.filter((d) => d.line === lineNum)
            return (
              <Fragment key={lineNum}>
                <CodeLine
                  tokens={tokens}
                  lineNum={lineNum}
                  highlighted={!!range && lineNum >= range.start && lineNum <= range.end}
                  focused={focus === lineNum}
                  onAddComment={() => props.onOpenComposer(lineNum)}
                />
                {lineDrafts.map((d) => (
                  <DraftRow key={d.id} draft={d} onUpdate={props.onUpdateDraft} onDelete={props.onDeleteDraft} />
                ))}
                {composerLine === lineNum && (
                  <LineComposer
                    onSave={(body) => props.onSaveDraft(lineNum, body)}
                    onCancel={props.onCloseComposer}
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

interface CodeLineProps {
  tokens: ThemedToken[]
  lineNum: number
  highlighted: boolean
  focused: boolean
  onAddComment: () => void
}

function CodeLine({ tokens, lineNum, highlighted, focused, onAddComment }: CodeLineProps): JSX.Element {
  return (
    <span
      data-line={lineNum}
      className={cn(
        'group code-line flex items-start',
        highlighted && 'line-hl',
        focused && 'line-focus',
      )}
    >
      <button
        type="button"
        onClick={onAddComment}
        title={`Comment on line ${lineNum}`}
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
  // shiki FontStyle: 1=italic, 2=bold, 4=underline. We only handle italic visually.
  return mask != null && (mask & 1) === 1 ? 'italic' : 'normal'
}
