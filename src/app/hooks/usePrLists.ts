import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { api, type PullRequestSummary } from '@/lib/api'

export type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; prs: PullRequestSummary[] }
  | { kind: 'error'; message: string }

export interface PrLists {
  mine: ListState
  review: ListState
  assigned: ListState
  refresh: () => void
}

export function usePrLists(): PrLists {
  const [mine, setMine] = useState<ListState>({ kind: 'loading' })
  const [review, setReview] = useState<ListState>({ kind: 'loading' })
  const [assigned, setAssigned] = useState<ListState>({ kind: 'loading' })

  const load = useCallback(() => {
    let cancelled = false
    const run = (
      fn: () => Promise<PullRequestSummary[]>,
      set: Dispatch<SetStateAction<ListState>>,
    ) => {
      set({ kind: 'loading' })
      return fn()
        .then((prs) => { if (!cancelled) set({ kind: 'ready', prs }) })
        .catch((err: Error) => { if (!cancelled) set({ kind: 'error', message: err.message }) })
    }
    void run(api.prs.mine, setMine)
    void run(api.prs.reviewRequested, setReview)
    void run(api.prs.assigned, setAssigned)
    return () => { cancelled = true }
  }, [])

  useEffect(() => load(), [load])

  return { mine, review, assigned, refresh: load }
}
