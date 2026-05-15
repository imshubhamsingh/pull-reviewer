import { useEffect, useMemo, useState, type JSX } from 'react'
import { match } from 'ts-pattern'
import type { TourStreamEvent } from '@/lib/api'

interface Props {
  events: TourStreamEvent[]
  onCancel?: () => void
}

const TAIL = 6

interface Phase {
  name: string
  detail?: string
}

export function GeneratingPanel({ events, onCancel }: Props): JSX.Element {
  const elapsed = useElapsed()
  const phase = useMemo(() => latestPhase(events), [events])
  const toolCounts = useMemo(() => countTools(events), [events])
  const tail = useMemo(() => recentActivities(events, TAIL), [events])
  const thinking = useMemo(() => latestThinking(events), [events])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
      <Spinner />
      <div className="text-center">
        <p className="text-text-primary text-sm font-medium">{phase.name}</p>
        {phase.detail && <p className="text-text-muted mt-1 font-mono text-xs">{phase.detail}</p>}
      </div>
      <Stats elapsedMs={elapsed} toolCounts={toolCounts} />
      {tail.length > 0 && (
        <ul className="text-text-muted mx-auto w-fit max-w-2xl space-y-0.5 font-mono text-xs">
          {tail.map((line, i) => <li key={i} className="truncate">{line}</li>)}
        </ul>
      )}
      {thinking && (
        <p className="text-text-muted/70 mx-auto max-w-2xl truncate font-mono text-[11px] italic">
          … {thinking}
        </p>
      )}
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

function Spinner(): JSX.Element {
  return (
    <div
      aria-label="loading"
      className="border-border border-t-text-brand h-10 w-10 animate-spin rounded-full border-2"
    />
  )
}

function Stats({ elapsedMs, toolCounts }: { elapsedMs: number; toolCounts: Array<{ name: string; count: number }> }): JSX.Element {
  return (
    <div className="text-text-muted flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
      <span>{formatElapsed(elapsedMs)}</span>
      {toolCounts.length > 0 && <span aria-hidden>·</span>}
      {toolCounts.map(({ name, count }) => (
        <span key={name}>{name.toLowerCase()} <span className="text-text-secondary">{count}</span></span>
      ))}
    </div>
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

/**
 * Live "thinking" line — shows the tail of the model's prose narration, not
 * the structured JSON output. Once the model starts the array/object that
 * carries the actual tour (per rules.md, this comes AFTER 1-3 sentences of
 * plain plan), we stop appending to the thinking display.
 *
 * Implementation: accumulate every partial_text fragment in order, drop
 * everything from the first `[` or `{` onward, return the tail of what
 * remains. So you see the model's most recent prose, never the JSON.
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
  return collapsed.length > 120 ? '… ' + collapsed.slice(-119) : collapsed
}

function latestPhase(events: TourStreamEvent[]): Phase {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e && e.event === 'phase') return { name: e.data.name, detail: e.data.detail }
  }
  // No phase yet — either generation just started or running against a CLI that doesn't emit phases.
  return { name: 'Generating tour…' }
}

function countTools(events: TourStreamEvent[]): Array<{ name: string; count: number }> {
  const counts = events
    .filter(isToolCall)
    .reduce<Map<string, number>>(
      (acc, e) => acc.set(e.data.name, (acc.get(e.data.name) ?? 0) + 1),
      new Map(),
    )
  return [...counts.entries()].map(([name, count]) => ({ name, count }))
}

function isToolCall(e: TourStreamEvent): e is Extract<TourStreamEvent, { event: 'tool_call' }> {
  return e.event === 'tool_call'
}

function recentActivities(events: TourStreamEvent[], n: number): string[] {
  // Skip phase events — the latest phase is already the headline above, so
  // repeating it in the tail is noise.
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
    .with({ event: 'phase' }, ({ data }) => `▸ ${data.name}${data.detail ? ` — ${data.detail}` : ''}`)
    .with({ event: 'final' }, () => '✓ model finished — parsing tour…')
    .with({ event: 'done' }, () => '✓ done')
    .with({ event: 'error' }, ({ data }) => `✗ ${data.message}`)
    .exhaustive()
}

/**
 * Renders tool arguments as space-separated values — no key= prefixes, no
 * parens. The tool name carries enough context (Read / Grep / Glob); the
 * remaining argument values (paths, patterns) are what the user actually
 * wants to see flow past.
 */
function stringifyInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return trim(stripWorktreePath(input), 80)
  if (typeof input !== 'object') return String(input)
  const values = Object.values(input as Record<string, unknown>)
    .filter((v) => v != null && v !== '')
    .map((v) => typeof v === 'string' ? trim(stripWorktreePath(v), 60) : JSON.stringify(v))
  return values.join(' ')
}

/**
 * Tool calls run inside `userData/worktrees/{owner}__{name}/code-tour-{sha}/`,
 * so file_path / path values come through as absolute paths into that worktree.
 * Strip the prefix so the activity log shows just the repo-relative path.
 */
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
