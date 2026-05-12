import type { CodePointer, TourResult, TourStep } from '@/lib/api'

/** Pick which sha to read from given the step's `code.side` hint. */
export function chooseSha(tour: TourResult, side: CodePointer['side']): string {
  if (side === 'before') return tour.baseRefOid ?? tour.headRefOid
  return tour.headRefOid
}

/**
 * Find the first step (after the current) whose primary `code` pointer overlaps
 * the given reference. Used for click-to-jump on references[].
 */
export function findStepForRef(tour: TourResult, ref: CodePointer): TourStep | undefined {
  for (const chapter of tour.chapters) {
    for (const step of chapter.steps) {
      const c = step.code
      if (!c || c.file !== ref.file) continue
      if (rangesOverlap(c, ref)) return step
    }
  }
  return undefined
}

function rangesOverlap(a: CodePointer, b: CodePointer): boolean {
  const aStart = a.lineStart ?? 1
  const aEnd = a.lineEnd ?? aStart
  const bStart = b.lineStart ?? 1
  const bEnd = b.lineEnd ?? bStart
  return aStart <= bEnd && bStart <= aEnd
}

export interface HighlightWindow {
  /** Lines that should get the focus-line emphasis. */
  focus: number | undefined
  /** Inclusive line range to visually highlight. */
  range: { start: number; end: number } | undefined
}

/** Resolve a CodePointer into renderer hints — focus line + highlight range. */
export function highlightWindow(code: CodePointer | undefined): HighlightWindow {
  if (!code) return { focus: undefined, range: undefined }
  const focus = code.focusLine ?? code.lineStart
  const ctx = code.contextLines ?? 2
  const start = code.lineStart ?? focus
  const end = code.lineEnd ?? focus ?? start
  if (start == null || end == null) return { focus, range: undefined }
  return { focus, range: { start: Math.max(1, start - ctx), end: end + ctx } }
}

/** Map a file path's extension to a shiki language id. Falls back to plaintext. */
export function inferLang(file: string): string {
  const ext = (file.split('.').pop() ?? '').toLowerCase()
  return EXT_TO_LANG[ext] ?? 'plaintext'
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  json: 'json', css: 'css', html: 'html', md: 'markdown',
  py: 'python', rs: 'rust', go: 'go', sql: 'sql',
  yml: 'yaml', yaml: 'yaml', sh: 'bash', bash: 'bash',
}
