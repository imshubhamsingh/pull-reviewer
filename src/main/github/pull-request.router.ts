import { Hono } from 'hono'
import type { PullRequestService } from '@/main/github/pull-request.service'
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

    return app
  }
}
