import type { Db } from '@/main/db/db'
import { Service } from '@/main/service'

export type ReviewSide = 'before' | 'after'

export interface ReviewDraftRecord {
  id: number
  repo: string
  prNumber: number
  file: string
  line: number
  /** First line of the comment range; null/equal-to-line means single-line. */
  startLine: number | null
  side: ReviewSide
  body: string
  /**
   * Reason the last submission attempt couldn't post this draft (typically
   * "Line could not be resolved" from GitHub). Cleared whenever the body or
   * line range is edited so the user can retry after fixing it.
   */
  lastSubmitError: string | null
  createdAt: string
  updatedAt: string
}

export interface ReviewDraftInput {
  repo: string
  prNumber: number
  file: string
  line: number
  startLine?: number | null
  side: ReviewSide
  body: string
}

interface Row {
  id: number
  repo: string
  pr_number: number
  file: string
  line: number
  start_line: number | null
  side: ReviewSide
  body: string
  last_submit_error: string | null
  created_at: string
  updated_at: string
}

const COLUMNS =
  'id, repo, pr_number, file, line, start_line, side, body, last_submit_error, created_at, updated_at'

export class ReviewDraftStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  list(repo: string, prNumber: number): ReviewDraftRecord[] {
    const rows = this.db.select<Row>(
      /* sql */ `
        SELECT ${COLUMNS}
          FROM review_drafts
         WHERE repo = ?
           AND pr_number = ?
         ORDER BY file, line, id
      `,
      [repo, prNumber],
    )
    return rows.map(toRecord)
  }

  get(id: number): ReviewDraftRecord | undefined {
    const row = this.db.selectOne<Row>(
      /* sql */ `
        SELECT ${COLUMNS}
          FROM review_drafts
         WHERE id = ?
      `,
      [id],
    )
    return row && toRecord(row)
  }

  create(input: ReviewDraftInput): ReviewDraftRecord {
    const now = new Date().toISOString()
    const result = this.db.insert(
      /* sql */ `
        INSERT INTO review_drafts
          (repo, pr_number, file, line, start_line, side, body, created_at, updated_at)
        VALUES
          (@repo, @prNumber, @file, @line, @startLine, @side, @body, @now, @now)
      `,
      { ...input, startLine: input.startLine ?? null, now },
    )
    return this.requireById(Number(result.lastInsertRowid))
  }

  updateBody(id: number, body: string): ReviewDraftRecord | undefined {
    // Editing the body clears any prior submit error — the comment is fresh
    // and worth retrying.
    this.db.update(
      /* sql */ `
        UPDATE review_drafts
           SET body = ?,
               last_submit_error = NULL,
               updated_at = ?
         WHERE id = ?
      `,
      [body, new Date().toISOString(), id],
    )
    return this.get(id)
  }

  /**
   * Re-anchor a draft to a new line / line range. `startLine` should be null
   * (or equal to `line`) for single-line drafts. Callers are responsible for
   * passing a valid range — the store doesn't clamp against file length.
   * Clears `last_submit_error` since re-anchoring is exactly the fix.
   */
  updateRange(id: number, line: number, startLine: number | null): ReviewDraftRecord | undefined {
    this.db.update(
      /* sql */ `
        UPDATE review_drafts
           SET line = ?,
               start_line = ?,
               last_submit_error = NULL,
               updated_at = ?
         WHERE id = ?
      `,
      [line, startLine, new Date().toISOString(), id],
    )
    return this.get(id)
  }

  /** Mark a draft as having failed its last submission attempt with a reason. */
  markSubmitError(id: number, reason: string): ReviewDraftRecord | undefined {
    this.db.update(
      /* sql */ `
        UPDATE review_drafts
           SET last_submit_error = ?,
               updated_at = ?
         WHERE id = ?
      `,
      [reason, new Date().toISOString(), id],
    )
    return this.get(id)
  }

  remove(id: number): boolean {
    const { changes } = this.db.delete(
      /* sql */ `
        DELETE FROM review_drafts
         WHERE id = ?
      `,
      [id],
    )
    return changes > 0
  }

  removeAll(repo: string, prNumber: number): number {
    const { changes } = this.db.delete(
      /* sql */ `
        DELETE FROM review_drafts
         WHERE repo = ?
           AND pr_number = ?
      `,
      [repo, prNumber],
    )
    return changes
  }

  private requireById(id: number): ReviewDraftRecord {
    const found = this.get(id)
    if (!found) throw new Error(`review draft ${id} not found after insert`)
    return found
  }
}

function toRecord(row: Row): ReviewDraftRecord {
  return {
    id: row.id,
    repo: row.repo,
    prNumber: row.pr_number,
    file: row.file,
    line: row.line,
    startLine: row.start_line,
    side: row.side,
    body: row.body,
    lastSubmitError: row.last_submit_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
