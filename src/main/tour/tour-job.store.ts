import type { Db } from '@/main/db/db'
import { Service } from '@/main/service'

/**
 * Persisted state for background tour-generation jobs. Keyed by
 * `(repo, pr, head_ref_oid, started_at)` — new commits on the same PR
 * create new job rows, and a single PR-head may have multiple historical
 * jobs (e.g., a `cancelled` + a later `succeeded`).
 *
 * The in-memory `TourJobManager` is the source of truth for live jobs;
 * this store provides persistence so:
 *  - App quit can mark all `running` rows as `cancelled` (Phase 6 cleanup).
 *  - The PR list can show a "retry — previous gen was cancelled" hint by
 *    looking at the latest job for the current head SHA.
 */

export type TourJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface TourJobRecord {
  id: number
  repo: string
  prNumber: number
  headRefOid: string
  status: TourJobStatus
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

export interface CreateTourJobInput {
  repo: string
  prNumber: number
  headRefOid: string
  status: TourJobStatus
  /** Pass undefined to leave NULL — manager will fill in on transition to 'running'. */
  startedAt?: string
}

interface Row {
  id: number
  repo: string
  pr_number: number
  head_ref_oid: string
  status: TourJobStatus
  started_at: string | null
  finished_at: string | null
  error: string | null
}

const COLUMNS = 'id, repo, pr_number, head_ref_oid, status, started_at, finished_at, error'

export class TourJobStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  create(input: CreateTourJobInput): TourJobRecord {
    const id = this.db.insert(
      /* sql */ `
        INSERT INTO tour_jobs (repo, pr_number, head_ref_oid, status, started_at)
        VALUES (@repo, @prNumber, @headRefOid, @status, @startedAt)
      `,
      {
        repo: input.repo,
        prNumber: input.prNumber,
        headRefOid: input.headRefOid,
        status: input.status,
        startedAt: input.startedAt ?? null,
      },
    ).lastInsertRowid as number
    const row = this.db.selectOne<Row>(/* sql */ `SELECT ${COLUMNS} FROM tour_jobs WHERE id = ?`, [
      id,
    ])
    if (!row) throw new Error('create: row vanished after insert')
    return toRecord(row)
  }

  update(
    id: number,
    patch: Partial<Pick<TourJobRecord, 'status' | 'startedAt' | 'finishedAt' | 'error'>>,
  ): void {
    const sets: string[] = []
    const params: Record<string, unknown> = { id }
    if (patch.status !== undefined) {
      sets.push('status = @status')
      params.status = patch.status
    }
    if (patch.startedAt !== undefined) {
      sets.push('started_at = @startedAt')
      params.startedAt = patch.startedAt
    }
    if (patch.finishedAt !== undefined) {
      sets.push('finished_at = @finishedAt')
      params.finishedAt = patch.finishedAt
    }
    if (patch.error !== undefined) {
      sets.push('error = @error')
      params.error = patch.error
    }
    if (sets.length === 0) return
    this.db.update(/* sql */ `UPDATE tour_jobs SET ${sets.join(', ')} WHERE id = @id`, params)
  }

  get(id: number): TourJobRecord | undefined {
    const row = this.db.selectOne<Row>(/* sql */ `SELECT ${COLUMNS} FROM tour_jobs WHERE id = ?`, [
      id,
    ])
    return row ? toRecord(row) : undefined
  }

  /** Most recent job for a specific (repo, pr, head_ref_oid). Used by the PR card retry-hint. */
  latestForSha(repo: string, prNumber: number, headRefOid: string): TourJobRecord | undefined {
    const row = this.db.selectOne<Row>(
      /* sql */ `
        SELECT ${COLUMNS}
          FROM tour_jobs
         WHERE repo = ? AND pr_number = ? AND head_ref_oid = ?
         ORDER BY id DESC
         LIMIT 1
      `,
      [repo, prNumber, headRefOid],
    )
    return row ? toRecord(row) : undefined
  }

  /** All jobs currently in 'queued' or 'running'. Sorted by id (FIFO). */
  listActive(): TourJobRecord[] {
    return this.db
      .select<Row>(
        /* sql */ `
        SELECT ${COLUMNS}
          FROM tour_jobs
         WHERE status IN ('queued', 'running')
         ORDER BY id
      `,
      )
      .map(toRecord)
  }

  /**
   * App-quit cleanup. Flips every 'running' or 'queued' row to 'cancelled'
   * and sets `finished_at` to now. No-op if no such rows.
   */
  markAllActiveAsCancelled(now = new Date().toISOString()): number {
    const result = this.db.update(
      /* sql */ `
        UPDATE tour_jobs
           SET status = 'cancelled', finished_at = @now
         WHERE status IN ('queued', 'running')
      `,
      { now },
    )
    return result.changes
  }

  /** GC old finished jobs. Called on app launch. */
  gc(maxAgeDays = 30, now = new Date()): number {
    const cutoff = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString()
    const result = this.db.delete(
      /* sql */ `
        DELETE FROM tour_jobs
         WHERE status IN ('succeeded', 'failed', 'cancelled')
           AND COALESCE(finished_at, '') < ?
      `,
      [cutoff],
    )
    return result.changes
  }
}

function toRecord(row: Row): TourJobRecord {
  return {
    id: row.id,
    repo: row.repo,
    prNumber: row.pr_number,
    headRefOid: row.head_ref_oid,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: row.error,
  }
}
