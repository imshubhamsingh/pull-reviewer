import { ExternalLink, X } from 'lucide-react'
import { useEffect, useMemo, useState, type JSX } from 'react'
import { useFileSnapshot } from '@/app/hooks/use-file-snapshot'
import { cn } from '@/app/lib/utils'
import { MarkdownView } from '@/app/components/markdown-view'
import type { ReviewDraft } from '@/lib/api'

export type ReviewEvent = 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'

export interface SubmitOptions {
  summary: string
  event: ReviewEvent
}

interface Props {
  drafts: ReviewDraft[]
  repo: string
  sha: string
  submitting: boolean
  error: string | undefined
  onCancel: () => void
  onSubmit: (opts: SubmitOptions) => void
  /** When set, each comment renders a "View file" affordance that closes the modal and navigates to the file:line in the tour view. */
  onJumpToFile?: (file: string, line: number) => void
}

/**
 * Pre-submit confirmation dialog. Groups pending drafts by file and renders
 * each draft anchored to a small code snippet of the lines it covers (±2
 * context lines), then the comment body underneath. Mirrors GitHub's
 * "Submit review" dialog so the reviewer can sanity-check their batch before
 * firing the network call.
 */
export function ReviewSummaryModal({
  drafts,
  repo,
  sha,
  submitting,
  error,
  onCancel,
  onSubmit,
  onJumpToFile,
}: Props): JSX.Element {
  const grouped = useMemo(() => groupByFile(drafts), [drafts])
  const [summary, setSummary] = useState('')
  const [event, setEvent] = useState<ReviewEvent>('COMMENT')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !submitting) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submitting, onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Submit review"
    >
      <div className="border-border bg-bg flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border shadow-xl">
        <Header
          count={drafts.length}
          fileCount={grouped.length}
          onCancel={onCancel}
          disabled={submitting}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {grouped.length === 0 ? (
            <p className="text-text-muted py-8 text-center text-sm">No pending comments.</p>
          ) : (
            grouped.map(({ file, drafts: fileDrafts }) => (
              <FileGroup
                key={file}
                file={file}
                drafts={fileDrafts}
                repo={repo}
                sha={sha}
                onJumpToFile={onJumpToFile}
              />
            ))
          )}
        </div>
        <SummarySection summary={summary} onChange={setSummary} disabled={submitting} />
        <EventSelector event={event} onChange={setEvent} disabled={submitting} />
        <Footer
          submitting={submitting}
          error={error}
          count={drafts.length}
          event={event}
          onCancel={onCancel}
          onSubmit={() => onSubmit({ summary: summary.trim(), event })}
        />
      </div>
    </div>
  )
}

function SummarySection({
  summary,
  onChange,
  disabled,
}: {
  summary: string
  onChange: (s: string) => void
  disabled: boolean
}): JSX.Element {
  return (
    <div className="border-border bg-surface shrink-0 border-t px-4 py-3">
      <label className="text-text-muted mb-1 block text-[10px] tracking-wider uppercase">
        Review summary{' '}
        <span className="text-text-muted/60 normal-case tracking-normal">
          (optional — top-level review comment)
        </span>
      </label>
      <textarea
        value={summary}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        placeholder="Leave a top-level review comment. Cmd-Enter on the summary submits the review."
        onKeyDown={(e) => {
          // Don't grab Cmd-Enter — let it bubble to the modal's onSubmit via the Submit button.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.stopPropagation()
        }}
        className="border-border bg-bg text-text-primary placeholder:text-text-muted w-full resize-y rounded-sm border px-2 py-1.5 text-xs outline-none disabled:opacity-50"
      />
    </div>
  )
}

function EventSelector({
  event,
  onChange,
  disabled,
}: {
  event: ReviewEvent
  onChange: (e: ReviewEvent) => void
  disabled: boolean
}): JSX.Element {
  return (
    <div className="border-border bg-surface shrink-0 flex items-center gap-2 border-t px-4 py-2">
      <span className="text-text-muted text-[10px] tracking-wider uppercase">Event</span>
      <EventOption
        value="COMMENT"
        current={event}
        onSelect={onChange}
        disabled={disabled}
        label="Comment"
        hint="Generic feedback, no approval/changes action"
      />
      <EventOption
        value="REQUEST_CHANGES"
        current={event}
        onSelect={onChange}
        disabled={disabled}
        label="Request changes"
        hint="Blocks merge until addressed"
      />
      <EventOption
        value="APPROVE"
        current={event}
        onSelect={onChange}
        disabled={disabled}
        label="Approve"
        hint="Approve the PR"
      />
    </div>
  )
}

interface EventOptionProps {
  value: ReviewEvent
  current: ReviewEvent
  onSelect: (e: ReviewEvent) => void
  disabled: boolean
  label: string
  hint: string
}

function EventOption({
  value,
  current,
  onSelect,
  disabled,
  label,
  hint,
}: EventOptionProps): JSX.Element {
  const active = value === current
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      disabled={disabled}
      title={hint}
      className={cn(
        'rounded-sm border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40',
        active
          ? 'border-text-brand bg-surface-hover text-text-primary'
          : 'border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary',
      )}
    >
      {label}
    </button>
  )
}

function Header({
  count,
  fileCount,
  onCancel,
  disabled,
}: {
  count: number
  fileCount: number
  onCancel: () => void
  disabled: boolean
}): JSX.Element {
  return (
    <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
      <div>
        <h2 className="text-text-primary text-sm font-semibold">Submit review</h2>
        <p className="text-text-muted mt-0.5 text-xs">
          {count} {count === 1 ? 'comment' : 'comments'} on {fileCount}{' '}
          {fileCount === 1 ? 'file' : 'files'}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        aria-label="Cancel"
        className="text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}

function FileGroup({
  file,
  drafts,
  repo,
  sha,
  onJumpToFile,
}: {
  file: string
  drafts: ReviewDraft[]
  repo: string
  sha: string
  onJumpToFile?: (file: string, line: number) => void
}): JSX.Element {
  const snapshot = useFileSnapshot(repo, sha, file)
  return (
    <section className="border-border bg-surface mb-3 overflow-hidden rounded-md border">
      <header className="border-border bg-bg/60 border-b px-3 py-1.5 font-mono text-[11px]">
        <span className="text-text-secondary">{file}</span>
        <span className="text-text-muted ml-2">
          {drafts.length} {drafts.length === 1 ? 'comment' : 'comments'}
        </span>
      </header>
      <ul className="divide-border divide-y">
        {drafts.map((d) => (
          <li key={d.id} className="px-3 py-3">
            <Snippet draft={d} snapshot={snapshot} />
            <CommentBody
              body={d.body}
              side={d.side}
              onView={onJumpToFile ? () => onJumpToFile(file, d.line) : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Snippet({
  draft,
  snapshot,
}: {
  draft: ReviewDraft
  snapshot: ReturnType<typeof useFileSnapshot>
}): JSX.Element {
  if (snapshot.kind === 'loading' || snapshot.kind === 'idle') {
    return <div className="text-text-muted py-2 text-[11px]">Loading snippet…</div>
  }
  if (snapshot.kind === 'error') {
    return (
      <div className="text-text-danger py-2 text-[11px]">
        Snippet unavailable: {snapshot.message}
      </div>
    )
  }
  const snap = snapshot.snap
  if (snap.encoding !== 'utf8' || !snap.content) {
    return (
      <div className="text-text-muted py-2 text-[11px]">Snippet unavailable ({snap.encoding}).</div>
    )
  }
  const { start, end } = draftRange(draft)
  const lines = snap.content.split('\n')
  const lo = Math.max(1, start - 2)
  const hi = Math.min(lines.length, end + 2)
  return (
    <pre className="bg-bg text-text-secondary mb-2 max-h-48 overflow-auto rounded-sm border-l-2 border-amber-500/60 font-mono text-[11px] leading-relaxed">
      {Array.from({ length: hi - lo + 1 }, (_, i) => {
        const lineNum = lo + i
        const inRange = lineNum >= start && lineNum <= end
        return (
          <div key={lineNum} className={cn('flex', inRange && 'bg-amber-500/10')}>
            <span
              className={cn(
                'select-none px-2 text-right tabular-nums',
                inRange ? 'text-amber-300' : 'text-text-muted/60',
              )}
              style={{ minWidth: '3rem' }}
            >
              {lineNum}
            </span>
            <code className="whitespace-pre">{lines[lineNum - 1] ?? ''}</code>
          </div>
        )
      })}
    </pre>
  )
}

function CommentBody({
  body,
  side,
  onView,
}: {
  body: string
  side: ReviewDraft['side']
  onView?: () => void
}): JSX.Element {
  return (
    <div className="border-border bg-bg rounded-sm border p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-text-muted text-[10px] tracking-wider uppercase">
          Pending comment{side === 'before' ? ' · before' : ''}
        </p>
        {onView && (
          <button
            type="button"
            onClick={onView}
            title="Open this file at this line"
            className="text-text-secondary hover:text-text-primary inline-flex items-center gap-1 text-[10px] normal-case transition-colors"
          >
            <ExternalLink size={11} aria-hidden />
            View file
          </button>
        )}
      </div>
      <MarkdownView body={body} className="text-text-primary text-xs leading-relaxed break-words" />
    </div>
  )
}

function Footer({
  submitting,
  error,
  count,
  event,
  onCancel,
  onSubmit,
}: {
  submitting: boolean
  error: string | undefined
  count: number
  event: ReviewEvent
  onCancel: () => void
  onSubmit: () => void
}): JSX.Element {
  const label = submitting
    ? 'Submitting…'
    : `${eventVerb(event)} review${count > 0 ? ` (${count})` : ''}`
  return (
    <div className="border-border bg-surface flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3">
      {error ? (
        <span className="text-text-danger flex-1 truncate text-xs" title={error}>
          {error}
        </span>
      ) : (
        <span className="text-text-muted flex-1 text-xs">
          Review will be posted to GitHub as a single batch.
        </span>
      )}
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="text-text-secondary hover:text-text-primary rounded-sm px-3 py-1 text-xs transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-fg rounded-sm px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {label}
        </button>
      </div>
    </div>
  )
}

function eventVerb(event: ReviewEvent): string {
  if (event === 'APPROVE') return 'Approve'
  if (event === 'REQUEST_CHANGES') return 'Request changes &'
  return 'Submit'
}

interface Group {
  file: string
  drafts: ReviewDraft[]
}

function groupByFile(drafts: ReviewDraft[]): Group[] {
  const map = new Map<string, ReviewDraft[]>()
  for (const d of drafts) {
    let bucket = map.get(d.file)
    if (!bucket) {
      bucket = []
      map.set(d.file, bucket)
    }
    bucket.push(d)
  }
  for (const list of map.values()) {
    list.sort((a, b) => firstLine(a) - firstLine(b))
  }
  return [...map.entries()].map(([file, ds]) => ({ file, drafts: ds }))
}

function firstLine(d: ReviewDraft): number {
  return d.startLine != null ? Math.min(d.startLine, d.line) : d.line
}

function draftRange(d: ReviewDraft): { start: number; end: number } {
  if (d.startLine == null || d.startLine === d.line) return { start: d.line, end: d.line }
  return { start: Math.min(d.startLine, d.line), end: Math.max(d.startLine, d.line) }
}
