import { Service } from '@/main/service'
import { TourSchema, type Tour } from '@/main/tour/tour-schema'

export type { Tour, TourChapter, TourStep } from '@/main/tour/tour-schema'

/**
 * Unwraps the CLI's output envelope and zod-validates the result against the
 * chapters-shaped Tour schema. Two unwrap steps tolerate model output that:
 *  - is wrapped in the `claude --output-format json` envelope `{ result: "..." }`
 *  - is wrapped in a ```json``` fence the model emitted despite instructions
 */
export class TourParser extends Service {
  parse(raw: string): Tour {
    this.logger.info('Parsing tour output', { bytes: raw.length })
    const text = stripFences(unwrapEnvelope(raw.trim()))
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
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
}
