import { match } from 'ts-pattern'
import type { ChatStreamEvent, TourStreamEvent } from '@/lib/api'

/**
 * Activity-tail shaping shared by GeneratingPanel (tour gen) and ChatPane
 * (per-message stream). Returns the most recent `n` non-phase events
 * rendered as short single-line strings, suitable for a `<li className="truncate">`
 * stream. Returns the latest `partial_text` fragment separately so the UI
 * can render a live "thinking" line under the tail.
 */

const TAIL = 6

export interface ActivityView {
  tail: string[]
  thinking: string | undefined
}

export function activityView(events: Array<TourStreamEvent | ChatStreamEvent>): ActivityView {
  const lines: string[] = []
  let thinking: string | undefined
  for (const event of events) {
    const described = describe(event)
    if (described) lines.push(described)
    if (event.event === 'partial_text') {
      const cleaned = cleanFragment(event.data.text)
      if (cleaned) thinking = cleaned
    }
  }
  return { tail: lines.slice(-TAIL), thinking }
}

function describe(event: TourStreamEvent | ChatStreamEvent): string | undefined {
  return match(event)
    .with({ event: 'tool_call' }, ({ data }) => {
      const args = stringifyInput(data.input)
      return args ? `→ ${data.name} ${args}` : `→ ${data.name}`
    })
    .with(
      { event: 'phase' },
      ({ data }) => `▸ ${data.name}${data.detail ? ` — ${data.detail}` : ''}`,
    )
    .with({ event: 'final' }, () => '✓ composing answer…')
    .with({ event: 'partial_text' }, () => undefined)
    .with({ event: 'done' }, () => undefined)
    .with({ event: 'error' }, ({ data }) => `✗ ${data.message}`)
    .otherwise(() => undefined)
}

function stringifyInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return trim(stripWorktreePath(input), 80)
  if (typeof input !== 'object') return String(input)
  const values = Object.values(input as Record<string, unknown>)
    .filter((v) => v != null && v !== '')
    .map((v) => (typeof v === 'string' ? trim(stripWorktreePath(v), 60) : JSON.stringify(v)))
  return values.join(' ')
}

function stripWorktreePath(s: string): string {
  const m = /\/code-tour-[a-f0-9]+\/(.+)$/.exec(s)
  return m?.[1] ?? s
}

function cleanFragment(text: string): string {
  const single = text.replace(/\s+/g, ' ').trim()
  if (single.length < 2) return ''
  return single.length > 120 ? single.slice(0, 119) + '…' : single
}

function trim(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
