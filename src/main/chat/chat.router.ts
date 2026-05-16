import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { ChatService } from '@/main/chat/chat.service'
import { Service } from '@/main/service'
import type { CliEvent } from '@/main/tour/cli-event'

interface SendBody {
  message: string
}
interface RenameBody {
  title: string
}
interface CreateBody {
  title?: string
}

export class ChatRouter extends Service {
  constructor(private readonly chats: ChatService) {
    super()
  }

  routes(): Hono {
    const app = new Hono()

    // GET /:owner/:name/:pr → list chats for this PR, newest-updated first.
    app.get('/:repoOwner/:repoName/:prNumber', (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      return c.json(this.chats.listChats(parsed.repo, parsed.prNumber))
    })

    // POST /:owner/:name/:pr → create a new chat.
    app.post('/:repoOwner/:repoName/:prNumber', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      const body = await c.req.json<CreateBody>().catch((): CreateBody => ({}))
      const chat = this.chats.createChat(
        parsed.repo,
        parsed.prNumber,
        body.title?.trim() || undefined,
      )
      return c.json(chat)
    })

    // GET /:owner/:name/:pr/:chatId/messages → message history.
    app.get('/:repoOwner/:repoName/:prNumber/:chatId/messages', (c) => {
      const chatId = numericParam(c.req.param('chatId'))
      if (chatId == null) return c.json({ error: 'invalid chat id' }, 400)
      return c.json(this.chats.listMessages(chatId))
    })

    // POST /:owner/:name/:pr/:chatId/send → blocking send; returns the final assistant message.
    app.post('/:repoOwner/:repoName/:prNumber/:chatId/send', async (c) => {
      const chatId = numericParam(c.req.param('chatId'))
      if (chatId == null) return c.json({ error: 'invalid chat id' }, 400)
      const body = await c.req.json<SendBody>().catch((): SendBody | null => null)
      if (!body?.message?.trim()) return c.json({ error: 'message required' }, 400)
      const { ac } = abortableSignal(c.req.raw.signal)
      try {
        const result = await this.chats.send({ chatId, message: body.message, signal: ac.signal })
        return c.json(result)
      } catch (err) {
        this.logger.error('Chat send failed', { chatId, err: (err as Error).message })
        return c.json({ error: (err as Error).message }, 500)
      }
    })

    // POST /:owner/:name/:pr/:chatId/send/stream → SSE; forwards CliEvents
    // by type while the model runs, then a `done` event with the persisted
    // assistant message, or `error` on failure.
    app.post('/:repoOwner/:repoName/:prNumber/:chatId/send/stream', async (c) => {
      const chatId = numericParam(c.req.param('chatId'))
      if (chatId == null) return c.json({ error: 'invalid chat id' }, 400)
      const body = await c.req.json<SendBody>().catch((): SendBody | null => null)
      if (!body?.message?.trim()) return c.json({ error: 'message required' }, 400)
      const { ac } = abortableSignal(c.req.raw.signal)

      return streamSSE(c, async (stream) => {
        const send = (event: string, data: unknown) =>
          stream.writeSSE({ event, data: JSON.stringify(data) })

        try {
          const result = await this.chats.send({
            chatId,
            message: body.message,
            signal: ac.signal,
            onEvent: (event: CliEvent) => send(event.type, event),
          })
          await send('done', result.assistantMessage)
        } catch (err) {
          this.logger.error('Streaming chat send failed', { chatId, err: (err as Error).message })
          await send('error', { message: (err as Error).message })
        }
      })
    })

    // PATCH /:chatId → rename.
    app.patch('/:chatId', async (c) => {
      const id = numericParam(c.req.param('chatId'))
      if (id == null) return c.json({ error: 'invalid chat id' }, 400)
      const body = await c.req.json<RenameBody>().catch((): RenameBody | null => null)
      if (!body?.title?.trim()) return c.json({ error: 'title required' }, 400)
      const renamed = this.chats.renameChat(id, body.title.trim())
      if (!renamed) return c.json({ error: 'chat not found' }, 404)
      return c.json(renamed)
    })

    // DELETE /:chatId → drop the chat (and its messages, via FK cascade).
    app.delete('/:chatId', (c) => {
      const id = numericParam(c.req.param('chatId'))
      if (id == null) return c.json({ error: 'invalid chat id' }, 400)
      const ok = this.chats.deleteChat(id)
      return c.json({ deleted: ok })
    })

    // DELETE /messages/:id → drop a single message.
    app.delete('/messages/:id', (c) => {
      const id = numericParam(c.req.param('id'))
      if (id == null) return c.json({ error: 'invalid message id' }, 400)
      const ok = this.chats.deleteMessage(id)
      return c.json({ deleted: ok })
    })

    return app
  }
}

interface ParsedParams {
  repo: string
  prNumber: number
}

function parseParams(
  repoOwner: string,
  repoName: string,
  prNumberRaw: string,
): ParsedParams | null {
  const prNumber = Number(prNumberRaw)
  if (!Number.isInteger(prNumber) || prNumber <= 0) return null
  return { repo: `${repoOwner}/${repoName}`, prNumber }
}

function numericParam(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function abortableSignal(upstream: AbortSignal): { ac: AbortController } {
  const ac = new AbortController()
  upstream.addEventListener('abort', () => ac.abort(), { once: true })
  return { ac }
}
