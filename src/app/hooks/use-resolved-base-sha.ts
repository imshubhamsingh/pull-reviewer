import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/**
 * Pass-through when `baseSha` is already known. When it's null but a PR
 * number is available, hit GitHub once to resolve it (the main process
 * caches per-PR so this is cheap on repeat opens).
 */
export type ResolvedBaseSha =
  | { state: 'ready'; sha: string }
  | { state: 'missing'; sha: null }
  | { state: 'resolving'; sha: null }
  | { state: 'error'; sha: null; message: string }

export function useResolvedBaseSha(
  repo: string,
  baseSha: string | null,
  prNumber: number | undefined,
): ResolvedBaseSha {
  const [remote, setRemote] = useState<ResolvedBaseSha | null>(null)
  useEffect(() => {
    if (baseSha) {
      setRemote(null)
      return
    }
    if (prNumber == null) {
      setRemote({ state: 'missing', sha: null })
      return
    }
    let cancelled = false
    setRemote({ state: 'resolving', sha: null })
    api.prs
      .baseSha(repo, prNumber)
      .then((res) => {
        if (cancelled) return
        if (res.baseSha) setRemote({ state: 'ready', sha: res.baseSha })
        else setRemote({ state: 'missing', sha: null })
      })
      .catch((err: Error) => {
        if (!cancelled) setRemote({ state: 'error', sha: null, message: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [repo, baseSha, prNumber])
  if (baseSha) return { state: 'ready', sha: baseSha }
  return remote ?? { state: 'resolving', sha: null }
}
