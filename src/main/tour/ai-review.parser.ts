import { Service } from '@/main/service'
import { ReviewSchema, type Review } from '@/main/tour/review-schema'

/**
 * Unwraps the CLI's output envelope and validates the resulting object
 * against the `ReviewSchema`. Mirrors `TourParser` (which parses a JSON
 * array) — same envelope-stripping and fence-stripping, but extracts the
 * first balanced `{...}` instead of `[...]`.
 *
 * The prompt asks the model to emit a triage paragraph BEFORE the JSON
 * object — we deliberately discard that prose by scanning for the first
 * `{`.
 */
export class AiReviewParser extends Service {
  parse(raw: string): Review {
    this.logger.info('Parsing review output', { bytes: raw.length })
    const text = extractJsonObject(stripFences(unwrapEnvelope(raw.trim())))
    const parsed: unknown = JSON.parse(text)
    return ReviewSchema.parse(parsed)
  }
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
    // Not a JSON envelope — treat as raw model output.
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
 * Find the first balanced `{...}` object in `text`. String contents are
 * ignored when counting braces so `{ "has } in it" }` parses correctly.
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
