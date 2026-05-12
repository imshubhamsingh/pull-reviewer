import { Hono } from 'hono'
import { Service } from '@/main/service'
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
      const { repoOwner, repoName, prNumber } = parseParams(c.req.param('repoOwner'), c.req.param('repoName'), c.req.param('prNumber'))
      if (!prNumber) return c.json({ error: 'invalid pr number' }, 400)
      const cached = this.tours.get(`${repoOwner}/${repoName}`, prNumber)
      if (!cached) return c.json({ error: 'no cached tour for this PR' }, 404)
      return c.json(cached)
    })

    // POST /:owner/:name/:prNumber/generate?force=true → cache hit returns cached (even if stale);
    // ?force=true bypasses cache and runs the model. No cache + no force → also runs the model.
    app.post('/:repoOwner/:repoName/:prNumber/generate', async (c) => {
      const { repoOwner, repoName, prNumber } = parseParams(c.req.param('repoOwner'), c.req.param('repoName'), c.req.param('prNumber'))
      if (!prNumber) return c.json({ error: 'invalid pr number' }, 400)

      const force = c.req.query('force') === 'true'
      const body = await c.req.json<GenerateBody>().catch((): GenerateBody => ({}))
      const ac = new AbortController()
      c.req.raw.signal.addEventListener('abort', () => ac.abort(), { once: true })

      try {
        const result = await this.tours.generate({
          prNumber,
          repo: `${repoOwner}/${repoName}`,
          provider: body.provider,
          model: body.model,
          signal: ac.signal,
          force,
        })
        return c.json(result)
      } catch (err) {
        this.logger.error('Tour generation failed', {
          prNumber,
          repo: `${repoOwner}/${repoName}`,
          err: (err as Error).message,
        })
        return c.json({ error: (err as Error).message }, 500)
      }
    })

    return app
  }
}

function parseParams(repoOwner: string, repoName: string, prNumberRaw: string): { repoOwner: string; repoName: string; prNumber: number | null } {
  const prNumber = Number(prNumberRaw)
  return {
    repoOwner,
    repoName,
    prNumber: Number.isInteger(prNumber) && prNumber > 0 ? prNumber : null,
  }
}
