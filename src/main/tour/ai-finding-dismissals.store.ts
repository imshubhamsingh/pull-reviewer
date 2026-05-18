import type { Db } from '@/main/db/db'
import { Service } from '@/main/service'

/**
 * Per-finding dismissal flags scoped to (repo, pr, head_sha, findingId).
 * Regenerating the tour produces a new head_sha — no rows match the new
 * head, so dismissals "clear" naturally without an explicit sweep. Same
 * pattern as `ChapterCompletionStore`.
 */

export interface DismissalRecord {
  id: number
  repo: string
  prNumber: number
  headRefOid: string
  findingId: string
  dismissedAt: string
}

export interface DismissalInput {
  repo: string
  prNumber: number
  headRefOid: string
  findingId: string
}

interface Row {
  id: number
  repo: string
  pr_number: number
  head_ref_oid: string
  finding_id: string
  dismissed_at: string
}

const COLUMNS = 'id, repo, pr_number, head_ref_oid, finding_id, dismissed_at'

export class AiFindingDismissalsStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  list(repo: string, prNumber: number, headRefOid: string): DismissalRecord[] {
    const rows = this.db.select<Row>(
      /* sql */ `
        SELECT ${COLUMNS}
          FROM ai_finding_dismissals
         WHERE repo = ? AND pr_number = ? AND head_ref_oid = ?
         ORDER BY id
      `,
      [repo, prNumber, headRefOid],
    )
    return rows.map(toRecord)
  }

  /** Idempotent — UNIQUE constraint absorbs duplicates; returns the existing row on re-dismiss. */
  add(input: DismissalInput): DismissalRecord {
    const now = new Date().toISOString()
    this.db.insert(
      /* sql */ `
        INSERT INTO ai_finding_dismissals (repo, pr_number, head_ref_oid, finding_id, dismissed_at)
        VALUES (@repo, @prNumber, @headRefOid, @findingId, @now)
        ON CONFLICT(repo, pr_number, head_ref_oid, finding_id) DO NOTHING
      `,
      { ...input, now },
    )
    const row = this.db.selectOne<Row>(
      /* sql */ `
        SELECT ${COLUMNS}
          FROM ai_finding_dismissals
         WHERE repo = ? AND pr_number = ? AND head_ref_oid = ? AND finding_id = ?
      `,
      [input.repo, input.prNumber, input.headRefOid, input.findingId],
    )
    if (!row) throw new Error('add: row vanished after insert')
    return toRecord(row)
  }

  remove(repo: string, prNumber: number, headRefOid: string, findingId: string): boolean {
    const { changes } = this.db.delete(
      /* sql */ `
        DELETE FROM ai_finding_dismissals
         WHERE repo = ? AND pr_number = ? AND head_ref_oid = ? AND finding_id = ?
      `,
      [repo, prNumber, headRefOid, findingId],
    )
    return changes > 0
  }
}

function toRecord(row: Row): DismissalRecord {
  return {
    id: row.id,
    repo: row.repo,
    prNumber: row.pr_number,
    headRefOid: row.head_ref_oid,
    findingId: row.finding_id,
    dismissedAt: row.dismissed_at,
  }
}
