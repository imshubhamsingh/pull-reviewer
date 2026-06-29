import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { useMemo, useState, type JSX } from 'react'
import { cn } from '@/app/lib/utils'
import type { UsageHit, UsagesResult } from '@/lib/api'

interface Props {
  /** Display symbol (echoed in the header even before results land). */
  symbol: string
  result: UsagesResult | null
  loading: boolean
  error: string | undefined
  /** Click on a result row — jumps the centre pane to that file:line via the
   *  host's existing `jumpToRef` flow. */
  onJumpRef: (ref: { file: string; lineStart: number }) => void
  /** Closes the Usages pane (caller flips the right pane to whatever was
   *  active before). */
  onClose: () => void
}

/**
 * Right-pane "Usages" mode. Header shows the symbol, hit count, file count,
 * and an engine badge so the reviewer knows whether they're looking at a
 * TS-compiler-precise list or a ripgrep best-effort one. Body is a
 * collapsible per-file grouping; each row jumps on click.
 */
export function UsagesPane({
  symbol,
  result,
  loading,
  error,
  onJumpRef,
  onClose,
}: Props): JSX.Element {
  const grouped = useMemo(() => groupByFile(result?.hits ?? []), [result])
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header
        symbol={symbol}
        result={result}
        loading={loading}
        fileCount={grouped.length}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <CenterMessage>Searching…</CenterMessage>
        ) : error ? (
          <CenterMessage tone="danger">{error}</CenterMessage>
        ) : !result ? (
          <CenterMessage>Right-click any identifier and pick "Find usages".</CenterMessage>
        ) : result.hits.length === 0 ? (
          <CenterMessage>No usages found in this PR's worktree.</CenterMessage>
        ) : (
          grouped.map((group) => <FileGroup key={group.file} group={group} onJumpRef={onJumpRef} />)
        )}
      </div>
    </div>
  )
}

function Header({
  symbol,
  result,
  loading,
  fileCount,
  onClose,
}: {
  symbol: string
  result: UsagesResult | null
  loading: boolean
  fileCount: number
  onClose: () => void
}): JSX.Element {
  const totalHits = result?.hits.length ?? 0
  const engineBadge = !result
    ? loading
      ? 'searching…'
      : ''
    : result.engine === 'typescript'
      ? `via TS compiler · ${result.durationMs}ms`
      : `via ripgrep · word match`
  return (
    <div className="border-border flex shrink-0 items-start justify-between gap-2 border-b px-3 py-2">
      <div className="min-w-0">
        <p className="text-text-primary truncate font-mono text-xs">{symbol || 'No symbol'}</p>
        {result && (
          <p className="text-text-muted text-[10px] tracking-wider uppercase">
            {totalHits} {totalHits === 1 ? 'hit' : 'hits'} · {fileCount}{' '}
            {fileCount === 1 ? 'file' : 'files'}
          </p>
        )}
        {engineBadge && (
          <p className="text-text-muted/80 text-[10px] tracking-wider uppercase">{engineBadge}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close usages pane"
        className="text-text-muted hover:text-text-primary shrink-0 transition-colors"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}

interface FileGroupData {
  file: string
  hits: UsageHit[]
}

function groupByFile(hits: UsageHit[]): FileGroupData[] {
  const map = new Map<string, UsageHit[]>()
  for (const h of hits) {
    const arr = map.get(h.file)
    if (arr) arr.push(h)
    else map.set(h.file, [h])
  }
  return Array.from(map.entries()).map(([file, hits]) => ({ file, hits }))
}

function FileGroup({
  group,
  onJumpRef,
}: {
  group: FileGroupData
  onJumpRef: (ref: { file: string; lineStart: number }) => void
}): JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-border border-b">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-surface-hover flex w-full items-center gap-1 px-3 py-1 text-left text-[11px]"
      >
        {open ? (
          <ChevronDown size={11} aria-hidden className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={11} aria-hidden className="text-text-muted shrink-0" />
        )}
        <span className="text-text-secondary min-w-0 flex-1 truncate font-mono">{group.file}</span>
        <span className="text-text-muted shrink-0 text-[10px] tracking-wider uppercase">
          {group.hits.length} {group.hits.length === 1 ? 'hit' : 'hits'}
        </span>
      </button>
      {open &&
        group.hits.map((hit, idx) => (
          <HitRow key={`${hit.line}-${hit.column}-${idx}`} hit={hit} onJumpRef={onJumpRef} />
        ))}
    </div>
  )
}

function HitRow({
  hit,
  onJumpRef,
}: {
  hit: UsageHit
  onJumpRef: (ref: { file: string; lineStart: number }) => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onJumpRef({ file: hit.file, lineStart: hit.line })}
      className="hover:bg-surface-hover flex w-full items-start gap-2 px-3 py-1 text-left font-mono text-[11px]"
    >
      <span
        className={cn(
          'text-text-muted w-6 shrink-0 text-right tabular-nums',
          hit.classification === 'def' && 'text-text-brand',
        )}
        title={hit.classification === 'def' ? 'Definition site' : undefined}
      >
        {hit.classification === 'def' ? 'def' : hit.line}
      </span>
      <span className="text-text-secondary min-w-0 flex-1 break-words whitespace-pre-wrap">
        {hit.line}:{' '}
        <HighlightedLine text={hit.lineText} matchStart={hit.matchStart} matchEnd={hit.matchEnd} />
      </span>
    </button>
  )
}

function HighlightedLine({
  text,
  matchStart,
  matchEnd,
}: {
  text: string
  matchStart: number
  matchEnd: number
}): JSX.Element {
  const before = text.slice(0, matchStart)
  const match = text.slice(matchStart, matchEnd)
  const after = text.slice(matchEnd)
  return (
    <>
      {before}
      <span className="search-match">{match}</span>
      {after}
    </>
  )
}

function CenterMessage({
  children,
  tone,
}: {
  children: React.ReactNode
  tone?: 'danger'
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex h-full items-center justify-center p-6 text-center text-xs',
        tone === 'danger' ? 'text-text-danger' : 'text-text-muted',
      )}
    >
      {children}
    </div>
  )
}
