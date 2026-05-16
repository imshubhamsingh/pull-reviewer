import { useState, type JSX } from 'react'
import type { AskStreamEvent, QaThread } from '@/lib/api'
import { AskAiPanel, type AskContext } from '@/app/components/ask-ai-panel'

interface Props {
  initial?: string
  rangeLabel?: string
  /** When provided, an "Ask AI" toggle is shown that opens an inline AskAiPanel. */
  askContext?: AskContext
  onAskStream?: (question: string, onEvent: (e: AskStreamEvent) => void) => Promise<QaThread>
  onSave: (body: string) => Promise<void>
  onCancel: () => void
  saveLabel?: string
}

export function LineComposer({
  initial = '',
  rangeLabel,
  askContext,
  onAskStream,
  onSave,
  onCancel,
  saveLabel = 'Add comment',
}: Props): JSX.Element {
  const [body, setBody] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const canSave = body.trim().length > 0 && !busy
  const canAsk = !!askContext && !!onAskStream

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      await onSave(body.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-border bg-surface mx-3 my-1 rounded-md border p-2">
      {rangeLabel && (
        <p className="text-text-muted mb-1 text-[10px] tracking-wider uppercase">
          Comment on {rangeLabel}
        </p>
      )}
      {askOpen && askContext && onAskStream && (
        <AskAiPanel
          context={askContext}
          onAskStream={onAskStream}
          onUseAsComment={(text) => setBody((prev) => (prev ? `${prev}\n\n${text}` : text))}
        />
      )}
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void save()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="Leave a review comment… (⌘↵ to save, Esc to cancel)"
        rows={3}
        className="bg-bg border-border text-text-primary w-full resize-y rounded-sm border px-2 py-1 text-xs leading-relaxed outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        {canAsk ? (
          <button
            type="button"
            onClick={() => setAskOpen((v) => !v)}
            className="text-text-secondary hover:text-text-primary text-xs transition-colors"
          >
            {askOpen ? '× Close Ask AI' : '✨ Ask AI'}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-text-secondary hover:text-text-primary text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void save()
            }}
            disabled={!canSave}
            className="bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-fg rounded-sm px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
