/**
 * Parses a mockup-element `source` annotation into a click-to-jump ref. The
 * grammar matches what we ask the model for in `rules.md`:
 *
 *   "<repo-relative path>:<lineStart>-<lineEnd>"
 *   "<repo-relative path>:<line>"
 *
 * Anything else falls through to `null` — the renderer keeps the element
 * displayed but doesn't make it clickable.
 */

export interface SourceRef {
  file: string
  lineStart: number
  lineEnd?: number
}

const PATTERN = /^(.+):(\d+)(?:-(\d+))?$/

export function parseSourceRef(source: string): SourceRef | null {
  const match = PATTERN.exec(source.trim())
  if (!match) return null
  const [, rawFile, rawStart, rawEnd] = match
  const file = rawFile?.trim()
  if (!file) return null
  const lineStart = Number.parseInt(rawStart ?? '', 10)
  if (!Number.isFinite(lineStart) || lineStart < 1) return null
  const lineEnd = rawEnd ? Number.parseInt(rawEnd, 10) : undefined
  return lineEnd !== undefined && Number.isFinite(lineEnd) && lineEnd >= lineStart
    ? { file, lineStart, lineEnd }
    : { file, lineStart }
}
