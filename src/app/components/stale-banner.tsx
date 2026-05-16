import type { JSX } from 'react'

interface Props {
  generatedFor: string | null | undefined
  currentHead: string | null | undefined
  onRegenerate: () => void
}

/**
 * Shown when a cached tour's head sha no longer matches the PR's current head.
 * Reading the old tour against old code is still useful — the user chooses when
 * to regenerate.
 */
export function StaleBanner({ generatedFor, currentHead, onRegenerate }: Props): JSX.Element {
  return (
    <div className="border-border bg-surface mb-3 flex items-center justify-between gap-4 rounded-md border px-4 py-2">
      <p className="text-text-secondary text-xs">
        <span aria-hidden className="mr-1">
          ⓘ
        </span>
        Tour was generated for <Sha>{generatedFor}</Sha>. PR head is now <Sha>{currentHead}</Sha>.
      </p>
      <button
        type="button"
        onClick={onRegenerate}
        className="bg-interactive-secondary hover:bg-interactive-secondary-hover text-text-primary rounded-sm px-3 py-1 text-xs transition-colors"
      >
        Regenerate
      </button>
    </div>
  )
}

function Sha({ children }: { children: string | null | undefined }): JSX.Element {
  const short =
    typeof children === 'string' && children.length >= 7 ? children.slice(0, 7) : 'unknown'
  return <code className="text-text-primary font-mono">{short}</code>
}
