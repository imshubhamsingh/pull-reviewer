import { Service } from '@/main/service'
import { TourSchema, type Tour } from '@/main/tour/tour-schema'

export type { Tour, TourChapter, TourStep } from '@/main/tour/tour-schema'

/**
 * Unwraps the CLI's output envelope and zod-validates the result against the
 * chapters-shaped Tour schema. Three normalisation steps tolerate model output
 * that:
 *  - is wrapped in the `claude --output-format json` envelope `{ result: "..." }`
 *  - is wrapped in a ```json``` fence the model emitted despite instructions
 *  - has a plain-text plan narration before the JSON array (we ask for this
 *    on purpose in rules.md so the user sees activity during long generations)
 */
export class TourParser extends Service {
  parse(raw: string): Tour {
    this.logger.info('Parsing tour output', { bytes: raw.length })
    const text = extractJsonArray(stripFences(unwrapEnvelope(raw.trim())))
    const parsed: unknown = JSON.parse(text)
    return TourSchema.parse(parsed)
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
 * Find the first balanced `[...]` array in `text`. If none, return text as-is
 * (JSON.parse will produce a useful error). String contents are ignored when
 * counting brackets so `[ "has ] in it" ]` parses correctly.
 */
function extractJsonArray(text: string): string {
  const start = text.indexOf('[')
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
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return text.slice(start)
}
