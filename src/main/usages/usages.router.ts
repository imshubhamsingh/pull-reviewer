import { Hono } from 'hono'
import { Service } from '@/main/service'
import type { UsagesInput, UsagesService } from '@/main/usages/usages.service'

/**
 * Mounted at `/api/usages` in server.ts. Single POST endpoint backing the
 * right-click "Find usages" / "Go to definition" flow on rendered code.
 */
export class UsagesRouter extends Service {
  constructor(private readonly usages: UsagesService) {
    super()
  }

  routes(): Hono {
    const app = new Hono()
    app.post('/', async (c) => {
      const body = await c.req.json<Partial<UsagesInput>>().catch((): Partial<UsagesInput> => ({}))
      if (
        !body.repo ||
        !body.sha ||
        !body.file ||
        typeof body.line !== 'number' ||
        typeof body.column !== 'number' ||
        (body.kind !== 'references' && body.kind !== 'definition')
      ) {
        return c.json({ error: 'invalid body' }, 400)
      }
      const { ac } = abortableSignal(c.req.raw.signal)
      try {
        const result = await this.usages.find({
          repo: body.repo,
          sha: body.sha,
          file: body.file,
          line: body.line,
          column: body.column,
          kind: body.kind,
          signal: ac.signal,
        })
        return c.json(result)
      } catch (err) {
        this.logger.error('Usages search failed', { err: (err as Error).message })
        return c.json({ error: (err as Error).message }, 500)
      }
    })
    return app
  }
}

function abortableSignal(upstream: AbortSignal): { ac: AbortController } {
  const ac = new AbortController()
  upstream.addEventListener('abort', () => ac.abort(), { once: true })
  return { ac }
}
