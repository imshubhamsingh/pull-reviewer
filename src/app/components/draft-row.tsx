import { useState, type JSX } from 'react'
import { LineComposer } from '@/app/components/line-composer'
import { MarkdownView } from '@/app/components/markdown-view'
import type { AskStreamEvent, QaThread, ReviewDraft } from '@/lib/api'

interface Props {
  draft: ReviewDraft
  /** Repo path of the file the draft is anchored to — used to build the Ask AI context. */
  file: string
  /** Head SHA the draft was authored against — used to build the Ask AI context. */
  sha: string
  onUpdate: (id: number, body: string) => Promise<void>
  onReanchor: (id: number, line: number, startLine: number | null) => Promise<void>
  onDelete: (id: number) => Promise<void>
  /** When wired, the edit-mode composer also surfaces the ✨ Ask AI tab. */
  onAskAiStream?: (
    input: { file: string; sha: string; startLine: number; endLine: number; question: string },
    onEvent: (e: AskStreamEvent) => void,
  ) => Promise<QaThread>
}

export function DraftRow({
  draft,
  file,
  sha,
  onUpdate,
  onReanchor,
  onDelete,
  onAskAiStream,
}: Props): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [rangeEditing, setRangeEditing] = useState(false)

  if (editing) {
    const startLine = Math.min(draft.startLine ?? draft.line, draft.line)
    const endLine = Math.max(draft.startLine ?? draft.line, draft.line)
    return (
      <LineComposer
        initial={draft.body}
        saveLabel="Save changes"
        askContext={onAskAiStream ? { file, sha, startLine, endLine } : undefined}
        onAskStream={
          onAskAiStream
            ? (question, onEvent) =>
                onAskAiStream({ file, sha, startLine, endLine, question }, onEvent)
            : undefined
        }
        onSave={async (body) => {
          await onUpdate(draft.id, body)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const startLine = Math.min(draft.startLine ?? draft.line, draft.line)
  const endLine = Math.max(draft.startLine ?? draft.line, draft.line)
  const rangeLabel = startLine === endLine ? `line ${endLine}` : `lines ${startLine}–${endLine}`
  return (
    <div className="border-border bg-surface mx-3 my-1 rounded-md border p-2 text-xs whitespace-normal">
      <div className="text-text-muted mb-1 flex items-center justify-between gap-2 text-[10px] tracking-wider uppercase">
        {rangeEditing ? (
          <RangeEditor
            initialStart={startLine}
            initialEnd={endLine}
            onSave={async (newStart, newEnd) => {
              await onReanchor(draft.id, newEnd, newStart === newEnd ? null : newStart)
              setRangeEditing(false)
            }}
            onCancel={() => setRangeEditing(false)}
          />
        ) : (
          <>
            <span>
              Pending review comment · {rangeLabel}
              {draft.lastSubmitError && (
                <span
                  className="bg-interactive-danger/20 text-text-danger ml-2 rounded-sm px-1.5 py-0.5 text-[9px] font-medium normal-case"
                  title={draft.lastSubmitError}
                >
                  Cannot be submitted · {draft.lastSubmitError}
                </span>
              )}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRangeEditing(true)}
                className="text-text-secondary hover:text-text-primary normal-case transition-colors"
              >
                Range
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-text-secondary hover:text-text-primary normal-case transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  void onDelete(draft.id)
                }}
                className="text-text-danger normal-case transition-opacity hover:opacity-80"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
      <MarkdownView body={draft.body} className="text-text-primary" />
    </div>
  )
}

function RangeEditor({
  initialStart,
  initialEnd,
  onSave,
  onCancel,
}: {
  initialStart: number
  initialEnd: number
  onSave: (start: number, end: number) => Promise<void>
  onCancel: () => void
}): JSX.Element {
  const [start, setStart] = useState(String(initialStart))
  const [end, setEnd] = useState(String(initialEnd))
  const [busy, setBusy] = useState(false)
  const lo = Number(start)
  const hi = Number(end)
  const valid =
    Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && hi >= 1 && lo <= hi && !busy
  const save = async (): Promise<void> => {
    if (!valid) return
    setBusy(true)
    try {
      await onSave(lo, hi)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex w-full items-center gap-2 normal-case">
      <span className="text-text-muted">Lines</span>
      <input
        type="number"
        min={1}
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="bg-bg border-border text-text-primary w-16 rounded-sm border px-1 py-0.5 text-[11px] outline-none"
      />
      <span className="text-text-muted">–</span>
      <input
        type="number"
        min={1}
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="bg-bg border-border text-text-primary w-16 rounded-sm border px-1 py-0.5 text-[11px] outline-none"
      />
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-text-secondary hover:text-text-primary text-[11px] transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            void save()
          }}
          disabled={!valid}
          className="bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-fg rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
