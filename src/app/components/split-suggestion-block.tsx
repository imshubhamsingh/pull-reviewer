import { ChevronDown, ChevronRight } from 'lucide-react'
import { type JSX } from 'react'
import type { SplitStack } from '@/lib/api'

/**
 * Collapsible breakdown of the AI's stacked-PR proposal — shown beneath the
 * PR-shape callout when the model thinks the change would benefit from
 * being split.
 */
export function SplitSuggestionBlock({
  summary,
  stacks,
  open,
  onToggle,
}: {
  summary: string
  stacks: SplitStack[]
  open: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        className="text-text-secondary hover:text-text-primary inline-flex items-center gap-1 text-[11px] transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Proposed stacked-PR split ({stacks.length} stacks)
      </button>
      {open && (
        <div className="border-border mt-2 rounded-sm border p-2">
          <p className="text-text-secondary mb-2">{summary}</p>
          <ol className="space-y-2">
            {stacks.map((stack, i) => (
              <li key={i} className="text-text-primary">
                <span className="text-text-muted mr-1 font-mono text-[10px]">{i + 1}.</span>
                <span className="font-medium">{stack.title}</span>
                <p className="text-text-secondary mt-0.5 leading-relaxed">{stack.rationale}</p>
                {stack.files && stack.files.length > 0 && (
                  <p className="text-text-muted mt-0.5 font-mono text-[10px]">
                    {stack.files.join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
