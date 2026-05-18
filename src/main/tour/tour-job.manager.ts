import type { CliEvent } from '@/main/tour/cli-event'
import type { Provider } from '@/main/tour/cli-runner.service'
import type { PrContextCollector } from '@/main/tour/pr-context.collector'
import type { TourService } from '@/main/tour/tour.service'
import type { TourResult } from '@/main/tour/tour-source'
import type { TourJobRecord, TourJobStore } from '@/main/tour/tour-job.store'
import { Service } from '@/main/service'

/**
 * Background tour-generation jobs. Decouples CLI lifecycle from the
 * renderer's SSE stream: a job survives renderer navigation /
 * disconnection. Renderer attaches via `subscribe()` for live events; the
 * store provides persistence so app-quit can mark active jobs cancelled
 * and the PR list can surface "previous gen was cancelled — retry"
 * affordances after relaunch.
 *
 * Keyed by `(repo, prNumber, headRefOid)` — a push that lands new
 * commits creates a fresh job; older-SHA jobs may still be running and
 * are left alone.
 *
 * Concurrency cap: at most `MAX_RUNNING` jobs in flight; excess jobs
 * wait in `queued` and promote FIFO when one finishes.
 */

const MAX_RUNNING = 3
/** Per-job ring buffer of recent events for late subscribers. */
const BUFFER_SIZE = 200

/**
 * Wire shape of a job event seen by a subscriber. Mirrors the CLI event
 * stream with two extra terminal kinds the live SSE consumers also need.
 */
export type JobEvent =
  | { kind: 'cli'; event: CliEvent }
  | { kind: 'done'; tour: TourResult }
  | { kind: 'error'; message: string }

export interface TourJobSummary {
  job: TourJobRecord
  /** Last `phase` event observed; used for PR list spinner labels. */
  lastPhase?: { name: string; detail?: string }
}

interface RunningJob {
  record: TourJobRecord
  ac: AbortController
}

interface JobOptions {
  force?: boolean
  provider?: Provider
  model?: string
}

export class TourJobManager extends Service {
  private active = new Map<number, RunningJob>()
  private queue: number[] = []
  private buffers = new Map<number, JobEvent[]>()
  private listeners = new Map<number, Set<(e: JobEvent) => void>>()
  /**
   * In-flight `start()` promises keyed by `repo#pr`. Dedups concurrent
   * starts so React strict-mode double-effects and rapid renderer
   * reconnects don't spawn duplicate jobs. The classic check-then-act
   * race: between awaiting `collectHeadSha` and checking the active
   * map, a second caller can slip in. This map keeps everyone
   * sharing the same promise.
   */
  private pendingStarts = new Map<string, Promise<TourJobRecord>>()

  constructor(
    private readonly tours: TourService,
    private readonly collector: PrContextCollector,
    private readonly store: TourJobStore,
    private readonly onComplete: (job: TourJobRecord, tour?: TourResult, err?: Error) => void,
  ) {
    super()
  }

  /**
   * Idempotent start. Resolves the PR's current head SHA, looks up an
   * active job for that triple — returns it if present. Otherwise
   * creates a new job row + either runs it immediately (under the cap)
   * or queues it.
   *
   * Concurrent calls for the same PR share a single in-flight promise.
   */
  start(repo: string, prNumber: number, opts: JobOptions = {}): Promise<TourJobRecord> {
    const key = `${repo}#${prNumber}`
    const pending = this.pendingStarts.get(key)
    if (pending) return pending
    const p = this.doStart(repo, prNumber, opts).finally(() => {
      this.pendingStarts.delete(key)
    })
    this.pendingStarts.set(key, p)
    return p
  }

  private async doStart(repo: string, prNumber: number, opts: JobOptions): Promise<TourJobRecord> {
    const headRefOid = await this.collector.collectHeadSha(prNumber, repo)
    const existing = this.findActive(repo, prNumber, headRefOid)
    if (existing) return existing.record

    const canRunNow = this.active.size < MAX_RUNNING
    const record = this.store.create({
      repo,
      prNumber,
      headRefOid,
      status: canRunNow ? 'running' : 'queued',
      startedAt: canRunNow ? new Date().toISOString() : undefined,
    })
    if (canRunNow) {
      this.spawn(record, opts)
    } else {
      this.queue.push(record.id)
    }
    return record
  }

  /** Snapshot of all active (running) + queued jobs. */
  list(): TourJobSummary[] {
    const out: TourJobSummary[] = []
    for (const j of this.active.values()) {
      out.push({
        job: j.record,
        lastPhase: latestPhase(this.buffers.get(j.record.id) ?? []),
      })
    }
    for (const id of this.queue) {
      const rec = this.store.get(id)
      if (rec) out.push({ job: rec })
    }
    return out
  }

  /** Latest persisted job for a (repo, pr, head) — used by the PR card retry hint. */
  latestForSha(repo: string, prNumber: number, headRefOid: string): TourJobRecord | undefined {
    return this.store.latestForSha(repo, prNumber, headRefOid)
  }

  /** User-initiated cancel. Aborts the AC + transitions to 'cancelled'. */
  cancel(jobId: number): boolean {
    const running = this.active.get(jobId)
    if (running) {
      running.ac.abort()
      return true
    }
    // Queued — just drop it from the queue and mark cancelled directly.
    const idx = this.queue.indexOf(jobId)
    if (idx >= 0) {
      this.queue.splice(idx, 1)
      const rec = this.store.get(jobId)
      if (rec) {
        this.store.update(jobId, { status: 'cancelled', finishedAt: new Date().toISOString() })
        this.broadcast(jobId, { kind: 'error', message: 'Cancelled before starting' })
        this.onComplete(
          { ...rec, status: 'cancelled' },
          undefined,
          new Error('Cancelled before starting'),
        )
      }
      return true
    }
    return false
  }

  /**
   * Subscribe to a job's event stream. Buffered events fire synchronously
   * first; live events follow. Returns an unsubscribe function.
   *
   * Most callers should prefer the higher-level `events()` async iterable
   * — it wraps subscribe/buffer/queue/terminate plumbing into a `for await`
   * loop that the router can consume directly.
   */
  subscribe(jobId: number, listener: (e: JobEvent) => void): () => void {
    const buffered = this.buffers.get(jobId) ?? []
    for (const e of buffered) listener(e)
    let set = this.listeners.get(jobId)
    if (!set) {
      set = new Set()
      this.listeners.set(jobId, set)
    }
    set.add(listener)
    return () => {
      set?.delete(listener)
    }
  }

  /**
   * Service-layer event stream. Yields every event the job emits — buffered
   * first, then live — until the job terminates (`done` or `error`) or the
   * caller breaks out / aborts the signal. The caller breaking the loop or
   * the signal aborting does NOT cancel the job; that's `cancel()`'s job.
   *
   * Designed so the router stays a thin loop: just `for await { sendSSE }`.
   */
  async *events(jobId: number, signal?: AbortSignal): AsyncIterable<JobEvent> {
    const queue: JobEvent[] = []
    let waker: (() => void) | null = null
    let finished = false

    const unsubscribe = this.subscribe(jobId, (e) => {
      queue.push(e)
      if (e.kind === 'done' || e.kind === 'error') finished = true
      waker?.()
    })

    const onAbort = (): void => {
      finished = true
      waker?.()
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      while (true) {
        if (queue.length === 0) {
          if (finished) return
          await new Promise<void>((res) => {
            waker = res
          })
          waker = null
          continue
        }
        yield queue.shift()!
        if (signal?.aborted) return
      }
    } finally {
      unsubscribe()
      signal?.removeEventListener('abort', onAbort)
    }
  }

  /**
   * App-quit cleanup. Aborts every running job's AC, then flips active
   * + queued rows to 'cancelled' in one DB write. CLI children receive
   * SIGTERM via the abort wiring; the caller is responsible for
   * SIGKILLing stragglers after a grace period.
   */
  shutdown(): void {
    for (const j of this.active.values()) j.ac.abort()
    const changed = this.store.markAllActiveAsCancelled()
    if (changed > 0) this.logger.info('Marked active jobs as cancelled on shutdown', { changed })
    this.active.clear()
    this.queue.length = 0
  }

  // ------------------------------------------------------------------

  private findActive(repo: string, prNumber: number, headRefOid: string): RunningJob | undefined {
    for (const j of this.active.values()) {
      if (
        j.record.repo === repo &&
        j.record.prNumber === prNumber &&
        j.record.headRefOid === headRefOid
      ) {
        return j
      }
    }
    return undefined
  }

  private spawn(record: TourJobRecord, opts: JobOptions): void {
    const ac = new AbortController()
    this.active.set(record.id, { record, ac })
    this.buffers.set(record.id, [])

    this.logger.info('Spawning tour job', {
      id: record.id,
      repo: record.repo,
      pr: record.prNumber,
      sha: record.headRefOid.slice(0, 7),
    })

    void this.tours
      .generate({
        repo: record.repo,
        prNumber: record.prNumber,
        provider: opts.provider,
        model: opts.model,
        force: opts.force,
        signal: ac.signal,
        onEvent: (e: CliEvent) => this.broadcast(record.id, { kind: 'cli', event: e }),
      })
      .then(
        (tour) => {
          this.finalise(record, ac.signal.aborted ? 'cancelled' : 'succeeded', tour)
        },
        (err: Error) => {
          this.finalise(record, ac.signal.aborted ? 'cancelled' : 'failed', undefined, err)
        },
      )
  }

  private finalise(
    record: TourJobRecord,
    status: 'succeeded' | 'failed' | 'cancelled',
    tour?: TourResult,
    err?: Error,
  ): void {
    const now = new Date().toISOString()
    const errorMsg = err ? err.message.slice(0, 400) : null
    this.store.update(record.id, {
      status,
      finishedAt: now,
      error: errorMsg,
    })
    const updated: TourJobRecord = { ...record, status, finishedAt: now, error: errorMsg }
    if (status === 'succeeded' && tour) {
      this.broadcast(record.id, { kind: 'done', tour })
    } else if (err) {
      this.broadcast(record.id, { kind: 'error', message: err.message })
    } else {
      this.broadcast(record.id, { kind: 'error', message: 'Cancelled' })
    }
    this.active.delete(record.id)
    this.onComplete(updated, tour, err)
    this.drainQueue()
  }

  private drainQueue(): void {
    while (this.active.size < MAX_RUNNING && this.queue.length > 0) {
      const nextId = this.queue.shift()!
      const rec = this.store.get(nextId)
      if (!rec) continue
      this.store.update(nextId, { status: 'running', startedAt: new Date().toISOString() })
      this.spawn({ ...rec, status: 'running' }, {})
    }
  }

  private broadcast(jobId: number, event: JobEvent): void {
    const buf = this.buffers.get(jobId)
    if (buf) {
      buf.push(event)
      if (buf.length > BUFFER_SIZE) buf.shift()
    }
    const set = this.listeners.get(jobId)
    if (!set) return
    for (const fn of set) fn(event)
  }
}

function latestPhase(events: JobEvent[]): { name: string; detail?: string } | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e?.kind === 'cli' && e.event.type === 'phase') {
      return { name: e.event.name, detail: e.event.detail }
    }
  }
  return undefined
}
