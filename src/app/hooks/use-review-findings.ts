import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { Finding, Review } from '@/lib/api'

/**
 * Per-PR state for AI review findings: a flat list of all findings, plus
 * the set of dismissed ids primed from the backend. Dismissal is
 * optimistic — UI flips immediately, server roundtrip rolls back on
 * failure.
 *
 * Scoped to (repo, prNumber, headRefOid). A new headSha (e.g. after the
 * user pushes commits) gets an empty dismissals set automatically because
 * no rows match the new sha.
 */

export interface ReviewFindingsState {
  review: Review | null
  /** Findings filtered to a given file, in their original order. */
  byFile: (file: string) => Finding[]
  /** All findings whose `code.lineStart` falls on the given line of the given file. */
  byLine: (file: string, line: number) => Finding[]
  /** Map: `lineStart` → findings on that line, keyed for the given file. */
  byLineMap: (file: string) => Map<number, Finding[]>
  isDismissed: (findingId: string) => boolean
  isConverted: (findingId: string) => boolean
  markConverted: (findingId: string) => void
  dismiss: (findingId: string) => Promise<void>
  undismiss: (findingId: string) => Promise<void>
}

export function useReviewFindings(
  review: Review | null,
  repo: string,
  prNumber: number,
  headRefOid: string,
): ReviewFindingsState {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [converted, setConverted] = useState<Set<string>>(new Set())

  // Prime the dismissed set from the backend on mount / scope change. We
  // intentionally don't surface a loading state — the UI shows ✨ icons
  // optimistically and reconciles when the GET returns.
  useEffect(() => {
    let cancelled = false
    api.reviewProgress.aiDismissals.list(repo, prNumber, headRefOid).then(
      (rows) => {
        if (cancelled) return
        setDismissed(new Set(rows.map((r) => r.findingId)))
      },
      () => {
        /* non-fatal — fall back to an empty set */
      },
    )
    return () => {
      cancelled = true
    }
  }, [repo, prNumber, headRefOid])

  const byFile = useCallback(
    (file: string): Finding[] => {
      if (!review) return []
      return review.findings.filter((f) => f.code?.file === file)
    },
    [review],
  )

  const byLineMap = useCallback(
    (file: string): Map<number, Finding[]> => {
      const out = new Map<number, Finding[]>()
      if (!review) return out
      for (const f of review.findings) {
        if (f.code?.file !== file) continue
        const line = f.code.lineStart
        if (line == null) continue
        const bucket = out.get(line)
        if (bucket) bucket.push(f)
        else out.set(line, [f])
      }
      return out
    },
    [review],
  )

  const byLine = useCallback(
    (file: string, line: number): Finding[] => {
      if (!review) return []
      return review.findings.filter((f) => f.code?.file === file && f.code?.lineStart === line)
    },
    [review],
  )

  const dismiss = useCallback(
    async (findingId: string): Promise<void> => {
      // Optimistic flip
      setDismissed((prev) => {
        const next = new Set(prev)
        next.add(findingId)
        return next
      })
      try {
        await api.reviewProgress.aiDismissals.add(repo, prNumber, headRefOid, findingId)
      } catch {
        setDismissed((prev) => {
          const next = new Set(prev)
          next.delete(findingId)
          return next
        })
      }
    },
    [repo, prNumber, headRefOid],
  )

  const undismiss = useCallback(
    async (findingId: string): Promise<void> => {
      setDismissed((prev) => {
        const next = new Set(prev)
        next.delete(findingId)
        return next
      })
      try {
        await api.reviewProgress.aiDismissals.remove(repo, prNumber, headRefOid, findingId)
      } catch {
        setDismissed((prev) => {
          const next = new Set(prev)
          next.add(findingId)
          return next
        })
      }
    },
    [repo, prNumber, headRefOid],
  )

  const isDismissed = useCallback((id: string) => dismissed.has(id), [dismissed])
  const isConverted = useCallback((id: string) => converted.has(id), [converted])
  const markConverted = useCallback((id: string) => {
    setConverted((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  return useMemo<ReviewFindingsState>(
    () => ({
      review,
      byFile,
      byLine,
      byLineMap,
      isDismissed,
      isConverted,
      markConverted,
      dismiss,
      undismiss,
    }),
    [
      review,
      byFile,
      byLine,
      byLineMap,
      isDismissed,
      isConverted,
      markConverted,
      dismiss,
      undismiss,
    ],
  )
}
