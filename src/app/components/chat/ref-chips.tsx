import { CornerUpRight } from 'lucide-react'
import type { JSX } from 'react'
import { cn } from '@/app/lib/utils'
import type { CodeRef } from '@/lib/api'

interface Props {
  refs: CodeRef[]
  onClick: (ref: CodeRef) => void
}

/**
 * Click-to-jump chips rendered below an assistant message that carries
 * structured `references[]`. Styling mirrors `References.tsx` (used by
 * CodePane step refs) so the visual vocabulary stays consistent across the
 * docs pane and the chat pane.
 */
export function RefChips({ refs, onClick }: Props): JSX.Element {
  if (refs.length === 0) return <></>
  return (
    <div className="bg-bg/40 flex flex-wrap items-center gap-1.5 rounded-md px-2 py-1.5">
      <span className="text-text-muted shrink-0 text-[10px] tracking-wider uppercase">refs</span>
      {refs.map((ref, i) => (
        <button
          key={`${ref.file}:${ref.lineStart}:${i}`}
          type="button"
          onClick={() => onClick(ref)}
          title={formatRef(ref)}
          className={cn(
            'bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            'inline-flex max-w-full items-center gap-1 truncate rounded-sm px-2 py-0.5 font-mono text-[11px] transition-colors',
          )}
        >
          <CornerUpRight size={11} aria-hidden className="shrink-0" />
          <span className="truncate">{formatRef(ref)}</span>
        </button>
      ))}
    </div>
  )
}

function formatRef(ref: CodeRef): string {
  const { lineStart: s, lineEnd: e } = ref
  if (e != null && e !== s) return `${ref.file}:${s}-${e}`
  return `${ref.file}:${s}`
}
