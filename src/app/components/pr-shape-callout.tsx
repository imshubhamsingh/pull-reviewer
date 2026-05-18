import { Clock, Layers } from 'lucide-react'
import { useState, type JSX } from 'react'
import { cn } from '@/app/lib/utils'
import { ComplexityFlagRow } from '@/app/components/complexity-flag-row'
import { SplitSuggestionBlock } from '@/app/components/split-suggestion-block'
import type { PrShape, PrSize } from '@/lib/api'

/**
 * Top-of-first-chapter "PR shape" summary — size band, estimated review
 * time, structural complexity flags, and an optional stacked-PR split
 * proposal. Lives inside the docs pane on chapter 1 so reviewers see the
 * high-level shape before drilling into per-file content.
 */

interface Props {
  shape: PrShape
  className?: string
}

export function PrShapeCallout({ shape, className }: Props): JSX.Element {
  const [splitOpen, setSplitOpen] = useState(false)
  const sizeStyle = SIZE_STYLE[shape.size]
  return (
    <section
      aria-label="PR shape summary"
      className={cn('border-border bg-surface mb-4 rounded-md border p-3 text-sm', className)}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-sm px-2 py-0.5 text-[11px] font-medium tracking-wider uppercase"
          style={{ backgroundColor: sizeStyle.bg, color: sizeStyle.fg }}
        >
          {sizeStyle.label}
        </span>
        <span
          className="text-text-secondary inline-flex items-center gap-1"
          title="Estimated review time for a lead-engineer-caliber first pass"
        >
          <Clock size={14} aria-hidden />
          {formatMinutes(shape.reviewMinutes)}
        </span>
        {shape.complexityFlags.length > 0 && (
          <span className="text-text-muted">
            · {shape.complexityFlags.length} structural{' '}
            {shape.complexityFlags.length === 1 ? 'flag' : 'flags'}
          </span>
        )}
        {shape.splitSuggestion && (
          <span className="text-text-muted inline-flex items-center gap-1">
            <Layers size={14} aria-hidden />
            stacked split suggested
          </span>
        )}
      </header>
      <p className="text-text-secondary mt-2 leading-relaxed">{shape.rationale}</p>

      {shape.complexityFlags.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {shape.complexityFlags.map((flag, i) => (
            <ComplexityFlagRow key={i} flag={flag} />
          ))}
        </ul>
      )}

      {shape.splitSuggestion && (
        <SplitSuggestionBlock
          summary={shape.splitSuggestion.summary}
          stacks={shape.splitSuggestion.stacks}
          open={splitOpen}
          onToggle={() => setSplitOpen((v) => !v)}
        />
      )}
    </section>
  )
}

const SIZE_STYLE: Record<PrSize, { label: string; bg: string; fg: string }> = {
  small: { label: 'Small PR', bg: 'rgba(74, 222, 128, 0.12)', fg: 'rgb(74, 222, 128)' },
  medium: { label: 'Medium PR', bg: 'rgba(56, 189, 248, 0.12)', fg: 'rgb(125, 211, 252)' },
  large: { label: 'Large PR', bg: 'rgba(251, 191, 36, 0.14)', fg: 'rgb(252, 211, 77)' },
  'very-large': {
    label: 'Very large PR',
    bg: 'rgba(239, 68, 68, 0.14)',
    fg: 'rgb(251, 113, 133)',
  },
}

function formatMinutes(min: number): string {
  if (min < 60) return `~${min} min review`
  const h = Math.floor(min / 60)
  const m = min % 60
  if (m === 0) return `~${h}h review`
  return `~${h}h ${m}m review`
}
