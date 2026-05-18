import { useEffect, useState, type JSX } from 'react'
import { ReviewSummaryModal, type SubmitOptions } from '@/app/components/review-summary-modal'
import type { TourResult } from '@/lib/api'
import type { ReviewDrafts } from '@/app/hooks/use-review-drafts'

interface Props {
  repo: string
  tour: TourResult
  drafts: ReviewDrafts
  /** Click "View file" on a comment → close the modal and navigate to file:line. */
  onJumpToFile?: (file: string, line: number) => void
}

const SUCCESS_TTL_MS = 8_000

/**
 * "Submit review" call-to-action. Clicking it opens a pre-submit summary
 * modal (GitHub-style) so the reviewer sees every pending comment anchored
 * to its code snippet before firing the network call. The actual submission
 * only happens from inside the modal.
 */
export function SubmitReviewButton({ repo, tour, drafts, onJumpToFile }: Props): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [lastSubmittedUrl, setLastSubmittedUrl] = useState<string | undefined>()
  const [reviewing, setReviewing] = useState(false)
  const count = drafts.drafts.length

  useEffect(() => {
    if (!lastSubmittedUrl) return
    const id = setTimeout(() => setLastSubmittedUrl(undefined), SUCCESS_TTL_MS)
    return () => clearTimeout(id)
  }, [lastSubmittedUrl])

  const submit = async (opts: SubmitOptions): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    setLastSubmittedUrl(undefined)
    try {
      const result = await drafts.submit({
        headSha: tour.headRefOid,
        summary: opts.summary || undefined,
        event: opts.event,
      })
      setLastSubmittedUrl(result.htmlUrl)
      setReviewing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {error && !reviewing && (
          <span className="text-text-danger truncate text-xs" title={error}>
            {truncate(error)}
          </span>
        )}
        {lastSubmittedUrl && (
          <button
            type="button"
            onClick={() => {
              window.electron.openExternal(lastSubmittedUrl)
            }}
            className="text-text-secondary hover:text-text-primary text-xs underline-offset-2 transition-colors hover:underline"
          >
            ✓ Submitted · view on GitHub
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setError(undefined)
            setReviewing(true)
          }}
          disabled={count === 0 || busy}
          className="bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-fg rounded-sm px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Submitting…' : `Review (${count})`}
        </button>
      </div>
      {reviewing && (
        <ReviewSummaryModal
          drafts={drafts.drafts}
          repo={repo}
          sha={tour.headRefOid}
          submitting={busy}
          error={error}
          onCancel={() => {
            if (!busy) setReviewing(false)
          }}
          onSubmit={(opts) => {
            submit(opts)
          }}
          onJumpToFile={
            onJumpToFile
              ? (file, line) => {
                  if (busy) return
                  setReviewing(false)
                  onJumpToFile(file, line)
                }
              : undefined
          }
        />
      )}
    </>
  )
}

function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
