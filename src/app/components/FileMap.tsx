import { match } from 'ts-pattern'
import type { JSX } from 'react'
import { cn } from '@/app/lib/utils'
import type { FileCoverage, FileCoverageKind } from '@/app/hooks/useFileCoverage'
import type { PrFile } from '@/lib/api'

interface Props {
  files: PrFile[]
  currentFile?: string
  coverage: FileCoverage
  onPick: (path: string) => void
}

export function FileMap({ files, currentFile, coverage, onPick }: Props): JSX.Element {
  if (files.length === 0) {
    return (
      <div className="text-text-muted flex h-full items-center justify-center p-4 text-center text-xs">
        No files in this PR.
      </div>
    )
  }
  return (
    <ul className="h-full overflow-y-auto py-1">
      {files.map((f) => (
        <li key={f.path}>
          <FileRow
            file={f}
            active={f.path === currentFile}
            kind={coverage.kind(f.path)}
            chapter={coverage.firstChapter(f.path)}
            chapterIdx={coverage.firstChapterIdx(f.path)}
            onPick={onPick}
          />
        </li>
      ))}
    </ul>
  )
}

interface RowProps {
  file: PrFile
  active: boolean
  kind: FileCoverageKind
  chapter: string | undefined
  chapterIdx: number | undefined
  onPick: (path: string) => void
}

function FileRow({ file, active, kind, chapter, chapterIdx, onPick }: RowProps): JSX.Element {
  const jumpable = kind !== 'uncovered'
  return (
    <button
      type="button"
      disabled={!jumpable}
      onClick={() => onPick(file.path)}
      title={tooltipFor(file.path, kind, chapter)}
      className={cn(
        'flex w-full items-center gap-2 border-l-2 px-3 py-1.5 text-left text-xs transition-colors',
        active
          ? 'border-text-brand bg-surface-hover text-text-primary'
          : 'border-transparent',
        !active && kind === 'pinned' && 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        !active && kind === 'referenced' && 'text-text-secondary/80 hover:bg-surface-hover hover:text-text-primary italic',
        !active && kind === 'uncovered' && 'text-text-muted cursor-default opacity-60',
      )}
    >
      <CoverageDot kind={kind} active={active} />
      <PathLabel path={file.path} />
      <ChapterBadge idx={chapterIdx} kind={kind} />
      <DiffCount additions={file.additions} deletions={file.deletions} />
    </button>
  )
}

function CoverageDot({ kind, active }: { kind: FileCoverageKind; active: boolean }): JSX.Element {
  // Pinned and referenced both look "in the tour" — solid bullet. Only uncovered is hollow.
  const className = match(kind)
    .with('pinned', () => active ? 'text-text-brand' : 'text-text-secondary')
    .with('referenced', () => 'text-text-secondary/70')
    .with('uncovered', () => 'text-text-muted/40')
    .exhaustive()
  const glyph = kind === 'uncovered' ? '○' : '●'
  return <span aria-hidden className={cn('text-[8px] leading-none', className)}>{glyph}</span>
}

function ChapterBadge({ idx, kind }: { idx: number | undefined; kind: FileCoverageKind }): JSX.Element {
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
  return (
    <span className="flex min-w-0 flex-1 items-baseline font-mono">
      {dir && <span className="text-text-muted truncate">{dir}</span>}
      <span className="shrink-0">{name}</span>
    </span>
  )
}

function DiffCount({ additions, deletions }: { additions: number; deletions: number }): JSX.Element {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums">
      <span className="text-green-400">+{additions}</span>
      <span className="text-red-400">−{deletions}</span>
    </span>
  )
}

function tooltipFor(path: string, kind: FileCoverageKind, chapter: string | undefined): string {
  return match(kind)
    .with('pinned', () => chapter ? `${path}\nPinned in: ${chapter}` : path)
    .with('referenced', () => chapter ? `${path}\nReferenced in: ${chapter}` : path)
    .with('uncovered', () => `${path}\nNot covered by the tour`)
    .exhaustive()
}
