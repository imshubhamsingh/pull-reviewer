import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

export interface ChapterCompletionsState {
  completed: Set<string>
  loading: boolean
  error: string | undefined
  isComplete: (chapterId: string) => boolean
  /** Optimistic flip + server roundtrip; rolls back on failure. */
  toggle: (chapterId: string) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Per-PR chapter-completion state. Scoped to (repo, pr, head_sha) — caller
 * passes those in so the hook can reload when the user regenerates the tour
 * (new head_sha = empty set automatically because no rows match).
 */
export function useChapterCompletions(
  repo: string,
  prNumber: number,
  headRefOid: string,
): ChapterCompletionsState {
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.reviewProgress.chapters.list(repo, prNumber, headRefOid)
      setCompleted(new Set(list.map((r) => r.chapterId)))
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
    async (chapterId: string) => {
      const wasComplete = completed.has(chapterId)
      // Optimistic flip
      setCompleted((prev) => {
        const next = new Set(prev)
        if (wasComplete) next.delete(chapterId)
        else next.add(chapterId)
        return next
      })
      try {
        if (wasComplete)
          await api.reviewProgress.chapters.unmark(repo, prNumber, headRefOid, chapterId)
        else await api.reviewProgress.chapters.mark(repo, prNumber, headRefOid, chapterId)
      } catch (e) {
        // Roll back
        setCompleted((prev) => {
          const next = new Set(prev)
          if (wasComplete) next.add(chapterId)
          else next.delete(chapterId)
          return next
        })
        setError((e as Error).message)
      }
    },
    [completed, repo, prNumber, headRefOid],
  )

  return {
    completed,
    loading,
    error,
    isComplete: (id) => completed.has(id),
    toggle,
    refresh,
  }
}
