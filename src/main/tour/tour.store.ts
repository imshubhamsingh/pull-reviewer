import type { Db } from '@/main/db/db'
import type { TokenUsage } from '@/main/tour/cli-event'
import type { PrFile } from '@/main/tour/pr-context.collector'
import type { Review } from '@/main/tour/review-schema'
import type { Tour } from '@/main/tour/tour-schema'
import { Service } from '@/main/service'

/** Bump when the persisted shape changes incompatibly; rows below the current value are treated as stale. */
const CURRENT_SCHEMA_VERSION = 3

export interface TourRecord {
  prId: string // "{repo}#{prNumber}"
  repo: string
  prNumber: number
  headRefOid: string
  baseRefOid: string | null
  previousHeadRefOid: string | null // set on regenerate; powers "commits since last tour" delta
  chapters: Tour // chapters-shaped payload (Phase 4)
  files: PrFile[]
  generatedAt: string // ISO 8601
  lastCheckedAt: string // when head_ref_oid was last verified
  lastAccessedAt: string
  provider: string
  model: string
  costUsd: number | null // total cost of the run (null if provider didn't report one)
  durationMs: number | null // wall-clock time the model took
  usage: TokenUsage | null // raw token counts
  review: Review | null // dedicated AI review pass output; null when the review CLI run failed
}

interface Row {
  pr_id: string
  repo: string
  pr_number: number
  head_ref_oid: string
  base_ref_oid: string | null
  previous_head_ref_oid: string | null
  chapters_json: string | null
  files_json: string
  generated_at: string
  last_checked_at: string
  last_accessed_at: string
  schema_version: number
  provider: string
  model: string
  cost_usd: number | null
  duration_ms: number | null
  usage_json: string | null
  review_json: string | null
}

const COLUMNS = `
  pr_id, repo, pr_number, head_ref_oid, base_ref_oid, previous_head_ref_oid,
  chapters_json, files_json, generated_at, last_checked_at, last_accessed_at,
  schema_version, provider, model, cost_usd, duration_ms, usage_json, review_json
`

export class TourStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  /**
   * Returns the cached tour for this PR, or undefined.
   * Rows older than `CURRENT_SCHEMA_VERSION` are treated as stale and ignored
   * (the caller will regenerate); same for rows missing `chapters_json`.
   */
  get(repo: string, prNumber: number): TourRecord | undefined {
    const id = prId(repo, prNumber)
    const row = this.db.selectOne<Row>(/* sql */ `SELECT ${COLUMNS} FROM tours WHERE pr_id = ?`, [
      id,
    ])
    if (!row || row.schema_version < CURRENT_SCHEMA_VERSION || !row.chapters_json) return undefined
    this.touchAccessed(id)
    return rowToRecord(row)
  }

  upsert(rec: TourRecord): void {
    this.db.insert(
      /* sql */ `INSERT INTO tours (${COLUMNS}, steps_json)
       VALUES (
         @prId, @repo, @prNumber, @headRefOid, @baseRefOid, @previousHeadRefOid,
         @chaptersJson, @filesJson, @generatedAt, @lastCheckedAt, @lastAccessedAt,
         @schemaVersion, @provider, @model, @costUsd, @durationMs, @usageJson, @reviewJson, '[]'
       )
       ON CONFLICT(pr_id) DO UPDATE SET
         head_ref_oid          = excluded.head_ref_oid,
         base_ref_oid          = excluded.base_ref_oid,
         previous_head_ref_oid = excluded.previous_head_ref_oid,
         chapters_json         = excluded.chapters_json,
         files_json            = excluded.files_json,
         generated_at          = excluded.generated_at,
         last_checked_at       = excluded.last_checked_at,
         last_accessed_at      = excluded.last_accessed_at,
         schema_version        = excluded.schema_version,
         provider              = excluded.provider,
         model                 = excluded.model,
         cost_usd              = excluded.cost_usd,
         duration_ms           = excluded.duration_ms,
         usage_json            = excluded.usage_json,
         review_json           = excluded.review_json`,
      {
        prId: rec.prId,
        repo: rec.repo,
        prNumber: rec.prNumber,
        headRefOid: rec.headRefOid,
        baseRefOid: rec.baseRefOid,
        previousHeadRefOid: rec.previousHeadRefOid,
        chaptersJson: JSON.stringify(rec.chapters),
        filesJson: JSON.stringify(rec.files),
        generatedAt: rec.generatedAt,
        lastCheckedAt: rec.lastCheckedAt,
        lastAccessedAt: rec.lastAccessedAt,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        provider: rec.provider,
        model: rec.model,
        costUsd: rec.costUsd,
        durationMs: rec.durationMs,
        usageJson: rec.usage ? JSON.stringify(rec.usage) : null,
        reviewJson: rec.review ? JSON.stringify(rec.review) : null,
      },
    )
  }

  touchChecked(repo: string, prNumber: number, at = new Date().toISOString()): void {
    this.db.update(/* sql */ `UPDATE tours SET last_checked_at = ? WHERE pr_id = ?`, [
      at,
      prId(repo, prNumber),
    ])
  }

  private touchAccessed(id: string, at = new Date().toISOString()): void {
    this.db.update(/* sql */ `UPDATE tours SET last_accessed_at = ? WHERE pr_id = ?`, [at, id])
  }
}

export function prId(repo: string, prNumber: number): string {
  return `${repo}#${prNumber}`
}

function rowToRecord(row: Row): TourRecord {
  return {
    prId: row.pr_id,
    repo: row.repo,
    prNumber: row.pr_number,
    headRefOid: row.head_ref_oid,
    baseRefOid: row.base_ref_oid,
    previousHeadRefOid: row.previous_head_ref_oid,
    chapters: JSON.parse(row.chapters_json ?? '[]') as Tour,
    files: JSON.parse(row.files_json) as PrFile[],
    generatedAt: row.generated_at,
    lastCheckedAt: row.last_checked_at,
    lastAccessedAt: row.last_accessed_at,
    provider: row.provider,
    model: row.model,
    costUsd: row.cost_usd,
    durationMs: row.duration_ms,
    usage: row.usage_json ? (JSON.parse(row.usage_json) as TokenUsage) : null,
    review: row.review_json ? (JSON.parse(row.review_json) as Review) : null,
  }
}
