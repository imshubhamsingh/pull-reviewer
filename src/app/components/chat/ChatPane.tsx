import { type JSX } from 'react'
import { ChatHeader } from '@/app/components/chat/ChatHeader'
import { Composer } from '@/app/components/chat/Composer'
import { MessageList } from '@/app/components/chat/MessageList'
import { useChats } from '@/app/hooks/useChats'
import type { CodeRef, PrChatMessage } from '@/lib/api'

interface Props {
  repo: string
  prNumber: number
  tourReady: boolean
  onRegenerate: () => void
  onJumpRef: (ref: CodeRef) => void
  onUseAsComment: (message: PrChatMessage) => void | Promise<void>
}

/**
 * Right-pane chat surface. Three vertical regions:
 *
 *   ChatHeader (selector + new / rename / delete)
 *   MessageList (scroll-y; activity tail when streaming)
 *   Composer (auto-grow textarea + Send/Stop)
 *
 * Gated on `tourReady` because the chat backend needs the tour's worktree at
 * the PR's head sha. The no-tour state surfaces an explicit Regenerate CTA.
 */
export function ChatPane({ repo, prNumber, tourReady, onRegenerate, onJumpRef, onUseAsComment }: Props): JSX.Element {
  const chat = useChats(repo, prNumber)

  if (!tourReady) {
    return (
      <div className="text-text-muted flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-xs">
        <p className="text-text-secondary text-sm">Chat needs the PR's tour to be generated.</p>
        <p>The AI uses the tour's worktree to read code from the PR's head sha.</p>
        <button
          type="button"
          onClick={onRegenerate}
          className="bg-interactive-primary text-interactive-primary-fg hover:bg-interactive-primary-hover mt-2 rounded-sm px-3 py-1.5 text-xs transition-colors"
        >
          Generate tour
        </button>
      </div>
    )
  }

  if (chat.loading) {
    return (
      <div className="text-text-muted flex h-full items-center justify-center text-xs">
        Loading chats…
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        chats={chat.chats}
        activeChatId={chat.activeChatId}
        onSelect={chat.selectChat}
        onNew={() => { void chat.newChat() }}
        onRename={chat.rename}
        onDelete={chat.deleteChat}
      />
      <div className="min-h-0 flex-1">
        <MessageList
          messages={chat.messages}
          streaming={chat.streaming}
          streamEvents={chat.streamEvents}
          onDeleteMessage={chat.deleteMessage}
          onJumpRef={onJumpRef}
          onUseAsComment={onUseAsComment}
        />
      </div>
      {chat.error && (
        <p className="text-text-danger border-border shrink-0 border-t px-3 py-1 text-[11px]">
          {chat.error}
        </p>
      )}
      <Composer busy={chat.streaming} onSend={chat.send} onCancel={chat.cancel} />
    </div>
  )
}
