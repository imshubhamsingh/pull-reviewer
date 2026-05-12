import type { Db } from '@/main/db/db'
import { Service } from '@/main/service'

export interface CloneRecord {
  repo: string                  // "{owner}/{name}"
  path: string                  // absolute filesystem path to the bare clone
  clonedAt: string              // ISO 8601
  lastFetchedAt: string         // last `git fetch` time
  lastAccessedAt: string        // touched on each read
}

interface Row {
  repo: string
  path: string
  cloned_at: string
  last_fetched_at: string
  last_accessed_at: string
}

const COLUMNS = `repo, path, cloned_at, last_fetched_at, last_accessed_at`

export class CloneStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  get(repo: string): CloneRecord | undefined {
    const row = this.db.selectOne<Row>(/* sql */ `SELECT ${COLUMNS} FROM clones WHERE repo = ?`, [repo])
    return row ? toRecord(row) : undefined
  }

  upsert(rec: CloneRecord): void {
    this.db.insert(
      /* sql */ `INSERT INTO clones (${COLUMNS})
       VALUES (@repo, @path, @clonedAt, @lastFetchedAt, @lastAccessedAt)
       ON CONFLICT(repo) DO UPDATE SET
         path             = excluded.path,
         last_fetched_at  = excluded.last_fetched_at,
         last_accessed_at = excluded.last_accessed_at`,
      rec,
    )
  }

  touchFetched(repo: string, at = new Date().toISOString()): void {
    this.db.update(/* sql */ `UPDATE clones SET last_fetched_at = ? WHERE repo = ?`, [at, repo])
  }

  touchAccessed(repo: string, at = new Date().toISOString()): void {
    this.db.update(/* sql */ `UPDATE clones SET last_accessed_at = ? WHERE repo = ?`, [at, repo])
  }

  /** Repos accessed before `before` — candidates for cleanup. */
  stale(before: string): CloneRecord[] {
    return this.db
      .select<Row>(/* sql */ `SELECT ${COLUMNS} FROM clones WHERE last_accessed_at < ?`, [before])
      .map(toRecord)
  }

  remove(repo: string): void {
    this.db.delete(/* sql */ `DELETE FROM clones WHERE repo = ?`, [repo])
  }
}

function toRecord(row: Row): CloneRecord {
  return {
    repo: row.repo,
    path: row.path,
    clonedAt: row.cloned_at,
    lastFetchedAt: row.last_fetched_at,
    lastAccessedAt: row.last_accessed_at,
  }
}
