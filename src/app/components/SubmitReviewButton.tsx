import { useState, type JSX } from 'react'
import type { TourResult } from '@/lib/api'
import type { ReviewDrafts } from '@/app/hooks/useReviewDrafts'

interface Props {
  tour: TourResult
  drafts: ReviewDrafts
}

export function SubmitReviewButton({ tour, drafts }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const count = drafts.drafts.length

  const submit = async () => {
    if (count === 0 || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await drafts.submit({ headSha: tour.headRefOid })
      window.open(result.htmlUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-text-danger truncate text-xs" title={error}>{truncate(error)}</span>}
      <button
        type="button"
        onClick={() => { void submit() }}
        disabled={count === 0 || busy}
        className="bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-fg rounded-sm px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Submitting…' : `Submit review (${count})`}
      </button>
    </div>
  )
}

function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
