import type { JSX } from 'react'

interface Props {
  file: string
  sha: string
  side?: 'before' | 'after' | 'diff'
}

export function CodeHeader({ file, sha, side }: Props): JSX.Element {
  return (
    <div className="border-border bg-surface flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1">
      <span className="text-text-secondary truncate font-mono text-xs">{file}</span>
      <div className="text-text-muted flex shrink-0 items-baseline gap-2 font-mono text-[10px]">
        {side && side !== 'after' && <span className="uppercase">{side}</span>}
        <span>{sha.slice(0, 7)}</span>
      </div>
    </div>
  )
}
