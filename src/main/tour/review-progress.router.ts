import { Hono } from 'hono'
import type { ChapterCompletionService } from '@/main/tour/chapter-completion.service'
import type { FileReviewService } from '@/main/tour/file-review.service'
import { Service } from '@/main/service'

interface MarkFilesBody {
  filePaths: string[]
}

/**
 * Combined router for the two review-progress signals (chapters + files).
 * Both are scoped to (repo, pr_number, head_ref_oid, …) so URLs encode all
 * four. The frontend hook calls `list` on mount, then `mark`/`unmark` per
 * user action with optimistic UI.
 *
 * Mounted at `/api/review-progress` in server.ts.
 */
export class ReviewProgressRouter extends Service {
  constructor(
    private readonly chapters: ChapterCompletionService,
    private readonly files: FileReviewService,
  ) {
    super()
  }

  routes(): Hono {
    const app = new Hono()

    // -------- Chapter completions ---------

    app.get('/:repoOwner/:repoName/:prNumber/:headSha/chapters', (c) => {
      const ctx = parseScope(c.req.param('repoOwner'), c.req.param('repoName'), c.req.param('prNumber'), c.req.param('headSha'))
      if (!ctx) return c.json({ error: 'invalid scope' }, 400)
      return c.json(this.chapters.list(ctx.repo, ctx.prNumber, ctx.headSha))
    })

    app.post('/:repoOwner/:repoName/:prNumber/:headSha/chapters/:chapterId', (c) => {
      const ctx = parseScope(c.req.param('repoOwner'), c.req.param('repoName'), c.req.param('prNumber'), c.req.param('headSha'))
      if (!ctx) return c.json({ error: 'invalid scope' }, 400)
      const chapterId = decodeURIComponent(c.req.param('chapterId'))
      return c.json(this.chapters.mark(ctx.repo, ctx.prNumber, ctx.headSha, chapterId))
    })

    app.delete('/:repoOwner/:repoName/:prNumber/:headSha/chapters/:chapterId', (c) => {
      const ctx = parseScope(c.req.param('repoOwner'), c.req.param('repoName'), c.req.param('prNumber'), c.req.param('headSha'))
      if (!ctx) return c.json({ error: 'invalid scope' }, 400)
      const chapterId = decodeURIComponent(c.req.param('chapterId'))
      const deleted = this.chapters.unmark(ctx.repo, ctx.prNumber, ctx.headSha, chapterId)
      return c.json({ deleted })
    })

    // -------- File reviews ---------

    app.get('/:repoOwner/:repoName/:prNumber/:headSha/files', (c) => {
      const ctx = parseScope(c.req.param('repoOwner'), c.req.param('repoName'), c.req.param('prNumber'), c.req.param('headSha'))
      if (!ctx) return c.json({ error: 'invalid scope' }, 400)
      return c.json(this.files.list(ctx.repo, ctx.prNumber, ctx.headSha))
    })

    // Bulk-mark — accepts `{ filePaths: string[] }`. Used by single-tick
    // (filePaths: [path]) AND by the chapter-complete cascade (filePaths:
    // every pinned file in the chapter). Same code path keeps the renderer
    // simple.
    app.post('/:repoOwner/:repoName/:prNumber/:headSha/files', async (c) => {
      const ctx = parseScope(c.req.param('repoOwner'), c.req.param('repoName'), c.req.param('prNumber'), c.req.param('headSha'))
      if (!ctx) return c.json({ error: 'invalid scope' }, 400)
      const body = await c.req.json<MarkFilesBody>().catch((): MarkFilesBody | null => null)
      if (!body || !Array.isArray(body.filePaths) || body.filePaths.some((p) => typeof p !== 'string')) {
        return c.json({ error: 'filePaths: string[] required' }, 400)
      }
      return c.json(this.files.markMany(ctx.repo, ctx.prNumber, ctx.headSha, body.filePaths))
    })

    app.delete('/:repoOwner/:repoName/:prNumber/:headSha/files/:filePath', (c) => {
      const ctx = parseScope(c.req.param('repoOwner'), c.req.param('repoName'), c.req.param('prNumber'), c.req.param('headSha'))
      if (!ctx) return c.json({ error: 'invalid scope' }, 400)
      const filePath = decodeURIComponent(c.req.param('filePath'))
      const deleted = this.files.unmark(ctx.repo, ctx.prNumber, ctx.headSha, filePath)
      return c.json({ deleted })
    })

    return app
  }
}

interface Scope {
  repo: string
  prNumber: number
  headSha: string
}

function parseScope(repoOwner: string, repoName: string, prNumberRaw: string, headShaRaw: string): Scope | null {
  const prNumber = Number(prNumberRaw)
  const headSha = decodeURIComponent(headShaRaw)
  if (!Number.isInteger(prNumber) || prNumber <= 0 || !headSha) return null
  return { repo: `${repoOwner}/${repoName}`, prNumber, headSha }
}
