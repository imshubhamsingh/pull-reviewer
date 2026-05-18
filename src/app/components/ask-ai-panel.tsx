import { useEffect, useMemo, useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import { MarkdownView } from '@/app/components/markdown-view'
import type { AskStreamEvent, QaThread } from '@/lib/api'

export interface AskContext {
  sha: string
  file: string
  startLine: number
  endLine: number
}

/** Imperative + reactive state surface for an external "Ask" button. */
export interface AskActions {
  submit: () => void
  canSubmit: boolean
  busy: boolean
}

interface Props {
  context: AskContext
  /**
   * Streaming ask — invokes onEvent for each tool_call / partial_text event,
   * resolves with the persisted thread when the model finishes.
   */
  onAskStream: (question: string, onEvent: (e: AskStreamEvent) => void) => Promise<QaThread>
  onUseAsComment: (text: string) => void
  /** Lets a parent (e.g. LineComposer) render its own submit button. */
  onActionsChange?: (actions: AskActions) => void
}

function placeholderFor(context: AskContext): string {
  const lo = Math.min(context.startLine, context.endLine)
  const hi = Math.max(context.startLine, context.endLine)
  return lo === hi ? `Ask AI about line ${lo}…` : `Ask AI about lines ${lo}–${hi}…`
}

export function AskAiPanel({
  context,
  onAskStream,
  onUseAsComment,
  onActionsChange,
}: Props): JSX.Element {
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [events, setEvents] = useState<AskStreamEvent[]>([])
  const [answer, setAnswer] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const placeholder = useMemo(() => placeholderFor(context), [context])

  const ask = async (): Promise<void> => {
    const trimmed = question.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(undefined)
    setAnswer(undefined)
    setEvents([])
    try {
      const thread = await onAskStream(trimmed, (e) => setEvents((prev) => [...prev, e]))
      setAnswer(thread.answer)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Surface submit + reactive flags to a parent so it can render its own
  // primary button (LineComposer relabels the footer's CTA to "Ask").
  useEffect(() => {
    onActionsChange?.({
      submit: () => void ask(),
      canSubmit: !!question.trim() && !busy,
      busy,
    })
  }, [question, busy, onActionsChange])

  return (
    <div className="min-w-0">
      <div className="relative min-w-0">
        <textarea
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void ask()
          }}
          placeholder={busy ? 'Asking…' : `${placeholder} (⌘↵ to ask)`}
          disabled={busy}
          rows={3}
          className="bg-bg border-border text-text-primary w-full resize-y rounded-sm border px-2 py-1 pr-7 text-xs leading-relaxed outline-none disabled:cursor-wait disabled:opacity-60"
        />
        {busy && (
          <span aria-hidden className="text-text-muted pointer-events-none absolute top-2 right-2">
            <Spinner />
          </span>
        )}
      </div>
      {busy && <ActivityLog events={events} />}
      {error && <p className="text-text-danger mt-2 text-xs">{error}</p>}
      {answer && (
        <div className="mt-2 min-w-0">
          <MarkdownView
            body={answer}
            className="text-text-secondary min-w-0 text-xs leading-relaxed break-words"
          />
          <button
            type="button"
            onClick={() => onUseAsComment(formatAsQuote(question.trim(), answer))}
            className="text-text-muted hover:text-text-primary mt-2 text-[11px] transition-colors"
          >
            ↡ Use as comment
          </button>
        </div>
      )}
    </div>
  )
}

const TAIL = 5

function ActivityLog({ events }: { events: AskStreamEvent[] }): JSX.Element {
  const lines = events
    .map(describe)
    .filter((s): s is string => s != null)
    .slice(-TAIL)
  if (lines.length === 0) {
    return <p className="text-text-muted mt-2 font-mono text-[11px]">… thinking</p>
  }
  return (
    <ul className="text-text-muted mt-2 space-y-0.5 font-mono text-[11px]">
      {lines.map((l, i) => (
        <li key={i} className="truncate">
          {l}
        </li>
      ))}
    </ul>
  )
}

function describe(e: AskStreamEvent | undefined): string | null {
  if (!e) return null
  return match(e)
    .with({ event: 'tool_call' }, ({ data }) => {
      const args = stringifyInput(data.input)
      return args ? `→ ${data.name} ${args}` : `→ ${data.name}`
    })
    .with({ event: 'final' }, () => '✓ composing answer…')
    .with({ event: 'partial_text' }, () => null)
    .with({ event: 'done' }, () => null)
    .with({ event: 'error' }, ({ data }) => `✗ ${data.message}`)
    .exhaustive()
}

function stringifyInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return trim(input, 80)
  if (typeof input !== 'object') return String(input)
  const values = Object.values(input as Record<string, unknown>)
    .filter((v) => v != null && v !== '')
    .map((v) => (typeof v === 'string' ? trim(v, 60) : JSON.stringify(v)))
  return values.join(' ')
}

function trim(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function Spinner(): JSX.Element {
  return (
    <span
      aria-hidden
      className="border-text-secondary border-t-text-primary inline-block h-3 w-3 animate-spin rounded-full border"
    />
  )
}

function formatAsQuote(question: string, answer: string): string {
  return `> **Q:** ${question}\n\n${answer}`
}
