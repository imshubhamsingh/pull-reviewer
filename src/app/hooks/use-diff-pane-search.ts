import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { buildDiffMatches, compileQuery, type DiffSearchMatch } from '@/app/lib/code-search'
import { useCmdFListener, useCodeSearch, type CodeSearch } from '@/app/hooks/use-code-search'
import type { DiffLine } from '@/app/lib/diff-lines'

/**
 * Wires the Cmd-F overlay state, the diff match computation, and the
 * scroll-into-view + flash effect that fires when the active match
 * changes. Returns the bag DiffBody needs to render.
 *
 * The `wrapperRef` is the element the caller should put on the outer
 * scroll container — both the row lookup (`[data-diff-row]`) and the
 * active-segment flash (`[data-search-active]`) query from inside it.
 */
export function useDiffPaneSearch(rows: DiffLine[]): {
  search: CodeSearch
  matches: DiffSearchMatch[]
  matchCount: number
  wrapperRef: RefObject<HTMLDivElement | null>
} {
  const search = useCodeSearch()
  useCmdFListener(search.open)
  const matches = useMemo(() => {
    const re = compileQuery(search.query, {
      regex: search.regex,
      caseSensitive: search.caseSensitive,
    })
    if (!re) return []
    return buildDiffMatches(rows, re)
  }, [rows, search.query, search.regex, search.caseSensitive])

  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (search.activeIndex < 0 || !wrapperRef.current) return
    const m = matches[search.activeIndex]
    if (!m) return
    const rowEl = wrapperRef.current.querySelector<HTMLElement>(`[data-diff-row="${m.rowIndex}"]`)
    rowEl?.scrollIntoView({ block: 'center' })
    const segs = wrapperRef.current.querySelectorAll<HTMLElement>('[data-search-active="true"]')
    segs.forEach((el) => el.classList.add('search-match-active-flash'))
    const id = window.setTimeout(
      () => segs.forEach((el) => el.classList.remove('search-match-active-flash')),
      700,
    )
    return () => window.clearTimeout(id)
  }, [search.activeIndex, matches])

  return { search, matches, matchCount: matches.length, wrapperRef }
}
