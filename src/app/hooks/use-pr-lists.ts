import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
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

  // Recents come from the local "I opened this PR" cache, so their stored
  // `state` / `reviewDecision` / `updatedAt` is frozen at touch-time. After a
  // refresh we overlay each recent with the live state from any of the other
  // three lists that contains it — covers the common cases (PR I reviewed
  // later got merged, PR I authored got approved, etc.). PRs not in any of
  // those lists stay at their cached state.
  const freshRecents = useMemo<ListState>(
    () => overlayRecents(recents, mine, review, reviewed),
    [recents, mine, review, reviewed],
  )

  const load = useCallback(() => {
    let cancelled = false
    const run = (
      fn: () => Promise<PullRequestSummary[]>,
      set: Dispatch<SetStateAction<ListState>>,
    ) => {
      set({ kind: 'loading' })
      return fn()
        .then((prs) => {
          if (!cancelled) set({ kind: 'ready', prs })
        })
        .catch((err: Error) => {
          if (!cancelled) set({ kind: 'error', message: err.message })
        })
    }
    run(api.prs.mine, setMine)
    run(api.prs.reviewRequested, setReview)
    run(api.prs.reviewedByMe, setReviewed)
    // Recents come from the LOCAL cache first — render instantly so the user
    // isn't blocked by a multi-second GraphQL batch. Then refresh in the
    // background and patch the list in place once GitHub responds. Failure
    // of the background refresh is silent; the cached snapshot stays.
    api.prs
      .recents()
      .then((prs) => {
        if (!cancelled) setRecents({ kind: 'ready', prs })
      })
      .catch((err: Error) => {
        if (!cancelled) setRecents({ kind: 'error', message: err.message })
      })
    api.prs.refreshRecents().then(
      (prs) => {
        if (!cancelled) setRecents({ kind: 'ready', prs })
      },
      () => {
        /* keep the cached snapshot — background refresh failure is silent. */
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => load(), [load])

  return { mine, review, reviewed, recents: freshRecents, refresh: load }
}

function overlayRecents(
  recents: ListState,
  mine: ListState,
  review: ListState,
  reviewed: ListState,
): ListState {
  if (recents.kind !== 'ready') return recents
  const fresh = new Map<string, PullRequestSummary>()
  for (const list of [mine, review, reviewed]) {
    if (list.kind !== 'ready') continue
    for (const pr of list.prs) fresh.set(pr.id, pr)
  }
  if (fresh.size === 0) return recents
  return {
    kind: 'ready',
    prs: recents.prs.map((pr) => fresh.get(pr.id) ?? pr),
  }
}
