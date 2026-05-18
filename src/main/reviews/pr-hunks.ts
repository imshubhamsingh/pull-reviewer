/**
 * Parse unified-diff patches into the set of line numbers each side covers.
 * GitHub will only accept review comments on lines covered by this set.
 *
 * Lifted out of `review.submitter.ts` so the upcoming `HunksService` (used
 * by the commentable-lines UI) can reuse the same parser.
 */

export interface FileHunks {
  /** Set of head-side line numbers (post-image) that fall inside any hunk. */
  rightLines: Set<number>
  /** Set of base-side line numbers (pre-image) that fall inside any hunk. */
  leftLines: Set<number>
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

export function parsePatchHunks(patch: string): FileHunks {
  const rightLines = new Set<number>()
  const leftLines = new Set<number>()
  let leftLine = 0
  let rightLine = 0
  for (const line of patch.split('\n')) {
    const header = HUNK_HEADER.exec(line)
    if (header) {
      leftLine = Number(header[1])
      rightLine = Number(header[3])
      continue
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      rightLines.add(rightLine)
      rightLine += 1
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      leftLines.add(leftLine)
      leftLine += 1
    } else if (line.startsWith(' ')) {
      // Context line — appears on BOTH sides; GitHub accepts comments here.
      leftLines.add(leftLine)
      rightLines.add(rightLine)
      leftLine += 1
      rightLine += 1
    }
  }
  return { rightLines, leftLines }
}
