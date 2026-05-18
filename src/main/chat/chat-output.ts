import { z } from 'zod'
import { DiagramSchema } from '@/main/tour/tour-schema'

/**
 * What the chat assistant returns each turn — a markdown answer, optional
 * code references the UI renders as click-to-jump chips, and optional
 * structured diagrams (mockup / mermaid / state machine) rendered inline
 * below the message bubble with a click-to-expand modal.
 */
const CodeRefSchema = z.object({
  file: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive().optional(),
})

export const ChatEnvelopeSchema = z.object({
  markdown: z.string().min(1),
  references: z.array(CodeRefSchema).max(8).default([]),
  diagrams: z.array(DiagramSchema).max(4).default([]),
})

export type ChatEnvelope = z.infer<typeof ChatEnvelopeSchema>
export type ChatRef = z.infer<typeof CodeRefSchema>

/**
 * Same tolerance shape as TourParser: tolerate the claude `{result: "..."}`
 * envelope, ```json fences, and (per the prompt) a plain-text plan narration
 * before the JSON object.
 *
 * Defensive against LLM JSON mistakes:
 *  - Trailing commas before `}` / `]` get stripped automatically.
 *  - If JSON parse still fails (or the envelope shape doesn't validate), we
 *    fall back to showing the raw model output as markdown with no
 *    references — better to surface the answer than throw a parse error.
 */
export function parseChatEnvelope(raw: string): ChatEnvelope {
  const unwrapped = stripFences(unwrapEnvelope(raw.trim()))
  const text = extractJsonObject(unwrapped)
  const parsed = tryParse(text)
  if (parsed == null) return fallbackEnvelope(unwrapped, raw)
  const result = ChatEnvelopeSchema.safeParse(parsed)
  if (result.success) return { ...result.data, markdown: stripEnvelopeDump(result.data.markdown) }
  const salvaged = salvageMarkdown(parsed)
  return {
    markdown: stripEnvelopeDump(salvaged ?? (unwrapped || raw.trim())),
    references: [],
    diagrams: [],
  }
}

/** Try plain parse; if that fails, retry after stripping trailing commas. */
function tryParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(stripTrailingCommas(text))
  } catch {
    return null
  }
}

function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1')
}

function fallbackEnvelope(unwrapped: string, raw: string): ChatEnvelope {
  return { markdown: stripEnvelopeDump(unwrapped || raw.trim()), references: [], diagrams: [] }
}

/**
 * Trim trailing `{"markdown": "..."}` envelope chunks that the model
 * sometimes appends after its narration (especially when the JSON gets
 * truncated mid-stream and the parser falls back to raw text). Leaving them
 * in produces a visible JSON dump with literal `\n` escapes below the
 * properly-rendered markdown — see screenshot in the 2026-05-18 session.
 *
 * Heuristic: find any `{"markdown":` (or whitespace + that) and cut everything
 * from there onwards. Safe for legitimate code blocks because LLM markdown
 * uses backticks for inline JSON, never bare braces at the start of a line.
 */
function stripEnvelopeDump(text: string): string {
  const match = text.match(/\s*\{\s*"markdown"\s*:/)
  if (!match || match.index == null) return text
  return text.slice(0, match.index).trimEnd()
}

/** Pluck a markdown-ish string field from a parsed-but-shape-mismatched JSON object. */
function salvageMarkdown(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined
  for (const key of ['markdown', 'message', 'answer', 'response', 'text']) {
    const v = (parsed as Record<string, unknown>)[key]
    if (typeof v === 'string' && v.trim().length > 0) return v
  }
  return undefined
}

function unwrapEnvelope(text: string): string {
  try {
    const envelope = JSON.parse(text) as unknown
    if (
      typeof envelope === 'object' &&
      envelope !== null &&
      'result' in envelope &&
      typeof (envelope as { result: unknown }).result === 'string'
    ) {
      return (envelope as { result: string }).result
    }
  } catch {
    // not a JSON envelope; treat as raw model output
  }
  return text
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
}

/**
 * Find the first balanced `{...}` object in `text`. Bracket counting ignores
 * characters inside JSON strings so escapes and nested objects parse cleanly.
 */
function extractJsonObject(text: string): string {
  const start = text.indexOf('{')
  if (start < 0) return text
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return text.slice(start)
}
