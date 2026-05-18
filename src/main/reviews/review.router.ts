import { Hono } from 'hono'
import { Service } from '@/main/service'
import type { ReviewDraftInput, ReviewSide } from '@/main/reviews/review-draft.store'
import type { ReviewService, SubmitInput } from '@/main/reviews/review.service'

interface DraftBody {
  file: string
  line: number
  /** First line of the range; null/equal-to-line means single-line. */
  startLine?: number | null
  side?: ReviewSide
  body: string
}

interface UpdateBody {
  body?: string
  /** Re-anchor target end-line. Pair with `startLine` to set a multi-line range. */
  line?: number
  startLine?: number | null
}

interface SubmitBody {
  headSha: string
  summary?: string
  event?: SubmitInput['event']
}

export class ReviewRouter extends Service {
  constructor(private readonly reviews: ReviewService) {
    super()
  }

  routes(): Hono {
    const app = new Hono()

    app.get('/:repoOwner/:repoName/:prNumber/drafts', (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      return c.json(this.reviews.list(parsed.repo, parsed.prNumber))
    })

    app.post('/:repoOwner/:repoName/:prNumber/drafts', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      const body = await c.req.json<DraftBody>().catch((): DraftBody | null => null)
      if (!body || !body.file || !body.body || !Number.isInteger(body.line)) {
        return c.json({ error: 'file, line (integer), and body are required' }, 400)
      }
      const input: ReviewDraftInput = {
        repo: parsed.repo,
        prNumber: parsed.prNumber,
        file: body.file,
        line: body.line,
        startLine: normaliseStart(body.line, body.startLine),
        side: body.side ?? 'after',
        body: body.body,
      }
      return c.json(this.reviews.create(input))
    })

    app.patch('/drafts/:id', async (c) => {
      const id = Number(c.req.param('id'))
      if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
      const body = await c.req.json<UpdateBody>().catch((): UpdateBody | null => null)
      if (!body) return c.json({ error: 'request body required' }, 400)
      const wantsRange = Number.isInteger(body.line)
      const wantsBody = typeof body.body === 'string' && body.body.length > 0
      if (!wantsRange && !wantsBody) {
        return c.json({ error: 'body or line is required' }, 400)
      }
      let updated
      if (wantsRange) {
        updated = this.reviews.reanchor(
          id,
          body.line as number,
          normaliseStart(body.line as number, body.startLine),
        )
      }
      if (wantsBody) {
        updated = this.reviews.update(id, body.body as string)
      }
      if (!updated) return c.json({ error: 'draft not found' }, 404)
      return c.json(updated)
    })

    app.delete('/drafts/:id', (c) => {
      const id = Number(c.req.param('id'))
      if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400)
      const ok = this.reviews.remove(id)
      return c.json({ deleted: ok })
    })

    app.post('/:repoOwner/:repoName/:prNumber/submit', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      const body = await c.req.json<SubmitBody>().catch((): SubmitBody | null => null)
      if (!body || !body.headSha) return c.json({ error: 'headSha is required' }, 400)
      try {
        const result = await this.reviews.submit({
          repo: parsed.repo,
          prNumber: parsed.prNumber,
          headSha: body.headSha,
          summary: body.summary,
          event: body.event,
        })
        return c.json(result)
      } catch (err) {
        this.logger.error('Review submit failed', {
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

/**
 * Normalise the start line on the way in: drop it when collapsed (single-line)
 * or invalid, otherwise hand back the lower bound. The store always sees a
 * clean null-or-int and never a "startLine === line" duplicate.
 */
function normaliseStart(line: number, startLine: number | null | undefined): number | null {
  if (startLine == null || !Number.isInteger(startLine)) return null
  if (startLine === line) return null
  return Math.min(line, startLine)
}
