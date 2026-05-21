import { match } from 'ts-pattern'
import { getBaseUrl, http } from '@/lib/api/base'
import { openSSE, type SseMessage } from '@/lib/api/sse'
import type { TokenUsage, TourResult } from '@/lib/api/types'

/**
 * Identifies which parallel CLI stream a backend event came from. `tour`
 * is the chapter-emitting generation; `review` is the dedicated AI review
 * pass. The generating panel splits its display by this tag.
 */
export type CliStream = 'tour' | 'review'

/** Event stream emitted by the tour-generation SSE endpoint. Mirrors backend CliEvent + done/error frames. */
export type TourStreamEvent =
  | {
      event: 'tool_call'
      data: { type: 'tool_call'; name: string; input: unknown; stream?: CliStream }
    }
  | { event: 'partial_text'; data: { type: 'partial_text'; text: string; stream?: CliStream } }
  | {
      event: 'final'
      data: {
        type: 'final'
        raw: string
        costUsd?: number
        durationMs?: number
        usage?: TokenUsage
        stream?: CliStream
      }
    }
  | {
      event: 'phase'
      data: { type: 'phase'; name: string; detail?: string; stream?: CliStream }
    }
  | { event: 'done'; data: TourResult }
  | { event: 'error'; data: { message: string } }

export interface TourJobRecord {
  id: number
  repo: string
  prNumber: number
  headRefOid: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

export interface TourJobSummary {
  job: TourJobRecord
  lastPhase?: { name: string; detail?: string }
}

export const tours = {
  /** Returns the cached tour, or rejects with ApiError(404) if none exists. Never runs the model. */
  get: (repo: string, prNumber: number) => http.get<TourResult>(`/api/tours/${repo}/${prNumber}`),
  /**
   * Returns any stored tour for this PR — including ones generated against an
   * older `CURRENT_SCHEMA_VERSION`. Rejects with ApiError(404) if nothing is
   * stored at all. Used by the No-tour screen to offer a "View previous tour"
   * affordance so a schema bump doesn't visibly orphan existing work.
   */
  getStale: (repo: string, prNumber: number) =>
    http.get<TourResult>(`/api/tours/${repo}/${prNumber}/stale`),
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
   *
   * Routes through the background job manager: if a job is already running
   * for this PR's current head SHA, the SSE attaches to that job's stream
   * instead of spawning a new one. Disconnect doesn't cancel the job.
   */
  streamGenerate: (
    repo: string,
    prNumber: number,
    opts: { force?: boolean; signal?: AbortSignal } = {},
  ) => streamTourGeneration(repo, prNumber, opts),
  /** Background-job APIs. The manager owns CLI lifecycle independent of the renderer. */
  jobs: {
    list: () => http.get<TourJobSummary[]>('/api/tours/jobs'),
    /**
     * Find the in-flight (running or queued) job for this PR across ANY head
     * SHA. Used by `useTour` to detect "regen in progress" even when a cached
     * tour exists for an older SHA.
     */
    findActiveForPr: async (
      repo: string,
      prNumber: number,
    ): Promise<TourJobSummary | undefined> => {
      const all = await http.get<TourJobSummary[]>('/api/tours/jobs')
      return all.find(
        (s) =>
          s.job.repo === repo &&
          s.job.prNumber === prNumber &&
          (s.job.status === 'running' || s.job.status === 'queued'),
      )
    },
    streamJob: (jobId: number, signal?: AbortSignal) => streamJobEvents(jobId, signal),
  },
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

/**
 * Attach to a specific job's event stream via GET /tours/jobs/:id/stream.
 * Replays buffered events then streams live ones. Disconnect doesn't kill
 * the job — the manager owns the CLI lifecycle.
 */
async function* streamJobEvents(
  jobId: number,
  signal?: AbortSignal,
): AsyncGenerator<TourStreamEvent> {
  const base = await getBaseUrl()
  const url = `${base}/api/tours/jobs/${jobId}/stream`
  for await (const msg of openSSE(url, { method: 'GET', signal })) {
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
