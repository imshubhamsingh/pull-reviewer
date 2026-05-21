import type { ThemedToken } from 'shiki'
import type { LineMatchRange } from '@/app/lib/code-search'

export interface HighlightedSegment {
  content: string
  color: string | undefined
  fontStyle: number | undefined
  matched: boolean
  active: boolean
}

/**
 * Take Shiki tokens for one line plus a list of search match ranges within
 * that line, return a flat list of segments. Each segment is either a
 * normal token slice OR a slice that falls inside a match (flagged via
 * `matched` and optionally `active`).
 *
 * The split preserves Shiki colour + font style across match boundaries so
 * highlighted text keeps its syntax colouring under the highlight.
 *
 * `activeRange` (when provided) marks the single segment range that should
 * receive the active match treatment (brighter background + flash target).
 */
export function highlightTokens(
  tokens: ThemedToken[],
  matches: LineMatchRange[],
  activeRange: LineMatchRange | null,
): HighlightedSegment[] {
  if (matches.length === 0) {
    return tokens.map((t) => ({
      content: t.content,
      color: t.color,
      fontStyle: t.fontStyle,
      matched: false,
      active: false,
    }))
  }
  const out: HighlightedSegment[] = []
  let pos = 0
  for (const tok of tokens) {
    const tokStart = pos
    const tokEnd = pos + tok.content.length
    const overlaps = matches.filter((m) => m.start < tokEnd && m.end > tokStart)
    if (overlaps.length === 0) {
      out.push({
        content: tok.content,
        color: tok.color,
        fontStyle: tok.fontStyle,
        matched: false,
        active: false,
      })
    } else {
      const boundaries = new Set<number>([tokStart, tokEnd])
      for (const m of overlaps) {
        boundaries.add(Math.max(m.start, tokStart))
        boundaries.add(Math.min(m.end, tokEnd))
      }
      const sorted = [...boundaries].sort((a, b) => a - b)
      for (let i = 0; i < sorted.length - 1; i++) {
        const segStart = sorted[i]!
        const segEnd = sorted[i + 1]!
        const hit = matches.find((m) => m.start <= segStart && m.end >= segEnd)
        out.push({
          content: tok.content.slice(segStart - tokStart, segEnd - tokStart),
          color: tok.color,
          fontStyle: tok.fontStyle,
          matched: !!hit,
          active: !!(
            activeRange &&
            hit &&
            hit.start === activeRange.start &&
            hit.end === activeRange.end
          ),
        })
      }
    }
    pos = tokEnd
  }
  return out
}
