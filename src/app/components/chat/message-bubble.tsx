import { MessageSquareQuote, X } from 'lucide-react'
import { marked } from 'marked'
import { useMemo, type JSX } from 'react'
import { match } from 'ts-pattern'
import { RefChips } from '@/app/components/chat/ref-chips'
import { cn } from '@/app/lib/utils'
import type { CodeRef, PrChatMessage } from '@/lib/api'

interface Props {
  message: PrChatMessage
  onDelete?: (id: number) => void
  onJumpRef?: (ref: CodeRef) => void
  onUseAsComment?: (message: PrChatMessage) => void | Promise<void>
}

/**
 * Renders one chat turn. User turns are right-aligned with a tinted surface;
 * assistant turns are left-aligned with prose styling. Empty streaming
 * assistants render a "thinking…" placeholder so the user has something to
 * look at while events flow into the activity tail below the list.
 */
export function MessageBubble({
  message,
  onDelete,
  onJumpRef,
  onUseAsComment,
}: Props): JSX.Element {
  const isUser = message.role === 'user'
  const refs =
    !isUser && message.references && message.references.length > 0 ? message.references : null
  const canUseAsComment =
    !isUser && refs != null && message.status === 'complete' && onUseAsComment != null
  return (
    <div className={cn('flex w-full px-3 py-2', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('group flex min-w-0 max-w-[90%] flex-col gap-1.5', isUser && 'order-2')}>
        <Header message={message} onDelete={onDelete} />
        <Body message={message} />
        {refs && onJumpRef && <RefChips refs={refs} onClick={onJumpRef} />}
        {canUseAsComment && (
          <button
            type="button"
            onClick={() => {
              void onUseAsComment(message)
            }}
            className="text-text-muted hover:text-text-primary inline-flex items-center gap-1 self-start text-[12px] transition-colors"
            title="Draft a review comment at the first reference"
          >
            <MessageSquareQuote size={12} aria-hidden />
            Use as comment
          </button>
        )}
      </div>
    </div>
  )
}

function Header({
  message,
  onDelete,
}: {
  message: PrChatMessage
  onDelete?: (id: number) => void
}): JSX.Element {
  const tone = message.role === 'user' ? 'You' : 'Assistant'
  return (
    <div className="text-text-muted mb-1 flex items-center justify-between gap-2 text-[11px] tracking-wider uppercase">
      <span>
        {tone}
        {statusSuffix(message.status)}
      </span>
      {onDelete && message.id > 0 && (
        <button
          type="button"
          onClick={() => onDelete(message.id)}
          className="text-text-muted hover:text-text-danger opacity-0 transition-all group-hover:opacity-100"
          aria-label="Delete message"
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  )
}

function Body({ message }: { message: PrChatMessage }): JSX.Element {
  const isUser = message.role === 'user'
  const renderedMarkdown = useMemo(() => {
    if (!message.body) return ''
    return marked.parse(message.body, { async: false }) as string
  }, [message.body])

  if (message.status === 'streaming' && !message.body) {
    return (
      <div className="border-border bg-surface text-text-muted rounded-md border px-3 py-2 text-sm italic">
        thinking…
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm leading-relaxed',
        isUser
          ? 'border-text-brand/30 bg-surface text-text-primary'
          : 'border-border bg-bg text-text-secondary',
        message.status === 'error' && 'border-text-danger/40 text-text-danger',
        message.status === 'interrupted' && 'opacity-80',
      )}
    >
      {isUser ? (
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      ) : (
        <div
          className="markdown min-w-0 break-words"
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      )}
    </div>
  )
}

function statusSuffix(status: PrChatMessage['status']): string {
  return match(status)
    .with('streaming', () => ' · streaming')
    .with('interrupted', () => ' · interrupted')
    .with('error', () => ' · error')
    .with('complete', () => '')
    .exhaustive()
}
