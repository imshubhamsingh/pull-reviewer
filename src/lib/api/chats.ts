import { match } from 'ts-pattern'
import { getBaseUrl, http } from '@/lib/api/base'
import { openSSE } from '@/lib/api/sse'
import type { PrChat, PrChatMessage } from '@/lib/api/types'

/**
 * Live SSE frame shape for `chats.sendStream`. Tool calls + partial text + the
 * terminal `done` (carrying the persisted assistant message) mirror what tour
 * generation emits, so the renderer can reuse the same activity-log helpers.
 */
export type ChatStreamEvent =
  | { event: 'tool_call'; data: { type: 'tool_call'; name: string; input: unknown } }
  | { event: 'partial_text'; data: { type: 'partial_text'; text: string } }
  | { event: 'final'; data: { type: 'final'; raw: string } }
  | { event: 'phase'; data: { type: 'phase'; name: string; detail?: string } }
  | { event: 'done'; data: PrChatMessage }
  | { event: 'error'; data: { message: string } }

export interface SendChatBody {
  message: string
}

export interface CreateChatBody {
  title?: string
}

export const chats = {
  list: (repo: string, prNumber: number) => http.get<PrChat[]>(`/api/chats/${repo}/${prNumber}`),

  create: (repo: string, prNumber: number, body: CreateChatBody = {}) =>
    http.post<PrChat>(`/api/chats/${repo}/${prNumber}`, body),

  listMessages: (repo: string, prNumber: number, chatId: number) =>
    http.get<PrChatMessage[]>(`/api/chats/${repo}/${prNumber}/${chatId}/messages`),

  /** Blocking send — returns both the persisted user turn and assistant reply. */
  send: (repo: string, prNumber: number, chatId: number, body: SendChatBody) =>
    http.post<{ userMessage: PrChatMessage; assistantMessage: PrChatMessage }>(
      `/api/chats/${repo}/${prNumber}/${chatId}/send`,
      body,
    ),

  /**
   * Streaming send — async generator yields tool_call / partial_text / phase
   * events while the model runs, then a terminal `done` carrying the assistant
   * message or `error` on failure.
   */
  sendStream: (
    repo: string,
    prNumber: number,
    chatId: number,
    body: SendChatBody,
    opts: { signal?: AbortSignal } = {},
  ) => streamSend(repo, prNumber, chatId, body, opts),

  rename: (chatId: number, title: string) => http.patch<PrChat>(`/api/chats/${chatId}`, { title }),

  remove: (chatId: number) => http.del<{ deleted: boolean }>(`/api/chats/${chatId}`),

  removeMessage: (id: number) => http.del<{ deleted: boolean }>(`/api/chats/messages/${id}`),

  /**
   * Persist a repaired mermaid source on one diagram inside an existing
   * message. Returns the updated message so callers can sync local state.
   * Used by the MermaidPane auto-fix flow on chat diagrams.
   */
  patchMessageMermaid: (messageId: number, diagramIndex: number, source: string) =>
    http.patch<PrChatMessage>(`/api/chats/messages/${messageId}/diagrams/${diagramIndex}/mermaid`, {
      source,
    }),
}

async function* streamSend(
  repo: string,
  prNumber: number,
  chatId: number,
  body: SendChatBody,
  opts: { signal?: AbortSignal },
): AsyncGenerator<ChatStreamEvent> {
  const base = await getBaseUrl()
  const url = `${base}/api/chats/${repo}/${prNumber}/${chatId}/send/stream`
  const init: RequestInit & { signal?: AbortSignal } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(opts.signal ? { signal: opts.signal } : {}),
  }
  for await (const msg of openSSE(url, init)) {
    const data: unknown = JSON.parse(msg.data)
    yield match(msg.event)
      .with('tool_call', () => ({ event: 'tool_call', data }) as ChatStreamEvent)
      .with('partial_text', () => ({ event: 'partial_text', data }) as ChatStreamEvent)
      .with('final', () => ({ event: 'final', data }) as ChatStreamEvent)
      .with('phase', () => ({ event: 'phase', data }) as ChatStreamEvent)
      .with('done', () => ({ event: 'done' as const, data: data as PrChatMessage }))
      .with('error', () => ({ event: 'error' as const, data: data as { message: string } }))
      .otherwise(() => ({
        event: 'partial_text' as const,
        data: { type: 'partial_text', text: msg.data },
      }))
  }
}
