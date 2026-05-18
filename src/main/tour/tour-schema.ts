import { z } from 'zod'
import { MockupSceneSchema } from '@/main/tour/mockup-schema'
import { StateMachineSchema } from '@/main/tour/state-machine-schema'
import { LENSES } from '@/main/tour/review-schema'

/**
 * The wire/storage shape of a generated tour. Defined as one cohesive set of
 * zod schemas so the contract lives in one place — the parser uses it for
 * validation; the store serializes its inferred types as JSON.
 *
 * Shape philosophy:
 *  - `panel: 'docs' | 'code' | 'code-map' | 'diagram'` — narration / code / a
 *    file-treemap / a Mermaid or mockup diagram. Each carries the fields its
 *    renderer needs and nothing else.
 *  - Chapters group steps so 25-step tours stay scannable.
 *  - `critique` lives at the chapter level: it's "what's wrong / what could be
 *    better" feedback the reviewer can promote to draft comments later.
 */

export const PANEL_KINDS = ['docs', 'code', 'code-map', 'diagram'] as const
export const MERMAID_DIAGRAM_KINDS = ['sequence', 'flowchart', 'er', 'class', 'fileGraph'] as const
export const DIAGRAM_KINDS = [...MERMAID_DIAGRAM_KINDS, 'mockup', 'state'] as const
export const CRITIQUE_SEVERITIES = ['minor', 'major', 'blocker'] as const
export const CODE_SIDES = ['before', 'after', 'diff'] as const

// Tolerant array clamp — when the model emits more entries than we want, take
// the first N rather than failing the whole tour. Better UX than throwing on
// a single over-eager step. Caps are still upper bounds, not requirements.
function clampArray(max: number) {
  return (v: unknown): unknown => (Array.isArray(v) && v.length > max ? v.slice(0, max) : v)
}

const CodePointerSchema = z.object({
  file: z.string().min(1),
  side: z.enum(CODE_SIDES).optional(),
  lineStart: z.number().int().nonnegative().optional(),
  lineEnd: z.number().int().nonnegative().optional(),
  /** Single line the renderer should center / scroll to — usually the call or decision the step is about. Defaults to lineStart. */
  focusLine: z.number().int().nonnegative().optional(),
  /** Up to 10 lines the renderer should emphasise. Clamped to first 10 if the model emits more. */
  focusLines: z.preprocess(
    clampArray(10),
    z.array(z.number().int().nonnegative()).max(10).optional(),
  ),
  /** Extra lines of buffer above/below the [lineStart, lineEnd] window. Renderer hint; defaults to 2. */
  contextLines: z.number().int().nonnegative().max(20).optional(),
})

// Discriminated by `kind`. Mermaid variants carry a `mermaid` source string;
// `mockup` carries a structured `MockupScene` rendered as a Figma-style flow;
// `state` carries an XState-shaped machine config rendered as a labeled state
// graph. Existing persisted tours parse cleanly under the union without
// migration — added variants are purely additive.
export const DiagramSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sequence'), mermaid: z.string().min(1).max(20_000) }),
  z.object({ kind: z.literal('flowchart'), mermaid: z.string().min(1).max(20_000) }),
  z.object({ kind: z.literal('er'), mermaid: z.string().min(1).max(20_000) }),
  z.object({ kind: z.literal('class'), mermaid: z.string().min(1).max(20_000) }),
  z.object({ kind: z.literal('fileGraph'), mermaid: z.string().min(1).max(20_000) }),
  z.object({ kind: z.literal('mockup'), mockup: MockupSceneSchema }),
  z.object({ kind: z.literal('state'), machine: StateMachineSchema }),
])

// `body` is preprocessed → string, with a fallback of '' if the model omits it.
// We'd rather render an empty narration block than throw the whole tour out
// when one step is missing prose — the prompt still asks for body on every step.
const TourStepSchema = z
  .object({
    id: z.string().min(1),
    panel: z.enum(PANEL_KINDS),
    title: z.string().min(1).max(120),
    body: z.preprocess((v) => (typeof v === 'string' ? v : ''), z.string()),
    code: CodePointerSchema.optional(),
    references: z.preprocess(clampArray(16), z.array(CodePointerSchema).max(16).optional()),
    diagram: DiagramSchema.optional(),
  })
  .refine((s) => s.panel !== 'code' || !!s.code, { message: '`code` panel requires `code`' })
  .refine((s) => s.panel !== 'diagram' || !!s.diagram, {
    message: '`diagram` panel requires `diagram`',
  })

// `lens` + `findingId` are populated by the AI review stitcher when an AI
// finding is injected into a chapter's critique. Model-emitted in-tour
// critique leaves both undefined and renders unchanged.
const CritiqueIssueSchema = z.object({
  severity: z.enum(CRITIQUE_SEVERITIES),
  body: z.string().min(1).max(2_000),
  code: CodePointerSchema.optional(),
  lens: z.enum(LENSES).optional(),
  findingId: z.string().optional(),
})

const CritiqueSuggestionSchema = z.object({
  body: z.string().min(1).max(2_000),
  code: CodePointerSchema.optional(),
  lens: z.enum(LENSES).optional(),
  findingId: z.string().optional(),
})

const ChapterCritiqueSchema = z.object({
  issues: z.array(CritiqueIssueSchema).max(10),
  suggestions: z.array(CritiqueSuggestionSchema).max(10),
})

const TourChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(80),
  summary: z.string().max(200).optional(),
  critique: ChapterCritiqueSchema.optional(),
  steps: z.array(TourStepSchema).min(1).max(15),
})

/**
 * Hard cap is 20 — soft cap lives in the prompt rules so the model can size
 * the tour to the PR. Tiny PRs get 2-3 chapters; sprawling refactors can get
 * 10-15. The 20 limit is defensive against pathological "one chapter per file".
 */
export const TourSchema = z.array(TourChapterSchema).min(1).max(20)

export type PanelKind = (typeof PANEL_KINDS)[number]
export type DiagramKind = (typeof DIAGRAM_KINDS)[number]
export type CritiqueSeverity = (typeof CRITIQUE_SEVERITIES)[number]
export type CodeSide = (typeof CODE_SIDES)[number]

export type CodePointer = z.infer<typeof CodePointerSchema>
export type Diagram = z.infer<typeof DiagramSchema>
export type TourStep = z.infer<typeof TourStepSchema>
export type CritiqueIssue = z.infer<typeof CritiqueIssueSchema>
export type CritiqueSuggestion = z.infer<typeof CritiqueSuggestionSchema>
export type ChapterCritique = z.infer<typeof ChapterCritiqueSchema>
export type TourChapter = z.infer<typeof TourChapterSchema>
export type Tour = z.infer<typeof TourSchema>
