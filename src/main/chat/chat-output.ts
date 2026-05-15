import { z } from 'zod'

/**
 * What the chat assistant returns each turn — a markdown answer plus an
 * optional list of structured code pointers the UI renders as click-to-jump
 * chips below the message bubble.
 */
const CodeRefSchema = z.object({
  file: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive().optional(),
})

export const ChatEnvelopeSchema = z.object({
  markdown: z.string().min(1),
  references: z.array(CodeRefSchema).max(8).default([]),
})

export type ChatEnvelope = z.infer<typeof ChatEnvelopeSchema>
export type ChatRef = z.infer<typeof CodeRefSchema>

/**
 * Same tolerance shape as TourParser: tolerate the claude `{result: "..."}`
 * envelope, ```json fences, and (per the prompt) a plain-text plan narration
 * before the JSON object.
 */
export function parseChatEnvelope(raw: string): ChatEnvelope {
  const text = extractJsonObject(stripFences(unwrapEnvelope(raw.trim())))
  const parsed: unknown = JSON.parse(text)
  return ChatEnvelopeSchema.parse(parsed)
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
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return text.slice(start)
}
