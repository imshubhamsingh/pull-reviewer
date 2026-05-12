import { match } from 'ts-pattern'
import { getBaseUrl, http } from '@/lib/api/base'
import { openSSE } from '@/lib/api/sse'
import type { AskAiInput, QaThread } from '@/lib/api/types'

export type AskStreamEvent =
  | { event: 'tool_call'; data: { type: 'tool_call'; name: string; input: unknown } }
  | { event: 'partial_text'; data: { type: 'partial_text'; text: string } }
  | { event: 'final'; data: { type: 'final'; raw: string } }
  | { event: 'done'; data: QaThread }
  | { event: 'error'; data: { message: string } }

export const qa = {
  list: (repo: string, prNumber: number) =>
    http.get<QaThread[]>(`/api/explain/${repo}/${prNumber}/threads`),
  ask: (repo: string, prNumber: number, input: AskAiInput) =>
    http.post<QaThread>(`/api/explain/${repo}/${prNumber}/ask`, input),
  askStream: (
    repo: string,
    prNumber: number,
    input: AskAiInput,
    opts: { signal?: AbortSignal } = {},
  ) => streamAsk(repo, prNumber, input, opts),
  remove: (id: number) =>
    http.del<{ deleted: boolean }>(`/api/explain/threads/${id}`),
}

async function* streamAsk(
  repo: string,
  prNumber: number,
  input: AskAiInput,
  opts: { signal?: AbortSignal },
): AsyncGenerator<AskStreamEvent> {
  const base = await getBaseUrl()
  const url = `${base}/api/explain/${repo}/${prNumber}/ask/stream`
  const init: RequestInit & { signal?: AbortSignal } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    ...(opts.signal ? { signal: opts.signal } : {}),
  }
  for await (const msg of openSSE(url, init)) {
    const data: unknown = JSON.parse(msg.data)
    yield match(msg.event)
      .with('tool_call', () => ({ event: 'tool_call', data }) as AskStreamEvent)
      .with('partial_text', () => ({ event: 'partial_text', data }) as AskStreamEvent)
      .with('final', () => ({ event: 'final', data }) as AskStreamEvent)
      .with('done', () => ({ event: 'done' as const, data: data as QaThread }))
      .with('error', () => ({ event: 'error' as const, data: data as { message: string } }))
      .otherwise(() => ({ event: 'partial_text' as const, data: { type: 'partial_text', text: msg.data } }))
  }
}
