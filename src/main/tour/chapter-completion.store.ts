import type { Db } from '@/main/db/db'
import { Service } from '@/main/service'

export interface ChapterCompletionRecord {
  id: number
  repo: string
  prNumber: number
  headRefOid: string
  chapterId: string
  completedAt: string
}

export interface ChapterCompletionInput {
  repo: string
  prNumber: number
  headRefOid: string
  chapterId: string
}

interface Row {
  id: number
  repo: string
  pr_number: number
  head_ref_oid: string
  chapter_id: string
  completed_at: string
}

const COLUMNS = 'id, repo, pr_number, head_ref_oid, chapter_id, completed_at'

/**
 * Per-chapter completion flags, scoped to a specific (repo, pr, head_sha).
 * Regenerating the tour produces a new head_sha and a fresh chapter id set,
 * so no rows match — completion clears automatically without an explicit
 * sweep.
 */
export class ChapterCompletionStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  list(repo: string, prNumber: number, headRefOid: string): ChapterCompletionRecord[] {
    const rows = this.db.select<Row>(
      /* sql */ `
        SELECT ${COLUMNS}
          FROM chapter_completions
         WHERE repo = ? AND pr_number = ? AND head_ref_oid = ?
         ORDER BY id
      `,
      [repo, prNumber, headRefOid],
    )
    return rows.map(toRecord)
  }

  /** Idempotent — UNIQUE constraint absorbs duplicates; returns the existing row on re-mark. */
  mark(input: ChapterCompletionInput): ChapterCompletionRecord {
    const now = new Date().toISOString()
    this.db.insert(
      /* sql */ `
        INSERT INTO chapter_completions (repo, pr_number, head_ref_oid, chapter_id, completed_at)
        VALUES (@repo, @prNumber, @headRefOid, @chapterId, @now)
        ON CONFLICT(repo, pr_number, head_ref_oid, chapter_id) DO NOTHING
      `,
      { ...input, now },
    )
    const row = this.db.selectOne<Row>(
      /* sql */ `
        SELECT ${COLUMNS}
          FROM chapter_completions
         WHERE repo = ? AND pr_number = ? AND head_ref_oid = ? AND chapter_id = ?
      `,
      [input.repo, input.prNumber, input.headRefOid, input.chapterId],
    )
    if (!row) throw new Error('mark: row vanished after insert')
    return toRecord(row)
  }

  unmark(repo: string, prNumber: number, headRefOid: string, chapterId: string): boolean {
    const { changes } = this.db.delete(
      /* sql */ `
        DELETE FROM chapter_completions
         WHERE repo = ? AND pr_number = ? AND head_ref_oid = ? AND chapter_id = ?
      `,
      [repo, prNumber, headRefOid, chapterId],
    )
    return changes > 0
  }
}

function toRecord(row: Row): ChapterCompletionRecord {
  return {
    id: row.id,
    repo: row.repo,
    prNumber: row.pr_number,
    headRefOid: row.head_ref_oid,
    chapterId: row.chapter_id,
    completedAt: row.completed_at,
  }
}
