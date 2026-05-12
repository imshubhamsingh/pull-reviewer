import { match } from 'ts-pattern'
import type { JSX } from 'react'
import type { TourStreamEvent } from '@/lib/api'

interface Props {
  events: TourStreamEvent[]
}

const TAIL = 8

/** Centered spinner + the last few stream events so the user sees the agent moving. */
export function GeneratingPanel({ events }: Props): JSX.Element {
  const tail = events.slice(-TAIL)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <Spinner />
      <p className="text-text-secondary text-sm">Generating tour…</p>
      <ul className="text-text-muted w-full max-w-2xl space-y-1 font-mono text-xs">
        {tail.map((e, i) => (
          <li key={i} className="truncate">{describe(e)}</li>
        ))}
      </ul>
    </div>
  )
}

function Spinner(): JSX.Element {
  return (
    <div
      aria-label="loading"
      className="border-border border-t-text-brand h-8 w-8 animate-spin rounded-full border-2"
    />
  )
}

function describe(e: TourStreamEvent): string {
  return match(e)
    .with({ event: 'tool_call' }, ({ data }) => `→ ${data.name}(${stringifyInput(data.input)})`)
    .with({ event: 'partial_text' }, ({ data }) => `… ${trim(data.text)}`)
    .with({ event: 'final' }, () => '✓ model finished — parsing tour…')
    .with({ event: 'done' }, () => '✓ done')
    .with({ event: 'error' }, ({ data }) => `✗ ${data.message}`)
    .exhaustive()
}

function stringifyInput(input: unknown): string {
  if (input == null) return ''
  if (typeof input === 'string') return trim(input)
  if (typeof input !== 'object') return String(input)
  const entries = Object.entries(input as Record<string, unknown>)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? trim(v) : JSON.stringify(v)}`)
  return entries.join(', ')
}

function trim(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
