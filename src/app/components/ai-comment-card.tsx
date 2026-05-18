import { Sparkles, X } from 'lucide-react'
import { type JSX } from 'react'
import { cn } from '@/app/lib/utils'
import { lensStyle, severityStyle } from '@/app/components/ai-lens-styles'
import { FindingBody } from '@/app/components/finding-body'
import type { Finding, SymbolLocation } from '@/lib/api'

interface Props {
  finding: Finding
  isConverted: boolean
  isDismissed: boolean
  onConvert: () => Promise<void> | void
  onDismiss: () => Promise<void> | void
  onClose: () => void
  /** Click handler for inline-code spans that resolve to a known symbol. */
  onJumpToSymbol: (loc: SymbolLocation) => void
}

/**
 * Inline AI-finding card that expands below a code line when its gutter
 * ✨ icon is clicked. Mirrors `DraftRow` visually so user-authored drafts
 * and AI findings read as siblings in the code pane. Carries lens +
 * severity chips, body, optional Convert-to-draft / Dismiss buttons, and
 * a close (×) affordance.
 */
export function AiCommentCard({
  finding,
  isConverted,
  isDismissed,
  onConvert,
  onDismiss,
  onClose,
  onJumpToSymbol,
}: Props): JSX.Element {
  const lens = lensStyle(finding.lens)
  const severity = severityStyle(finding.severity)
  return (
    <div className="border-border bg-surface mx-3 my-1 rounded-md border p-2 text-xs">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={11} aria-hidden className="text-text-secondary" />
          <span
            className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: lens.bg, color: lens.fg }}
          >
            {lens.label}
          </span>
          <span
            className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{ background: severity.bg, color: severity.fg }}
          >
            {severity.label}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close finding"
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
      <FindingBody finding={finding} onJumpToSymbol={onJumpToSymbol} />

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            void onDismiss()
          }}
          disabled={isDismissed}
          className={cn(
            'text-text-secondary hover:text-text-primary text-[11px] transition-colors',
            isDismissed && 'cursor-default opacity-40 hover:text-text-secondary',
          )}
        >
          {isDismissed ? 'Dismissed' : 'Dismiss'}
        </button>
        <button
          type="button"
          onClick={() => {
            void onConvert()
          }}
          disabled={isConverted}
          className={cn(
            'border-border bg-surface-hover hover:border-text-secondary rounded-sm border px-2 py-0.5 text-[11px] transition-colors',
            isConverted && 'cursor-default opacity-40 hover:border-border',
          )}
        >
          {isConverted ? 'Converted to draft' : 'Convert to draft'}
        </button>
      </div>
    </div>
  )
}
