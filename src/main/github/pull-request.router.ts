import { Hono } from 'hono'
import type { PullRequestService, PullRequestSummary } from '@/main/github/pull-request.service'
import { Service } from '@/main/service'

export class PullRequestRouter extends Service {
  constructor(private readonly pullRequests: PullRequestService) {
    super()
  }

  routes(): Hono {
    const app = new Hono()

    app.get('/mine', async (c) => {
      const data = await this.pullRequests.listMine()
      return c.json(data)
    })

    app.get('/review-requested', async (c) => {
      const data = await this.pullRequests.listReviewRequested()
      return c.json(data)
    })

    app.get('/reviewed-by-me', async (c) => {
      const data = await this.pullRequests.listReviewedByMe()
      return c.json(data)
    })

    app.get('/recents', (c) => c.json(this.pullRequests.listRecents()))

    app.post('/recents/touch', async (c) => {
      const body = await c.req.json<PullRequestSummary>().catch((): PullRequestSummary | null => null)
      if (!body || typeof body.number !== 'number' || typeof body.repo !== 'string') {
        return c.json({ error: 'invalid pr summary' }, 400)
      }
      this.pullRequests.touchRecent(body)
      return c.json({ ok: true })
    })

    return app
  }
}
