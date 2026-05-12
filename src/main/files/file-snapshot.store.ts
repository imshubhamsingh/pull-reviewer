import type { Db } from '@/main/db/db'
import { Service } from '@/main/service'

export type SnapshotEncoding = 'utf8' | 'base64' | 'omitted'

export interface FileSnapshot {
  repo: string
  sha: string
  path: string
  content: string | null
  encoding: SnapshotEncoding
  size: number
  fetchedAt: string
  accessedAt: string
}

interface Row {
  repo: string
  sha: string
  path: string
  content: string | null
  encoding: SnapshotEncoding
  size: number
  fetched_at: string
  accessed_at: string
}

const COLUMNS = `repo, sha, path, content, encoding, size, fetched_at, accessed_at`

export class FileSnapshotStore extends Service {
  constructor(private readonly db: Db) {
    super()
  }

  get(repo: string, sha: string, path: string): FileSnapshot | undefined {
    const row = this.db.selectOne<Row>(
      /* sql */ `SELECT ${COLUMNS} FROM file_snapshots WHERE repo = ? AND sha = ? AND path = ?`,
      [repo, sha, path],
    )
    return row ? toSnapshot(row) : undefined
  }

  put(snap: FileSnapshot): void {
    this.db.insert(
      /* sql */ `INSERT INTO file_snapshots (${COLUMNS})
       VALUES (@repo, @sha, @path, @content, @encoding, @size, @fetchedAt, @accessedAt)
       ON CONFLICT(repo, sha, path) DO UPDATE SET
         content     = excluded.content,
         encoding    = excluded.encoding,
         size        = excluded.size,
         accessed_at = excluded.accessed_at`,
      snap,
    )
  }

  touchAccessed(repo: string, sha: string, path: string, at = new Date().toISOString()): void {
    this.db.update(
      /* sql */ `UPDATE file_snapshots SET accessed_at = ? WHERE repo = ? AND sha = ? AND path = ?`,
      [at, repo, sha, path],
    )
  }
}

function toSnapshot(row: Row): FileSnapshot {
  return {
    repo: row.repo,
    sha: row.sha,
    path: row.path,
    content: row.content,
    encoding: row.encoding,
    size: row.size,
    fetchedAt: row.fetched_at,
    accessedAt: row.accessed_at,
  }
}
