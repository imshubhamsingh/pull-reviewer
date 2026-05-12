/**
 * Wire types — the JSON shape returned by the embedded Hono server. These
 * deliberately mirror the backend records (src/main/**) so the frontend and
 * backend stay in lockstep without sharing files.
 */

export type PrState = 'OPEN' | 'CLOSED' | 'MERGED'
export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null

export interface PullRequestSummary {
  id: string
  number: number
  title: string
  url: string
  repo: string
  author: string
  isDraft: boolean
  state: PrState
  createdAt: string
  updatedAt: string
  additions: number
  deletions: number
  changedFiles: number
  reviewDecision: ReviewDecision
}

export interface CodePointer {
  file: string
  side?: 'before' | 'after' | 'diff'
  lineStart?: number
  lineEnd?: number
  /** Single line to center/scroll to — usually the call or decision the step is about. Defaults to lineStart. */
  focusLine?: number
  /** Multiple lines to emphasise, when the narration calls out distinct spots. Renderer treats every line in this list as focused. */
  focusLines?: number[]
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
  costUsd: number | null
  durationMs: number | null
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

export type ReviewSide = 'before' | 'after'

export interface ReviewDraft {
  id: number
  repo: string
  prNumber: number
  file: string
  line: number
  /** First line of the comment range; null or equal-to-line means single-line. */
  startLine: number | null
  side: ReviewSide
  body: string
  createdAt: string
  updatedAt: string
}

export interface CreateDraftInput {
  file: string
  line: number
  startLine?: number | null
  side?: ReviewSide
  body: string
}

export interface SubmitReviewInput {
  headSha: string
  summary?: string
  event?: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'
}

export interface SubmittedReview {
  id: number
  htmlUrl: string
}

export interface QaThread {
  id: number
  repo: string
  prNumber: number
  file: string
  startLine: number
  endLine: number
  question: string
  answer: string
  model: string | null
  createdAt: string
}

export interface AskAiInput {
  sha: string
  file: string
  startLine: number
  endLine: number
  question: string
  model?: string
}
