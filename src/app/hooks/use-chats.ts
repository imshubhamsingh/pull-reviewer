import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ChatStreamEvent, type PrChat, type PrChatMessage } from '@/lib/api'

export interface ChatsState {
  chats: PrChat[]
  activeChatId: number | null
  messages: PrChatMessage[]
  loading: boolean
  streaming: boolean
  streamEvents: ChatStreamEvent[] // live tool_call / partial_text tail for the in-flight message
  error: string | undefined

  selectChat: (id: number) => void
  newChat: () => Promise<PrChat>
  send: (message: string) => Promise<void>
  cancel: () => void
  rename: (id: number, title: string) => Promise<void>
  deleteChat: (id: number) => Promise<void>
  deleteMessage: (id: number) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Hook owning the chat list + active chat + active stream for a single PR.
 *
 * Streaming flow:
 *   1. Append the user message + a temporary assistant placeholder (status='streaming').
 *   2. Pump SSE events into `streamEvents` (rendered as activity tail by ChatPane).
 *   3. On `done`, replace the placeholder with the persisted assistant row.
 *   4. On `error`, mark the placeholder body with the error text + status='error'.
 *   5. On cancel, abort the underlying fetch; backend persists the partial body
 *      with status='interrupted' and the `done` event still arrives carrying it.
 */
export function useChats(repo: string, prNumber: number): ChatsState {
  const [chats, setChats] = useState<PrChat[]>([])
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [messages, setMessages] = useState<PrChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [streamEvents, setStreamEvents] = useState<ChatStreamEvent[]>([])
  const [error, setError] = useState<string | undefined>()

  const abortRef = useRef<AbortController | null>(null)
  const placeholderIdRef = useRef<number | null>(null)

  // -------- list + active chat ---------

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.chats.list(repo, prNumber)
      setChats(list)
      setError(undefined)
      // Pin the most-recent chat on initial load; explicit selection wins after.
      setActiveChatId((current) => current ?? list[0]?.id ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [repo, prNumber])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (activeChatId == null) {
      setMessages([])
      return
    }
    void (async () => {
      try {
        const list = await api.chats.listMessages(repo, prNumber, activeChatId)
        setMessages(list)
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [repo, prNumber, activeChatId])

  // -------- chat lifecycle ---------

  const selectChat = useCallback((id: number) => {
    cancelStream(abortRef)
    setActiveChatId(id)
    setStreamEvents([])
  }, [])

  const newChat = useCallback(async () => {
    const chat = await api.chats.create(repo, prNumber)
    setChats((prev) => [chat, ...prev])
    setActiveChatId(chat.id)
    setMessages([])
    return chat
  }, [repo, prNumber])

  const rename = useCallback(async (id: number, title: string) => {
    const updated = await api.chats.rename(id, title)
    setChats((prev) => prev.map((c) => (c.id === id ? updated : c)))
  }, [])

  const deleteChat = useCallback(async (id: number) => {
    await api.chats.remove(id)
    setChats((prev) => prev.filter((c) => c.id !== id))
    setActiveChatId((current) => (current === id ? null : current))
  }, [])

  const deleteMessage = useCallback(async (id: number) => {
    await api.chats.removeMessage(id)
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  // -------- send + cancel ---------

  const send = useCallback(
    async (message: string) => {
      const trimmed = message.trim()
      if (!trimmed || streaming) return
      let chatId = activeChatId
      if (chatId == null) {
        const created = await newChat()
        chatId = created.id
      }
      cancelStream(abortRef)
      const ac = new AbortController()
      abortRef.current = ac

      // Optimistic: user turn + assistant placeholder. The real rows arrive via `done`.
      const now = new Date().toISOString()
      const tempUserId = -Date.now()
      const tempAssistantId = -Date.now() - 1
      placeholderIdRef.current = tempAssistantId
      setMessages((prev) => [
        ...prev,
        {
          id: tempUserId,
          chatId,
          role: 'user',
          body: trimmed,
          references: null,
          diagrams: null,
          status: 'complete',
          model: null,
          createdAt: now,
        },
        {
          id: tempAssistantId,
          chatId,
          role: 'assistant',
          body: '',
          references: null,
          diagrams: null,
          status: 'streaming',
          model: null,
          createdAt: now,
        },
      ])
      setStreaming(true)
      setStreamEvents([])
      setError(undefined)

      try {
        for await (const evt of api.chats.sendStream(
          repo,
          prNumber,
          chatId,
          { message: trimmed },
          { signal: ac.signal },
        )) {
          setStreamEvents((prev) => [...prev, evt])
          if (evt.event === 'partial_text') {
            // Stream raw model text into the bubble so the user sees progress
            // instead of "thinking…". The body gets replaced with the parsed
            // envelope markdown on `done`; the raw JSON envelope shell that
            // wraps it is fine to flash briefly here.
            const chunk = evt.data.text
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId && m.status === 'streaming'
                  ? { ...m, body: m.body + chunk }
                  : m,
              ),
            )
          } else if (evt.event === 'done') {
            setMessages((prev) => prev.map((m) => (m.id === tempAssistantId ? evt.data : m)))
            // Bump this chat to the top of the list (updated_at moved server-side).
            setChats((prev) => bumpChat(prev, chatId))
          } else if (evt.event === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === tempAssistantId ? { ...m, body: evt.data.message, status: 'error' } : m,
              ),
            )
            setError(evt.data.message)
          }
        }
      } catch (e) {
        const message = (e as Error).message
        // AbortController.abort() throws a DOMException with name='AbortError'.
        if (ac.signal.aborted) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId && m.status === 'streaming'
                ? { ...m, status: 'interrupted' }
                : m,
            ),
          )
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId ? { ...m, body: message, status: 'error' } : m,
            ),
          )
          setError(message)
        }
      } finally {
        setStreaming(false)
        placeholderIdRef.current = null
        if (abortRef.current === ac) abortRef.current = null
        // SSE-close-without-done race: the stream may end without yielding a
        // `done` event even though the backend persisted the final message.
        // Re-fetch THIS chat's messages directly — going through `refresh()`
        // would read its stale-closure `activeChatId` (null at send-time on a
        // brand-new chat) and wipe the message list. The setter callback
        // checks the user is still viewing this chat before overwriting.
        if (!ac.signal.aborted && chatId != null) {
          api.chats.listMessages(repo, prNumber, chatId).then(
            (list) => {
              setMessages((current) => {
                const stillHere = current.some((m) => m.chatId === chatId)
                return stillHere ? list : current
              })
            },
            () => {
              /* network glitch — leave the optimistic state in place. */
            },
          )
        }
      }
    },
    [activeChatId, newChat, repo, prNumber, streaming],
  )

  const cancel = useCallback(() => {
    cancelStream(abortRef)
  }, [])

  // Tear down the active stream on unmount so a navigation away doesn't leak it.
  useEffect(() => () => cancelStream(abortRef), [])

  return {
    chats,
    activeChatId,
    messages,
    loading,
    streaming,
    streamEvents,
    error,
    selectChat,
    newChat,
    send,
    cancel,
    rename,
    deleteChat,
    deleteMessage,
    refresh,
  }
}

function cancelStream(ref: { current: AbortController | null }): void {
  ref.current?.abort()
  ref.current = null
}

function bumpChat(list: PrChat[], chatId: number): PrChat[] {
  const idx = list.findIndex((c) => c.id === chatId)
  if (idx <= 0) return list
  const bumped = list[idx]
  if (!bumped) return list
  return [bumped, ...list.slice(0, idx), ...list.slice(idx + 1)]
}
