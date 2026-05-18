/**
 * LCS-based line diff. Compact (~30 lines) and good enough for the diff
 * viewer toggle on the code pane: two file revisions of the same file,
 * line-by-line, no rename/move detection. Output is a flat list suitable
 * for direct rendering — equal/added/deleted rows in source order with the
 * line numbers each side would have shown.
 */

export type DiffKind = 'eq' | 'add' | 'del'

export interface DiffLine {
  kind: DiffKind
  /** Base-side line number (1-based). Present for `eq` and `del`. */
  baseLine?: number
  /** Head-side line number (1-based). Present for `eq` and `add`. */
  headLine?: number
  content: string
}

export function diffLines(base: string[], head: string[]): DiffLine[] {
  const m = base.length
  const n = head.length
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      lcs[i]![j] =
        base[i - 1] === head[j - 1]
          ? lcs[i - 1]![j - 1]! + 1
          : Math.max(lcs[i - 1]![j]!, lcs[i]![j - 1]!)
    }
  }
  const out: DiffLine[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (base[i - 1] === head[j - 1]) {
      out.unshift({ kind: 'eq', baseLine: i, headLine: j, content: base[i - 1]! })
      i--
      j--
    } else if (lcs[i - 1]![j]! >= lcs[i]![j - 1]!) {
      out.unshift({ kind: 'del', baseLine: i, content: base[i - 1]! })
      i--
    } else {
      out.unshift({ kind: 'add', headLine: j, content: head[j - 1]! })
      j--
    }
  }
  while (i > 0) {
    out.unshift({ kind: 'del', baseLine: i, content: base[i - 1]! })
    i--
  }
  while (j > 0) {
    out.unshift({ kind: 'add', headLine: j, content: head[j - 1]! })
    j--
  }
  return out
}
