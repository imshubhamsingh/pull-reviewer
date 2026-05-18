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
  /** Most-recent commit timestamp on the PR's head branch. */
  lastCommitAt: string | null
  /** Submission timestamp of the viewer's latest review on this PR; null if not reviewed. */
  viewerLatestReviewAt: string | null
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

/**
 * Lo-fi UI mockup wire types — mirrored from `src/main/tour/mockup-schema.ts`.
 * Multi-frame mockups render Figma-style: every frame laid out on one pannable
 * canvas with labeled arrows between them per `MockupTransition.trigger`.
 */
export type MockupElement =
  | { type: 'box'; x: number; y: number; w: number; h: number; source?: string; label?: string }
  | {
      type: 'group'
      x: number
      y: number
      w: number
      h: number
      source?: string
      label?: string
      children: MockupElement[]
    }
  | { type: 'divider'; x: number; y: number; w: number; source?: string }
  | { type: 'spacer'; x: number; y: number; w: number; h: number; source?: string }
  | {
      type: 'text'
      x: number
      y: number
      source?: string
      text: string
      size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
      weight?: 'normal' | 'medium' | 'bold'
      tone?: 'primary' | 'secondary' | 'muted' | 'danger'
    }
  | { type: 'link'; x: number; y: number; source?: string; text: string; href?: string }
  | { type: 'code'; x: number; y: number; source?: string; text: string }
  | {
      type: 'button'
      x: number
      y: number
      w: number
      h: number
      source?: string
      label: string
      variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon'
      icon?: string
    }
  | {
      type: 'input'
      x: number
      y: number
      w: number
      h: number
      source?: string
      kind?: 'text' | 'password' | 'email' | 'number' | 'search'
      placeholder?: string
      value?: string
    }
  | {
      type: 'textarea'
      x: number
      y: number
      w: number
      h: number
      source?: string
      placeholder?: string
      value?: string
      rows?: number
    }
  | {
      type: 'select'
      x: number
      y: number
      w: number
      h: number
      source?: string
      placeholder?: string
      value?: string
      options?: string[]
    }
  | { type: 'checkbox'; x: number; y: number; source?: string; label?: string; checked: boolean }
  | {
      type: 'radio'
      x: number
      y: number
      source?: string
      label?: string
      checked: boolean
      groupId?: string
    }
  | { type: 'toggle'; x: number; y: number; source?: string; label?: string; on: boolean }
  | { type: 'image'; x: number; y: number; w: number; h: number; source?: string; alt?: string }
  | { type: 'avatar'; x: number; y: number; source?: string; size?: number; label?: string }
  | { type: 'icon'; x: number; y: number; source?: string; name: string; size?: number }
  | {
      type: 'badge'
      x: number
      y: number
      source?: string
      label: string
      tone?: 'primary' | 'secondary' | 'muted' | 'danger' | 'success' | 'warn'
    }
  | {
      type: 'table'
      x: number
      y: number
      w: number
      h: number
      source?: string
      columns: string[]
      rows: string[][]
    }
  | {
      type: 'list'
      x: number
      y: number
      w: number
      h: number
      source?: string
      items: string[]
      ordered?: boolean
    }
  | {
      type: 'tabs'
      x: number
      y: number
      w: number
      h: number
      source?: string
      tabs: string[]
      activeIdx?: number
    }
  | {
      type: 'nav'
      x: number
      y: number
      w: number
      h: number
      source?: string
      items: { label: string; active?: boolean }[]
      orientation?: 'horizontal' | 'vertical'
    }
  | {
      type: 'modal'
      x: number
      y: number
      w: number
      h: number
      source?: string
      title?: string
      children: MockupElement[]
    }
  | {
      type: 'tooltip'
      x: number
      y: number
      source?: string
      text: string
      anchor?: 'top' | 'bottom' | 'left' | 'right'
    }

export interface MockupFrame {
  id: string
  title: string
  width: number
  height: number
  canvasX?: number
  canvasY?: number
  elements: MockupElement[]
}

export interface MockupTransition {
  fromFrame: string
  toFrame: string
  trigger: string
  fromSide?: 'top' | 'right' | 'bottom' | 'left'
  toSide?: 'top' | 'right' | 'bottom' | 'left'
}

export interface MockupScene {
  frames: MockupFrame[]
  transitions?: MockupTransition[]
}

/**
 * State machine wire types — mirrored from
 * `src/main/tour/state-machine-schema.ts`. XState v5-shaped subset.
 */
export interface Transition {
  target?: string
  cond?: string
  actions?: string[]
  source?: string
}

export interface StateNode {
  id?: string
  type?: 'atomic' | 'compound' | 'final'
  entry?: string | string[]
  exit?: string | string[]
  on?: Record<string, string | Transition | (string | Transition)[]>
  states?: Record<string, StateNode>
  initial?: string
  source?: string
}

export interface StateMachine {
  id: string
  initial: string
  source?: string
  states: Record<string, StateNode>
}

export type Diagram =
  | { kind: 'sequence'; mermaid: string }
  | { kind: 'flowchart'; mermaid: string }
  | { kind: 'er'; mermaid: string }
  | { kind: 'class'; mermaid: string }
  | { kind: 'fileGraph'; mermaid: string }
  | { kind: 'mockup'; mockup: MockupScene }
  | { kind: 'state'; machine: StateMachine }

export interface TourStep {
  id: string
  panel: 'docs' | 'code' | 'code-map' | 'diagram'
  title: string
  body: string
  code?: CodePointer
  references?: CodePointer[]
  diagram?: Diagram
}

export type Lens =
  | 'code-quality'
  | 'business-logic'
  | 'data-integrity'
  | 'api-contracts'
  | 'performance-security'
  | 'observability'
  | 'migration'
  | 'design-system'
  | 'ux-dx'

export interface CritiqueIssue {
  severity: 'minor' | 'major' | 'blocker'
  body: string
  code?: CodePointer
  /** Set when this issue was injected by the AI review stitcher; absent for model-emitted in-tour critique. */
  lens?: Lens
  /** Back-pointer to the originating review finding (for dismissals + Convert-to-draft). */
  findingId?: string
}

export interface CritiqueSuggestion {
  body: string
  code?: CodePointer
  lens?: Lens
  findingId?: string
}

export interface FindingCode {
  file: string
  side?: 'before' | 'after' | 'diff'
  lineStart?: number
  lineEnd?: number
}

export interface SymbolLocation {
  file: string
  line: number
}

export interface Finding {
  id: string
  lens: Lens
  severity: 'minor' | 'major' | 'blocker'
  body: string
  code?: FindingCode
  suggestion?: string
  /** Click-to-jump symbol table — keys match `` `inline-code` `` spans in body/suggestion. */
  symbols?: Record<string, SymbolLocation>
  /** Optional inline Mermaid diagram source for findings that benefit from a visual. */
  mermaid?: string
}

export interface SkipReason {
  lens: Lens
  reason: string
}

export interface Review {
  lensesApplied: Lens[]
  lensesSkipped: SkipReason[]
  findings: Finding[]
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
  review: Review | null
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

/**
 * Click-to-jump pointer the chat assistant emits next to its markdown answer.
 * Same shape as `CodePointer` minus the diff-side / focus fields — chat refs
 * aren't tied to a specific side of the diff.
 */
export interface CodeRef {
  file: string
  lineStart: number
  lineEnd?: number
}

export type ChatMessageRole = 'user' | 'assistant'
export type ChatMessageStatus = 'streaming' | 'complete' | 'interrupted' | 'error'

export interface PrChat {
  id: number
  repo: string
  prNumber: number
  title: string
  createdAt: string
  updatedAt: string
}

export interface PrChatMessage {
  id: number
  chatId: number
  role: ChatMessageRole
  body: string
  references: CodeRef[] | null
  status: ChatMessageStatus
  model: string | null
  createdAt: string
}

/**
 * App-wide settings. Each known key has a typed accessor so call sites stay
 * safe even though the backend persists JSON-encoded values.
 *
 * - `chatHistoryBudget` — how many user+assistant pairs the chat service
 *   replays per send. `null` means "send everything", an integer means
 *   "last N pairs".
 */
export interface AppSettings {
  chatHistoryBudget: number | null
}

/** Review-progress signals — chapter completions and per-file reviewed flags. */
export interface ChapterCompletion {
  id: number
  repo: string
  prNumber: number
  headRefOid: string
  chapterId: string
  completedAt: string
}

export interface FileReview {
  id: number
  repo: string
  prNumber: number
  headRefOid: string
  filePath: string
  reviewedAt: string
}
