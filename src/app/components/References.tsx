import type { JSX } from 'react'
import { cn } from '@/app/lib/utils'
import type { CodePointer } from '@/lib/api'

interface Props {
  refs: CodePointer[]
  onClick: (ref: CodePointer) => void
  isJumpable: (ref: CodePointer) => boolean
}

export function References({ refs, onClick, isJumpable }: Props): JSX.Element {
  return (
    <div className="border-border bg-surface flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-2">
      <span className="text-text-muted text-[10px] tracking-wider uppercase">refs</span>
      {refs.map((ref, i) => {
        const jumpable = isJumpable(ref)
        return (
          <button
            key={i}
            type="button"
            disabled={!jumpable}
            onClick={() => onClick(ref)}
            className={cn(
              'bg-bg rounded-sm px-2 py-0.5 font-mono text-[11px] transition-colors',
              jumpable
                ? 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                : 'text-text-muted cursor-default opacity-50',
            )}
          >
            ↪ {formatRef(ref)}
          </button>
        )
      })}
    </div>
  )
}

function formatRef(ref: CodePointer): string {
  const { lineStart: s, lineEnd: e } = ref
  if (s != null && e != null && s !== e) return `${ref.file}:${s}-${e}`
  if (s != null) return `${ref.file}:${s}`
  return ref.file
}
