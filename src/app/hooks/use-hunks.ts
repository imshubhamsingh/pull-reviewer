import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { HunksFileRanges, HunksResponse } from '@/lib/api'
import { getCachedHunks, hunksCacheKey, putCachedHunks } from '@/app/lib/hunks-cache'

/**
 * Resolved PR-hunks state for the `(repo, prNumber, headSha)` triple. The
 * renderer prefers an IndexedDB hit so app restarts don't refetch; on miss
 * it pings the main process, which has its own short LRU. The same key is
 * deduplicated in-flight so a Code-pane mount and a tour-ready prewarm don't
 * race into two network calls.
 */
export type HunksState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; response: HunksResponse }
  | { kind: 'error'; message: string }

const inflight = new Map<string, Promise<HunksResponse>>()

export function useHunks(repo: string, prNumber: number, headSha: string | null): HunksState {
  const [state, setState] = useState<HunksState>({ kind: 'idle' })

  useEffect(() => {
    if (!headSha) {
      setState({ kind: 'idle' })
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    void fetchHunks(repo, prNumber, headSha).then(
      (response) => {
        if (!cancelled) setState({ kind: 'ready', response })
      },
      (err: Error) => {
        if (!cancelled) setState({ kind: 'error', message: err.message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [repo, prNumber, headSha])

  return state
}

/**
 * Fire-and-forget warm-up — used by `TourView` to populate the IDB before
 * the user opens any file. Shares the in-flight dedupe with `useHunks` so
 * a pending fetch isn't duplicated.
 */
export function prewarmHunks(repo: string, prNumber: number, headSha: string | null): void {
  if (!headSha) return
  void fetchHunks(repo, prNumber, headSha).catch(() => {
    // Swallow — the lazy fetch on Code-pane mount will surface the error
    // if it actually matters.
  })
}

async function fetchHunks(repo: string, prNumber: number, headSha: string): Promise<HunksResponse> {
  const key = hunksCacheKey(repo, prNumber, headSha)
  const cached = await getCachedHunks(key)
  if (cached) return cached
  const existing = inflight.get(key)
  if (existing) return existing
  const promise = api.reviews
    .hunks(repo, prNumber, headSha)
    .then(async (response) => {
      await putCachedHunks(key, response)
      return response
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}

/**
 * Expand a file's RLE ranges into a `Set<number>` for O(1) per-line lookups
 * in `CodeLines`. Pass the same `HunksFileRanges` reference and side across
 * renders for a memoised set — the WeakMap keying means we never hold the
 * Set after the underlying ranges are garbage-collected.
 */
const setCache = new WeakMap<HunksFileRanges, { right?: Set<number>; left?: Set<number> }>()

export function commentableLineSet(
  ranges: HunksFileRanges | undefined,
  side: 'right' | 'left',
): Set<number> {
  if (!ranges) return EMPTY
  let entry = setCache.get(ranges)
  if (!entry) {
    entry = {}
    setCache.set(ranges, entry)
  }
  if (!entry[side]) entry[side] = expand(ranges[side])
  return entry[side]
}

function expand(rangePairs: [number, number][]): Set<number> {
  const out = new Set<number>()
  for (const [start, end] of rangePairs) {
    for (let n = start; n <= end; n += 1) out.add(n)
  }
  return out
}

const EMPTY: Set<number> = new Set()
