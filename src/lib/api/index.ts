import { buildClient, type HttpClient } from '@/lib/api/client'

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

export interface TourStep {
  id: string
  panel: 'docs' | 'code' | 'code-map'
  file?: string
  side?: 'before' | 'after' | 'diff'
  lineStart?: number
  lineEnd?: number
  title: string
  body: string
}

export interface PrFile {
  path: string
  additions: number
  deletions: number
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
  steps: TourStep[]
  files: PrFile[]
  provider: string
  model: string
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
  },
}

export { ApiError } from '@/lib/api/client'
