import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { useMemo, useState, type JSX } from 'react'
import { cn } from '@/app/lib/utils'
import { lensStyle, severityStyle } from '@/app/components/ai-lens-styles'
import { FindingBody } from '@/app/components/finding-body'
import type { Finding, Lens, Review, SkipReason, SymbolLocation } from '@/lib/api'
import type { ReviewFindingsState } from '@/app/hooks/use-review-findings'

interface Props {
  review: Review | null
  findings: ReviewFindingsState
  onJumpToFinding: (finding: Finding) => void
  onJumpToSymbol: (loc: SymbolLocation) => void
  onConvertToDraft: (finding: Finding) => Promise<void> | void
  /** True while the dedicated review CLI is still in flight (no review JSON yet on this tour). */
  reviewing?: boolean
}

type Severity = 'blocker' | 'major' | 'minor'

/**
 * Whole-PR AI review rollup. Top: triage strip + severity rollup. Middle:
 * findings grouped by lens with click-to-jump. Bottom: collapsed dismissed
 * section with undismiss action. Empty state covers the "no review yet"
 * and "running" cases.
 */
export function ReviewPane({
  review,
  findings,
  onJumpToFinding,
  onJumpToSymbol,
  onConvertToDraft,
  reviewing,
}: Props): JSX.Element {
  if (reviewing && !review) return <RunningState />
  if (!review) return <EmptyState />
  if (review.findings.length === 0) return <NoFindingsState skipped={review.lensesSkipped} />

  return (
    <PopulatedReview
      review={review}
      findings={findings}
      onJumpToFinding={onJumpToFinding}
      onJumpToSymbol={onJumpToSymbol}
      onConvertToDraft={onConvertToDraft}
    />
  )
}

function PopulatedReview({
  review,
  findings,
  onJumpToFinding,
  onJumpToSymbol,
  onConvertToDraft,
}: {
  review: Review
  findings: ReviewFindingsState
  onJumpToFinding: (f: Finding) => void
  onJumpToSymbol: (loc: SymbolLocation) => void
  onConvertToDraft: (f: Finding) => Promise<void> | void
}): JSX.Element {
  const [severityFilter, setSeverityFilter] = useState<Severity | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)
  const [showDismissed, setShowDismissed] = useState(false)

  const active = useMemo(
    () => review.findings.filter((f) => !findings.isDismissed(f.id)),
    [review.findings, findings],
  )
  const dismissed = useMemo(
    () => review.findings.filter((f) => findings.isDismissed(f.id)),
    [review.findings, findings],
  )

  const filteredActive = severityFilter
    ? active.filter((f) => f.severity === severityFilter)
    : active

  const grouped = useMemo(() => groupByLens(filteredActive), [filteredActive])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto px-3 py-2 text-xs">
      <TriageStrip
        applied={review.lensesApplied}
        skipped={review.lensesSkipped}
        showSkipped={showSkipped}
        onToggleSkipped={() => setShowSkipped((v) => !v)}
      />
      <SeverityRollup
        all={active}
        filter={severityFilter}
        onFilter={(s) => setSeverityFilter((cur) => (cur === s ? null : s))}
      />
      <div className="mt-2 flex flex-col gap-2">
        {grouped.map(({ lens, items }) => (
          <LensGroup
            key={lens}
            lens={lens}
            items={items}
            findings={findings}
            onJumpToFinding={onJumpToFinding}
            onJumpToSymbol={onJumpToSymbol}
            onConvertToDraft={onConvertToDraft}
          />
        ))}
        {grouped.length === 0 && (
          <p className="text-text-muted py-4 text-center">No findings match the current filter.</p>
        )}
      </div>
      {dismissed.length > 0 && (
        <div className="border-border mt-3 border-t pt-2">
          <button
            type="button"
            onClick={() => setShowDismissed((v) => !v)}
            className="text-text-secondary hover:text-text-primary flex w-full items-center gap-1 text-[11px] uppercase tracking-wider transition-colors"
          >
            {showDismissed ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Dismissed ({dismissed.length})
          </button>
          {showDismissed && (
            <div className="mt-2 flex flex-col gap-2">
              {dismissed.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  findings={findings}
                  onJumpToFinding={onJumpToFinding}
                  onJumpToSymbol={onJumpToSymbol}
                  onConvertToDraft={onConvertToDraft}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TriageStrip({
  applied,
  skipped,
  showSkipped,
  onToggleSkipped,
}: {
  applied: Lens[]
  skipped: SkipReason[]
  showSkipped: boolean
  onToggleSkipped: () => void
}): JSX.Element {
  return (
    <div className="border-border mb-2 rounded-md border p-2">
      <p className="text-text-secondary text-[11px]">
        <span className="text-text-primary font-medium">{applied.length}</span> lens
        {applied.length === 1 ? '' : 'es'} applied
        {skipped.length > 0 && (
          <>
            {' · '}
            <button
              type="button"
              onClick={onToggleSkipped}
              className="text-text-secondary hover:text-text-primary inline-flex items-center gap-0.5 transition-colors"
            >
              {showSkipped ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {skipped.length} skipped
            </button>
          </>
        )}
      </p>
      {showSkipped && skipped.length > 0 && (
        <ul className="text-text-muted mt-1.5 flex flex-col gap-0.5 text-[10px]">
          {skipped.map((s) => (
            <li key={s.lens}>
              <span className="text-text-secondary">{lensStyle(s.lens).label}:</span> {s.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SeverityRollup({
  all,
  filter,
  onFilter,
}: {
  all: Finding[]
  filter: Severity | null
  onFilter: (s: Severity) => void
}): JSX.Element {
  const counts: Record<Severity, number> = { blocker: 0, major: 0, minor: 0 }
  for (const f of all) counts[f.severity]++
  return (
    <div className="mb-2 flex gap-1.5">
      {(['blocker', 'major', 'minor'] as const).map((sev) => (
        <SeverityTile
          key={sev}
          severity={sev}
          count={counts[sev]}
          active={filter === sev}
          onClick={() => onFilter(sev)}
        />
      ))}
    </div>
  )
}

function SeverityTile({
  severity,
  count,
  active,
  onClick,
}: {
  severity: Severity
  count: number
  active: boolean
  onClick: () => void
}): JSX.Element {
  const style = severityStyle(severity)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col items-start rounded-md border px-2 py-1 transition-colors',
        active ? 'border-text-secondary' : 'border-border hover:border-text-muted',
      )}
      style={{ background: active ? style.bg : 'transparent' }}
    >
      <span
        className="text-[9px] uppercase tracking-wider"
        style={{ color: active ? style.fg : 'var(--color-text-muted)' }}
      >
        {style.label}
      </span>
      <span
        className="text-base font-semibold tabular-nums"
        style={{ color: active ? style.fg : 'var(--color-text-primary)' }}
      >
        {count}
      </span>
    </button>
  )
}

function LensGroup({
  lens,
  items,
  findings,
  onJumpToFinding,
  onJumpToSymbol,
  onConvertToDraft,
}: {
  lens: Lens
  items: Finding[]
  findings: ReviewFindingsState
  onJumpToFinding: (f: Finding) => void
  onJumpToSymbol: (loc: SymbolLocation) => void
  onConvertToDraft: (f: Finding) => Promise<void> | void
}): JSX.Element {
  const [open, setOpen] = useState(true)
  const style = lensStyle(lens)
  return (
    <div className="border-border rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-surface-hover flex w-full items-center justify-between gap-2 px-2 py-1.5 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown size={11} aria-hidden /> : <ChevronRight size={11} aria-hidden />}
          <span
            className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: style.bg, color: style.fg }}
          >
            {style.label}
          </span>
        </span>
        <span className="text-text-muted text-[10px] tabular-nums">{items.length}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 p-2 pt-0">
          {items.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              findings={findings}
              onJumpToFinding={onJumpToFinding}
              onJumpToSymbol={onJumpToSymbol}
              onConvertToDraft={onConvertToDraft}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FindingCard({
  finding,
  findings,
  onJumpToFinding,
  onJumpToSymbol,
  onConvertToDraft,
}: {
  finding: Finding
  findings: ReviewFindingsState
  onJumpToFinding: (f: Finding) => void
  onJumpToSymbol: (loc: SymbolLocation) => void
  onConvertToDraft: (f: Finding) => Promise<void> | void
}): JSX.Element {
  const sev = severityStyle(finding.severity)
  const isDismissed = findings.isDismissed(finding.id)
  const isConverted = findings.isConverted(finding.id)
  const canConvert = !!finding.code?.file && finding.code.lineStart != null
  return (
    <div className="border-border bg-surface rounded-md border p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          className="rounded-sm px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
          style={{ background: sev.bg, color: sev.fg }}
        >
          {sev.label}
        </span>
        {finding.code?.file && finding.code.lineStart != null && (
          <button
            type="button"
            onClick={() => onJumpToFinding(finding)}
            className="text-text-secondary hover:text-text-primary truncate text-[10px] underline-offset-2 transition-colors hover:underline"
            title={`Jump to ${finding.code.file}:${finding.code.lineStart}`}
          >
            {finding.code.file}:{finding.code.lineStart}
          </button>
        )}
      </div>
      <div className="mb-1.5">
        <FindingBody finding={finding} onJumpToSymbol={onJumpToSymbol} />
      </div>
      <div className="flex items-center justify-end gap-2">
        {isDismissed ? (
          <button
            type="button"
            onClick={() => void findings.undismiss(finding.id)}
            className="text-text-secondary hover:text-text-primary text-[10px] transition-colors"
          >
            Undismiss
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void findings.dismiss(finding.id)}
            className="text-text-secondary hover:text-text-primary text-[10px] transition-colors"
          >
            Dismiss
          </button>
        )}
        {canConvert && (
          <button
            type="button"
            onClick={() => {
              void onConvertToDraft(finding)
            }}
            disabled={isConverted}
            className={cn(
              'border-border bg-surface-hover hover:border-text-secondary rounded-sm border px-1.5 py-0.5 text-[10px] transition-colors',
              isConverted && 'cursor-default opacity-40 hover:border-border',
            )}
          >
            {isConverted ? 'Converted' : 'Convert to draft'}
          </button>
        )}
      </div>
    </div>
  )
}

interface LensGroupItem {
  lens: Lens
  items: Finding[]
}

function groupByLens(findings: Finding[]): LensGroupItem[] {
  const out = new Map<Lens, Finding[]>()
  for (const f of findings) {
    const bucket = out.get(f.lens)
    if (bucket) bucket.push(f)
    else out.set(f.lens, [f])
  }
  // Sort findings within each lens by severity (blocker > major > minor)
  const order: Record<Severity, number> = { blocker: 0, major: 1, minor: 2 }
  for (const [, items] of out) items.sort((a, b) => order[a.severity] - order[b.severity])
  return Array.from(out.entries()).map(([lens, items]) => ({ lens, items }))
}

function RunningState(): JSX.Element {
  return (
    <div className="text-text-muted flex h-full items-center justify-center p-6 text-center text-xs">
      <div className="flex flex-col items-center gap-2">
        <Sparkles size={16} aria-hidden className="animate-pulse" />
        <p>Reviewing this PR across multiple lenses…</p>
      </div>
    </div>
  )
}

function EmptyState(): JSX.Element {
  return (
    <div className="text-text-muted flex h-full items-center justify-center p-6 text-center text-xs">
      Review pending — regenerate the tour to run the AI review.
    </div>
  )
}

function NoFindingsState({ skipped }: { skipped: SkipReason[] }): JSX.Element {
  return (
    <div className="text-text-muted flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs">
      <Sparkles size={16} aria-hidden className="text-text-secondary" />
      <p>No findings — the applied lenses didn't flag anything in this PR.</p>
      {skipped.length > 0 && (
        <p>
          ({skipped.length} lens{skipped.length === 1 ? '' : 'es'} skipped)
        </p>
      )}
    </div>
  )
}
