import { useCallback, useEffect, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { api, ApiError, type TourResult, type TourStreamEvent } from '@/lib/api'

export type TourState =
  | { kind: 'loading' }
  | { kind: 'no-tour'; staleTour: TourResult | null }
  | { kind: 'generating'; events: TourStreamEvent[] }
  | { kind: 'ready'; tour: TourResult }
  | { kind: 'error'; message: string }

interface UseTourResult {
  state: TourState
  /** Kick off a generation from the no-tour state (or force one over a cached
   *  tour). The hook auto-attaches to an in-flight generation on mount; this
   *  is only needed for the "user clicks Generate" / "user clicks Regenerate"
   *  paths. */
  generate: () => void
  regenerate: () => void
  cancel: () => void
  /** Promote the stale tour attached to the `no-tour` state into a `ready`
   *  view without regenerating. No-op when no stale tour is on hand. */
  viewStale: () => void
}

export function useTour(repo: string, prNumber: number): UseTourResult {
  const [state, setState] = useState<TourState>({ kind: 'loading' })
  const acRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async (force: boolean) => {
      acRef.current?.abort()
      const ac = new AbortController()
      acRef.current = ac

      try {
        setState({ kind: 'loading' })

        // Active-job-first: if a background job is already running for this
        // PR (any SHA), attach to its stream and show the generating screen.
        // This fixes the "cached tour shown during regen" UX bug — when the
        // user clicks regenerate or navigates back mid-flight, they see live
        // progress instead of the stale tour.
        const active = await api.tours.jobs.findActiveForPr(repo, prNumber)
        if (ac.signal.aborted) return
        if (active && !force) {
          setState({ kind: 'generating', events: [] })
          for await (const msg of api.tours.jobs.streamJob(active.job.id, ac.signal)) {
            if (handleTerminal(msg, setState)) return
            setState((s) => appendStreamEvent(s, msg))
          }
          return
        }

        // Normal cache check — only when no active job exists (or force-regen).
        if (!force) {
          const cached = await tryGetCached(repo, prNumber)
          if (ac.signal.aborted) return
          if (cached) {
            setState({ kind: 'ready', tour: cached })
            return
          }
          // No cached tour AND no in-flight job — stop here. Surface a
          // "Generate tour" prompt instead of auto-burning tokens. The user
          // explicitly asked to opt-in per PR. If a tour exists from a prior
          // schema version, attach it so the screen can offer "View previous
          // tour" alongside the regenerate CTA.
          const stale = await tryGetStale(repo, prNumber)
          if (ac.signal.aborted) return
          setState({ kind: 'no-tour', staleTour: stale ?? null })
          return
        }

        // Kick off (or attach to) a generation. The /generate/stream route
        // is idempotent via the job manager — concurrent starts dedupe.
        setState({ kind: 'generating', events: [] })
        for await (const msg of api.tours.streamGenerate(repo, prNumber, {
          force,
          signal: ac.signal,
        })) {
          if (handleTerminal(msg, setState)) return
          setState((s) => appendStreamEvent(s, msg))
        }
      } catch (err) {
        if (ac.signal.aborted) return
        setState({ kind: 'error', message: (err as Error).message })
      }
    },
    [repo, prNumber],
  )

  useEffect(() => {
    void load(false)
    return () => acRef.current?.abort()
  }, [load])

  const cancel = useCallback(() => {
    acRef.current?.abort()
    setState({ kind: 'error', message: 'Generation cancelled' })
  }, [])

  const viewStale = useCallback(() => {
    setState((prev) => {
      if (prev.kind !== 'no-tour' || !prev.staleTour) return prev
      return { kind: 'ready', tour: prev.staleTour }
    })
  }, [])

  return {
    state,
    generate: () => {
      void load(true)
    },
    regenerate: () => {
      void load(true)
    },
    cancel,
    viewStale,
  }
}

async function tryGetCached(repo: string, prNumber: number): Promise<TourResult | undefined> {
  try {
    return await api.tours.get(repo, prNumber)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined
    throw err
  }
}

async function tryGetStale(repo: string, prNumber: number): Promise<TourResult | undefined> {
  try {
    return await api.tours.getStale(repo, prNumber)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined
    throw err
  }
}

function handleTerminal(msg: TourStreamEvent, setState: (s: TourState) => void): boolean {
  return match(msg)
    .with({ event: 'done' }, ({ data }) => {
      setState({ kind: 'ready', tour: data })
      return true
    })
    .with({ event: 'error' }, ({ data }) => {
      setState({ kind: 'error', message: data.message })
      return true
    })
    .otherwise(() => false)
}

function appendStreamEvent(prev: TourState, msg: TourStreamEvent): TourState {
  return prev.kind === 'generating' ? { kind: 'generating', events: [...prev.events, msg] } : prev
}
