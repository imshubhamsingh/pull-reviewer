import type { JSX } from 'react'

/**
 * Right-pane banner shown when a PR has more changed files than the GitHub
 * Files API returned in one paged scan (currently capped at 500 files). The
 * commentable-lines indicator can't paint files past the cap; their drafts
 * may still fail on submit with the existing 422 marker.
 */
export function HunksTruncatedBanner(): JSX.Element {
  return (
    <div className="border-border bg-surface mb-3 flex items-start gap-2 rounded-md border px-4 py-2">
      <span aria-hidden className="text-text-secondary mt-0.5 text-xs">
        ⓘ
      </span>
      <p className="text-text-secondary text-xs leading-relaxed">
        <span className="text-text-primary font-medium">First 500 files only.</span> This PR has
        more changed files than the GitHub diff API returns in one scan. Lines in files past 500
        won&apos;t show the comment indicator; drafts there may fail on submit.
      </p>
    </div>
  )
}
