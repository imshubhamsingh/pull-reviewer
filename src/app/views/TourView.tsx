import type { JSX } from 'react'

interface Props {
  repo: string
  prNumber: number
  onBack: () => void
}

/** Placeholder until Phase 7 wires the docs pane + chapter stepper. */
export function TourView({ repo, prNumber, onBack }: Props): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <button
        type="button"
        onClick={onBack}
        className="text-text-secondary hover:text-text-primary text-sm mb-4"
      >
        ← back
      </button>
      <h1 className="text-2xl font-semibold">{repo} #{prNumber}</h1>
      <p className="text-text-secondary mt-2">Tour viewer — under construction (Phase 7).</p>
    </div>
  )
}
