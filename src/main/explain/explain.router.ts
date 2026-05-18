import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { Service } from '@/main/service'
import type { CliEvent } from '@/main/tour/cli-event'
import type { ExplainService } from '@/main/explain/explain.service'

interface AskBody {
  sha: string
  file: string
  startLine: number
  endLine: number
  question: string
  model?: string
  /** Chapter the user was on when asking — null when asked outside a chapter context. */
  chapterId?: string | null
}

export class ExplainRouter extends Service {
  constructor(private readonly explain: ExplainService) {
    super()
  }

  routes(): Hono {
    const app = new Hono()

    // List all Q&A threads for a PR.
    app.get('/:repoOwner/:repoName/:prNumber/threads', (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      return c.json(this.explain.list(parsed.repo, parsed.prNumber))
    })

    // Ask AI a question about a specific line range. Persists as a Q&A thread.
    app.post('/:repoOwner/:repoName/:prNumber/ask', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      const body = await c.req.json<AskBody>().catch((): AskBody | null => null)
      if (!body || !body.sha || !body.file || !body.question) {
        return c.json({ error: 'sha, file, and question are required' }, 400)
      }
      if (!Number.isInteger(body.startLine) || !Number.isInteger(body.endLine)) {
        return c.json({ error: 'startLine and endLine must be integers' }, 400)
      }
      const { ac } = abortableSignal(c.req.raw.signal)
      try {
        const result = await this.explain.ask({
          repo: parsed.repo,
          prNumber: parsed.prNumber,
          sha: body.sha,
          file: body.file,
          startLine: body.startLine,
          endLine: body.endLine,
          question: body.question,
          model: body.model,
          chapterId: body.chapterId ?? null,
          signal: ac.signal,
        })
        return c.json(result.thread)
      } catch (err) {
        this.logger.error('Explain failed', {
          repo: parsed.repo,
          file: body.file,
          err: (err as Error).message,
        })
        return c.json({ error: (err as Error).message }, 500)
      }
    })

    // Streaming variant: SSE with tool_call / partial_text / done / error events
    // so the renderer can show what the model is doing (web search, fetch) live.
    app.post('/:repoOwner/:repoName/:prNumber/ask/stream', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      const body = await c.req.json<AskBody>().catch((): AskBody | null => null)
      if (!body || !body.sha || !body.file || !body.question) {
        return c.json({ error: 'sha, file, and question are required' }, 400)
      }
      if (!Number.isInteger(body.startLine) || !Number.isInteger(body.endLine)) {
        return c.json({ error: 'startLine and endLine must be integers' }, 400)
      }
      const { ac } = abortableSignal(c.req.raw.signal)

      return streamSSE(c, async (stream) => {
        const send = (event: string, data: unknown) =>
          stream.writeSSE({ event, data: JSON.stringify(data) })
        try {
          const result = await this.explain.ask({
            repo: parsed.repo,
            prNumber: parsed.prNumber,
            sha: body.sha,
            file: body.file,
            startLine: body.startLine,
            endLine: body.endLine,
            question: body.question,
            model: body.model,
            chapterId: body.chapterId ?? null,
            signal: ac.signal,
            onEvent: (event: CliEvent) => send(event.type, event),
          })
          await send('done', result.thread)
        } catch (err) {
          this.logger.error('Streaming ask failed', {
            repo: parsed.repo,
            file: body.file,
            err: (err as Error).message,
          })
          await send('error', { message: (err as Error).message })
        }
      })
    })

    app.delete('/threads/:id', (c) => {
      const id = Number(c.req.param('id'))
      if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
      const ok = this.explain.remove(id)
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

function abortableSignal(upstream: AbortSignal): { ac: AbortController } {
  const ac = new AbortController()
  upstream.addEventListener('abort', () => ac.abort(), { once: true })
  return { ac }
}
