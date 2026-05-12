/**
 * Minimal SSE client over `fetch`. Yields `{ event, data }` records as the
 * server emits them. Why not `EventSource`?
 *  - EventSource doesn't support POST (and our generate-stream is POST).
 *  - We need to forward an abort signal cleanly.
 *
 * Parses standard `event: <name>\ndata: <json-or-text>\n\n` framing per the
 * SSE spec — multi-line `data:` lines are joined with `\n`.
 */
export interface SseMessage {
  event: string
  data: string
}

export async function* openSSE(
  url: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): AsyncGenerator<SseMessage> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'text/event-stream', ...init.headers },
  })
  if (!response.ok || !response.body) {
    throw new Error(`SSE stream failed: HTTP ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      yield* drainFrames(() => buffer, (next) => { buffer = next })
    }
  } finally {
    reader.releaseLock()
  }
}

function* drainFrames(get: () => string, set: (next: string) => void): Generator<SseMessage> {
  let text = get()
  while (true) {
    const split = text.indexOf('\n\n')
    if (split < 0) break
    const frame = text.slice(0, split)
    text = text.slice(split + 2)
    const msg = parseFrame(frame)
    if (msg) yield msg
  }
  set(text)
}

function parseFrame(frame: string): SseMessage | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    // ignore id:, retry:, and comment lines (starting with `:`)
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}
