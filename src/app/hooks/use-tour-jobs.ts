import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type TourJobSummary } from '@/lib/api'

/**
 * Renderer-wide snapshot of all active + queued tour jobs. Polls
 * `GET /tours/jobs` every `POLL_MS` while at least one job is active;
 * goes idle (no polling) when the list is empty. Consumers (PR list,
 * header pill) read `summaries` and `findForPr(repo, pr)`.
 *
 * Future: replace polling with an SSE channel that pushes job-state
 * changes from the manager. Polling is fine for v1.
 */

const POLL_MS = 2500
const IDLE_RECHECK_MS = 8000

export interface UseTourJobsResult {
  summaries: TourJobSummary[]
  findForPr: (repo: string, prNumber: number) => TourJobSummary | undefined
  refresh: () => Promise<void>
}

export function useTourJobs(): UseTourJobsResult {
  const [summaries, setSummaries] = useState<TourJobSummary[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const fetchOnce = useCallback(async (): Promise<TourJobSummary[]> => {
    try {
      const list = await api.tours.jobs.list()
      if (mountedRef.current) setSummaries(list)
      return list
    } catch {
      return []
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    await fetchOnce()
  }, [fetchOnce])

  useEffect(() => {
    mountedRef.current = true
    const tick = async (): Promise<void> => {
      const list = await fetchOnce()
      if (!mountedRef.current) return
      // Active jobs → fast polling; idle → slower re-check so newly-started
      // jobs from other views still surface within a few seconds.
      const delay = list.length > 0 ? POLL_MS : IDLE_RECHECK_MS
      timerRef.current = setTimeout(() => void tick(), delay)
    }
    void tick()
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [fetchOnce])

  const findForPr = useCallback(
    (repo: string, prNumber: number): TourJobSummary | undefined =>
      summaries.find((s) => s.job.repo === repo && s.job.prNumber === prNumber),
    [summaries],
  )

  return { summaries, findForPr, refresh }
}
