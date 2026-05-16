import { marked } from 'marked'
import { useMemo, type JSX } from 'react'
import type { QaThread } from '@/lib/api'

interface Props {
  thread: QaThread
  onDelete?: (id: number) => Promise<void>
}

/** Read-only Q&A card rendered in the docs pane below the step body. */
export function QaThreadCard({ thread, onDelete }: Props): JSX.Element {
  const range =
    thread.startLine === thread.endLine
      ? `line ${thread.startLine}`
      : `lines ${thread.startLine}–${thread.endLine}`
  const answerHtml = useMemo(
    () => marked.parse(thread.answer, { async: false }) as string,
    [thread.answer],
  )
  return (
    <section className="border-border bg-surface mt-3 space-y-2 rounded-md border p-3">
      <header className="text-text-muted flex items-center justify-between text-[10px] tracking-wider uppercase">
        <span>
          <span aria-hidden>✨</span> AI · {range} ·{' '}
          <span className="font-mono">{thread.file}</span>
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={() => {
              void onDelete(thread.id)
            }}
            className="text-text-danger hover:opacity-80 normal-case transition-opacity"
          >
            Delete
          </button>
        )}
      </header>
      <p className="text-text-primary text-xs">
        <span className="text-text-muted">Q:</span> {thread.question}
      </p>
      <div
        className="markdown text-text-secondary text-xs leading-relaxed"
        dangerouslySetInnerHTML={{ __html: answerHtml }}
      />
    </section>
  )
}
