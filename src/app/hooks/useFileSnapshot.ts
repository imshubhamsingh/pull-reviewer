import { useEffect, useState } from 'react'
import { api, type FileSnapshot } from '@/lib/api'

export type SnapshotState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; snap: FileSnapshot }
  | { kind: 'error'; message: string }

/**
 * Renderer-side cache so each unique (repo, sha, path) hits the backend at most
 * once per app session. The backend's snapshot store is already content-addressed,
 * so this is purely about avoiding redundant HTTP roundtrips while navigating
 * the stepper.
 */
const cache = new Map<string, FileSnapshot>()
const inflight = new Map<string, Promise<FileSnapshot>>()

function getSnapshot(repo: string, sha: string, path: string): Promise<FileSnapshot> {
  const key = `${repo}@${sha}:${path}`
  const cached = cache.get(key)
  if (cached) return Promise.resolve(cached)
  const live = inflight.get(key)
  if (live) return live
  const pending = api.files.get(repo, sha, path)
    .then((snap) => { cache.set(key, snap); return snap })
    .finally(() => { inflight.delete(key) })
  inflight.set(key, pending)
  return pending
}

export function useFileSnapshot(repo: string, sha: string, path: string | undefined): SnapshotState {
  const [state, setState] = useState<SnapshotState>({ kind: 'idle' })

  useEffect(() => {
    if (!path) { setState({ kind: 'idle' }); return }
    let cancelled = false
    setState({ kind: 'loading' })
    getSnapshot(repo, sha, path)
      .then((snap) => { if (!cancelled) setState({ kind: 'ready', snap }) })
      .catch((err: Error) => { if (!cancelled) setState({ kind: 'error', message: err.message }) })
    return () => { cancelled = true }
  }, [repo, sha, path])

  return state
}
