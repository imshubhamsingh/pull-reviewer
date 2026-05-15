import { X } from 'lucide-react'
import { match } from 'ts-pattern'
import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { CodeLines, type ComposerTarget } from '@/app/components/CodeLines'
import { useFileSnapshot } from '@/app/hooks/useFileSnapshot'
import { useGutterSelection } from '@/app/hooks/useGutterSelection'
import { useShiki } from '@/app/hooks/useShiki'
import { inferLang } from '@/app/lib/code-utils'
import { cn } from '@/app/lib/utils'
import type { QaThreads } from '@/app/hooks/useQaThreads'
import type { ReviewDrafts } from '@/app/hooks/useReviewDrafts'
import type { CodeRef, FileSnapshot } from '@/lib/api'

interface Props {
  repo: string
  headSha: string
  baseSha: string | null
  ref: CodeRef
  drafts: ReviewDrafts
  qa: QaThreads
  onClose: () => void
}

/**
 * Center-pane fallback for refs pointing at a file the tour didn't pin.
 * Same syntax-highlighted, gutter-draftable surface as the regular CodePane —
 * differences are the header (close button, "from chat" label) and the
 * head→base sha fallback (chat refs sometimes target deleted files that only
 * exist at the base sha).
 */
export function StandaloneCodeView({ repo, headSha, baseSha, ref, drafts, qa, onClose }: Props): JSX.Element {
  const [currentSha, setCurrentSha] = useState(headSha)
  useEffect(() => { setCurrentSha(headSha) }, [headSha, ref.file])
  const snapshot = useFileSnapshot(repo, currentSha, ref.file)
  const hl = useShiki()

  // If head returned a "missing file" snapshot (deleted in this PR) and a base
  // sha is available, retry there automatically — the chat ref's lines were
  // describing the pre-deletion contents.
  useEffect(() => {
    if (snapshot.kind !== 'ready') return
    if (currentSha !== headSha) return
    if (snapshot.snap.encoding === 'omitted' && snapshot.snap.size === 0 && baseSha) {
      setCurrentSha(baseSha)
    }
  }, [snapshot, currentSha, headSha, baseSha])

  const viewingBase = currentSha !== headSha
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header file={ref.file} ref={ref} viewingBase={viewingBase} onClose={onClose} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {match(snapshot)
          .with({ kind: 'idle' }, () => <EmptyState>No file selected.</EmptyState>)
          .with({ kind: 'loading' }, () => <EmptyState>Loading file…</EmptyState>)
          .with({ kind: 'error' }, ({ message }) => <EmptyState tone="danger">{message}</EmptyState>)
          .with({ kind: 'ready' }, ({ snap }) => (
            <ReadyBody snap={snap} ref={ref} sha={currentSha} drafts={drafts} qa={qa} hl={hl} viewingBase={viewingBase} />
          ))
          .exhaustive()}
      </div>
    </div>
  )
}

interface ReadyBodyProps {
  snap: FileSnapshot
  ref: CodeRef
  sha: string
  drafts: ReviewDrafts
  qa: QaThreads
  hl: ReturnType<typeof useShiki>
  viewingBase: boolean
}

function ReadyBody({ snap, ref, sha, drafts, qa, hl, viewingBase }: ReadyBodyProps): JSX.Element {
  const [composer, setComposer] = useState<ComposerTarget | null>(null)
  const selection = useGutterSelection({
    onCommit: (range) => setComposer({ startLine: range.startLine, endLine: range.endLine }),
  })

  if (snap.encoding === 'omitted') {
    if (snap.size === 0) {
      return <EmptyState>File not present at this revision — likely deleted in this PR.</EmptyState>
    }
    return <EmptyState>File too large to display inline ({formatBytes(snap.size)}). Open in GitHub to view.</EmptyState>
  }
  if (snap.encoding === 'base64' || !snap.content) {
    return <EmptyState>Binary file ({formatBytes(snap.size)}) — preview not supported.</EmptyState>
  }
  if (!hl) return <EmptyState>Loading highlighter…</EmptyState>

  const start = ref.lineStart
  const end = ref.lineEnd ?? ref.lineStart
  const focusLines = new Set<number>([start])
  const range = { start, end }
  const fileDrafts = drafts.drafts.filter((d) => d.file === ref.file)

  return (
    <CodeLines
      highlighter={hl}
      content={snap.content}
      lang={inferLang(ref.file)}
      file={ref.file}
      sha={sha}
      focusLines={focusLines}
      scrollTo={start}
      range={range}
      drafts={fileDrafts}
      composer={composer}
      selection={selection}
      onCloseComposer={() => { setComposer(null); selection.clear() }}
      onAskAiStream={(input, onEvent) => qa.askStream(input, { onEvent })}
      onSaveDraft={async (target, body) => {
        const lo = Math.min(target.startLine, target.endLine)
        const hi = Math.max(target.startLine, target.endLine)
        await drafts.add({
          file: ref.file,
          line: hi,
          startLine: lo === hi ? null : lo,
          // If we fell back to base sha because the file was deleted, the
          // comment belongs on the 'before' side so GitHub anchors it at the
          // pre-deletion lines (instead of failing on a non-existent line).
          side: viewingBase ? 'before' : 'after',
          body,
        })
        setComposer(null)
        selection.clear()
      }}
      onUpdateDraft={drafts.update}
      onDeleteDraft={drafts.remove}
    />
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function Header({ file, ref, viewingBase, onClose }: { file: string; ref: CodeRef; viewingBase: boolean; onClose: () => void }): JSX.Element {
  return (
    <div className="border-border bg-surface flex shrink-0 items-center justify-between border-b px-3 py-1.5">
      <div className="min-w-0 flex-1 truncate font-mono text-xs">
        <span className="text-text-secondary">{file}</span>
        <span className="text-text-muted">:{formatRange(ref)}</span>
      </div>
      {viewingBase && (
        <span className="text-amber-400 shrink-0 px-2 text-[10px] tracking-wider uppercase" title="File deleted in this PR — showing pre-deletion contents from the base sha">
          Base · before
        </span>
      )}
      <span className="text-text-muted shrink-0 px-2 text-[10px] tracking-wider uppercase">From chat</span>
      <button
        type="button"
        onClick={onClose}
        className="text-text-secondary hover:text-text-primary shrink-0 transition-colors"
        aria-label="Close standalone view"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}

function formatRange(ref: CodeRef): string {
  const { lineStart: s, lineEnd: e } = ref
  return e != null && e !== s ? `${s}-${e}` : String(s)
}

function EmptyState({ children, tone }: { children: ReactNode; tone?: 'danger' }): JSX.Element {
  return (
    <div className={cn(
      'flex h-full items-center justify-center p-6 text-center text-xs',
      tone === 'danger' ? 'text-text-danger' : 'text-text-muted',
    )}>
      {children}
    </div>
  )
}
