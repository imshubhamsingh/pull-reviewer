import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { api, type PullRequestSummary } from '@/lib/api'

export type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; prs: PullRequestSummary[] }
  | { kind: 'error'; message: string }

export interface PrLists {
  mine: ListState
  review: ListState
}

export function usePrLists(): PrLists {
  const [mine, setMine] = useState<ListState>({ kind: 'loading' })
  const [review, setReview] = useState<ListState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    const load = (
      fn: () => Promise<PullRequestSummary[]>,
      set: Dispatch<SetStateAction<ListState>>,
    ) => fn()
      .then((prs) => { if (!cancelled) set({ kind: 'ready', prs }) })
      .catch((err: Error) => { if (!cancelled) set({ kind: 'error', message: err.message }) })

    load(api.prs.mine, setMine)
    load(api.prs.reviewRequested, setReview)
    return () => { cancelled = true }
  }, [])

  return { mine, review }
}
