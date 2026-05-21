/**
 * Pure helpers for the Cmd-F code search overlay. Kept separate from React
 * state so they're trivially unit-testable: `compileQuery` returns null on
 * invalid regex / empty input, callers treat null as "no search".
 */

export interface CodeSearchOptions {
  regex: boolean
  caseSensitive: boolean
}

export interface LineMatchRange {
  start: number
  end: number
}

/**
 * Build a RegExp for `query` honouring the flags. Returns null when the
 * query is empty OR — for the regex mode — invalid. The `g` flag is always
 * set so a single match per line doesn't shortcut the iterator.
 */
export function compileQuery(query: string, opts: CodeSearchOptions): RegExp | null {
  if (!query) return null
  const flags = opts.caseSensitive ? 'g' : 'gi'
  const source = opts.regex ? query : escapeRegExp(query)
  try {
    return new RegExp(source, flags)
  } catch {
    return null
  }
}

/**
 * All non-empty matches in `content`. Resets `re.lastIndex` so callers can
 * reuse the same RegExp across many lines without state bleed.
 */
export function findLineMatches(content: string, re: RegExp): LineMatchRange[] {
  re.lastIndex = 0
  const out: LineMatchRange[] = []
  let m: RegExpExecArray | null
  // Empty-match regexes (e.g. `^`, `(?:)`) would loop forever; bail after
  // one zero-width hit per line by advancing lastIndex manually.
  while ((m = re.exec(content)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1
      continue
    }
    out.push({ start: m.index, end: m.index + m[0].length })
  }
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A search match in a diff row. `sides` records which columns of Split view
 * should paint the highlight — `del` rows live only in the base column,
 * `add` rows only in the head column, `eq` rows mirror in both. Unified
 * view ignores `sides` and paints every match in its single cell.
 */
export interface DiffSearchMatch {
  rowIndex: number
  start: number
  end: number
  sides: Array<'base' | 'head'>
}

export interface DiffRowContent {
  kind: 'add' | 'del' | 'eq'
  content: string
}

/**
 * Build the flat list of diff matches for nav. Order: row ascending, then
 * matches within a row in source order. Eq matches appear in both columns
 * (one nav entry, painted twice). Single-line matches only.
 */
export function buildDiffMatches(rows: DiffRowContent[], re: RegExp): DiffSearchMatch[] {
  const out: DiffSearchMatch[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const ranges = findLineMatches(row.content, re)
    if (ranges.length === 0) continue
    const sides: Array<'base' | 'head'> =
      row.kind === 'del' ? ['base'] : row.kind === 'add' ? ['head'] : ['base', 'head']
    for (const r of ranges) {
      out.push({ rowIndex: i, start: r.start, end: r.end, sides })
    }
  }
  return out
}
