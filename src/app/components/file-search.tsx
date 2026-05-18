import { Search, X } from 'lucide-react'
import type { JSX } from 'react'
import type { PrFile } from '@/lib/api'

/**
 * Controlled fuzzy-search input for filtering a file list (used by the right
 * pane's Map tab). Pairs with the `fuzzyFilterFiles` helper exported from
 * this file — file-map owns the query state so it can drive both the input
 * and the filtered list / empty-state render.
 */

interface Props {
  query: string
  onChange: (q: string) => void
  /** Match count shown next to the input when a query is active. */
  matchCount: number
}

export function FileSearch({ query, onChange, matchCount }: Props): JSX.Element {
  return (
    <div className="border-border bg-surface shrink-0 border-b px-2 py-1.5">
      <div className="border-border bg-bg flex items-center gap-1.5 rounded-sm border px-2 py-1">
        <Search size={11} aria-hidden className="text-text-muted shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Filter files…"
          className="text-text-primary placeholder:text-text-muted min-w-0 flex-1 bg-transparent text-xs outline-none"
          aria-label="Filter files in the map"
        />
        {query && (
          <>
            <span className="text-text-muted shrink-0 text-[10px] tabular-nums">{matchCount}</span>
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Clear file filter"
              className="text-text-muted hover:text-text-primary shrink-0 transition-colors"
            >
              <X size={11} aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Subsequence-based fuzzy filter — each character of the query must appear
 * in the file path in order, case-insensitive. Cheap, predictable, and good
 * enough for "appx" → "App.tsx" or "ap/checkout" → "app/pages/checkout.tsx".
 */
export function fuzzyFilterFiles(files: PrFile[], rawQuery: string): PrFile[] {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return files
  return files.filter((f) => isSubsequence(q, f.path.toLowerCase()))
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++
  }
  return i === needle.length
}
