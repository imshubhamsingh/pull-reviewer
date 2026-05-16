import { useEffect, useRef, type JSX } from 'react'
import { MessageBubble } from '@/app/components/chat/message-bubble'
import { activityView } from '@/app/lib/activity-log'
import type { ChatStreamEvent, CodeRef, PrChatMessage } from '@/lib/api'

interface Props {
  messages: PrChatMessage[]
  streaming: boolean
  streamEvents: ChatStreamEvent[]
  onDeleteMessage: (id: number) => void
  onJumpRef: (ref: CodeRef) => void
  onUseAsComment: (message: PrChatMessage) => void | Promise<void>
}

export function MessageList({
  messages,
  streaming,
  streamEvents,
  onDeleteMessage,
  onJumpRef,
  onUseAsComment,
}: Props): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Snap to the bottom whenever messages change or new stream events arrive.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, streamEvents])

  if (messages.length === 0) {
    return <EmptyState />
  }

  const { tail, thinking } = activityView(streamEvents)

  return (
    <div ref={scrollRef} className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onDelete={onDeleteMessage}
            onJumpRef={onJumpRef}
            onUseAsComment={onUseAsComment}
          />
        ))}
      </div>
      {streaming && (tail.length > 0 || thinking) && (
        <div className="border-border text-text-muted mx-3 mb-3 mt-1 rounded-md border border-dashed px-3 py-2 font-mono text-[11px]">
          {tail.length > 0 && (
            <ul className="space-y-0.5">
              {tail.map((line, i) => (
                <li key={i} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
          )}
          {thinking && <p className="text-text-muted/70 mt-1 truncate italic">… {thinking}</p>}
        </div>
      )}
    </div>
  )
}

function EmptyState(): JSX.Element {
  return (
    <div className="text-text-muted flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-xs">
      <p className="text-text-secondary text-sm">Ask the AI anything about this PR.</p>
      <ul className="text-text-muted space-y-1 text-[11px]">
        <li>· Walk me through the new API surface</li>
        <li>· Where exactly is auth enforced?</li>
        <li>· Any risky edge cases in this diff?</li>
      </ul>
    </div>
  )
}
