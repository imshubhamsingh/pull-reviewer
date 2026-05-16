import { match } from 'ts-pattern'
import { getBaseUrl, http } from '@/lib/api/base'
import { openSSE, type SseMessage } from '@/lib/api/sse'
import type { TokenUsage, TourResult } from '@/lib/api/types'

/** Event stream emitted by the tour-generation SSE endpoint. Mirrors backend CliEvent + done/error frames. */
export type TourStreamEvent =
  | { event: 'tool_call'; data: { type: 'tool_call'; name: string; input: unknown } }
  | { event: 'partial_text'; data: { type: 'partial_text'; text: string } }
  | {
      event: 'final'
      data: {
        type: 'final'
        raw: string
        costUsd?: number
        durationMs?: number
        usage?: TokenUsage
      }
    }
  | { event: 'phase'; data: { type: 'phase'; name: string; detail?: string } }
  | { event: 'done'; data: TourResult }
  | { event: 'error'; data: { message: string } }

export const tours = {
  /** Returns the cached tour, or rejects with ApiError(404) if none exists. Never runs the model. */
  get: (repo: string, prNumber: number) => http.get<TourResult>(`/api/tours/${repo}/${prNumber}`),
  /**
   * If a cached tour exists, returns it (possibly stale — check `currentHeadRefOid !== headRefOid`).
   * Otherwise runs the model. With `force: true`, bypasses the cache and always runs the model.
   */
  generate: (repo: string, prNumber: number, opts: { force?: boolean } = {}) =>
    http.post<TourResult>(
      `/api/tours/${repo}/${prNumber}/generate${opts.force ? '?force=true' : ''}`,
    ),
  /**
   * Streamed generation — yields tool_call / partial_text / final / phase events while
   * the model runs, then a final 'done' event with the TourResult (or 'error' on failure).
   */
  streamGenerate: (
    repo: string,
    prNumber: number,
    opts: { force?: boolean; signal?: AbortSignal } = {},
  ) => streamTourGeneration(repo, prNumber, opts),
}

async function* streamTourGeneration(
  repo: string,
  prNumber: number,
  opts: { force?: boolean; signal?: AbortSignal },
): AsyncGenerator<TourStreamEvent> {
  const base = await getBaseUrl()
  const url = `${base}/api/tours/${repo}/${prNumber}/generate/stream${opts.force ? '?force=true' : ''}`
  for await (const msg of openSSE(url, { method: 'POST', signal: opts.signal })) {
    yield decodeStreamEvent(msg)
  }
}

function decodeStreamEvent(msg: SseMessage): TourStreamEvent {
  const data: unknown = JSON.parse(msg.data)
  return match(msg.event)
    .with('tool_call', () => ({ event: 'tool_call', data }) as TourStreamEvent)
    .with('partial_text', () => ({ event: 'partial_text', data }) as TourStreamEvent)
    .with('final', () => ({ event: 'final', data }) as TourStreamEvent)
    .with('phase', () => ({ event: 'phase', data }) as TourStreamEvent)
    .with('done', () => ({ event: 'done' as const, data: data as TourResult }))
    .with('error', () => ({ event: 'error' as const, data: data as { message: string } }))
    .otherwise(() => ({
      event: 'partial_text' as const,
      data: { type: 'partial_text', text: msg.data },
    }))
}
