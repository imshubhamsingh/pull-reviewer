import { CheckSquare, Square } from 'lucide-react'
import { match } from 'ts-pattern'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { FileSearch, fuzzyFilterFiles } from '@/app/components/file-search'
import { cn } from '@/app/lib/utils'
import type { FileCoverage, FileCoverageKind } from '@/app/hooks/use-file-coverage'
import type { PrFile, ReviewDraft } from '@/lib/api'

interface Props {
  files: PrFile[]
  currentFile?: string
  coverage: FileCoverage
  reviewed: Set<string>
  /** Pending review drafts. FileMap buckets these by file to render a 💬
   *  indicator on rows with pending comments. Empty array = no indicators. */
  drafts: ReviewDraft[]
  onPick: (path: string) => void
  onToggleReviewed: (path: string) => void
}

export function FileMap({
  files,
  currentFile,
  coverage,
  reviewed,
  drafts,
  onPick,
  onToggleReviewed,
}: Props): JSX.Element {
  const listRef = useRef<HTMLUListElement>(null)
  const activeRowRef = useRef<HTMLLIElement>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!currentFile || !activeRowRef.current || !listRef.current) return
    activeRowRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [currentFile])

  const filtered = useMemo(() => fuzzyFilterFiles(files, query), [files, query])
  const draftsByFile = useMemo(() => bucketDraftsByFile(drafts), [drafts])

  if (files.length === 0) {
    return (
      <div className="text-text-muted flex h-full items-center justify-center p-4 text-center text-xs">
        No files in this PR.
      </div>
    )
  }
  const reviewedCount = files.reduce((n, f) => (reviewed.has(f.path) ? n + 1 : n), 0)
  return (
    <div className="flex h-full flex-col">
      <FileProgress done={reviewedCount} total={files.length} />
      <FileSearch query={query} onChange={setQuery} matchCount={filtered.length} />
      {filtered.length === 0 ? (
        <p className="text-text-muted flex flex-1 items-center justify-center p-4 text-center text-xs">
          No files match "{query}".
        </p>
      ) : (
        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
          {filtered.map((f) => {
            const active = f.path === currentFile
            return (
              <li key={f.path} ref={active ? activeRowRef : undefined}>
                <FileRow
                  file={f}
                  active={active}
                  kind={coverage.kind(f.path)}
                  chapter={coverage.firstChapter(f.path)}
                  chapterIdx={coverage.firstChapterIdx(f.path)}
                  reviewed={reviewed.has(f.path)}
                  draftCount={draftsByFile.get(f.path) ?? 0}
                  onPick={onPick}
                  onToggleReviewed={onToggleReviewed}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function FileProgress({ done, total }: { done: number; total: number }): JSX.Element {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="border-border bg-surface shrink-0 border-b px-3 py-2">
      <div className="text-text-muted mb-1 flex items-baseline justify-between text-[10px] tracking-wider uppercase">
        <span>Files reviewed</span>
        <span className="tabular-nums">
          {done}/{total} · {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-bg h-1 w-full overflow-hidden rounded-sm"
      >
        <div
          className="bg-interactive-primary h-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

interface RowProps {
  file: PrFile
  active: boolean
  kind: FileCoverageKind
  chapter: string | undefined
  chapterIdx: number | undefined
  reviewed: boolean
  draftCount: number
  onPick: (path: string) => void
  onToggleReviewed: (path: string) => void
}

function FileRow({
  file,
  active,
  kind,
  chapter,
  chapterIdx,
  reviewed,
  draftCount,
  onPick,
  onToggleReviewed,
}: RowProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 border-l-2 pl-3 pr-2 py-1.5 text-xs transition-colors',
        active ? 'border-text-brand bg-surface-hover text-text-primary' : 'border-transparent',
        !active && kind === 'pinned' && 'text-text-secondary hover:bg-surface-hover',
        !active && kind === 'referenced' && 'text-text-secondary/80 hover:bg-surface-hover italic',
        !active && kind === 'uncovered' && 'text-text-muted hover:bg-surface-hover opacity-70',
        reviewed && !active && 'opacity-50',
      )}
    >
      <button
        type="button"
        onClick={() => onPick(file.path)}
        title={tooltipFor(file.path, kind, chapter, reviewed, draftCount)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <CoverageDot kind={kind} active={active} />
        <PathLabel path={file.path} />
        <ChapterBadge idx={chapterIdx} kind={kind} />
        {draftCount > 0 && <DraftBadge count={draftCount} />}
        <DiffCount additions={file.additions} deletions={file.deletions} />
      </button>
      <button
        type="button"
        onClick={() => onToggleReviewed(file.path)}
        aria-pressed={reviewed}
        aria-label={reviewed ? 'Mark file unreviewed' : 'Mark file reviewed'}
        title={reviewed ? 'Reviewed (click to unmark)' : 'Mark file reviewed'}
        className={cn(
          'flex shrink-0 items-center transition-colors',
          reviewed
            ? 'text-green-400 hover:text-green-300'
            : 'text-text-muted/70 hover:text-text-primary',
        )}
      >
        {reviewed ? <CheckSquare size={12} aria-hidden /> : <Square size={12} aria-hidden />}
      </button>
    </div>
  )
}

function CoverageDot({ kind, active }: { kind: FileCoverageKind; active: boolean }): JSX.Element {
  const className = match(kind)
    .with('pinned', () => (active ? 'text-text-brand' : 'text-text-secondary'))
    .with('referenced', () => 'text-text-secondary/70')
    .with('uncovered', () => 'text-text-muted/40')
    .exhaustive()
  const glyph = kind === 'uncovered' ? '○' : '●'
  return (
    <span aria-hidden className={cn('text-[8px] leading-none', className)}>
      {glyph}
    </span>
  )
}

function ChapterBadge({
  idx,
  kind,
}: {
  idx: number | undefined
  kind: FileCoverageKind
}): JSX.Element {
  if (idx == null) {
    return (
      <span className="text-text-muted/50 shrink-0 font-mono text-[9px] tracking-wider uppercase">
        none
      </span>
    )
  }
  return (
    <span
      className={cn(
        'shrink-0 rounded-sm px-1 font-mono text-[9px] tracking-wider uppercase',
        kind === 'pinned' ? 'bg-surface text-text-secondary' : 'bg-surface/60 text-text-muted',
      )}
    >
      ch {idx}
    </span>
  )
}

function PathLabel({ path }: { path: string }): JSX.Element {
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash + 1) : ''
  const name = slash >= 0 ? path.slice(slash + 1) : path
  // Single truncating line — flips visual direction so the basename + extension
  // stay visible and the ellipsis eats into the directory prefix instead. The
  // `<bdi>` keeps the actual characters left-to-right; `direction: rtl` just
  // controls where the overflow ellipsis lands.
  return (
    <span
      className="min-w-0 flex-1 truncate font-mono"
      style={{ direction: 'rtl', textAlign: 'left' }}
      title={path}
    >
      <bdi style={{ direction: 'ltr' }}>
        {dir && <span className="text-text-muted">{dir}</span>}
        {name}
      </bdi>
    </span>
  )
}

function DiffCount({
  additions,
  deletions,
}: {
  additions: number
  deletions: number
}): JSX.Element {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums">
      <span className="text-green-400">+{additions}</span>
      <span className="text-red-400">−{deletions}</span>
    </span>
  )
}

function bucketDraftsByFile(drafts: ReviewDraft[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const d of drafts) out.set(d.file, (out.get(d.file) ?? 0) + 1)
  return out
}

function DraftBadge({ count }: { count: number }): JSX.Element {
  return (
    <span
      title={`${count} pending review ${count === 1 ? 'comment' : 'comments'} on this file`}
      className="text-text-brand shrink-0 font-mono text-[10px] tabular-nums"
    >
      💬{count > 1 ? count : ''}
    </span>
  )
}

function tooltipFor(
  path: string,
  kind: FileCoverageKind,
  chapter: string | undefined,
  reviewed: boolean,
  draftCount: number,
): string {
  const base = match(kind)
    .with('pinned', () => (chapter ? `${path}\nPinned in: ${chapter}` : path))
    .with('referenced', () => (chapter ? `${path}\nReferenced in: ${chapter}` : path))
    .with('uncovered', () => `${path}\nNot covered by the tour — click to open standalone`)
    .exhaustive()
  const parts: string[] = [base]
  if (draftCount > 0) {
    parts.push(`· ${draftCount} pending ${draftCount === 1 ? 'comment' : 'comments'}`)
  }
  if (reviewed) parts.push('· Reviewed')
  return parts.join('\n')
}
