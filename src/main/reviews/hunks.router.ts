import { Hono } from 'hono'
import { Service } from '@/main/service'
import type { HunksService } from '@/main/reviews/hunks.service'

/**
 * GET `/api/hunks/:repoOwner/:repoName/:prNumber?headSha=…` → per-file
 * commentable-line ranges for the PR's diff. Consumed by the renderer's
 * `useHunks` hook to drive the in-code visual indicator. `headSha` is a
 * query param to keep 40-char SHAs out of the path.
 */
export class HunksRouter extends Service {
  constructor(private readonly hunks: HunksService) {
    super()
  }

  routes(): Hono {
    const app = new Hono()

    app.get('/:repoOwner/:repoName/:prNumber', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
        c.req.query('headSha'),
      )
      if (!parsed) return c.json({ error: 'invalid params' }, 400)
      try {
        const response = await this.hunks.getOrFetch(parsed.repo, parsed.prNumber, parsed.headSha)
        return c.json(response)
      } catch (err) {
        this.logger.error('Resolve PR hunks failed', {
          repo: parsed.repo,
          prNumber: parsed.prNumber,
          err: (err as Error).message,
        })
        return c.json({ error: (err as Error).message }, 500)
      }
    })

    return app
  }
}

interface ParsedParams {
  repo: string
  prNumber: number
  headSha: string
}

function parseParams(
  repoOwner: string,
  repoName: string,
  prNumberRaw: string,
  headSha: string | undefined,
): ParsedParams | null {
  const prNumber = Number(prNumberRaw)
  if (!Number.isInteger(prNumber) || prNumber <= 0) return null
  if (!headSha || headSha.length === 0) return null
  return { repo: `${repoOwner}/${repoName}`, prNumber, headSha }
}
