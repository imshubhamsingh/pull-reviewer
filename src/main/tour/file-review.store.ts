import type { Db } from '@/main/db/db'
import { Service } from '@/main/service'

export interface FileReviewRecord {
  id: number
  repo: string
  prNumber: number
  headRefOid: string
  filePath: string
  reviewedAt: string
}

export interface FileReviewInput {
  repo: string
  prNumber: number
  headRefOid: string
  filePath: string
}

interface Row {
  id: number
  repo: string
  pr_number: number
  head_ref_oid: string
  file_path: string
  reviewed_at: string
}

const COLUMNS = 'id, repo, pr_number, head_ref_oid, file_path, reviewed_at'

/**
 * Per-file "reviewed" flags, scoped to a specific (repo, pr, head_sha).
 *
 * Sources of writes:
 *  1. Explicit user click on a file's tick in the FileMap (single mark/unmark)
 *  2. Cascade from chapter-completion: when a chapter is marked complete, all
 *     of its pinned files (`step.code.file`) get bulk-marked via `markMany`.
 *     Atomic — the renderer treats the chapter mark as a single intent.
 *
 * Un-marking a chapter does NOT unmark its files: explicit reviewed state
 * survives. The cascade only fires on completion, not on uncompletion.
 */
export class FileReviewStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  list(repo: string, prNumber: number, headRefOid: string): FileReviewRecord[] {
    const rows = this.db.select<Row>(
      /* sql */ `
        SELECT ${COLUMNS}
          FROM file_reviews
         WHERE repo = ? AND pr_number = ? AND head_ref_oid = ?
         ORDER BY id
      `,
      [repo, prNumber, headRefOid],
    )
    return rows.map(toRecord)
  }

  mark(input: FileReviewInput): FileReviewRecord {
    const now = new Date().toISOString()
    this.insertOne(input, now)
    return this.findOne(input.repo, input.prNumber, input.headRefOid, input.filePath)
  }

  /**
   * Bulk-mark multiple files in a single transaction. Used by the chapter-
   * complete cascade to atomically tick every pinned file. Idempotent per
   * file (UNIQUE absorbs duplicates).
   */
  markMany(repo: string, prNumber: number, headRefOid: string, filePaths: string[]): FileReviewRecord[] {
    if (filePaths.length === 0) return []
    const now = new Date().toISOString()
    this.db.transaction(() => {
      for (const filePath of filePaths) {
        this.insertOne({ repo, prNumber, headRefOid, filePath }, now)
      }
    })
    return filePaths.map((filePath) => this.findOne(repo, prNumber, headRefOid, filePath))
  }

  unmark(repo: string, prNumber: number, headRefOid: string, filePath: string): boolean {
    const { changes } = this.db.delete(
      /* sql */ `
        DELETE FROM file_reviews
         WHERE repo = ? AND pr_number = ? AND head_ref_oid = ? AND file_path = ?
      `,
      [repo, prNumber, headRefOid, filePath],
    )
    return changes > 0
  }

  private insertOne(input: FileReviewInput, now: string): void {
    this.db.insert(
      /* sql */ `
        INSERT INTO file_reviews (repo, pr_number, head_ref_oid, file_path, reviewed_at)
        VALUES (@repo, @prNumber, @headRefOid, @filePath, @now)
        ON CONFLICT(repo, pr_number, head_ref_oid, file_path) DO NOTHING
      `,
      { ...input, now },
    )
  }

  private findOne(repo: string, prNumber: number, headRefOid: string, filePath: string): FileReviewRecord {
    const row = this.db.selectOne<Row>(
      /* sql */ `
        SELECT ${COLUMNS}
          FROM file_reviews
         WHERE repo = ? AND pr_number = ? AND head_ref_oid = ? AND file_path = ?
      `,
      [repo, prNumber, headRefOid, filePath],
    )
    if (!row) throw new Error('findOne: row vanished after insert')
    return toRecord(row)
  }
}

function toRecord(row: Row): FileReviewRecord {
  return {
    id: row.id,
    repo: row.repo,
    prNumber: row.pr_number,
    headRefOid: row.head_ref_oid,
    filePath: row.file_path,
    reviewedAt: row.reviewed_at,
  }
}
