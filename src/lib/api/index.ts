import { buildClient, type HttpClient } from '@/lib/api/client'
import { openSSE, type SseMessage } from '@/lib/api/sse'

declare global {
  interface Window {
    electron: { getApiPort: () => Promise<number> }
  }
}

let baseUrl: Promise<string> | undefined

function getBaseUrl(): Promise<string> {
  baseUrl ??= window.electron.getApiPort().then((port) => `http://localhost:${port}`)
  return baseUrl
}

export const http: HttpClient = buildClient(getBaseUrl)

/** Event stream emitted by the tour-generation SSE endpoint. Mirrors backend CliEvent + done/error frames. */
export type TourStreamEvent =
  | { event: 'tool_call'; data: { type: 'tool_call'; name: string; input: unknown } }
  | { event: 'partial_text'; data: { type: 'partial_text'; text: string } }
  | { event: 'final'; data: { type: 'final'; raw: string; costUsd?: number; durationMs?: number; usage?: TokenUsage } }
  | { event: 'done'; data: TourResult }
  | { event: 'error'; data: { message: string } }

export interface PullRequestSummary {
  id: string
  number: number
  title: string
  url: string
  repo: string
  author: string
  isDraft: boolean
  updatedAt: string
}

export interface CodePointer {
  file: string
  side?: 'before' | 'after' | 'diff'
  lineStart?: number
  lineEnd?: number
  /** Single line to center/scroll to — usually the call or decision the step is about. Defaults to lineStart. */
  focusLine?: number
  /** Extra lines of buffer above/below the window. Renderer hint; defaults to 2. */
  contextLines?: number
}

export interface Diagram {
  kind: 'sequence' | 'flowchart' | 'er' | 'class' | 'fileGraph'
  mermaid: string
}

export interface TourStep {
  id: string
  panel: 'docs' | 'code' | 'code-map' | 'diagram'
  title: string
  body: string
  code?: CodePointer
  references?: CodePointer[]
  diagram?: Diagram
}

export interface CritiqueIssue {
  severity: 'minor' | 'major' | 'blocker'
  body: string
  code?: CodePointer
}

export interface CritiqueSuggestion {
  body: string
  code?: CodePointer
}

export interface ChapterCritique {
  issues: CritiqueIssue[]
  suggestions: CritiqueSuggestion[]
}

export interface TourChapter {
  id: string
  title: string
  summary?: string
  critique?: ChapterCritique
  steps: TourStep[]
}

export interface PrFile {
  path: string
  additions: number
  deletions: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens?: number
  cacheReadInputTokens?: number
}

export interface TourResult {
  prNumber: number
  repo: string
  headRefOid: string
  baseRefOid: string | null
  previousHeadRefOid: string | null
  generatedAt: string
  /** Live PR head sha at the time of this response. If !== headRefOid, the tour is stale. */
  currentHeadRefOid: string
  chapters: TourChapter[]
  files: PrFile[]
  provider: string
  model: string
  /** Total cost reported by the provider for the generation run (USD). null if unknown. */
  costUsd: number | null
  /** Wall-clock time the model took, in ms. null if unknown. */
  durationMs: number | null
  /** Raw token counts as reported by the provider. */
  usage: TokenUsage | null
}

export interface FileSnapshot {
  repo: string
  sha: string
  path: string
  content: string | null
  encoding: 'utf8' | 'base64' | 'omitted'
  size: number
  fetchedAt: string
  accessedAt: string
}

export const api = {
  prs: {
    mine: () => http.get<PullRequestSummary[]>('/api/pull-requests/mine'),
    reviewRequested: () => http.get<PullRequestSummary[]>('/api/pull-requests/review-requested'),
  },
  tours: {
    /** Returns the cached tour, or rejects with ApiError(404) if none exists. Never runs the model. */
    get: (repo: string, prNumber: number) =>
      http.get<TourResult>(`/api/tours/${repo}/${prNumber}`),
    /**
     * If a cached tour exists, returns it (possibly stale — check `currentHeadRefOid !== headRefOid`).
     * Otherwise runs the model. With `force: true`, bypasses the cache and always runs the model.
     */
    generate: (repo: string, prNumber: number, opts: { force?: boolean } = {}) =>
      http.post<TourResult>(
        `/api/tours/${repo}/${prNumber}/generate${opts.force ? '?force=true' : ''}`,
      ),
    /**
     * Streamed generation — yields tool_call / partial_text / final events while the model
     * runs, then a final 'done' event with the TourResult (or 'error' on failure).
     */
    streamGenerate: (
      repo: string,
      prNumber: number,
      opts: { force?: boolean; signal?: AbortSignal } = {},
    ) => streamTourGeneration(repo, prNumber, opts),
  },
  files: {
    /** Read a file at a given sha. Read-through cache; fast on repeat reads. */
    get: (repo: string, sha: string, path: string) =>
      http.get<FileSnapshot>(`/api/files/${repo}/${sha}/${encodeURI(path)}`),
  },
}

export { ApiError } from '@/lib/api/client'

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
  switch (msg.event) {
    case 'tool_call':
    case 'partial_text':
    case 'final':
      return { event: msg.event, data } as TourStreamEvent
    case 'done':
      return { event: 'done', data: data as TourResult }
    case 'error':
      return { event: 'error', data: data as { message: string } }
    default:
      return { event: 'partial_text', data: { type: 'partial_text', text: msg.data } }
  }
}
