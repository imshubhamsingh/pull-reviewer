import { ExternalLink } from 'lucide-react'
import type { JSX } from 'react'
import { match } from 'ts-pattern'
import { cn } from '@/app/lib/utils'
import { relativeTime } from '@/app/lib/relative-time'
import {
  classify,
  formatHours,
  hoursBetween,
  PICKUP_BANDS,
  type HealthBand,
} from '@/app/lib/pr-health'
import type { PullRequestSummary, ReviewDecision } from '@/lib/api'

interface Props {
  pr: PullRequestSummary
  context: 'mine' | 'review' | 'reviewed' | 'recents'
  onOpen: (pr: PullRequestSummary) => void
}

export function PrCard({ pr, context, onOpen }: Props): JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(pr)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(pr)
        }
      }}
      className="border-border bg-surface hover:bg-surface-hover w-full cursor-pointer rounded-md border px-4 py-3 text-left transition-colors"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-text-secondary text-sm">#{pr.number}</span>
        <span className="text-text-primary font-medium">{pr.title}</span>
        {pr.isDraft && <span className="text-text-muted text-xs">· draft</span>}
        <GitHubLink url={pr.url} />
      </div>
      <MetaRow pr={pr} />
      <BadgeRow pr={pr} context={context} />
    </div>
  )
}

/**
 * Opens the PR on github.com without firing the card's onOpen. Renders as a
 * small icon next to the title; `stopPropagation` keeps the click off the
 * card's row click handler.
 */
function GitHubLink({ url }: { url: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        window.electron.openExternal(url)
      }}
      title={`Open ${url} on GitHub`}
      aria-label="Open on GitHub"
      className="text-text-muted hover:text-text-primary ml-0.5 inline-flex items-center transition-colors"
    >
      <ExternalLink size={12} aria-hidden />
    </button>
  )
}

function MetaRow({ pr }: { pr: PullRequestSummary }): JSX.Element {
  const showDiff = pr.additions > 0 || pr.deletions > 0 || pr.changedFiles > 0
  const openedRel = pr.createdAt ? relativeTime(pr.createdAt) : ''
  const updatedRel = pr.updatedAt ? relativeTime(pr.updatedAt) : ''
  return (
    <div className="text-text-muted mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
      <span>{pr.repo}</span>
      <Dot />
      <span>{pr.author}</span>
      {showDiff && (
        <>
          <Dot />
          <DiffBadge additions={pr.additions} deletions={pr.deletions} files={pr.changedFiles} />
        </>
      )}
      {openedRel && (
        <>
          <Dot />
          <span title={`Opened ${pr.createdAt}`}>opened {openedRel} ago</span>
        </>
      )}
      {updatedRel && pr.updatedAt !== pr.createdAt && (
        <>
          <Dot />
          <span title={`Last updated ${pr.updatedAt}`}>updated {updatedRel} ago</span>
        </>
      )}
    </div>
  )
}

function BadgeRow({
  pr,
  context,
}: {
  pr: PullRequestSummary
  context: 'mine' | 'review' | 'reviewed' | 'recents'
}): JSX.Element | null {
  const badges: JSX.Element[] = []

  // For "how long has this been waiting on me", `updatedAt` is the right
  // anchor — it captures the most recent meaningful event (push, re-request,
  // comment). `createdAt` would say "57 days" for an old PR even if it was
  // re-requested 2h ago, which is misleading.
  // On the Review-requested tab GitHub already filters to PRs awaiting the
  // viewer, so the badge is always meaningful. On Recents we have to gate
  // ourselves — a merged PR or one the viewer already reviewed shouldn't
  // claim to be "pending your review".
  if (context === 'review' && pr.updatedAt) {
    badges.push(pickupBadge(pr.updatedAt))
  } else if (context === 'recents' && pr.updatedAt && viewerOwesReview(pr)) {
    badges.push(pickupBadge(pr.updatedAt))
  }

  // Decision badges are about *your PR*'s health. Mine shows them always.
  // Recents shows them only while the PR is still OPEN — once merged or
  // closed the decision is historical noise next to the more useful
  // MERGED / CLOSED state badge below.
  if (context === 'mine' || (context === 'recents' && pr.state === 'OPEN')) {
    const decisionBadge = renderDecision(pr.reviewDecision, pr.updatedAt)
    if (decisionBadge) badges.push(decisionBadge)
  }

  // Reviewed + Recents tabs show open/closed/merged state so the user can
  // tell at a glance whether the PR is still live or already shipped.
  if (context === 'reviewed' || context === 'recents') {
    badges.push(<StateBadge key="state" state={pr.state} />)
  }

  // Re-review status: if the viewer has reviewed, compare their latest
  // review time vs the PR's latest commit time so the badge tells them
  // whether the ball is in the author's court or back in theirs. Recents
  // shows it too — same signal value as on the Reviewed tab.
  if ((context === 'reviewed' || context === 'recents') && pr.state === 'OPEN') {
    const status = reviewStatus(pr.viewerLatestReviewAt, pr.lastCommitAt)
    if (status) badges.push(status)
  }

  if (badges.length === 0) return null
  return <div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>
}

function reviewStatus(
  viewerLatestReviewAt: string | null,
  lastCommitAt: string | null,
): JSX.Element | null {
  if (!viewerLatestReviewAt) return null
  // Author pushed after the viewer's last review → ball is back in the
  // viewer's court. Otherwise the viewer is awaiting an author response.
  if (lastCommitAt && lastCommitAt > viewerLatestReviewAt) {
    return (
      <Badge
        key="rev"
        tone="warn"
        title={`Author pushed ${relativeTime(lastCommitAt)} ago — your last review was ${relativeTime(viewerLatestReviewAt)} ago`}
      >
        Awaiting your re-review
      </Badge>
    )
  }
  return (
    <Badge
      key="rev"
      tone="brand"
      title={`Your last review: ${relativeTime(viewerLatestReviewAt)} ago — no new commits since`}
    >
      Review submitted · awaiting author
    </Badge>
  )
}

function StateBadge({ state }: { state: PullRequestSummary['state'] }): JSX.Element {
  return match(state)
    .with('OPEN', () => (
      <Badge key="state" tone="brand">
        Open
      </Badge>
    ))
    .with('MERGED', () => (
      <Badge key="state" tone="success">
        Merged
      </Badge>
    ))
    .with('CLOSED', () => (
      <Badge key="state" tone="neutral">
        Closed
      </Badge>
    ))
    .exhaustive()
}

function renderDecision(
  decision: ReviewDecision,
  updatedAt: string | undefined,
): JSX.Element | null {
  return match(decision)
    .with('CHANGES_REQUESTED', () => (
      <Badge key="d" tone="danger">
        Changes requested
      </Badge>
    ))
    .with('APPROVED', () => (
      <Badge key="d" tone="success">
        Approved
      </Badge>
    ))
    .with('REVIEW_REQUIRED', () =>
      updatedAt ? (
        <Badge key="d" tone="warn">
          Awaiting review · {relativeTime(updatedAt)}
        </Badge>
      ) : (
        <Badge key="d" tone="warn">
          Awaiting review
        </Badge>
      ),
    )
    .otherwise(() => null)
}

function Dot(): JSX.Element {
  return <span aria-hidden>·</span>
}

function DiffBadge({
  additions,
  deletions,
  files,
}: {
  additions: number
  deletions: number
  files: number
}): JSX.Element {
  return (
    <span className="font-mono">
      <span className="text-green-400">+{additions}</span>
      <span className="text-text-muted"> / </span>
      <span className="text-red-400">−{deletions}</span>
      {files > 0 && (
        <span className="text-text-muted ml-1.5">
          {files} {files === 1 ? 'file' : 'files'}
        </span>
      )}
    </span>
  )
}

type Tone = 'brand' | 'danger' | 'success' | 'warn' | 'neutral'

const TONE_CLASSES: Record<Tone, string> = {
  brand: 'bg-interactive-primary/15 text-text-brand',
  danger: 'bg-interactive-danger/15 text-text-danger',
  success: 'bg-green-500/15 text-green-400',
  warn: 'bg-amber-500/15 text-amber-400',
  neutral: 'bg-surface text-text-secondary',
}

function Badge({
  tone,
  children,
  title,
}: {
  tone: Tone
  children: React.ReactNode
  title?: string
}): JSX.Element {
  return (
    <span
      title={title}
      className={cn(
        'rounded-sm px-1.5 py-0.5 text-[10px] font-medium tracking-wider uppercase',
        TONE_CLASSES[tone],
      )}
    >
      {children}
    </span>
  )
}

const BAND_TONE: Record<HealthBand, Tone> = {
  elite: 'success',
  good: 'brand',
  fair: 'warn',
  focus: 'danger',
}

function pickupBadge(updatedAt: string): JSX.Element {
  const hours = hoursBetween(updatedAt)
  return (
    <HealthBadge
      key="pickup"
      band={classify(hours, PICKUP_BANDS)}
      label={`Pending your review · ${formatHours(hours)}`}
      title={`Waiting ${formatHours(hours)} since last activity — pickup bands: <${PICKUP_BANDS.elite}h elite, <${PICKUP_BANDS.good}h good, <${PICKUP_BANDS.fair}h fair`}
    />
  )
}

/**
 * Recents-only gate for the pickup badge. The viewer owes a review when the
 * PR is still OPEN AND either they've never reviewed it OR the author has
 * pushed new commits since their last review. Closed / merged PRs and PRs
 * the viewer has already reviewed (with no new commits) don't surface a
 * "pending" badge.
 */
function viewerOwesReview(pr: PullRequestSummary): boolean {
  if (pr.state !== 'OPEN') return false
  if (!pr.viewerLatestReviewAt) return true
  return pr.lastCommitAt != null && pr.lastCommitAt > pr.viewerLatestReviewAt
}

function HealthBadge({
  band,
  label,
  title,
}: {
  band: HealthBand
  label: string
  title?: string
}): JSX.Element {
  return (
    <Badge tone={BAND_TONE[band]} title={title}>
      {label}
    </Badge>
  )
}
