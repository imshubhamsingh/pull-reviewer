import { z } from 'zod'

// Inlined to avoid a circular import with tour-schema (which now imports
// `LENSES` from here for its critique items). These two arrays are also
// exported from tour-schema; the values must stay in sync.
const REVIEW_SEVERITIES = ['minor', 'major', 'blocker'] as const
const REVIEW_CODE_SIDES = ['before', 'after', 'diff'] as const

/**
 * Review pass output — the structured findings produced by the dedicated AI
 * review CLI run that follows tour generation. The model triages the diff to
 * pick which lenses apply, then walks each applicable lens emitting findings.
 *
 * Severity is mapped from the reviewer-* prompt taxonomy (Critical/High/
 * Medium/Low) into our 3-level model (blocker/major/minor) in the prompt
 * itself; the schema only validates the mapped values.
 */

export const LENSES = [
  'code-quality',
  'business-logic',
  'data-integrity',
  'api-contracts',
  'performance-security',
  'observability',
  'migration',
  'design-system',
  'ux-dx',
] as const
export type Lens = (typeof LENSES)[number]

const FindingCodeSchema = z.object({
  file: z.string().min(1),
  side: z.enum(REVIEW_CODE_SIDES).optional(),
  lineStart: z.number().int().nonnegative().optional(),
  lineEnd: z.number().int().nonnegative().optional(),
})

const SymbolLocationSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
})

const FindingSchema = z.object({
  /**
   * Stable within (repo, pr, head_sha). Drives the dismissals table key
   * — same id across re-fetches lets the user dismiss once and have it
   * stick. Prompt instructs the model to use `<lens>/<file>/<lineStart>`
   * or `<lens>/cross-cutting/<n>` so the id is deterministic.
   */
  id: z.string().min(1).max(160),
  lens: z.enum(LENSES),
  severity: z.enum(REVIEW_SEVERITIES),
  body: z.string().min(1).max(2_000),
  code: FindingCodeSchema.optional(),
  suggestion: z.string().max(2_000).optional(),
  /** Optional click-to-jump map for identifiers mentioned in the body. */
  symbols: z.record(z.string().min(1), SymbolLocationSchema).optional(),
  /** Optional inline diagram source rendered beneath the body. */
  mermaid: z.string().min(1).max(4_000).optional(),
})

const SkipReasonSchema = z.object({
  lens: z.enum(LENSES),
  reason: z.string().min(1).max(240),
})

/**
 * Top-of-review "PR shape" summary — surfaced at the top of the tour before
 * the per-lens findings. Lets the reviewer see at a glance whether the PR is
 * splittable, how long it'll take, and which structural/complexity issues
 * the author should fix BEFORE drilling into per-file feedback.
 *
 * All fields are derived from the diff itself; no external static-analysis
 * runs — the model eyeballs cyclomatic complexity, nesting, churn, etc.
 */
const PR_SIZE = ['small', 'medium', 'large', 'very-large'] as const
const COMPLEXITY_KINDS = [
  'cyclomatic',
  'file-length',
  'function-length',
  'nesting',
  'churn',
  'pattern',
  'duplication',
] as const

const ComplexityFlagSchema = z.object({
  kind: z.enum(COMPLEXITY_KINDS),
  severity: z.enum(REVIEW_SEVERITIES),
  body: z.string().min(1).max(800),
  suggestion: z.string().max(800).optional(),
  code: FindingCodeSchema.optional(),
})

const SplitStackSchema = z.object({
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(400),
  files: z.array(z.string().min(1)).max(40).optional(),
})

const SplitSuggestionSchema = z.object({
  summary: z.string().min(1).max(400),
  stacks: z.array(SplitStackSchema).min(2).max(6),
})

const PrShapeSchema = z.object({
  size: z.enum(PR_SIZE),
  /** Minutes a lead-engineer-caliber reviewer would spend on a focused first pass. */
  reviewMinutes: z.number().int().min(5).max(600),
  rationale: z.string().min(1).max(800),
  splitSuggestion: SplitSuggestionSchema.optional(),
  complexityFlags: z.array(ComplexityFlagSchema).max(20),
})

export const ReviewSchema = z.object({
  lensesApplied: z.array(z.enum(LENSES)).max(LENSES.length),
  lensesSkipped: z.array(SkipReasonSchema).max(LENSES.length),
  /** Optional so older stored reviews still parse. */
  prShape: PrShapeSchema.optional(),
  findings: z.array(FindingSchema).max(60),
})

export type FindingCode = z.infer<typeof FindingCodeSchema>
export type Finding = z.infer<typeof FindingSchema>
export type SkipReason = z.infer<typeof SkipReasonSchema>
export type ComplexityFlag = z.infer<typeof ComplexityFlagSchema>
export type SplitStack = z.infer<typeof SplitStackSchema>
export type SplitSuggestion = z.infer<typeof SplitSuggestionSchema>
export type PrShape = z.infer<typeof PrShapeSchema>
export type Review = z.infer<typeof ReviewSchema>
