import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { api, type PullRequestSummary } from '@/lib/api'

export type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; prs: PullRequestSummary[] }
  | { kind: 'error'; message: string }

export interface PrLists {
  mine: ListState
  review: ListState
  reviewed: ListState
  recents: ListState
  refresh: () => void
}

export function usePrLists(): PrLists {
  const [mine, setMine] = useState<ListState>({ kind: 'loading' })
  const [review, setReview] = useState<ListState>({ kind: 'loading' })
  const [reviewed, setReviewed] = useState<ListState>({ kind: 'loading' })
  const [recents, setRecents] = useState<ListState>({ kind: 'loading' })

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
    run(api.prs.mine, setMine)
    run(api.prs.reviewRequested, setReview)
    run(api.prs.reviewedByMe, setReviewed)
    run(api.prs.recents, setRecents)
    return () => { cancelled = true }
  }, [])

  useEffect(() => load(), [load])

  return { mine, review, reviewed, recents, refresh: load }
}
