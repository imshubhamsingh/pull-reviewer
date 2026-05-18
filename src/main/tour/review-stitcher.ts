import type { PrFile } from '@/main/tour/pr-context.collector'
import type { Finding, Review } from '@/main/tour/review-schema'
import type {
  ChapterCritique,
  CritiqueIssue,
  CritiqueSuggestion,
  Tour,
} from '@/main/tour/tour-schema'

/**
 * Distributes AI review findings across the tour's surfaces:
 *
 *  - Finding pinned to a file that some chapter covers (`code.file` or
 *    in any step's `references[]`) → appended to that chapter's critique.
 *  - Finding pinned to a file NO chapter covers → collected into a
 *    synthetic "Additional review findings" chapter, one step per finding
 *    pinned to the file:line.
 *  - Cross-cutting finding (no `code.file`) → stays only in
 *    `tour.review.findings`; not appended to any chapter.
 *
 * Pure function — no DB, no React. Returns a *new* tour; the input is not
 * mutated. Severity 'minor' becomes a suggestion; 'major' / 'blocker'
 * become issues. The synthetic chapter is only added when there's at
 * least one uncovered finding.
 */

export interface StitchInput {
  tour: Tour
  review: Review | null
  files: PrFile[]
}

export interface StitchOutput {
  tour: Tour
}

const SYNTHETIC_CHAPTER_ID = 'additional-review-findings'

export function stitchReview(input: StitchInput): StitchOutput {
  if (!input.review || input.review.findings.length === 0) {
    return { tour: input.tour }
  }

  const fileToChapterIdx = buildFileToChapterIdx(input.tour)
  const tour = cloneTour(input.tour)
  const uncovered: Finding[] = []

  for (const finding of input.review.findings) {
    const file = finding.code?.file
    if (!file) continue // cross-cutting — leave in review.findings only

    const idx = fileToChapterIdx.get(file)
    const chapter = idx !== undefined ? tour[idx] : undefined
    if (!chapter) {
      uncovered.push(finding)
      continue
    }
    appendToChapter(chapter, finding)
  }

  if (uncovered.length > 0) {
    tour.push(buildSyntheticChapter(uncovered))
  }

  return { tour }
}

/**
 * `code.file` of a step is the strongest binding (the chapter "owns" that
 * file). References are the second-best — a step that *mentions* a file
 * still gives the reader a place to look. First-pinning wins on ties.
 */
function buildFileToChapterIdx(tour: Tour): Map<string, number> {
  const fromCode = new Map<string, number>()
  const fromRefs = new Map<string, number>()
  tour.forEach((chapter, i) => {
    for (const step of chapter.steps) {
      const codeFile = step.code?.file
      if (codeFile && !fromCode.has(codeFile)) fromCode.set(codeFile, i)
      for (const ref of step.references ?? []) {
        if (ref.file && !fromRefs.has(ref.file)) fromRefs.set(ref.file, i)
      }
    }
  })
  const out = new Map<string, number>(fromRefs)
  for (const [file, idx] of fromCode) out.set(file, idx) // code wins over refs
  return out
}

function appendToChapter(chapter: Tour[number], finding: Finding): void {
  const critique: ChapterCritique = chapter.critique ?? { issues: [], suggestions: [] }
  if (finding.severity === 'minor') {
    critique.suggestions.push(toSuggestion(finding))
  } else {
    critique.issues.push(toIssue(finding))
  }
  chapter.critique = critique
}

function toIssue(finding: Finding): CritiqueIssue {
  return {
    severity: finding.severity,
    body: buildBody(finding),
    code: finding.code ? toCodePointer(finding.code) : undefined,
    lens: finding.lens,
    findingId: finding.id,
  }
}

function toSuggestion(finding: Finding): CritiqueSuggestion {
  return {
    body: buildBody(finding),
    code: finding.code ? toCodePointer(finding.code) : undefined,
    lens: finding.lens,
    findingId: finding.id,
  }
}

function toCodePointer(code: NonNullable<Finding['code']>): CritiqueIssue['code'] {
  return {
    file: code.file,
    side: code.side,
    lineStart: code.lineStart,
    lineEnd: code.lineEnd,
  }
}

function buildBody(finding: Finding): string {
  if (!finding.suggestion) return finding.body
  return `${finding.body}\n\n**Suggestion:** ${finding.suggestion}`
}

function buildSyntheticChapter(findings: Finding[]): Tour[number] {
  return {
    id: SYNTHETIC_CHAPTER_ID,
    title: 'Additional review findings',
    summary: `${findings.length} finding${findings.length === 1 ? '' : 's'} on files the tour didn't cover`,
    steps: findings.map((f, n) => ({
      id: `arf-${n + 1}`,
      panel: 'code' as const,
      title: stepTitleFor(f),
      body: buildBody(f),
      code: {
        file: f.code!.file,
        side: f.code?.side,
        lineStart: f.code?.lineStart,
        lineEnd: f.code?.lineEnd,
      },
    })),
    critique: {
      issues: findings.filter((f) => f.severity !== 'minor').map(toIssue),
      suggestions: findings.filter((f) => f.severity === 'minor').map(toSuggestion),
    },
  }
}

function stepTitleFor(f: Finding): string {
  const line = f.code?.lineStart != null ? `:${f.code.lineStart}` : ''
  return `${f.code!.file}${line}`
}

function cloneTour(tour: Tour): Tour {
  // Deep clone so callers can keep their original tour intact. Tours are
  // small (low hundreds of steps); JSON round-trip is fastest and safest.
  return JSON.parse(JSON.stringify(tour)) as Tour
}
