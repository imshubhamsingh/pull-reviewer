import { useCallback, useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'

interface Props {
  busy: boolean
  onSend: (message: string) => void | Promise<void>
  onCancel: () => void
  placeholder?: string
  /** External pre-fill payload — bump `nonce` to force the textarea to be
   *  re-seeded (e.g. when the user clicks "💬 Chat" on a line range). The
   *  nonce-keyed effect lets repeat clicks re-prefill even when the text is
   *  identical to the previous value. */
  prefill?: { text: string; nonce: number }
}

const MAX_ROWS = 8

/**
 * Multiline textarea with auto-grow + keyboard shortcuts:
 *  - Cmd/Ctrl+Enter → send
 *  - Esc            → cancel in-flight stream
 *
 * Plain Enter inserts a newline so users can compose multi-paragraph
 * questions without surprises. Send button is the explicit affordance.
 */
export function Composer({ busy, onSend, onCancel, placeholder, prefill }: Props): JSX.Element {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  // Auto-send the prefill payload (e.g. user clicked "Send to chat" on a
  // line range). The user already typed their question in the LineComposer
  // Chat tab, so a second Send click is just friction. If a stream is
  // already in flight (`busy`), fall back to pre-filling the textarea so
  // we don't drop the message — the user can hit Send themselves once
  // the previous turn settles. Keyed on nonce so repeat clicks re-fire.
  useEffect(() => {
    if (!prefill) return
    if (busy) {
      setValue(prefill.text)
      ref.current?.focus()
      return
    }
    setValue('')
    void onSend(prefill.text)
  }, [prefill?.nonce])

  // Auto-grow up to MAX_ROWS by toggling rows via scrollHeight.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 20 // matches text-sm leading
    const max = lineHeight * MAX_ROWS
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
  }, [value])

  const trySend = useCallback(async () => {
    const trimmed = value.trim()
    if (!trimmed || busy) return
    setValue('')
    await onSend(trimmed)
  }, [value, busy, onSend])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void trySend()
      } else if (e.key === 'Escape' && busy) {
        e.preventDefault()
        onCancel()
      }
    },
    [trySend, busy, onCancel],
  )

  return (
    <div className="border-border bg-bg shrink-0 border-t p-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder ?? 'Ask anything about this PR (Cmd-Enter to send)'}
          className="border-border bg-surface text-text-primary placeholder:text-text-muted min-w-0 flex-1 resize-none rounded-sm border px-2 py-1.5 text-sm outline-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={onCancel}
            className="bg-interactive-danger/15 text-text-danger hover:bg-interactive-danger/25 shrink-0 rounded-sm px-3 py-1.5 text-sm transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              void trySend()
            }}
            disabled={!value.trim()}
            className="bg-interactive-primary text-interactive-primary-fg hover:bg-interactive-primary-hover shrink-0 rounded-sm px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
