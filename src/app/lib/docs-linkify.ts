import type { CodePointer } from '@/lib/api'

export interface LinkifySources {
  /** Step references — when matched, click resolves to a full CodePointer (with lines). */
  refs?: CodePointer[]
  /** Other repo-relative file paths from the tour. Matched by basename only. */
  filePaths?: string[]
}

export interface LinkifyResult {
  html: string
  /** Index-aligned with the data-ref-idx anchors in the produced html. */
  pointers: CodePointer[]
}

/**
 * Wraps `<code>token</code>` spans whose text matches a known file's basename
 * in `.doc-link` anchors. The renderer listens for clicks via event delegation
 * and looks up `pointers[data-ref-idx]` to resolve the navigation target.
 *
 * Matching is intentionally simple — file basename (with and without
 * extension), case-insensitive, punctuation stripped. First source that
 * claims a key wins.
 */
export function linkify(html: string, sources: LinkifySources): LinkifyResult {
  const pointers: CodePointer[] = []
  const lookup = new Map<string, number>()
  collectFromRefs(sources.refs, pointers, lookup)
  collectFromPaths(sources.filePaths, pointers, lookup)
  if (lookup.size === 0) return { html, pointers }

  const linked = html.replace(/<code>([^<]+)<\/code>/g, (full, raw: string) => {
    const cleaned = raw.replace(/[()]/g, '').trim()
    if (!cleaned) return full
    const idx = lookup.get(cleaned.toLowerCase())
    if (idx == null) return full
    return `<a class="doc-link" data-ref-idx="${idx}" href="#" title="Jump to ${escapeAttr(pointers[idx]!.file)}">${raw}</a>`
  })
  return { html: linked, pointers }
}

function collectFromRefs(refs: CodePointer[] | undefined, pointers: CodePointer[], lookup: Map<string, number>): void {
  if (!refs) return
  for (const ref of refs) registerPointer(ref, pointers, lookup)
}

function collectFromPaths(paths: string[] | undefined, pointers: CodePointer[], lookup: Map<string, number>): void {
  if (!paths) return
  for (const path of paths) registerPointer({ file: path }, pointers, lookup)
}

function registerPointer(ref: CodePointer, pointers: CodePointer[], lookup: Map<string, number>): void {
  const tokens = identifierTokens(ref.file)
  const claimedAny = claimTokens(tokens, lookup, pointers.length)
  if (claimedAny) pointers.push(ref)
}

function claimTokens(tokens: string[], lookup: Map<string, number>, idx: number): boolean {
  let claimed = false
  for (const tok of tokens) {
    const key = tok.toLowerCase()
    if (lookup.has(key)) continue
    lookup.set(key, idx)
    claimed = true
  }
  return claimed
}

function identifierTokens(file: string): string[] {
  const base = file.split('/').pop() ?? file
  const stem = base.replace(/\.[^.]+$/, '')
  return [base, stem]
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
