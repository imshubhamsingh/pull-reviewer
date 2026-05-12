import { useState, type JSX } from 'react'
import { LineComposer } from '@/app/components/LineComposer'
import type { ReviewDraft } from '@/lib/api'

interface Props {
  draft: ReviewDraft
  onUpdate: (id: number, body: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export function DraftRow({ draft, onUpdate, onDelete }: Props): JSX.Element {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <LineComposer
        initial={draft.body}
        saveLabel="Save changes"
        onSave={async (body) => {
          await onUpdate(draft.id, body)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const range = draft.startLine != null && draft.startLine !== draft.line
    ? `lines ${Math.min(draft.startLine, draft.line)}–${Math.max(draft.startLine, draft.line)}`
    : `line ${draft.line}`
  return (
    <div className="border-border bg-surface mx-3 my-1 rounded-md border p-2 text-xs">
      <div className="text-text-muted mb-1 flex items-center justify-between text-[10px] tracking-wider uppercase">
        <span>Pending review comment · {range}</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-text-secondary hover:text-text-primary normal-case transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => { void onDelete(draft.id) }}
            className="text-text-danger hover:opacity-80 normal-case transition-opacity"
          >
            Delete
          </button>
        </div>
      </div>
      <p className="text-text-primary whitespace-pre-wrap leading-relaxed">{draft.body}</p>
    </div>
  )
}
