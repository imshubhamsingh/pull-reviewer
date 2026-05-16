import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { Service } from '@/main/service'
import type { CliEvent } from '@/main/tour/cli-event'
import type { Provider } from '@/main/tour/cli-runner.service'
import type { TourService } from '@/main/tour/tour.service'

interface GenerateBody {
  provider?: Provider
  model?: string
}

export class TourRouter extends Service {
  constructor(private readonly tours: TourService) {
    super()
  }

  routes(): Hono {
    const app = new Hono()

    // GET /:owner/:name/:prNumber → cached tour, or 404 if none. Never runs the model.
    app.get('/:repoOwner/:repoName/:prNumber', (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      const cached = this.tours.get(parsed.repo, parsed.prNumber)
      if (!cached) return c.json({ error: 'no cached tour for this PR' }, 404)
      return c.json(cached)
    })

    // POST /:owner/:name/:prNumber/generate?force=true → cache hit returns cached (even if stale);
    // ?force=true bypasses cache and runs the model. No cache + no force → also runs the model.
    app.post('/:repoOwner/:repoName/:prNumber/generate', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)

      const force = c.req.query('force') === 'true'
      const body = await c.req.json<GenerateBody>().catch((): GenerateBody => ({}))
      const { ac } = abortableSignal(c.req.raw.signal)

      try {
        const result = await this.tours.generate({
          prNumber: parsed.prNumber,
          repo: parsed.repo,
          provider: body.provider,
          model: body.model,
          signal: ac.signal,
          force,
        })
        return c.json(result)
      } catch (err) {
        this.logger.error('Tour generation failed', {
          repo: parsed.repo,
          prNumber: parsed.prNumber,
          err: (err as Error).message,
        })
        return c.json({ error: (err as Error).message }, 500)
      }
    })

    // POST /:owner/:name/:prNumber/generate/stream → Server-Sent Events while the model runs.
    // Stream protocol: one SSE event per CliEvent ('tool_call', 'partial_text', 'final'),
    // followed by a `done` event with the final TourResult, or an `error` event with the message.
    app.post('/:repoOwner/:repoName/:prNumber/generate/stream', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)

      const force = c.req.query('force') === 'true'
      const body = await c.req.json<GenerateBody>().catch((): GenerateBody => ({}))
      const { ac } = abortableSignal(c.req.raw.signal)

      return streamSSE(c, async (stream) => {
        const send = (event: string, data: unknown) =>
          stream.writeSSE({ event, data: JSON.stringify(data) })

        try {
          const result = await this.tours.generate({
            prNumber: parsed.prNumber,
            repo: parsed.repo,
            provider: body.provider,
            model: body.model,
            signal: ac.signal,
            force,
            onEvent: (event: CliEvent) => send(event.type, event),
          })
          await send('done', result)
        } catch (err) {
          this.logger.error('Streaming generation failed', {
            repo: parsed.repo,
            prNumber: parsed.prNumber,
            err: (err as Error).message,
          })
          await send('error', { message: (err as Error).message })
        }
      })
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
