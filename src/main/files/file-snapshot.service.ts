import type { GitCloneManager } from '@/main/git/clone.manager'
import type { FileSnapshot, FileSnapshotStore } from '@/main/files/file-snapshot.store'
import { MAX_INLINE_BYTES } from '@/main/git/blob-reader'
import { Service } from '@/main/service'

/**
 * Read-through cache for file contents at a given sha. Cache key is
 * `(repo, sha, path)` — SHAs are immutable, so a hit is always correct.
 *
 *  - hit: return the row, touch `accessed_at` for LRU eviction (Phase 11).
 *  - miss: read via `GitCloneManager.showFile`, persist, return.
 *
 * Exception: cached rows with `encoding: 'omitted'` whose stored size now
 * fits under `MAX_INLINE_BYTES` are treated as misses and refetched. This
 * lets a cap bump self-heal — without it, a file that was omitted under the
 * old 256 KB cap would stay omitted forever even after the cap moves up.
 */
export class FileSnapshotService extends Service {
  constructor(
    private readonly clones: GitCloneManager,
    private readonly store: FileSnapshotStore,
  ) {
    super()
  }

  async get(repo: string, sha: string, path: string): Promise<FileSnapshot> {
    const cached = this.store.get(repo, sha, path)
    if (cached && !shouldRefetch(cached)) {
      this.store.touchAccessed(repo, sha, path)
      return cached
    }

    const blob = await this.clones.showFile(repo, sha, path)
    const now = new Date().toISOString()
    const snap: FileSnapshot = {
      repo,
      sha,
      path,
      content: blob.content,
      encoding: blob.encoding,
      size: blob.size,
      fetchedAt: now,
      accessedAt: now,
    }
    this.store.put(snap)
    return snap
  }
}

function shouldRefetch(cached: FileSnapshot): boolean {
  return cached.encoding === 'omitted' && cached.size > 0 && cached.size <= MAX_INLINE_BYTES
}
