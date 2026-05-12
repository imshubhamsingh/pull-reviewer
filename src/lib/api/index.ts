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
  },
  files: {
    /** Read a file at a given sha. Read-through cache; fast on repeat reads. */
    get: (repo: string, sha: string, path: string) =>
      http.get<FileSnapshot>(`/api/files/${repo}/${sha}/${encodeURI(path)}`),
  },
}

export { ApiError } from '@/lib/api/client'
