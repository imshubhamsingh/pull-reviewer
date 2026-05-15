import { useMemo } from 'react'
import type { FlatStep } from '@/app/hooks/useChapterNav'

/** How a file shows up in the tour — pinned in some step, only referenced, or absent. */
export type FileCoverageKind = 'pinned' | 'referenced' | 'uncovered'

export interface FileCoverage {
  kind: (path: string) => FileCoverageKind
  /** First step index that touches the file (pin preferred, ref fallback). -1 if uncovered. */
  firstStep: (path: string) => number
  /** Chapter title where the file first appears, for tooltips. undefined if uncovered. */
  firstChapter: (path: string) => string | undefined
  /** 1-based chapter number where the file first appears (for "ch N" badges). undefined if uncovered. */
  firstChapterIdx: (path: string) => number | undefined
  /** Files appearing as `step.code.file` for steps within this chapter index. Refs excluded. */
  pinnedFilesIn: (chapterIdx: number) => string[]
}

export function useFileCoverage(flat: FlatStep[]): FileCoverage {
  return useMemo(() => buildCoverage(flat), [flat])
}

function buildCoverage(flat: FlatStep[]): FileCoverage {
  const pinnedAt = new Map<string, number>()
  const referencedAt = new Map<string, number>()
  // chapterIdx → set of distinct pinned file paths in that chapter
  const pinnedByChapter = new Map<number, Set<string>>()
  flat.forEach((f, idx) => {
    const code = f.step.code?.file
    if (code) {
      if (!pinnedAt.has(code)) pinnedAt.set(code, idx)
      let bucket = pinnedByChapter.get(f.chapterIdx)
      if (!bucket) { bucket = new Set(); pinnedByChapter.set(f.chapterIdx, bucket) }
      bucket.add(code)
    }
    f.step.references?.forEach((r) => {
      if (!referencedAt.has(r.file)) referencedAt.set(r.file, idx)
    })
  })
  const firstStep = (path: string): number => pinnedAt.get(path) ?? referencedAt.get(path) ?? -1
  return {
    kind: (path) => {
      if (pinnedAt.has(path)) return 'pinned'
      if (referencedAt.has(path)) return 'referenced'
      return 'uncovered'
    },
    firstStep,
    firstChapter: (path) => {
      const idx = firstStep(path)
      return idx >= 0 ? flat[idx]?.chapter.title : undefined
    },
    firstChapterIdx: (path) => {
      const idx = firstStep(path)
      if (idx < 0) return undefined
      const chapterIdx = flat[idx]?.chapterIdx
      return chapterIdx != null ? chapterIdx + 1 : undefined
    },
    pinnedFilesIn: (chapterIdx) => {
      const bucket = pinnedByChapter.get(chapterIdx)
      return bucket ? [...bucket] : []
    },
  }
}
