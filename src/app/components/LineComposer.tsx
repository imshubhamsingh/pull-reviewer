import { useState, type JSX } from 'react'

interface Props {
  initial?: string
  onSave: (body: string) => Promise<void>
  onCancel: () => void
  saveLabel?: string
}

export function LineComposer({ initial = '', onSave, onCancel, saveLabel = 'Add comment' }: Props): JSX.Element {
  const [body, setBody] = useState(initial)
  const [busy, setBusy] = useState(false)
  const canSave = body.trim().length > 0 && !busy

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try { await onSave(body.trim()) }
    finally { setBusy(false) }
  }

  return (
    <div className="border-border bg-surface mx-3 my-1 rounded-md border p-2">
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
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-text-secondary hover:text-text-primary text-xs transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => { void save() }}
          disabled={!canSave}
          className="bg-interactive-primary hover:bg-interactive-primary-hover text-interactive-primary-fg rounded-sm px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  )
}
