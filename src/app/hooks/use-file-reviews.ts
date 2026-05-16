import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

export interface FileReviewsState {
  reviewed: Set<string>
  loading: boolean
  error: string | undefined
  isReviewed: (filePath: string) => boolean
  /** Optimistic per-file flip; rolls back on failure. */
  toggle: (filePath: string) => Promise<void>
  /** Bulk-mark for chapter-complete cascade. Idempotent; rolls back on failure. */
  markMany: (filePaths: string[]) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Per-PR file-reviewed state. Scoped to (repo, pr, head_sha). Two write paths:
 *   1. `toggle(path)` — user clicks the tick on a FileMap row.
 *   2. `markMany(paths)` — chapter-complete cascade bulk-ticks pinned files.
 */
export function useFileReviews(
  repo: string,
  prNumber: number,
  headRefOid: string,
): FileReviewsState {
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.reviewProgress.files.list(repo, prNumber, headRefOid)
      setReviewed(new Set(list.map((r) => r.filePath)))
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [repo, prNumber, headRefOid])

  useEffect(() => {
    refresh()
  }, [refresh])

  const toggle = useCallback(
    async (filePath: string) => {
      const wasReviewed = reviewed.has(filePath)
      setReviewed((prev) => {
        const next = new Set(prev)
        if (wasReviewed) next.delete(filePath)
        else next.add(filePath)
        return next
      })
      try {
        if (wasReviewed) await api.reviewProgress.files.unmark(repo, prNumber, headRefOid, filePath)
        else await api.reviewProgress.files.markMany(repo, prNumber, headRefOid, [filePath])
      } catch (e) {
        setReviewed((prev) => {
          const next = new Set(prev)
          if (wasReviewed) next.add(filePath)
          else next.delete(filePath)
          return next
        })
        setError((e as Error).message)
      }
    },
    [reviewed, repo, prNumber, headRefOid],
  )

  const markMany = useCallback(
    async (filePaths: string[]) => {
      if (filePaths.length === 0) return
      const prevSnapshot = new Set(reviewed)
      setReviewed((prev) => {
        const next = new Set(prev)
        for (const p of filePaths) next.add(p)
        return next
      })
      try {
        await api.reviewProgress.files.markMany(repo, prNumber, headRefOid, filePaths)
      } catch (e) {
        // Roll back to the pre-cascade snapshot.
        setReviewed(prevSnapshot)
        setError((e as Error).message)
      }
    },
    [reviewed, repo, prNumber, headRefOid],
  )

  return {
    reviewed,
    loading,
    error,
    isReviewed: (p) => reviewed.has(p),
    toggle,
    markMany,
    refresh,
  }
}
