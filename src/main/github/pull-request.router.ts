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

    // Re-fetch each cached recent's live state from GitHub via batched
    // node() queries, then return the refreshed list. Used by the
    // renderer's Refresh button so merged / closed PRs flip state.
    app.post('/recents/refresh', async (c) => {
      try {
        const data = await this.pullRequests.refreshRecents()
        return c.json(data)
      } catch (err) {
        this.logger.error('Refresh recents failed', { err: (err as Error).message })
        return c.json({ error: (err as Error).message }, 500)
      }
    })

    // On-demand resolution of a PR's base SHA — used by the Diff pane when
    // the local tour record doesn't have one (older tours).
    app.get('/:repoOwner/:repoName/:prNumber/base-sha', async (c) => {
      const repoOwner = c.req.param('repoOwner')
      const repoName = c.req.param('repoName')
      const prNumber = Number(c.req.param('prNumber'))
      if (!repoOwner || !repoName || !Number.isInteger(prNumber) || prNumber <= 0) {
        return c.json({ error: 'invalid params' }, 400)
      }
      try {
        const sha = await this.pullRequests.resolveBaseSha(`${repoOwner}/${repoName}`, prNumber)
        return c.json({ baseSha: sha })
      } catch (err) {
        this.logger.error('Resolve base sha failed', {
          repo: `${repoOwner}/${repoName}`,
          prNumber,
          err: (err as Error).message,
        })
        return c.json({ error: (err as Error).message }, 500)
      }
    })

    app.post('/recents/touch', async (c) => {
      const body = await c.req
        .json<PullRequestSummary>()
        .catch((): PullRequestSummary | null => null)
      if (!body || typeof body.number !== 'number' || typeof body.repo !== 'string') {
        return c.json({ error: 'invalid pr summary' }, 400)
      }
      this.pullRequests.touchRecent(body)
      return c.json({ ok: true })
    })

    return app
  }
}
