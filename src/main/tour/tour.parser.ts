import { z } from 'zod'
import { Service } from '@/main/service'

const TourStepSchema = z.object({
  id: z.string().min(1),
  panel: z.enum(['docs', 'code', 'code-map']),
  file: z.string().optional(),
  side: z.enum(['before', 'after', 'diff']).optional(),
  lineStart: z.number().int().nonnegative().optional(),
  lineEnd: z.number().int().nonnegative().optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1),
})

const TourSchema = z.array(TourStepSchema).min(1).max(20)

export type TourStep = z.infer<typeof TourStepSchema>

export class TourParser extends Service {
  parse(raw: string): TourStep[] {
    this.logger.info('Parsing tour output', { bytes: raw.length })

    let text = raw.trim()

    // Unwrap `claude --output-format json` envelope: { result: "..." }
    try {
      const envelope = JSON.parse(text) as unknown
      if (
        typeof envelope === 'object' &&
        envelope !== null &&
        'result' in envelope &&
        typeof (envelope as { result: unknown }).result === 'string'
      ) {
        text = (envelope as { result: string }).result
      }
    } catch {
      // not a JSON envelope; treat as raw model output
    }

    // Strip ``` fences if the model wrapped despite instructions
    text = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim()

    const parsed: unknown = JSON.parse(text)
    return TourSchema.parse(parsed)
  }
}
