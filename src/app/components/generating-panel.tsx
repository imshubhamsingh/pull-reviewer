import { Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import type { CliStream, TourStreamEvent } from '@/lib/api'

interface Props {
  events: TourStreamEvent[]
  onCancel?: () => void
}

const TAIL = 5

interface Phase {
  name: string
  detail?: string
}

/**
 * Two-column generating screen — tour gen on the left, AI review on the
 * right. Each column shows its own phase headline, tool-call counts, and
 * recent activity tail. Backend tags every CliEvent with `stream: 'tour'`
 * or `stream: 'review'`; events without a tag default to `tour` (legacy /
 * pre-parallel events).
 */
export function GeneratingPanel({ events, onCancel }: Props): JSX.Element {
  const elapsed = useElapsed()
  const tourEvents = useMemo(() => filterByStream(events, 'tour'), [events])
  const reviewEvents = useMemo(() => filterByStream(events, 'review'), [events])
  const reviewActive = reviewEvents.length > 0

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
      <Spinner />
      <p className="text-text-secondary text-xs">{formatElapsed(elapsed)}</p>
      <div className="grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
        <StreamColumn title="Tour generation" stream="tour" events={tourEvents} />
        <StreamColumn
          title="AI review"
          stream="review"
          events={reviewEvents}
          inactiveLabel={reviewActive ? undefined : 'Standing by…'}
          icon={<Sparkles size={11} aria-hidden />}
        />
      </div>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-text-secondary hover:text-text-danger mt-2 text-xs underline-offset-2 transition-colors hover:underline"
        >
          Cancel generation
        </button>
      )}
    </div>
  )
}

interface ColumnProps {
  title: string
  stream: CliStream
  events: TourStreamEvent[]
  /** Shown in place of the activity tail when no events have arrived yet. */
  inactiveLabel?: string
  icon?: JSX.Element
}

function StreamColumn({ title, stream, events, inactiveLabel, icon }: ColumnProps): JSX.Element {
  const phase = useMemo(() => latestPhase(events), [events])
  const toolCounts = useMemo(() => countTools(events), [events])
  const tail = useMemo(() => recentActivities(events, TAIL), [events])
  const thinking = useMemo(() => latestThinking(events), [events])
  return (
    <section className="border-border rounded-md border p-3">
      <header className="text-text-secondary mb-2 flex items-center gap-1.5 text-[10px] tracking-wider uppercase">
        {icon}
        <span>{title}</span>
      </header>
      {inactiveLabel ? (
        <p className="text-text-muted text-xs italic">{inactiveLabel}</p>
      ) : (
        <>
          <p className="text-text-primary text-sm font-medium">{phase.name}</p>
          {phase.detail && (
            <p className="text-text-muted mt-0.5 font-mono text-[11px]">{phase.detail}</p>
          )}
          {toolCounts.length > 0 && (
            <p className="text-text-muted mt-1.5 font-mono text-[10px]">
              {toolCounts.map((t, i) => (
                <span key={t.name}>
                  {i > 0 && ' · '}
                  {t.name.toLowerCase()} <span className="text-text-secondary">{t.count}</span>
                </span>
              ))}
            </p>
          )}
          {tail.length > 0 && (
            <ul className="text-text-muted mt-2 space-y-0.5 font-mono text-[11px]">
              {tail.map((line, i) => (
                <li key={i} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
          )}
          {thinking && (
            <p className="text-text-muted/70 mt-2 line-clamp-2 font-mono text-[10px] italic">
              … {thinking}
            </p>
          )}
        </>
      )}
      <span aria-hidden className="hidden">
        {stream}
      </span>
    </section>
  )
}

function Spinner(): JSX.Element {
  return (
    <div
      aria-label="loading"
      className="border-border border-t-text-brand h-10 w-10 animate-spin rounded-full border-2"
    />
  )
}

function useElapsed(): number {
  const start = useMemo(() => Date.now(), [])
  const [now, setNow] = useState(start)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now - start
}

function filterByStream(events: TourStreamEvent[], stream: CliStream): TourStreamEvent[] {
  return events.filter((e) => {
    if (e.event === 'done' || e.event === 'error') return false
    const tagged = e.data.stream ?? 'tour' // legacy / pre-parallel events default to tour
    return tagged === stream
  })
}

/**
 * Live "thinking" line — shows the tail of the model's prose narration, not
 * the structured JSON output. Once the model starts the array/object that
 * carries the actual tour (per rules.md, this comes AFTER 1-3 sentences of
 * plain plan), we stop appending to the thinking display.
 */
function latestThinking(events: TourStreamEvent[]): string | undefined {
  let acc = ''
  for (const e of events) {
    if (e.event === 'partial_text') acc += e.data.text
  }
  if (!acc) return undefined
  const jsonStart = acc.search(/[[{]/)
  const prose = (jsonStart >= 0 ? acc.slice(0, jsonStart) : acc).trim()
  if (prose.length < 2) return undefined
  const collapsed = prose.replace(/\s+/g, ' ')
  return collapsed.length > 100 ? '… ' + collapsed.slice(-99) : collapsed
}

function latestPhase(events: TourStreamEvent[]): Phase {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e && e.event === 'phase') return { name: e.data.name, detail: e.data.detail }
  }
  return { name: 'Starting…' }
}

function countTools(events: TourStreamEvent[]): Array<{ name: string; count: number }> {
  const counts = events
    .filter(isToolCall)
    .reduce<
      Map<string, number>
    >((acc, e) => acc.set(e.data.name, (acc.get(e.data.name) ?? 0) + 1), new Map())
  return [...counts.entries()].map(([name, count]) => ({ name, count }))
}

function isToolCall(e: TourStreamEvent): e is Extract<TourStreamEvent, { event: 'tool_call' }> {
  return e.event === 'tool_call'
}

function recentActivities(events: TourStreamEvent[], n: number): string[] {
  return events
    .filter((e) => e.event !== 'phase')
    .map(describe)
    .filter((s): s is string => s != null)
    .slice(-n)
}

function describe(e: TourStreamEvent): string | null {
  return match(e)
    .with({ event: 'tool_call' }, ({ data }) => {
      const args = stringifyInput(data.input)
      return args ? `→ ${data.name} ${args}` : `→ ${data.name}`
    })
    .with({ event: 'partial_text' }, () => null)
    .with(
      { event: 'phase' },
      ({ data }) => `▸ ${data.name}${data.detail ? ` — ${data.detail}` : ''}`,
    )
    .with({ event: 'final' }, () => '✓ model finished')
    .with({ event: 'done' }, () => '✓ done')
    .with({ event: 'error' }, ({ data }) => `✗ ${data.message}`)
    .exhaustive()
}

function stringifyInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return trim(stripWorktreePath(input), 60)
  if (typeof input !== 'object') return String(input)
  const values = Object.values(input as Record<string, unknown>)
    .filter((v) => v != null && v !== '')
    .map((v) => (typeof v === 'string' ? trim(stripWorktreePath(v), 50) : JSON.stringify(v)))
  return values.join(' ')
}

function stripWorktreePath(s: string): string {
  const m = /\/code-tour-[a-f0-9]+\/(.+)$/.exec(s)
  return m?.[1] ?? s
}

function trim(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
