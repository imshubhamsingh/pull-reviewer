import type { BlobReader, BlobResult } from '@/main/git/blob-reader'
import type { CloneRegistry } from '@/main/git/clone-registry'
import type { WorktreeManager } from '@/main/git/worktree-manager'
import { Service } from '@/main/service'

/**
 * Facade composing the git pieces. This is the only class other modules
 * (FileSnapshotService, TourService's worktree usage) need to talk to.
 *
 * Behind the scenes:
 *  - `CloneRegistry` owns clone paths and "is this sha here?" checks
 *  - `BlobReader` does `git show {sha}:{path}` with binary/size fallbacks
 *  - `WorktreeManager` does temporary `git worktree add/remove`
 */
export class GitCloneManager extends Service {
  constructor(
    private readonly registry: CloneRegistry,
    private readonly blobs: BlobReader,
    private readonly worktrees: WorktreeManager,
  ) {
    super()
  }

  ensureBare(repo: string): Promise<string> {
    return this.registry.ensureBare(repo)
  }

  ensureSha(repo: string, sha: string): Promise<void> {
    return this.registry.ensureSha(repo, sha)
  }

  showFile(repo: string, sha: string, path: string, maxBytes?: number): Promise<BlobResult> {
    return this.blobs.read(repo, sha, path, maxBytes)
  }

  addWorktree(repo: string, sha: string): Promise<string> {
    return this.worktrees.add(repo, sha)
  }

  removeWorktree(path: string): Promise<void> {
    return this.worktrees.remove(path)
  }

  sweepOrphans(): Promise<void> {
    return this.worktrees.sweepOrphans()
  }
}
