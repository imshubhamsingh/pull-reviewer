import { useEffect, useState, type JSX } from 'react'
import { api, type PullRequestSummary } from '@/lib/api'

interface Props {
  onOpen: (pr: PullRequestSummary) => void
}

export function PrList({ onOpen }: Props): JSX.Element {
  const [prs, setPrs] = useState<PullRequestSummary[] | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false
    api.prs.mine()
      .then((data) => { if (!cancelled) setPrs(data) })
      .catch((err: Error) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [])

  if (error) return <ErrorBanner message={error} />
  if (!prs) return <LoadingBanner />

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">My open PRs</h1>
        <p className="text-text-secondary text-sm mt-1">{prs.length} open</p>
      </header>
      <ul className="space-y-2">
        {prs.map((pr) => (
          <li key={pr.id}>
            <button
              type="button"
              onClick={() => onOpen(pr)}
              className="w-full text-left rounded-md border border-border bg-surface hover:bg-surface-hover transition-colors px-4 py-3"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-text-secondary text-sm">#{pr.number}</span>
                <span className="text-text-primary font-medium">{pr.title}</span>
                {pr.isDraft && <span className="text-text-muted text-xs">· draft</span>}
              </div>
              <div className="text-text-muted text-xs mt-1">{pr.repo}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="text-text-danger">Failed to load PRs: {message}</p>
    </div>
  )
}

function LoadingBanner(): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl p-6 text-text-secondary">Loading…</div>
  )
}
