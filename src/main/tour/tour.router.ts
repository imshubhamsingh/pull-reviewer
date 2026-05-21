import type { Context } from 'hono'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { Service } from '@/main/service'
import type { Provider } from '@/main/tour/cli-runner.service'
import type { JobEvent, TourJobManager } from '@/main/tour/tour-job.manager'
import type { TourService } from '@/main/tour/tour.service'

interface GenerateBody {
  provider?: Provider
  model?: string
}

interface StartJobBody {
  provider?: Provider
  model?: string
}

export class TourRouter extends Service {
  constructor(
    private readonly tours: TourService,
    private readonly jobs: TourJobManager,
  ) {
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

    // GET /:owner/:name/:prNumber/stale → any stored tour, including rows from
    // an older `CURRENT_SCHEMA_VERSION`. Powers the "View previous tour"
    // button on the No-tour screen so a schema bump doesn't visibly orphan
    // previously-generated tours. 404 if nothing is stored at all.
    app.get('/:repoOwner/:repoName/:prNumber/stale', (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      const stale = this.tours.getStale(parsed.repo, parsed.prNumber)
      if (!stale) return c.json({ error: 'no stored tour for this PR' }, 404)
      return c.json(stale)
    })

    // POST /:owner/:name/:prNumber/generate → run synchronously (no streaming).
    // Kept for back-compat; new code paths should prefer the job routes below.
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

    // POST /:owner/:name/:prNumber/generate/stream → legacy streaming endpoint.
    // Internally creates a background job + streams its events; closing the
    // SSE no longer kills the CLI (the job owns its own lifecycle now).
    // New code should call `/job` + `/jobs/:id/stream` directly so the
    // renderer can detach from the stream without losing the work.
    app.post('/:repoOwner/:repoName/:prNumber/generate/stream', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)

      const force = c.req.query('force') === 'true'
      const body = await c.req.json<GenerateBody>().catch((): GenerateBody => ({}))

      let job
      try {
        job = await this.jobs.start(parsed.repo, parsed.prNumber, {
          force,
          provider: body.provider,
          model: body.model,
        })
      } catch (err) {
        this.logger.error('Failed to start tour job', {
          repo: parsed.repo,
          prNumber: parsed.prNumber,
          err: (err as Error).message,
        })
        return c.json({ error: (err as Error).message }, 500)
      }

      return this.streamJob(c, job.id)
    })

    // ------ Job routes (background generation) ------

    // POST /:owner/:name/:prNumber/job → start (or attach to existing) job.
    // Returns the TourJob record. CLI continues running even if the caller disconnects.
    app.post('/:repoOwner/:repoName/:prNumber/job', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      const force = c.req.query('force') === 'true'
      const body = await c.req.json<StartJobBody>().catch((): StartJobBody => ({}))
      try {
        const job = await this.jobs.start(parsed.repo, parsed.prNumber, {
          force,
          provider: body.provider,
          model: body.model,
        })
        return c.json({ job })
      } catch (err) {
        return c.json({ error: (err as Error).message }, 500)
      }
    })

    // GET /:owner/:name/:prNumber/job → latest job for this PR's current head SHA.
    // Returns `{ job: null }` if no job has been started for the current SHA.
    app.get('/:repoOwner/:repoName/:prNumber/job', async (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      const headRefOidQuery = c.req.query('headRefOid')
      if (!headRefOidQuery) return c.json({ error: 'headRefOid query param required' }, 400)
      const job = this.jobs.latestForSha(parsed.repo, parsed.prNumber, headRefOidQuery)
      return c.json({ job: job ?? null })
    })

    // DELETE /:owner/:name/:prNumber/job → cancel the in-flight job for the
    // (repo, pr, current-head-sha) triple. Returns `{cancelled: bool}`.
    app.delete('/:repoOwner/:repoName/:prNumber/job', (c) => {
      const parsed = parseParams(
        c.req.param('repoOwner'),
        c.req.param('repoName'),
        c.req.param('prNumber'),
      )
      if (!parsed) return c.json({ error: 'invalid pr number' }, 400)
      const headRefOid = c.req.query('headRefOid')
      if (!headRefOid) return c.json({ error: 'headRefOid query param required' }, 400)
      const summary = this.jobs
        .list()
        .find(
          (s) =>
            s.job.repo === parsed.repo &&
            s.job.prNumber === parsed.prNumber &&
            s.job.headRefOid === headRefOid,
        )
      if (!summary) return c.json({ cancelled: false })
      return c.json({ cancelled: this.jobs.cancel(summary.job.id) })
    })

    // GET /jobs → all active + queued jobs (snapshot).
    app.get('/jobs', (c) => c.json(this.jobs.list()))

    // GET /jobs/:jobId/stream → live SSE for a specific job. Replays buffered
    // events first, then streams live updates. Closing this SSE does NOT cancel
    // the job — the manager owns the CLI lifecycle.
    app.get('/jobs/:jobId/stream', (c) => {
      const jobId = Number(c.req.param('jobId'))
      if (!Number.isInteger(jobId) || jobId <= 0) return c.json({ error: 'invalid job id' }, 400)
      return this.streamJob(c, jobId)
    })

    return app
  }

  /**
   * Pipe a job's events to an SSE response. The router is intentionally
   * thin — all the subscribe / queue / abort / replay machinery lives in
   * `TourJobManager.events()` (service layer). Closing the SSE just
   * breaks the loop; the manager keeps the CLI running.
   */
  private streamJob(c: Context, jobId: number): Response {
    return streamSSE(c, async (stream) => {
      for await (const e of this.jobs.events(jobId, c.req.raw.signal)) {
        const frame = toSseFrame(e)
        await stream.writeSSE({ event: frame.event, data: JSON.stringify(frame.data) })
      }
    })
  }
}

/** Map a JobEvent to an SSE `{ event, data }` frame. Pure mapping. */
function toSseFrame(e: JobEvent): { event: string; data: unknown } {
  if (e.kind === 'cli') return { event: e.event.type, data: e.event }
  if (e.kind === 'done') return { event: 'done', data: e.tour }
  return { event: 'error', data: { message: e.message } }
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
