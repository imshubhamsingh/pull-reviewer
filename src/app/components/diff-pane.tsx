import { useMemo, type JSX } from 'react'
import { match } from 'ts-pattern'
import { useFileSnapshot, type SnapshotState } from '@/app/hooks/use-file-snapshot'
import type { FileSnapshot } from '@/lib/api'
import { useShiki } from '@/app/hooks/use-shiki'
import { useResolvedBaseSha } from '@/app/hooks/use-resolved-base-sha'
import { useDiffSurface } from '@/app/hooks/use-diff-surface'
import { useDiffPaneSearch } from '@/app/hooks/use-diff-pane-search'
import { diffLines, type DiffLine } from '@/app/lib/diff-lines'
import { CodeSearchOverlay } from '@/app/components/code-search-overlay'
import { DiffColumns, type DiffSearchPayload } from '@/app/components/diff-split'
import { UnifiedDiff } from '@/app/components/diff-unified'
import { DiffHeader, FileBanner, Notice, type FileStatus } from '@/app/components/diff-helpers'
import type { DiffSurface } from '@/app/components/diff-surface'
import type { ReviewDrafts } from '@/app/hooks/use-review-drafts'
import type { QaThreads } from '@/app/hooks/use-qa-threads'

/**
 * Side-by-side diff between base and head revisions of a single file.
 * Rendered when the user toggles the code pane into "Diff" mode. Two columns
 * (base on the left, head on the right) inside one scroll container so rows
 * stay aligned without a scroll-sync hack. Deletions tint the left side red;
 * additions tint the right side green. Context lines stay neutral on both.
 *
 * Drag-select on a line gutter opens an inline composer (full-width, between
 * the diff bands) — letting the user comment on deleted lines (`side='before'`)
 * which the regular Code pane can't reach. Pass `drafts` / `qa` / `chapterId`
 * to enable the flow; omit them for a read-only diff view.
 */

export type DiffLayout = 'split' | 'unified'

interface Props {
  repo: string
  baseSha: string | null
  headSha: string
  file: string
  /** When `baseSha` is null and `prNumber` is provided, the pane fetches the
   * current base-branch SHA from GitHub on mount and uses that instead. */
  prNumber?: number
  /** `split` = two columns side-by-side with synced horizontal scroll.
   *  `unified` = one column with stacked +/- rows (GitHub's compact view). */
  layout?: DiffLayout
  /** Pass to enable the comment-creation flow. Omit for read-only view. */
  drafts?: ReviewDrafts
  qa?: QaThreads
  chapterId?: string
}

export function DiffPane({
  repo,
  baseSha,
  headSha,
  file,
  prNumber,
  layout = 'split',
  drafts,
  qa,
  chapterId,
}: Props): JSX.Element {
  const resolvedBaseSha = useResolvedBaseSha(repo, baseSha, prNumber)
  const headSnap = useFileSnapshot(repo, headSha, file)
  // Only fetch base when we have a baseSha — useFileSnapshot returns idle for
  // undefined path. Don't pass empty-string sha; the backend would 400.
  const baseSnap = useFileSnapshot(
    repo,
    resolvedBaseSha.sha ?? '',
    resolvedBaseSha.sha ? file : undefined,
  )
  const hl = useShiki()

  // The diff renderer needs BOTH sides resolved before computing — otherwise
  // a transient single-side render makes every line look like a deletion or
  // addition (the bug that surfaced as "everything looks new").
  if (headSnap.kind === 'idle') return <Notice>No file selected.</Notice>
  if (headSnap.kind === 'loading') return <Notice>Loading head…</Notice>
  if (headSnap.kind === 'error') return <Notice tone="danger">{headSnap.message}</Notice>

  if (resolvedBaseSha.state === 'resolving') return <Notice>Resolving base revision…</Notice>
  if (resolvedBaseSha.state === 'missing') {
    return (
      <Notice tone="warn">
        No base revision recorded for this tour
        {prNumber == null ? ' — only head is available.' : ' and GitHub returned no base sha.'}
      </Notice>
    )
  }
  if (resolvedBaseSha.state === 'error') {
    return <Notice tone="danger">Could not resolve base sha: {resolvedBaseSha.message}</Notice>
  }
  if (baseSnap.kind === 'loading' || baseSnap.kind === 'idle') {
    return <Notice>Loading base…</Notice>
  }

  // Files above BlobReader's 256 KB inline cap come back as `encoding:
  // 'omitted'` with non-zero size (zero size = file genuinely missing). When
  // BOTH sides are omitted-for-size or binary, the inline diff is meaningless
  // — surface a clear notice with a GitHub fallback link instead of the
  // generic "both revisions empty" message that yarn.lock-style files trigger.
  const headBlocked = isInlineBlocked(headSnap)
  const baseBlocked = baseSnap.kind === 'ready' && isInlineBlocked(baseSnap)
  if (headBlocked && (baseBlocked || baseSnap.kind === 'error')) {
    return (
      <InlineUnavailable
        repo={repo}
        sha={headSha}
        file={file}
        headSize={headSnap.kind === 'ready' ? headSnap.snap.size : 0}
        headEncoding={headSnap.kind === 'ready' ? headSnap.snap.encoding : 'omitted'}
      />
    )
  }

  const headContent = headSnap.snap.encoding === 'utf8' ? (headSnap.snap.content ?? '') : ''
  // base might 404 (file added in this PR) — treat as empty so every line shows
  // up as an addition, which is the correct diff for a newly-introduced file.
  const baseContent =
    baseSnap.kind === 'ready' && baseSnap.snap.encoding === 'utf8'
      ? (baseSnap.snap.content ?? '')
      : ''
  const baseMissing = baseSnap.kind === 'error'
  const headMissing = headSnap.snap.encoding !== 'utf8' || !headSnap.snap.content
  return (
    <DiffBody
      repo={repo}
      prNumber={prNumber}
      file={file}
      headSha={headSha}
      baseSha={resolvedBaseSha.sha ?? ''}
      baseContent={baseContent}
      headContent={headContent}
      baseMissing={baseMissing}
      headMissing={headMissing}
      layout={layout}
      hl={hl}
      drafts={drafts}
      qa={qa}
      chapterId={chapterId}
    />
  )
}

interface DiffBodyProps {
  repo: string
  prNumber: number | undefined
  file: string
  headSha: string
  baseSha: string
  baseContent: string
  headContent: string
  baseMissing: boolean
  headMissing: boolean
  layout: DiffLayout
  hl: ReturnType<typeof useShiki>
  drafts: ReviewDrafts | undefined
  qa: QaThreads | undefined
  chapterId: string | undefined
}

function DiffBody({
  repo,
  prNumber,
  file,
  headSha,
  baseSha,
  baseContent,
  headContent,
  baseMissing,
  headMissing,
  layout,
  hl,
  drafts,
  qa,
  chapterId,
}: DiffBodyProps): JSX.Element {
  const rows = useMemo<DiffLine[]>(() => {
    const baseLines = baseContent ? baseContent.split('\n') : []
    const headLines = headContent ? headContent.split('\n') : []
    return diffLines(baseLines, headLines)
  }, [baseContent, headContent])

  const surface: DiffSurface | null = useDiffSurface({
    repo,
    prNumber,
    file,
    headSha,
    baseSha,
    drafts,
    qa,
    chapterId,
  })

  const { search, matches: searchMatches, matchCount, wrapperRef } = useDiffPaneSearch(rows)
  const searchPayload: DiffSearchPayload = {
    matches: searchMatches,
    activeIndex: search.activeIndex,
  }

  if (rows.length === 0) {
    return <Notice>Both revisions are empty — nothing to diff.</Notice>
  }
  const noChanges = rows.every((r) => r.kind === 'eq')
  const fileStatus: FileStatus = headMissing
    ? 'removed'
    : baseMissing
      ? 'added'
      : noChanges
        ? 'unchanged'
        : 'changed'

  return (
    <div ref={wrapperRef} className="flex h-full min-h-0 flex-col">
      <FileBanner file={file} status={fileStatus} />
      {layout === 'split' && <DiffHeader />}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <CodeSearchOverlay search={search} matchCount={matchCount} />
        {match(layout)
          .with('unified', () => (
            <UnifiedDiff rows={rows} hl={hl} file={file} surface={surface} search={searchPayload} />
          ))
          .with('split', () => (
            <DiffColumns rows={rows} hl={hl} file={file} surface={surface} search={searchPayload} />
          ))
          .exhaustive()}
      </div>
    </div>
  )
}

/**
 * A snapshot is "inline-blocked" when its content can't render in the diff
 * grid — either skipped by the 256 KB cap (`encoding: 'omitted'` with non-
 * zero size, set by BlobReader) or binary (`base64`). Zero-size omitted
 * means the file genuinely doesn't exist at that sha and is handled by the
 * added/removed status path.
 */
function isInlineBlocked(state: SnapshotState): boolean {
  if (state.kind !== 'ready') return false
  const { encoding, size } = state.snap
  if (encoding === 'base64') return true
  if (encoding === 'omitted' && size > 0) return true
  return false
}

function InlineUnavailable({
  repo,
  sha,
  file,
  headSize,
  headEncoding,
}: {
  repo: string
  sha: string
  file: string
  headSize: number
  headEncoding: FileSnapshot['encoding']
}): JSX.Element {
  const url = `https://github.com/${repo}/blob/${sha}/${file}`
  const reason =
    headEncoding === 'base64'
      ? 'Binary file — preview not supported inline.'
      : `File too large to diff inline (${formatBytes(headSize)}).`
  return (
    <Notice>
      <p>{reason}</p>
      <p className="text-text-muted mt-2 text-[11px]">
        Open on GitHub:{' '}
        <button
          type="button"
          onClick={() => window.electron.openExternal(url)}
          className="text-text-brand hover:underline"
        >
          {file}
        </button>
      </p>
    </Notice>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
