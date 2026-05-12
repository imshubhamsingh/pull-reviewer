import type { Db } from '@/main/db/db'
import type { PrFile } from '@/main/tour/pr-context.collector'
import type { TourStep } from '@/main/tour/tour.parser'
import { Service } from '@/main/service'

export interface TourRecord {
  prId: string                          // "{repo}#{prNumber}"
  repo: string
  prNumber: number
  headRefOid: string
  baseRefOid: string | null
  previousHeadRefOid: string | null     // set on regenerate; powers "commits since last tour" delta
  steps: TourStep[]                     // legacy flat shape; Phase 4 reshapes to chapters
  files: PrFile[]
  generatedAt: string                   // ISO 8601
  lastCheckedAt: string                 // when head_ref_oid was last verified
  lastAccessedAt: string
  provider: string
  model: string
}

interface Row {
  pr_id: string
  repo: string
  pr_number: number
  head_ref_oid: string
  base_ref_oid: string | null
  previous_head_ref_oid: string | null
  steps_json: string
  files_json: string
  generated_at: string
  last_checked_at: string
  last_accessed_at: string
  provider: string
  model: string
}

const COLUMNS = `
  pr_id, repo, pr_number, head_ref_oid, base_ref_oid, previous_head_ref_oid,
  steps_json, files_json, generated_at, last_checked_at, last_accessed_at,
  provider, model
`

export class TourStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  get(repo: string, prNumber: number): TourRecord | undefined {
    const id = prId(repo, prNumber)
    const row = this.db.selectOne<Row>(/* sql */ `SELECT ${COLUMNS} FROM tours WHERE pr_id = ?`, [id])
    if (!row) return undefined
    this.touchAccessed(id)
    return rowToRecord(row)
  }

  upsert(rec: TourRecord): void {
    this.db.insert(
      /* sql */ `INSERT INTO tours (${COLUMNS})
       VALUES (
         @prId, @repo, @prNumber, @headRefOid, @baseRefOid, @previousHeadRefOid,
         @stepsJson, @filesJson, @generatedAt, @lastCheckedAt, @lastAccessedAt,
         @provider, @model
       )
       ON CONFLICT(pr_id) DO UPDATE SET
         head_ref_oid          = excluded.head_ref_oid,
         base_ref_oid          = excluded.base_ref_oid,
         previous_head_ref_oid = excluded.previous_head_ref_oid,
         steps_json            = excluded.steps_json,
         files_json            = excluded.files_json,
         generated_at          = excluded.generated_at,
         last_checked_at       = excluded.last_checked_at,
         last_accessed_at      = excluded.last_accessed_at,
         provider              = excluded.provider,
         model                 = excluded.model`,
      {
        prId: rec.prId,
        repo: rec.repo,
        prNumber: rec.prNumber,
        headRefOid: rec.headRefOid,
        baseRefOid: rec.baseRefOid,
        previousHeadRefOid: rec.previousHeadRefOid,
        stepsJson: JSON.stringify(rec.steps),
        filesJson: JSON.stringify(rec.files),
        generatedAt: rec.generatedAt,
        lastCheckedAt: rec.lastCheckedAt,
        lastAccessedAt: rec.lastAccessedAt,
        provider: rec.provider,
        model: rec.model,
      },
    )
  }

  /** Update last_checked_at without rewriting the whole row (called after a fresh head-sha probe). */
  touchChecked(repo: string, prNumber: number, at = new Date().toISOString()): void {
    this.db.update(/* sql */ `UPDATE tours SET last_checked_at = ? WHERE pr_id = ?`, [at, prId(repo, prNumber)])
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
    steps: JSON.parse(row.steps_json) as TourStep[],
    files: JSON.parse(row.files_json) as PrFile[],
    generatedAt: row.generated_at,
    lastCheckedAt: row.last_checked_at,
    lastAccessedAt: row.last_accessed_at,
    provider: row.provider,
    model: row.model,
  }
}
