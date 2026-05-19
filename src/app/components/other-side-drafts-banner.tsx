import type { JSX } from 'react'

/**
 * Inline banner shown by `CodePane` when the file has pending drafts on the
 * side opposite to the one currently rendered (e.g. user added a comment on
 * a deleted line, but the Code pane is showing the head revision). Click
 * switches the host to Diff/split so both sides — and the draft — are
 * visible.
 */
export function OtherSideDraftsBanner({
  count,
  otherSide,
  onJumpToDiff,
}: {
  count: number
  otherSide: 'before' | 'after'
  onJumpToDiff: () => void
}): JSX.Element {
  // GitHub-style framing: "original" for the pre-PR revision, "updated" for
  // the post-PR revision. Avoids the misread of "deleted version" as the file
  // itself being deleted — it's the file's pre-change revision, not the file.
  const label = otherSide === 'before' ? 'original revision' : 'updated revision'
  return (
    <button
      type="button"
      onClick={onJumpToDiff}
      title="Open the Diff view to see this comment"
      className="border-border bg-surface hover:bg-surface-hover text-text-secondary flex w-full items-center justify-between border-b px-3 py-1.5 text-[11px] transition-colors"
    >
      <span>
        💬 {count} {count === 1 ? 'comment' : 'comments'} on the {label} of this file.
      </span>
      <span className="text-text-muted">View in Diff →</span>
    </button>
  )
}
