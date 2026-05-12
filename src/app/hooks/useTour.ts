import { useCallback, useEffect, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { api, ApiError, type TourResult, type TourStreamEvent } from '@/lib/api'

export type TourState =
  | { kind: 'loading' }
  | { kind: 'generating'; events: TourStreamEvent[] }
  | { kind: 'ready'; tour: TourResult }
  | { kind: 'error'; message: string }

interface UseTourResult {
  state: TourState
  regenerate: () => void
  cancel: () => void
}

export function useTour(repo: string, prNumber: number): UseTourResult {
  const [state, setState] = useState<TourState>({ kind: 'loading' })
  const acRef = useRef<AbortController | null>(null)

  const load = useCallback(async (force: boolean) => {
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac

    try {
      if (!force) {
        setState({ kind: 'loading' })
        const cached = await tryGetCached(repo, prNumber)
        if (ac.signal.aborted) return
        if (cached) { setState({ kind: 'ready', tour: cached }); return }
      }
      setState({ kind: 'generating', events: [] })
      for await (const msg of api.tours.streamGenerate(repo, prNumber, { force, signal: ac.signal })) {
        if (handleTerminal(msg, setState)) return
        setState((s) => appendStreamEvent(s, msg))
      }
    } catch (err) {
      if (ac.signal.aborted) return
      setState({ kind: 'error', message: (err as Error).message })
    }
  }, [repo, prNumber])

  useEffect(() => {
    void load(false)
    return () => acRef.current?.abort()
  }, [load])

  const cancel = useCallback(() => {
    acRef.current?.abort()
    setState({ kind: 'error', message: 'Generation cancelled' })
  }, [])

  return {
    state,
    regenerate: () => { void load(true) },
    cancel,
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

function handleTerminal(msg: TourStreamEvent, setState: (s: TourState) => void): boolean {
  return match(msg)
    .with({ event: 'done' }, ({ data }) => { setState({ kind: 'ready', tour: data }); return true })
    .with({ event: 'error' }, ({ data }) => { setState({ kind: 'error', message: data.message }); return true })
    .otherwise(() => false)
}

function appendStreamEvent(prev: TourState, msg: TourStreamEvent): TourState {
  return prev.kind === 'generating'
    ? { kind: 'generating', events: [...prev.events, msg] }
    : prev
}
